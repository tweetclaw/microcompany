import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import './SessionList.css';

export interface SessionInfo {
  session_id: string;
  working_directory: string;
  title: string;
  message_count: number;
  last_activity: number;
  created_at: number;
  provider_id?: string | null;
  provider_name?: string | null;
  model?: string | null;
}

interface SessionListProps {
  workingDirectory: string;
  currentSessionId?: string | null;
  refreshKey?: string | number;
  onSessionSelected: (sessionId: string) => void;
}

function SessionList({ workingDirectory, currentSessionId, refreshKey, onSessionSelected }: SessionListProps) {
  const [sessions, setSessions] = React.useState<SessionInfo[]>([]);
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
      const result = await invoke<SessionInfo[]>('list_sessions', { workingDir: workingDirectory });
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
      await invoke('delete_session', { sessionId });
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
        <p className="session-list-empty-hint">点击右上角“新建”开始第一段对话</p>
      </div>
    );
  }

  return (
    <div className="session-list">
      {sessions.map((session) => (
        <div
          key={session.session_id}
          className={[
            'session-item',
            currentSessionId === session.session_id ? 'session-item-active' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => onSessionSelected(session.session_id)}
        >
          <div className="session-icon">💬</div>
          <div className="session-info">
            <div className="session-name">{session.title}</div>
            <div className="session-meta">
              {session.message_count} 条消息 · {formatTime(session.last_activity)}
            </div>
            {(session.provider_name || session.model) && (
              <div className="session-provider-badge">
                {session.provider_name || session.provider_id || 'Provider'} · {session.model || 'Default'}
              </div>
            )}
          </div>
          <button
            className="session-delete"
            onClick={(e) => handleDeleteSession(session.session_id, e)}
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
