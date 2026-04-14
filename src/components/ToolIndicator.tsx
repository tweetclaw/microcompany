import React from 'react';
import { ToolCall } from '../types';
import './ToolIndicator.css';

interface ToolIndicatorProps {
  toolCall: ToolCall | null;
}

export const ToolIndicator: React.FC<ToolIndicatorProps> = ({ toolCall }) => {
  if (!toolCall) return null;

  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'running':
        return <span className="spinner">⏳</span>;
      case 'success':
        return <span className="check">✅</span>;
      case 'error':
        return <span className="error">❌</span>;
      default:
        return null;
    }
  };

  return (
    <div className={`tool-indicator tool-${toolCall.status}`}>
      <span className="tool-icon">🔧</span>
      <span className="tool-name">{toolCall.tool}</span>
      <span className="tool-action">{toolCall.action}</span>
      {getStatusIcon()}
    </div>
  );
};
