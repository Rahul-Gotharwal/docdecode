import { trpc } from "@/app/_trpc/client";
import { INFINITE_QUERY_LIMIT } from "@/config/infinite-query";
import { Loader2, MessageSquare } from "lucide-react";
import Skeleton from "react-loading-skeleton";
import Message from "./Message";
import { useContext, useEffect, useRef } from "react";
import { ChatContext } from "./ChatContext";
import {useIntersection} from "@mantine/hooks"
interface MessageProps {
  fileId: string;
}
const Messages = ({ fileId }: MessageProps) => {
  // because of the naming conflict we give the another name to isloading => isAithinking
  // because threr are two isLoading
  const {isLoading:isAiThinking} = useContext(ChatContext)
  const { data, isLoading, fetchNextPage } =
    trpc.getFileMessage.useInfiniteQuery(
      {
        fileId,
        limit: INFINITE_QUERY_LIMIT,
      },
      {
        getNextPageParam: (lastPage) => lastPage?.nextCursor,
        keepPreviousData: true,
      }
    );
  const messages = data?.pages.flatMap((page) => page.messages);
  const loadingMessage = {
    createdAt: new Date().toISOString(),
    id: "loading-message",
    isUserMessage: false,
    text: (
      <span className="flex h-full items-center justify-center ">
        <Loader2 className="h-4 w-4 animate-spin " />
      </span>
    ),
  };
  const combinedMessage = [
    ...(isAiThinking ? [loadingMessage] : []),
    ...(messages ?? []),
  ];
  const lastMessageRef = useRef<HTMLDivElement>(null)
  const {ref , entry} = useIntersection({
    root:lastMessageRef.current,
    threshold:1
  })
  useEffect (() =>{
    if(entry?.isIntersecting){
      fetchNextPage()
    }
  },[entry, fetchNextPage])
  return (
    <div className="flex max-h-[calc(100vh-3.5rem-7rem)] border-zinc-200 flex-1 flex-col-reverse gap-4 p-3 overflow-y-auto scrollbar-thumb-blue scrollbar-thumb-rounded scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch">
      {combinedMessage && combinedMessage.length > 0 ? (
        combinedMessage.map((message, i) => {
          const isNextMessageSamePerson =
            combinedMessage[i - 1]?.isUserMessage ===
            combinedMessage[i]?.isUserMessage;
          if (i === combinedMessage.length - 1) {
            return (
              <Message
               ref={ref}
                message={message}
                isNextMessageSamePerson={isNextMessageSamePerson}
                key={message.id}
              />
            );
          } else
            return (
              <Message
                message={message}
                isNextMessageSamePerson={isNextMessageSamePerson}
                key={message.id}
              />
            );
        })
      ) : isLoading ? (
        <div className="w-full flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 ">
          <MessageSquare className="h-8 w-8 text-purple-500" />
          <h3 className="font-semibold text-xl">You&apos;re all set!</h3>
          <p className="text-zinc-500 text-sm ">
            Ask your first question to started..
          </p>
        </div>
      )}
    </div>
  );
};

export default Messages;
