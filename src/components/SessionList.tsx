import React from 'react';
import { listNormalSessions, deleteSession } from '../api';
import { SessionSummary } from '../types/api';
import './SessionList.css';

interface SessionListProps {
  workingDirectory: string;
  currentSessionId?: string | null;
  refreshKey?: string | number;
  onSessionSelected: (sessionId: string) => void;
  onSessionDeleted?: (sessionId: string) => void;
}

function SessionList({ workingDirectory, currentSessionId, refreshKey, onSessionSelected, onSessionDeleted }: SessionListProps) {
  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadSessions();
  }, [workingDirectory, refreshKey]);

  const loadSessions = async () => {
    if (!workingDirectory) {
      setSessions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const result = await listNormalSessions();
      setSessions(result);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    if (!window.confirm('确定要删除这个会话吗？')) {
      return;
    }

    try {
      await deleteSession(sessionId);

      if (onSessionDeleted) {
        onSessionDeleted(sessionId);
      }

      await loadSessions();
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert(`删除会话失败: ${error}`);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (hours < 1) return '刚刚';
    if (hours < 24) return `${hours} 小时前`;
    if (days === 1) return '昨天';
    if (days < 7) return `${days} 天前`;

    return date.toLocaleDateString('zh-CN');
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
        <p className="session-list-empty-hint">点击右上角"新建"开始第一段对话</p>
      </div>
    );
  }

  return (
    <div className="session-list">
      {sessions.map((session) => (
        <div
          key={session.id}
          className={[
            'session-item',
            currentSessionId === session.id ? 'session-item-active' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => onSessionSelected(session.id)}
        >
          <div className="session-icon">💬</div>
          <div className="session-info">
            <div className="session-name">{session.name}</div>
            <div className="session-meta">
              <span className="session-time">{formatTime(session.updated_at)}</span>
              <span className="session-count">{session.message_count} 条消息</span>
              {session.provider && (
                <span className="session-provider">
                  {session.provider} · {session.model}
                </span>
              )}
            </div>
          </div>
          <button
            className="session-delete"
            onClick={(e) => handleDeleteSession(session.id, e)}
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
