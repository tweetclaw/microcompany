import React from 'react';
import SessionList from './SessionList';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkingDirectory: string;
  onSessionSelected: (sessionId: string) => void;
}

function Sidebar({ isOpen, onClose, currentWorkingDirectory, onSessionSelected }: SidebarProps) {
  const handleSessionSelected = (sessionId: string) => {
    // 直接调用 onSessionSelected 加载会话
    onSessionSelected(sessionId);
    onClose();
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
