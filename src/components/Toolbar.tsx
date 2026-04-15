import React from 'react';
import './Toolbar.css';

interface ToolbarProps {
  workingDirectory: string | null;
  onMenuClick: () => void;
}

function Toolbar({
  workingDirectory,
  onMenuClick,
}: ToolbarProps) {
  const getDirectoryName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <button className="toolbar-menu-button" onClick={onMenuClick} title="Sessions">
          ☰
        </button>
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
    </div>
  );
}

export default Toolbar;
