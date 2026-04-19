import React, { useState } from 'react';
import { Task, TaskRole } from '../types';
import { ProviderConfig } from '../types/settings';
import AddRoleModal from './AddRoleModal';
import './TaskBuilder.css';

interface TaskBuilderProps {
  workingDirectory: string;
  availableProviders: ProviderConfig[];
  onTaskCreated: (task: Task) => void;
  onCancel: () => void;
}

function TaskBuilder({
  workingDirectory,
  availableProviders,
  onTaskCreated,
  onCancel,
}: TaskBuilderProps) {
  const [taskName, setTaskName] = useState('');
  const [roles, setRoles] = useState<TaskRole[]>([]);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);

  const handleStartTask = () => {
    if (roles.length === 0) {
      alert('Please add at least one role');
      return;
    }

    const task: Task = {
      id: `task-${Date.now()}`,
      name: taskName || 'Untitled Task',
      roles,
      createdAt: Date.now(),
    };

    onTaskCreated(task);
  };

  const handleAddRole = () => {
    setShowAddRoleModal(true);
  };

  const handleRoleCreated = (role: TaskRole) => {
    setRoles([...roles, role]);
    setShowAddRoleModal(false);
  };

  return (
    <div className="task-builder">
      <div className="task-builder-header">
        <h2>New Task</h2>
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
          {roles.length === 0 ? (
            <div className="task-builder-empty">
              <p>No roles yet. Create the first role for this task.</p>
            </div>
          ) : (
            <div className="task-roles-list">
              {roles.map((role) => (
                <div key={role.id} className="task-role-card">
                  <div className="task-role-name">{role.name}</div>
                  <div className="task-role-meta">
                    {role.identity} · {role.providerName} · {role.model}
                  </div>
                  <div className="task-role-status">
                    {role.sessionReady ? 'Session ready' : 'Creating session...'}
                  </div>
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
          disabled={roles.length === 0}
        >
          Start Task
        </button>
      </div>

      {showAddRoleModal && (
        <AddRoleModal
          workingDirectory={workingDirectory}
          availableProviders={availableProviders}
          onRoleCreated={handleRoleCreated}
          onCancel={() => setShowAddRoleModal(false)}
        />
      )}
    </div>
  );
}

export default TaskBuilder;
