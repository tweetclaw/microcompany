import React from 'react';
import SessionList from './SessionList';
import './SessionListPanel.css';

interface SessionListPanelProps {
  workingDirectory: string;
  currentSessionId: string | null;
  sessionListRefreshKey: number;
  onSessionSelected: (sessionId: string) => void;
  onSessionDeleted: (sessionId: string) => void;
  onNewChatClick: () => void;
}

export default function SessionListPanel({
  workingDirectory,
  currentSessionId,
  sessionListRefreshKey,
  onSessionSelected,
  onSessionDeleted,
  onNewChatClick,
}: SessionListPanelProps) {
  return (
    <div className="session-list-panel">
      <div className="session-list-header">
        <button className="new-chat-button" onClick={onNewChatClick}>
          <span className="new-chat-icon">➕</span>
          <span>新建对话</span>
        </button>
      </div>
      <div className="session-list-content">
        <SessionList
          workingDirectory={workingDirectory}
          currentSessionId={currentSessionId}
          refreshKey={sessionListRefreshKey}
          onSessionSelected={onSessionSelected}
          onSessionDeleted={onSessionDeleted}
        />
      </div>
    </div>
  );
}
