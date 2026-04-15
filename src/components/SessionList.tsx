import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import './SessionList.css';

interface SessionInfo {
  working_directory: string;
  message_count: number;
  last_activity: number;
}

interface SessionListProps {
  onSessionSelected: (directory: string) => void;
}

function SessionList({ onSessionSelected }: SessionListProps) {
  const [sessions, setSessions] = React.useState<SessionInfo[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const result = await invoke<SessionInfo[]>('list_sessions');
      setSessions(result);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (workingDir: string, event: React.MouseEvent) => {
    event.stopPropagation();

    if (!window.confirm('确定要删除这个会话吗？')) {
      return;
    }

    try {
      await invoke('delete_session', { workingDir });
      await loadSessions();
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert(`删除会话失败: ${error}`);
    }
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp * 1000;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (hours < 1) return '刚刚';
    if (hours < 24) return `${hours} 小时前`;
    if (days === 1) return '昨天';
    if (days < 7) return `${days} 天前`;

    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('zh-CN');
  };

  const getDirectoryName = (path: string) => {
    // Extract directory name from full path
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  if (loading) {
    return (
      <div className="session-list-loading">
        <div className="loading-spinner"></div>
        <p>加载会话中...</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="session-list-empty">
        <p>暂无历史会话</p>
        <p className="session-list-empty-hint">选择一个工作目录开始对话</p>
      </div>
    );
  }

  return (
    <div className="session-list">
      {sessions.map((session, index) => (
        <div
          key={index}
          className="session-item"
          onClick={() => onSessionSelected(session.working_directory)}
        >
          <div className="session-icon">📂</div>
          <div className="session-info">
            <div className="session-name">{getDirectoryName(session.working_directory)}</div>
            <div className="session-meta">
              {session.message_count} 条消息 · {formatTime(session.last_activity)}
            </div>
          </div>
          <button
            className="session-delete"
            onClick={(e) => handleDeleteSession(session.working_directory, e)}
            title="删除会话"
          >
            🗑️
          </button>
        </div>
      ))}
    </div>
  );
}

export default SessionList;
