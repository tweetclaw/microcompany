import React, { useState, KeyboardEvent } from 'react';
import './InputBox.css';

interface InputBoxProps {
  onSendMessage: (content: string) => void;
  onCancelMessage: () => void;
  isInputDisabled?: boolean;
  isBusy?: boolean;
  canCancel?: boolean;
  isCancelling?: boolean;
}

function InputBox({
  onSendMessage,
  onCancelMessage,
  isInputDisabled = false,
  isBusy = false,
  canCancel = false,
  isCancelling = false,
}: InputBoxProps) {
  const [input, setInput] = useState('');

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

  return (
    <div className="input-box">
      <div className="input-container">
        <textarea
          className="input-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isInputDisabled ? '请先选择工作目录...' : isBusy ? 'AI 正在处理中...' : '输入消息... (Enter发送, Shift+Enter换行)'}
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
    </div>
  );
}

export default InputBox;
