import React, { useState, useEffect } from 'react';
import { Task, TaskRole, Message } from '../types';
import { ProviderConfig } from '../types/settings';
import './TaskWorkspace.css';

interface TaskWorkspaceProps {
  task: Task;
  workingDirectory: string;
  availableProviders: ProviderConfig[];
  currentRoleId: string | null;
  onRoleSelected: (roleId: string) => void;
  onForwardLatestReply: () => void;
  onExitTask: () => void;
  children: React.ReactNode;
}

function TaskWorkspace({
  task,
  workingDirectory,
  availableProviders,
  currentRoleId,
  onRoleSelected,
  onForwardLatestReply,
  onExitTask,
  children,
}: TaskWorkspaceProps) {
  const currentRole = task.roles.find((r) => r.id === currentRoleId);

  return (
    <div className="task-workspace">
      <div className="task-workspace-header">
        <div className="task-workspace-title">Task: {task.name}</div>
        <button className="task-exit-button" onClick={onExitTask}>
          ← Exit Task
        </button>
      </div>

      <div className="task-workspace-body">
        <div className="task-roles-sidebar">
          <div className="task-roles-header">Roles in Task</div>
          <div className="task-roles-list">
            {task.roles.map((role) => (
              <div
                key={role.id}
                className={`task-role-item ${currentRoleId === role.id ? 'active' : ''}`}
                onClick={() => onRoleSelected(role.id)}
              >
                <div className="task-role-indicator">
                  {currentRoleId === role.id ? '●' : '○'}
                </div>
                <div className="task-role-info">
                  <div className="task-role-item-name">{role.name}</div>
                  <div className="task-role-item-identity">{role.identity}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="task-main-area">
          {currentRole && (
            <div className="task-current-role-header">
              <div className="task-current-role-info">
                Current Role: {currentRole.name} ({currentRole.identity})
              </div>
              <button
                className="task-forward-button"
                onClick={onForwardLatestReply}
              >
                Forward Latest Reply
              </button>
            </div>
          )}
          <div className="task-chat-container">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default TaskWorkspace;
