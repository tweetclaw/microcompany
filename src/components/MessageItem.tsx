import React, { Suspense, lazy, useState } from 'react';
import { Message } from '../types';
import { TimelineView } from './TimelineView';
import './MessageItem.css';

interface MessageItemProps {
  message: Message;
  showRetry?: boolean;
  onRetry?: (content: string) => void;
  onHandoffClick?: (message: Message, handoffRawValue: string, cleanedContent: string) => void;
}

const MarkdownRenderer = lazy(() => import('./MarkdownRenderer').then((module) => ({ default: module.MarkdownRenderer })));

function MessageItem({ message, showRetry, onRetry, onHandoffClick }: MessageItemProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  // 提取 handoff 标签
  const extractHandoff = (content: string): { handoffValue: string; cleanedContent: string } => {
    const handoffRegex = /<handoff>(.*?)<\/handoff>/s;
    const match = content.match(handoffRegex);
    if (match) {
      const handoffValue = match[1].trim();
      const cleanedContent = content.replace(handoffRegex, '').trim();
      console.log('[MessageItem] Extracted handoff:', {
        originalContent: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        handoffValue,
        fullMatch: match[0]
      });
      return { handoffValue, cleanedContent };
    }
    return { handoffValue: '', cleanedContent: content };
  };

  const { handoffValue, cleanedContent } = extractHandoff(message.content);
  const hasHandoff = !isUser && message.role === 'assistant' && handoffValue !== '';

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
              cleanedContent && (
                <Suspense fallback={<div className="message-text">{cleanedContent}</div>}>
                  <MarkdownRenderer
                    content={cleanedContent}
                    isStreaming={message.isStreaming}
                  />
                </Suspense>
              )
            )}
            {/* 再次调度按钮 */}
            {hasHandoff && onHandoffClick && !message.isStreaming && (
              <div style={{ marginTop: '12px' }}>
                <button
                  className="message-handoff-button"
                  onClick={() => onHandoffClick(message, handoffValue, cleanedContent)}
                  title="重新发起工作交接"
                >
                  🔄 再次调度
                </button>
              </div>
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
