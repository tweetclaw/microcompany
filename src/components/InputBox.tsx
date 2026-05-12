import React, { useState, KeyboardEvent, useEffect, useRef } from 'react';
import './InputBox.css';

interface InputBoxProps {
  onSendMessage: (content: string) => void;
  onCancelMessage: () => void;
  isInputDisabled?: boolean;
  isBusy?: boolean;
  canCancel?: boolean;
  isCancelling?: boolean;
  placeholderText?: string;
  currentProviderName?: string | null;
  currentModelName?: string | null;
}

const TEXTAREA_MIN_HEIGHT = 120;
const TEXTAREA_MAX_HEIGHT = 320;

function InputBox({
  onSendMessage,
  onCancelMessage,
  isInputDisabled = false,
  isBusy = false,
  canCancel = false,
  isCancelling = false,
  placeholderText,
  currentProviderName,
  currentModelName,
}: InputBoxProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, TEXTAREA_MIN_HEIGHT), TEXTAREA_MAX_HEIGHT);
    const hasOverflow = textarea.scrollHeight > TEXTAREA_MAX_HEIGHT;

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = hasOverflow ? 'auto' : 'hidden';

    if (hasOverflow) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  }, [input]);

  const handleSend = () => {
    if (input.trim() && !isInputDisabled && !isBusy) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleCancel = () => {
    if (canCancel) {
      onCancelMessage();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isBusy) {
      e.preventDefault();
      handleSend();
    }
  };

  // 默认 placeholder 逻辑
  const defaultPlaceholder = isInputDisabled
    ? '请先选择工作目录...'
    : isBusy
      ? 'AI 正在处理中...'
      : '输入消息... (Enter发送, Shift+Enter换行)';

  return (
    <div className="input-box">
      <div className="input-container">
        <div className="input-row">
          <textarea
            ref={textareaRef}
            className="input-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText || defaultPlaceholder}
            disabled={isInputDisabled || isBusy}
            rows={1}
          />
          {isBusy ? (
            <button
              className="cancel-button"
              onClick={handleCancel}
              disabled={!canCancel}
              title={isCancelling ? '正在中断...' : '中断 AI 思考'}
            >
              {isCancelling ? '⏹ 中断中...' : '⏹ 中断'}
            </button>
          ) : (
            <button
              className="send-button"
              onClick={handleSend}
              disabled={isInputDisabled || !input.trim()}
            >
              发送
            </button>
          )}
        </div>
        {currentProviderName && currentModelName && (
          <div className="input-model-info">
            {currentProviderName} · {currentModelName}
          </div>
        )}
      </div>
    </div>
  );
}

export default InputBox;
