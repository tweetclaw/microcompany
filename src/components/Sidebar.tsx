import React from 'react';
import SessionList from './SessionList';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkingDirectory: string;
}

function Sidebar({ isOpen, onClose, currentWorkingDirectory }: SidebarProps) {
  const handleSessionSelected = (directory: string) => {
    // Check if it's the same directory
    if (directory === currentWorkingDirectory) {
      onClose();
      return;
    }

    // Show confirmation dialog
    const confirmed = window.confirm(
      '切换会话需要重启应用。\n\n是否保存选择并关闭应用？\n（重新启动应用后将自动加载选中的会话）'
    );

    if (confirmed) {
      // Save selected directory to localStorage
      localStorage.setItem('pendingWorkingDirectory', directory);

      // Show instruction to user
      alert('请重新启动应用以加载选中的会话。');

      // Close sidebar
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="sidebar-overlay" onClick={onClose}></div>
      <div className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <h2>Sessions</h2>
          <button className="sidebar-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="sidebar-content">
          <SessionList onSessionSelected={handleSessionSelected} />
        </div>
      </div>
    </>
  );
}

export default Sidebar;
