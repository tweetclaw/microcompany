import React, { useState, KeyboardEvent } from 'react';
import './InputBox.css';

interface InputBoxProps {
  onSendMessage: (content: string) => void;
  onCancelMessage: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}

function InputBox({ onSendMessage, onCancelMessage, disabled = false, isLoading = false }: InputBoxProps) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (input.trim() && !disabled && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleCancel = () => {
    onCancelMessage();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
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
          placeholder={disabled ? '请先选择工作目录...' : isLoading ? 'AI 正在思考中...' : '输入消息... (Enter发送, Shift+Enter换行)'}
          disabled={disabled || isLoading}
          rows={1}
        />
        {isLoading ? (
          <button
            className="cancel-button"
            onClick={handleCancel}
            title="中断 AI 思考"
          >
            ⏹ 中断
          </button>
        ) : (
          <button
            className="send-button"
            onClick={handleSend}
            disabled={disabled || !input.trim()}
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}

export default InputBox;
