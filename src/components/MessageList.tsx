import React, { useEffect, useRef } from 'react';
import MessageItem from './MessageItem';
import { Message } from '../types';
import './MessageList.css';

interface MessageListProps {
  messages: Message[];
  isBusy: boolean;
}

function MessageList({ messages, isBusy }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBusy]);

  return (
    <div className="message-list">
      <div className="message-list-content">
        {messages.length === 0 && !isBusy && (
          <div className="message-list-empty">
            <p>开始对话，输入你的问题...</p>
          </div>
        )}

        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
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
