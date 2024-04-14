import {z} from 'zod'
export const sendMessageValidator = z.object({
    fileId:z.string(),
    message:z.string()
}) // to check the data in the post request body