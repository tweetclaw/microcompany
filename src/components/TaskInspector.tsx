import React from 'react';
import { Task, TaskRole } from '../types';
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
        <div className="task-inspector-section-title">Activity Log</div>
        <div className="activity-log">
          <div className="activity-log-placeholder">Activity log coming soon...</div>
        </div>
      </div>
    </div>
  );
}
