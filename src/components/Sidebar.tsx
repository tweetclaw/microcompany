import React from 'react';
import SessionList from './SessionList';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
  collapsed: boolean;
  isCompact: boolean;
  onClose: () => void;
  currentWorkingDirectory: string;
  currentSessionId?: string | null;
  onSessionSelected: (sessionId: string) => void;
}

function Sidebar({
  isOpen,
  collapsed,
  isCompact,
  onClose,
  currentWorkingDirectory,
  currentSessionId,
  onSessionSelected,
}: SidebarProps) {
  const handleSessionSelected = (sessionId: string) => {
    onSessionSelected(sessionId);
    if (isCompact) {
      onClose();
    }
  };

  const sidebarBody = (
    <div
      className={[
        'sidebar',
        isCompact ? 'sidebar-compact' : 'sidebar-docked',
        isCompact && isOpen ? 'sidebar-open' : '',
        !isCompact && collapsed ? 'sidebar-collapsed' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="sidebar-header">
        <div>
          <div className="sidebar-eyebrow">Workspace</div>
          <h2>Sessions</h2>
        </div>
        {isCompact && (
          <button className="sidebar-close" onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      <div className="sidebar-content">
        <SessionList
          workingDirectory={currentWorkingDirectory}
          currentSessionId={currentSessionId}
          onSessionSelected={handleSessionSelected}
        />
      </div>
    </div>
  );

  if (isCompact) {
    if (!isOpen) return null;
    return (
      <>
        <div className="sidebar-overlay" onClick={onClose}></div>
        {sidebarBody}
      </>
    );
  }

  return sidebarBody;
}

export default Sidebar;
