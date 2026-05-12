import React, { useEffect } from 'react';
import MessageItem from './MessageItem';
import { Message } from '../types';
import { useScrollControl } from '../hooks/useScrollControl';
import './MessageList.css';

interface MessageListProps {
  messages: Message[];
  isBusy: boolean;
  onRetry?: (content: string) => void;
  onHandoffClick?: (message: Message, handoffRawValue: string, cleanedContent: string) => void;
}

function MessageList({ messages, isBusy, onRetry, onHandoffClick }: MessageListProps) {
  const {
    containerRef,
    isAtBottom,
    hasNewMessage,
    setHasNewMessage,
    scrollToBottom,
  } = useScrollControl();

  // 智能滚动：仅当用户在底部时才自动滚动，否则显示"新消息"提示
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom('smooth');
    } else {
      setHasNewMessage(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Show retry button only on the last message when it's a user message and AI is idle
  const lastMessageIndex = messages.length - 1;
  const isLastUserMessageUnreplied =
    !isBusy &&
    lastMessageIndex >= 0 &&
    messages[lastMessageIndex].role === 'user';

  return (
    <div className="message-list" ref={containerRef}>
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
            onHandoffClick={onHandoffClick}
          />
        ))}

        {isBusy && (
          <div className="loading-indicator">
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
          </div>
        )}
      </div>

      {/* 滚动到底部按钮 */}
      {!isAtBottom && hasNewMessage && (
        <button
          className="message-list-scroll-btn"
          onClick={() => scrollToBottom('smooth')}
          aria-label="滚动到最新消息"
          type="button"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>新消息</span>
        </button>
      )}
    </div>
  );
}

export default MessageList;
