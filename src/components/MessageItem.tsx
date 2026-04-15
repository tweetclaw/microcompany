import React from 'react';
import { Message } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import './MessageItem.css';

interface MessageItemProps {
  message: Message;
}

function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user';
  const isThinking = message.isStreaming && message.content.includes('思考中');

  return (
    <div className={`message-item ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-avatar">
        {isUser ? '👤' : '🤖'}
      </div>
      <div className="message-content">
        {isUser ? (
          <div className="message-text">{message.content}</div>
        ) : isThinking ? (
          <div className="message-thinking">{message.content}</div>
        ) : (
          <MarkdownRenderer
            content={message.content}
            isStreaming={message.isStreaming}
          />
        )}
      </div>
    </div>
  );
}

export default MessageItem;
