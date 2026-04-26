import React, { useMemo, useState } from 'react';
import { TaskCreateRequest, RoleConfig } from '../types';
import { ProviderConfig } from '../types/settings';
import AddRoleModal from './AddRoleModal';
import './TaskBuilder.css';

interface TaskBuilderProps {
  workingDirectory: string;
  availableProviders: ProviderConfig[];
  onTaskCreated: (taskRequest: TaskCreateRequest) => void;
  onCancel: () => void;
}

function TaskBuilder({
  workingDirectory,
  availableProviders,
  onTaskCreated,
  onCancel,
}: TaskBuilderProps) {
  const [taskName, setTaskName] = useState('');
  const [roles, setRoles] = useState<RoleConfig[]>([]);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);

  const sortedRoles = useMemo(
    () => [...roles].sort((left, right) => left.display_order - right.display_order),
    [roles]
  );

  const handleStartTask = () => {
    if (!taskName.trim()) {
      alert('请输入任务名称');
      return;
    }

    if (roles.length === 0) {
      alert('Please add at least one role');
      return;
    }

    const taskRequest: TaskCreateRequest = {
      name: taskName.trim(),
      description: '',
      icon: '📋',
      roles: sortedRoles.map((role, index) => ({
        ...role,
        display_order: index,
      })),
    };

    onTaskCreated(taskRequest);
  };

  const handleAddRole = () => {
    setShowAddRoleModal(true);
  };

  const handleRoleCreated = (role: RoleConfig) => {
    setRoles((currentRoles) => [
      ...currentRoles,
      {
        ...role,
        display_order: currentRoles.length,
      },
    ]);
    setShowAddRoleModal(false);
  };

  return (
    <>
      <div className="task-builder-overlay" onClick={onCancel}>
        <div className="task-builder-modal" onClick={(e) => e.stopPropagation()}>
          <div className="task-builder-header">
            <h2>New Task</h2>
            <button className="task-builder-close" onClick={onCancel} aria-label="Close task builder">✕</button>
          </div>

          <div className="task-builder-content">
            <div className="task-builder-field">
              <label>Task Name:</label>
              <input
                type="text"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="Enter task name"
                className="task-name-input"
              />
            </div>

            <div className="task-builder-field">
              <label>Roles</label>
              {sortedRoles.length === 0 ? (
                <div className="task-builder-empty">
                  <p>No roles yet. Create the first role for this task.</p>
                </div>
              ) : (
                <div className="task-roles-list">
                  {sortedRoles.map((role) => (
                    <div key={`${role.display_order}-${role.name}-${role.provider}`} className="task-role-card">
                      <div className="task-role-header">
                        <div className="task-role-name">{role.name}</div>
                        <div className="task-role-order">Role {role.display_order + 1}</div>
                      </div>
                      <div className="task-role-meta">
                        {role.identity} · {role.provider} · {role.model}
                      </div>
                      {role.archetype_id && (
                        <div className="task-role-archetype">Archetype: {role.archetype_id}</div>
                      )}
                      {role.handoff_enabled && (
                        <div className="task-role-flag">Handoff suggestions enabled</div>
                      )}
                      {role.system_prompt_append && (
                        <div className="task-role-override">
                          {role.system_prompt_append}
                        </div>
                      )}
                      {role.custom_system_prompt && (
                        <div className="task-role-override">
                          Uses a custom full system prompt
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <button className="task-add-role-button" onClick={handleAddRole}>
                + Add Role
              </button>
            </div>
          </div>

          <div className="task-builder-footer">
            <button className="task-builder-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="task-builder-start"
              onClick={handleStartTask}
              disabled={sortedRoles.length === 0}
            >
              Start Task
            </button>
          </div>
        </div>
      </div>

      {showAddRoleModal && (
        <AddRoleModal
          workingDirectory={workingDirectory}
          availableProviders={availableProviders}
          onRoleCreated={handleRoleCreated}
          onCancel={() => setShowAddRoleModal(false)}
        />
      )}
    </>
  );
}

export default TaskBuilder;
