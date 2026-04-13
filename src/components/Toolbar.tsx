import React from 'react';
import './Toolbar.css';

interface ToolbarProps {
  workingDirectory: string | null;
  onWorkingDirectoryChange: (dir: string) => void;
  onClearChat: () => void;
}

function Toolbar({
  workingDirectory,
  onWorkingDirectoryChange,
  onClearChat,
}: ToolbarProps) {
  const handleSelectDirectory = () => {
    // Mock directory selection
    const mockDir = '/Users/example/project';
    onWorkingDirectoryChange(mockDir);
  };

  const handleClearChat = () => {
    if (window.confirm('确定要清空对话历史吗?')) {
      onClearChat();
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className="working-dir-label">工作目录:</span>
        {workingDirectory ? (
          <span className="working-dir-path" title={workingDirectory}>
            {workingDirectory}
          </span>
        ) : (
          <span className="working-dir-path" style={{ color: 'var(--text-tertiary)' }}>
            未选择
          </span>
        )}
      </div>
      <div className="toolbar-right">
        <button className="toolbar-button" onClick={handleSelectDirectory}>
          选择目录
        </button>
        <button className="toolbar-button" onClick={handleClearChat}>
          清空对话
        </button>
      </div>
    </div>
  );
}

export default Toolbar;
