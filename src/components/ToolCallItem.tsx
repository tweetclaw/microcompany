import React, { useState } from 'react';
import { ToolCallRecord } from '../types';
import './ToolCallItem.css';

interface ToolCallItemProps {
  toolCall: ToolCallRecord;
}

const ToolCallItem: React.FC<ToolCallItemProps> = ({ toolCall }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'running':
        return '⏳';
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      default:
        return '•';
    }
  };

  const getStatusClass = () => {
    return `tool-call-status-${toolCall.status}`;
  };

  return (
    <div className={`tool-call-item ${getStatusClass()}`}>
      <div
        className="tool-call-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="tool-call-status-icon">{getStatusIcon()}</span>
        <span className="tool-call-tool">{toolCall.tool}</span>
        <span className="tool-call-action">{toolCall.action}</span>
        <span className="tool-call-expand">{isExpanded ? '▼' : '▶'}</span>
      </div>

      {isExpanded && toolCall.result && (
        <div className="tool-call-result">
          <pre>{toolCall.result}</pre>
        </div>
      )}
    </div>
  );
};

export default ToolCallItem;
