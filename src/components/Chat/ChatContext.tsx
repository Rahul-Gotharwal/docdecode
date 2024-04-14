import { ReactNode, createContext, useRef, useState } from "react";
import { useToast } from "../ui/use-toast";
import { useMutation } from "@tanstack/react-query";
import { trpc } from "@/app/_trpc/client";
import { INFINITE_QUERY_LIMIT } from "@/config/infinite-query";

type StreamResponse = {
  addMessage: () => void;
  message: string;
  handleInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  isLoading: boolean;
};

export const ChatContext = createContext<StreamResponse>({
  addMessage: () => {},
  message: "",
  handleInputChange: () => {},
  isLoading: false,
});

interface Props {
  fileId: string;
  children: ReactNode;
}

export const ChatContextProvider = ({ fileId, children }: Props) => {
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const backUpMessage = useRef(" ");
  const { mutate: sendMessage } = useMutation({
    mutationFn: async ({ message }: { message: string }) => {
      const response = await fetch("/api/message", {
        method: "POST",
        body: JSON.stringify({
          fileId,
          message,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to send the message");
      }
      return response.body;
    }, // for optimistic update
    onMutate: async ({ message }) => {
      backUpMessage.current = message;
      setMessage("");

      // step 1 for dont overwrite the message during the refecthing
      await utils.getFileMessage.cancel();
      // step 2 for previos value we have about the mwessgages
      const previosMessages = utils.getFileMessage.getInfiniteData();
      // step 3 inserting the new value or messages for optimistic updates
      utils.getFileMessage.setInfiniteData(
        { fileId, limit: INFINITE_QUERY_LIMIT },
        (old) => {
          if (!old) {
            return {
              pages: [],
              pageParams: [],
            };
          }
          let newPages = [...old.pages];
          let latestPage = newPages[0]!;
          latestPage.messages = [
            {
              createdAt: new Date().toISOString(),
              id: crypto.randomUUID(),
              text: message,
              isUserMessage: true,
            },
            ...latestPage.messages,
          ];

          newPages[0] = latestPage;
          return {
            ...old,
            pages: newPages,
          };
        }
      );
      setIsLoading(true);
      return {
        previosMessages:
          previosMessages?.pages.flatMap((page) => page.messages) ?? [],
      };
    },
    onSuccess: async (stream) => {
      setIsLoading(false);
      if (!stream) {
        return toast({
          title: "There was a problem sending this message",
          description: "please refresh this page and try again later",
          variant: "destructive",
        });
      }
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let done = false;

      // accumulated response
      let accresponse = "";
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        // chunk is the like in  generated form data will present not like sudden update
        const chunkvlaue = decoder.decode(value);
        accresponse += chunkvlaue;
        // append the chunk to the actual message
        utils.getFileMessage.setInfiniteData(
          { fileId, limit: INFINITE_QUERY_LIMIT },
          (old) => {
            if (!old) return { pages: [], pageParams: [] };

            let isAiResponseCreated = old.pages.some((page) =>
              page.messages.some((message) => message.id === "ai-response")
            );
            let updatedPages = old.pages.map((page)=>{
                if(page === old.pages[0]){
                    let updatedMessages 
                    if(!isAiResponseCreated){
                        updatedMessages = [
                            {
                                createdAt:new Date().toISOString(),
                                id:"ai-response",
                                text:accresponse,
                                isUserMessage:false
                            },
                           ...page.messages

                        ]
                    } else{
                        updatedMessages = page.messages.map((message) =>{
                            if(message.id === "ai-response"){
                                return {
                                    ...message,
                                    text:accresponse
                                }
                            }else{ 
                                return message
                            }
                        })
                    }
                    return {
                        ...page,
                        messages:updatedMessages
                    }
                }
                return page
            })
            return {...old, pages:updatedPages}
          }
        );
      }
    },

    onError: (_, __, context) => {
      setMessage(backUpMessage.current);
      utils.getFileMessage.setData(
        { fileId },
        { messages: context?.previosMessages ?? [] }
      );
    }, // if we are either successful or not
    onSettled: async () => {
      setIsLoading(false);
      await utils.getFileMessage.invalidate({ fileId });
    },
  });
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };
  const addMessage = () => sendMessage({ message });

  return (
    <ChatContext.Provider
      value={{ addMessage, message, handleInputChange, isLoading }}
    >
      {children}
    </ChatContext.Provider>
  );
};
