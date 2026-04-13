import React from 'react';
import { Message } from '../types';
import './MessageItem.css';

interface MessageItemProps {
  message: Message;
}

function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user';
  
  return (
    <div className={`message-item ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">
        {isUser ? 'U' : 'AI'}
      </div>
      <div className="message-content">
        {message.content}
      </div>
    </div>
  );
}

export default MessageItem;
