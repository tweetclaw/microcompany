import React, { Suspense, lazy, useState } from 'react';
import { Message } from '../types';
import { TimelineView } from './TimelineView';
import './MessageItem.css';

interface MessageItemProps {
  message: Message;
}

const MarkdownRenderer = lazy(() => import('./MarkdownRenderer').then((module) => ({ default: module.MarkdownRenderer })));

function MessageItem({ message }: MessageItemProps) {
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
            {message.timeline && message.timeline.length > 0 ? (
              // If timeline exists: show timeline only (includes tool_call and output in chronological order)
              // This ensures consistent display for both streaming and historical messages
              <TimelineView timeline={message.timeline} isStreaming={message.isStreaming} />
            ) : (
              // No timeline: show content only (backward compatibility for old messages)
              <>
                {message.content && (
                  <Suspense fallback={<div className="message-text">{message.content}</div>}>
                    <MarkdownRenderer
                      content={message.content}
                      isStreaming={message.isStreaming}
                    />
                  </Suspense>
                )}
              </>
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
    </div>
  );
}

export default MessageItem;
