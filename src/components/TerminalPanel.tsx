import React from 'react';
import './TerminalPanel.css';

interface TerminalPanelProps {
  collapsed: boolean;
}

function TerminalPanel({ collapsed }: TerminalPanelProps) {
  if (collapsed) {
    return null;
  }

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <span className="terminal-title">终端</span>
      </div>
      <div className="terminal-content">
        <div className="terminal-placeholder">
          <p>命令行工作区</p>
          <p className="terminal-hint">终端功能即将推出...</p>
        </div>
      </div>
    </div>
  );
}

export default TerminalPanel;
