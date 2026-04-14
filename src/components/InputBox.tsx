import React, { useState, KeyboardEvent } from 'react';
import './InputBox.css';

interface InputBoxProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
}

function InputBox({ onSendMessage, disabled = false }: InputBoxProps) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
          placeholder={disabled ? '请先选择工作目录...' : '输入消息... (Enter发送, Shift+Enter换行)'}
          disabled={disabled}
          rows={1}
        />
        <button
          className="send-button"
          onClick={handleSend}
          disabled={disabled || !input.trim()}
        >
          发送
        </button>
      </div>
    </div>
  );
}

export default InputBox;
