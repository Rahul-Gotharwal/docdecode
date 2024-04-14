import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@/db';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { getPineconeClient } from '@/lib/pinecone';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { VectorOperationsApi } from '@pinecone-database/pinecone/dist/pinecone-generated-ts-fetch';
import { RecordMetadata } from '@pinecone-database/pinecone';

// logic part for uploading the file
const s3Client = new S3Client({
  region: process.env.NEXT_PUBLIC_AWS_S3_REGION || ' ',
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY || ' ',
  },
});

async function uploadFileToS3(file: Buffer, fileName: string): Promise<string> {
  const fileBuffer = file;

  const params = {
    Bucket: process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME,
    Key: `${fileName}`,
    Body: fileBuffer,
    ContentType: 'application/pdf',
  };

  const command = new PutObjectCommand(params);
  await s3Client.send(command);

  return fileName;
}

// this is the API for posting the data
export async function POST(request: any, userId: string): Promise<any> {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'File is required.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = await uploadFileToS3(buffer, file.name);

    // Update the database with the file information
    const uploadedFile = await db.file.create({
      data: {
        key: fileName,
        name: file.name,
        userId: 'kp_37e2a1af91f44861946a081d10112f5c',
        url: `https://${process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_S3_REGION}.amazonaws.com/${file.name}`,
        uploadStatus: 'PROCESSING',
      },
    });

    try {
      const response = await fetch(
        `https://${process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_S3_REGION}.amazonaws.com/${file.name}`
      );
      const blob = await response.blob();
      const loader = new PDFLoader(blob);
      const pageLevelDocs = await loader.load(); // one actual page in the array
      const pagesAmt = pageLevelDocs.length;

      // Create a Pinecone index
      const pinecone = await getPineconeClient()
      const pineconeIndex = pinecone.Index("docdecode")
      // generate the vector from the text
      const embeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPEN_AI_KEY,
      });

      // turning text into the vectors
      await PineconeStore.fromDocuments(pageLevelDocs, embeddings, {
        pineconeIndex,
        namespace: uploadedFile.id,
      });

      await db.file.update({
        data: {
          uploadStatus: 'SUCCESS',
        },
        where: {
          id: uploadedFile.id,
        },
      });
    } catch (error) {
      console.error("Error during Pinecone operations:", error);
      await db.file.update({
        data: {
          uploadStatus: 'FAILED',
        },
        where: {
          id: uploadedFile.id,
        },
      });
    }
  
    return NextResponse.json({ success: true, key: fileName, uploadedFile });
  } catch (error) {
    return NextResponse.json({ error });
  }
}
