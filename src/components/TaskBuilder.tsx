import React, { useMemo, useState } from 'react';
import { TaskCreateRequest, RoleConfig } from '../types';
import { ProviderConfig } from '../types/settings';
import type { SystemTemplate, TemplateSummary, CreateFromTemplateRequest } from '../types/template';
import AddRoleModal from './AddRoleModal';
import TemplatePicker from './TemplatePicker';
import TemplateDraftEditor from './TemplateDraftEditor';
import './TaskBuilder.css';

interface TaskBuilderProps {
  workingDirectory: string;
  availableProviders: ProviderConfig[];
  onTaskCreated: (taskRequest: TaskCreateRequest) => void;
  onCancel: () => void;
}

const PRODUCT_MANAGER_IDENTITIES = new Set(['product manager', 'pm', '项目经理', '产品经理']);
const PRODUCT_MANAGER_ARCHETYPE_IDS = new Set(['product_manager']);

function hasProductManagerRole(roles: RoleConfig[]) {
  return roles.some((role) => {
    const normalizedIdentity = role.identity.trim().toLowerCase();
    return PRODUCT_MANAGER_IDENTITIES.has(normalizedIdentity)
      || (role.archetype_id ? PRODUCT_MANAGER_ARCHETYPE_IDS.has(role.archetype_id) : false);
  });
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
  const [pmFirstWorkflow, setPmFirstWorkflow] = useState(true);
  
  // Template flow state
  const [creationMode, setCreationMode] = useState<'from-scratch' | 'from-template' | 'template-picker'>('template-picker');
  const [selectedTemplate, setSelectedTemplate] = useState<SystemTemplate | TemplateSummary | null>(null);

  const sortedRoles = useMemo(
    () => [...roles].sort((left, right) => left.display_order - right.display_order),
    [roles]
  );

  const hasPmRole = useMemo(() => hasProductManagerRole(sortedRoles), [sortedRoles]);

  const handleStartTask = () => {
    if (!taskName.trim()) {
      alert('请输入任务名称');
      return;
    }

    if (roles.length === 0) {
      alert('Please add at least one role');
      return;
    }

    if (pmFirstWorkflow && !hasPmRole) {
      alert('PM-first workflow requires a Product Manager role');
      return;
    }

    const taskRequest: TaskCreateRequest = {
      name: taskName.trim(),
      description: '',
      icon: 'task',
      pm_first_workflow: pmFirstWorkflow,
      working_directory: workingDirectory,
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

  const handleTemplateSelected = (template: SystemTemplate | TemplateSummary) => {
    setSelectedTemplate(template);
    setCreationMode('from-template');
  };

  const handleConfirmTemplate = (request: CreateFromTemplateRequest) => {
    // Convert CreateFromTemplateRequest to TaskCreateRequest
    // We need to get the resolved roles from the template
    if (!selectedTemplate) {
      alert('Template not selected');
      return;
    }

    const roles = 'roles' in selectedTemplate ? selectedTemplate.roles : [];
    const pmFirstWorkflow = 'pm_first_workflow' in selectedTemplate ? selectedTemplate.pm_first_workflow : false;

    // Apply role overrides if provided
    const finalRoles = roles.map((role) => {
      const override = request.role_overrides?.[role.name];
      const provider = override?.provider || role.provider;
      return {
        name: role.name,
        identity: role.identity,
        provider: provider, // Backend expects 'provider' field (Provider ID)
        model: provider, // Backend expects 'model' field (will be resolved by backend)
        archetype_id: role.archetype_id || undefined,
        handoff_enabled: role.handoff_enabled,
        system_prompt_append: role.system_prompt_append || undefined,
        custom_system_prompt: role.custom_system_prompt || undefined,
        display_order: 0, // Will be set below
      };
    });

    const taskRequest: TaskCreateRequest = {
      name: request.task_name.trim(),
      description: 'description' in selectedTemplate ? selectedTemplate.description : '',
      icon: selectedTemplate.icon || 'task',
      pm_first_workflow: pmFirstWorkflow,
      working_directory: workingDirectory,
      roles: finalRoles.map((role, index) => ({
        ...role,
        display_order: index,
      })),
    };

    onTaskCreated(taskRequest);
  };

  const handleBackToTemplatePicker = () => {
    setCreationMode('template-picker');
    setSelectedTemplate(null);
  };

  // Render template picker (now the default entry point)
  if (creationMode === 'template-picker') {
    return (
      <TemplatePicker
        onSelectTemplate={handleTemplateSelected}
        onCreateBlank={() => setCreationMode('from-scratch')}
        onCancel={onCancel}
        availableProviders={availableProviders}
      />
    );
  }

  // Render template draft editor
  if (creationMode === 'from-template' && selectedTemplate) {
    return (
      <TemplateDraftEditor
        template={selectedTemplate}
        onConfirm={handleConfirmTemplate}
        onBack={handleBackToTemplatePicker}
        onCancel={onCancel}
      />
    );
  }

  // Render from-scratch builder (original UI)
  return (
    <>
      <div className="task-builder-overlay" onClick={onCancel}>
        <div className="task-builder-modal" onClick={(e) => e.stopPropagation()}>
          <div className="task-builder-header">
            <button className="task-builder-back" onClick={handleBackToTemplatePicker} aria-label="Back">
              ← Back
            </button>
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
              <label>Workflow</label>
              <div className="task-builder-workflow-card">
                <label className="task-builder-checkbox-row">
                  <input
                    type="checkbox"
                    checked={pmFirstWorkflow}
                    onChange={(e) => setPmFirstWorkflow(e.target.checked)}
                  />
                  <span>Start with the Product Manager</span>
                </label>
                <p className="task-builder-workflow-help">
                  When enabled, the Product Manager reads the task-template proposal first, defines the smallest scope, and tells you which role should work next.
                </p>
                {pmFirstWorkflow && !hasPmRole && sortedRoles.length > 0 && (
                  <p className="task-builder-workflow-warning">
                    Add a Product Manager role before starting this workflow.
                  </p>
                )}
              </div>
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
