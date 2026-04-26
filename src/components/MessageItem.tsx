import React, { Suspense, lazy } from 'react';
import { Message } from '../types';
import './MessageItem.css';

interface MessageItemProps {
  message: Message;
}

const MarkdownRenderer = lazy(() => import('./MarkdownRenderer').then((module) => ({ default: module.MarkdownRenderer })));

function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`message-item ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-avatar">
        {isUser ? '👤' : '🤖'}
      </div>
      <div className="message-content">
        {isUser ? (
          <div className="message-text">{message.content}</div>
        ) : (
          <Suspense fallback={<div className="message-text">{message.content}</div>}>
            <MarkdownRenderer
              content={message.content}
              isStreaming={message.isStreaming}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

export default MessageItem;
