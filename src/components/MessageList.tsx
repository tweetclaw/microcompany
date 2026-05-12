import React, { useEffect, useRef } from 'react';
import MessageItem from './MessageItem';
import { Message } from '../types';
import './MessageList.css';

interface MessageListProps {
  messages: Message[];
  isBusy: boolean;
  onRetry?: (content: string) => void;
}

function MessageList({ messages, isBusy, onRetry }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBusy]);

  // Show retry button only on the last message when it's a user message and AI is idle
  const lastMessageIndex = messages.length - 1;
  const isLastUserMessageUnreplied =
    !isBusy &&
    lastMessageIndex >= 0 &&
    messages[lastMessageIndex].role === 'user';

  return (
    <div className="message-list">
      <div className="message-list-content">
        {messages.length === 0 && !isBusy && (
          <div className="message-list-empty">
            <p>开始对话，输入你的问题...</p>
          </div>
        )}

        {messages.map((message, index) => (
          <MessageItem
            key={message.id}
            message={message}
            showRetry={isLastUserMessageUnreplied && index === lastMessageIndex}
            onRetry={onRetry}
          />
        ))}

        {isBusy && (
          <div className="loading-indicator">
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

export default MessageList;
