import React, { Suspense, lazy, useState } from 'react';
import { Message } from '../types';
import { TimelineView } from './TimelineView';
import './MessageItem.css';

interface MessageItemProps {
  message: Message;
  showRetry?: boolean;
  onRetry?: (content: string) => void;
}

const MarkdownRenderer = lazy(() => import('./MarkdownRenderer').then((module) => ({ default: module.MarkdownRenderer })));

function MessageItem({ message, showRetry, onRetry }: MessageItemProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleRetry = () => {
    if (onRetry && message.content) {
      onRetry(message.content);
    }
  };

  return (
    <div className={`message-item ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-avatar">
        {isUser ? '👤' : '🤖'}
      </div>
      <div className="message-content">
        {isUser ? (
          <div className="message-text">{message.content}</div>
        ) : (
          <>
            {/* Show timeline if exists (tool calls and thinking in chronological order) */}
            {message.timeline && message.timeline.length > 0 ? (
              <TimelineView timeline={message.timeline} />
            ) : (
              /* Show content only if no timeline exists (fallback for old messages) */
              message.content && (
                <Suspense fallback={<div className="message-text">{message.content}</div>}>
                  <MarkdownRenderer
                    content={message.content}
                    isStreaming={message.isStreaming}
                  />
                </Suspense>
              )
            )}
          </>
        )}
      </div>
      {!isUser && !message.isStreaming && (
        <button
          className="message-copy-button"
          onClick={handleCopy}
          title="复制消息内容"
        >
          {copied ? '✓' : '📋'}
        </button>
      )}
      {isUser && showRetry && onRetry && (
        <button
          className="message-retry-button"
          onClick={handleRetry}
          title="重新发送此消息"
        >
          ↩ 重试
        </button>
      )}
    </div>
  );
}

export default MessageItem;
