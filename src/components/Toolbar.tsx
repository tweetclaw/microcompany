import React from 'react';
import './Toolbar.css';

interface ToolbarProps {
  workingDirectory: string | null;
  onClearChat: () => void;
}

function Toolbar({
  workingDirectory,
  onClearChat,
}: ToolbarProps) {
  const handleClearChat = () => {
    if (window.confirm('确定要清空对话历史吗?')) {
      onClearChat();
    }
  };

  const getDirectoryName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className="working-dir-label">工作目录:</span>
        {workingDirectory ? (
          <span className="working-dir-path" title={workingDirectory}>
            {getDirectoryName(workingDirectory)}
          </span>
        ) : (
          <span className="working-dir-path" style={{ color: 'var(--text-tertiary)' }}>
            未选择
          </span>
        )}
      </div>
      <div className="toolbar-right">
        <button className="toolbar-button" onClick={handleClearChat}>
          清空对话
        </button>
      </div>
    </div>
  );
}

export default Toolbar;
