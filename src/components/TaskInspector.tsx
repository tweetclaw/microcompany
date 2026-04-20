import React from 'react';
import { Task, TaskRole } from '../types';
import { useTaskStatistics } from '../hooks/useApi';
import './TaskInspector.css';

interface TaskInspectorProps {
  task: Task;
  currentRoleId: string | null;
  onRoleSelected: (roleId: string) => void;
  onForwardLatestReply: () => void;
  hasLatestReply: boolean;
}

export default function TaskInspector({
  task,
  currentRoleId,
  onRoleSelected,
  onForwardLatestReply,
  hasLatestReply,
}: TaskInspectorProps) {
  const { stats, loading, error } = useTaskStatistics(task.id);
  const [showAllRoles, setShowAllRoles] = React.useState(false);

  return (
    <div className="task-inspector">
      <div className="task-inspector-section">
        <div className="task-inspector-section-title">Roles in Task</div>
        <div className="role-list">
          {task.roles.map((role) => (
            <div
              key={role.id}
              className={`role-card ${currentRoleId === role.id ? 'active' : ''}`}
              onClick={() => onRoleSelected(role.id)}
            >
              <div className="role-card-header">
                {currentRoleId === role.id && <span className="role-active-indicator">✓</span>}
                <span className="role-name">{role.name}</span>
              </div>
              <div className="role-card-details">
                <div className="role-identity">{role.identity}</div>
                <div className="role-model">{role.model}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="task-inspector-section">
        <div className="task-inspector-section-title">Actions</div>
        <button
          className="task-action-button"
          onClick={onForwardLatestReply}
          disabled={!hasLatestReply}
          title={hasLatestReply ? 'Forward latest reply to another role' : 'No reply to forward'}
        >
          <span className="task-action-icon">📤</span>
          <span>Forward Latest Reply</span>
        </button>
      </div>

      <div className="task-inspector-section">
        <div className="task-inspector-section-title">Statistics</div>
        {loading ? (
          <div className="task-stats-loading">Loading...</div>
        ) : error ? (
          <div className="task-stats-error">Failed to load statistics</div>
        ) : stats ? (
          <div className="task-stats">
            <div className="task-stat-item">
              <span className="task-stat-label">Total Messages</span>
              <span className="task-stat-value">{stats.total_messages}</span>
            </div>
            <div className="task-stat-item">
              <span className="task-stat-label">Created</span>
              <span className="task-stat-value">{new Date(stats.created_at).toLocaleDateString()}</span>
            </div>
            {stats.messages_by_role.length > 0 && (
              <div className="task-stat-roles">
                <div className="task-stat-roles-title">Messages by Role</div>
                {(showAllRoles ? stats.messages_by_role : stats.messages_by_role.slice(0, 3)).map((roleStats) => (
                  <div key={roleStats.role_id} className="task-stat-role-item">
                    <span className="task-stat-role-name">{roleStats.role_name}</span>
                    <span className="task-stat-role-count">{roleStats.message_count}</span>
                  </div>
                ))}
                {stats.messages_by_role.length > 3 && (
                  <button
                    className="task-stat-show-more"
                    onClick={() => setShowAllRoles(!showAllRoles)}
                  >
                    {showAllRoles ? '收起' : `显示全部 ${stats.messages_by_role.length} 个角色`}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="task-stats-empty">No statistics available</div>
        )}
      </div>
    </div>
  );
}
