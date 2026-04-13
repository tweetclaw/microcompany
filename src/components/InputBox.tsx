import React, { useState, KeyboardEvent } from 'react';
import './InputBox.css';

interface InputBoxProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
}

function InputBox({ onSendMessage, disabled }: InputBoxProps) {
  const [content, setContent] = useState('');

  const handleSend = () => {
    if (content.trim() && !disabled) {
      onSendMessage(content.trim());
      setContent('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="input-box-container">
      <div className="input-box">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "请先选择工作目录再开始对话..." : "Type a message... (Press Enter to send, Shift+Enter for new line)"}
          disabled={disabled}
          rows={1}
        />
        <button 
          className="send-button"
          onClick={handleSend}
          disabled={disabled || !content.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default InputBox;
