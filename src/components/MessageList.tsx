import React, { useEffect, useRef } from 'react';
import MessageItem from './MessageItem';
import { Message } from '../types';
import './MessageList.css';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

function MessageList({ messages, isLoading }: MessageListProps) {
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="message-list">
      {messages.length === 0 ? (
        <div className="empty-state">
          <h2>MicroCompany AI Assistant</h2>
          <p>Please select a working directory and type a message to start.</p>
        </div>
      ) : (
        messages.map((msg) => <MessageItem key={msg.id} message={msg} />)
      )}
      
      {isLoading && (
        <div className="loading-indicator">
          <div className="pulse-dot"></div>
          <div className="pulse-dot"></div>
          <div className="pulse-dot"></div>
        </div>
      )}
      <div ref={endOfMessagesRef} />
    </div>
  );
}

export default MessageList;
