import React, { useMemo, useState } from 'react';
import { TaskCreateRequest, RoleConfig } from '../types';
import { ProviderConfig } from '../types/settings';
import type { SystemTemplate, TemplateSummary, CreateFromTemplateRequest, UserTemplate, TemplateRole } from '../types/template';
import AddRoleModal from './AddRoleModal';
import TemplatePicker from './TemplatePicker';
import TemplateDraftEditor from './TemplateDraftEditor';
import './TaskBuilder.css';

interface TaskBuilderProps { workingDirectory: string; availableProviders: ProviderConfig[]; onTaskCreated: (taskRequest: TaskCreateRequest) => void; onCancel: () => void; }

function applyTemplateRoleOverrides(templateRoles: TemplateRole[], request: CreateFromTemplateRequest, availableProviders: ProviderConfig[]): RoleConfig[] {
  return templateRoles.map((role, index) => {
    const override = request.role_overrides?.[role.name];
    const matchedProvider = override?.provider
      ? availableProviders.find((provider) => provider.id === override.provider)
      : null;

    return {
      ...role,
      provider: override?.provider ?? role.provider,
      model: override?.model ?? matchedProvider?.model ?? role.model,
      display_order: index,
    };
  });
}

function TaskBuilder({ workingDirectory, availableProviders, onTaskCreated, onCancel }: TaskBuilderProps) {
  const [taskName, setTaskName] = useState(''); const [roles, setRoles] = useState<RoleConfig[]>([]); const [showAddRoleModal, setShowAddRoleModal] = useState(false); const [pmFirstWorkflow, setPmFirstWorkflow] = useState(true); const [creationMode, setCreationMode] = useState<'from-scratch' | 'from-template' | 'template-picker'>('template-picker'); const [selectedTemplate, setSelectedTemplate] = useState<SystemTemplate | UserTemplate | TemplateSummary | null>(null); const sortedRoles = useMemo(() => [...roles].sort((a, b) => a.display_order - b.display_order), [roles]);
  if (creationMode === 'template-picker') return <TemplatePicker onSelectTemplate={(template) => { setSelectedTemplate(template); setCreationMode('from-template'); }} onCreateBlank={() => setCreationMode('from-scratch')} onCancel={onCancel} availableProviders={availableProviders} />;
  if (creationMode === 'from-template' && selectedTemplate) return <TemplateDraftEditor template={selectedTemplate} availableProviders={availableProviders} onConfirm={(request: CreateFromTemplateRequest) => { const templateRoles = 'roles' in selectedTemplate ? selectedTemplate.roles : []; onTaskCreated({ name: request.task_name.trim(), description: 'description' in selectedTemplate ? selectedTemplate.description : '', icon: selectedTemplate.icon || 'task', pm_first_workflow: 'pm_first_workflow' in selectedTemplate ? selectedTemplate.pm_first_workflow : false, working_directory: workingDirectory, roles: applyTemplateRoleOverrides(templateRoles, request, availableProviders) }); }} onBack={() => { setCreationMode('template-picker'); setSelectedTemplate(null); }} onCancel={onCancel} />;
  return <div className="task-builder-overlay"><div className="task-builder-modal"><div className="task-builder-header"><button className="task-builder-back" onClick={() => setCreationMode('template-picker')}>← Back</button><h2>New Task</h2><button className="task-builder-close" onClick={onCancel}>✕</button></div><div className="task-builder-content"><div className="task-builder-field"><label>Task Name:</label><input type="text" value={taskName} onChange={(e) => setTaskName(e.target.value)} className="task-name-input" /></div><div className="task-builder-field"><label>Roles</label><button className="task-add-role-button" onClick={() => setShowAddRoleModal(true)}>+ Add Role</button></div></div></div>{showAddRoleModal && <AddRoleModal workingDirectory={workingDirectory} availableProviders={availableProviders} onRoleCreated={(role) => setRoles((current) => [...current, { ...role, display_order: current.length }])} onCancel={() => setShowAddRoleModal(false)} />}</div>;
}
export default TaskBuilder;
