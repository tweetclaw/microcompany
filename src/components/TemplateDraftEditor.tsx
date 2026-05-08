import React, { useState, useMemo } from 'react';
import type { SystemTemplate, TemplateSummary, TemplateRole, TemplateWarning, CreateFromTemplateRequest, TemplateDraft } from '../types/template';
import { resolveTemplateDraft } from '../api/templates';
import './TemplateDraftEditor.css';

interface TemplateDraftEditorProps {
  template: SystemTemplate | TemplateSummary;
  onConfirm: (request: CreateFromTemplateRequest) => void;
  onBack: () => void;
  onCancel: () => void;
}

type RoleOverride = {
  provider?: string;
  model?: string;
};

function buildDraftFromTemplate(template: SystemTemplate | TemplateSummary, taskName: string): TemplateDraft {
  const roles: TemplateRole[] = 'roles' in template ? [...template.roles] : [];
  const pmFirstWorkflow = 'pm_first_workflow' in template ? template.pm_first_workflow : false;
  const warnings: TemplateWarning[] = [];

  roles.forEach((role, idx) => {
    if (!role.provider || role.provider.trim() === '') {
      warnings.push({
        type: 'missing_provider',
        role_index: idx,
        role_name: role.name,
        message: `Role "${role.name}" is missing a provider. Please select one before creating.`,
        blocking: true,
      });
    }
    if (!role.model || role.model.trim() === '') {
      warnings.push({
        type: 'missing_model',
        role_index: idx,
        role_name: role.name,
        message: `Role "${role.name}" is missing a model. Please select one before creating.`,
        blocking: true,
      });
    }
  });

  return {
    task_name: taskName,
    description: 'description' in template ? template.description : '',
    icon: template.icon || '📋',
    pm_first_workflow: pmFirstWorkflow,
    roles,
    warnings,
  };
}

export default function TemplateDraftEditor({
  template,
  onConfirm,
  onBack,
  onCancel,
}: TemplateDraftEditorProps) {
  const templateId = template.id;
  const templateSource = 'source' in template ? template.source : 'system';
  const initialTaskName = template.name;

  const [taskName, setTaskName] = useState(initialTaskName);

  // Derive the draft from the template
  const draft = useMemo(
    () => buildDraftFromTemplate(template, taskName),
    [template, taskName]
  );

  // Per-role overrides
  const [overrides, setOverrides] = useState<Record<number, RoleOverride>>({});

  const updateRoleOverride = (roleIndex: number, patch: Partial<RoleOverride>) => {
    setOverrides((prev) => ({
      ...prev,
      [roleIndex]: {
        ...prev[roleIndex],
        ...patch,
      },
    }));
  };

  // Compute final role state with overrides applied
  const resolvedRoles = useMemo(() => {
    return draft.roles.map((role, idx) => ({
      ...role,
      provider: overrides[idx]?.provider ?? role.provider,
      model: overrides[idx]?.model ?? role.model,
    }));
  }, [draft.roles, overrides]);

  // Re-check warnings after overrides
  const resolvedWarnings = useMemo(() => {
    const warnings: TemplateWarning[] = [];
    resolvedRoles.forEach((role, idx) => {
      if (!role.provider || role.provider.trim() === '') {
        warnings.push({
          type: 'missing_provider',
          role_index: idx,
          role_name: role.name,
          message: `Role "${role.name}" is missing a provider. Please select one before creating.`,
          blocking: true,
        });
      }
      if (!role.model || role.model.trim() === '') {
        warnings.push({
          type: 'missing_model',
          role_index: idx,
          role_name: role.name,
          message: `Role "${role.name}" is missing a model. Please select one before creating.`,
          blocking: true,
        });
      }
    });
    return warnings;
  }, [resolvedRoles]);

  const blockingWarnings = resolvedWarnings.filter((w) => w.blocking);
  const hasBlockingWarnings = blockingWarnings.length > 0;

  const handleCreate = () => {
    // Build role_overrides record keyed by role name
    const roleOverrides: Record<string, { provider?: string; model?: string }> = {};
    Object.entries(overrides).forEach(([idx, override]) => {
      const roleName = draft.roles[Number(idx)]?.name;
      if (roleName && (override.provider || override.model)) {
        roleOverrides[roleName] = {
          ...(override.provider ? { provider: override.provider } : {}),
          ...(override.model ? { model: override.model } : {}),
        };
      }
    });

    const request: CreateFromTemplateRequest = {
      template_id: templateId,
      template_source: templateSource,
      task_name: taskName.trim(),
      role_overrides: Object.keys(roleOverrides).length > 0 ? roleOverrides : undefined,
    };

    onConfirm(request);
  };

  return (
    <div className="draft-editor-overlay" onClick={onCancel}>
      <div className="draft-editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="draft-editor-header">
          <button className="draft-editor-back" onClick={onBack} aria-label="Back to templates">
            ← Back
          </button>
          <h2>Confirm Template</h2>
          <button className="draft-editor-close" onClick={onCancel} aria-label="Cancel">
            ✕
          </button>
        </div>

        <div className="draft-editor-content">
          {/* Task-level editing */}
          <div className="draft-section">
            <div className="draft-field">
              <label htmlFor="draft-task-name">Task Name</label>
              <input
                id="draft-task-name"
                type="text"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="Enter task name"
                className="draft-task-name-input"
              />
            </div>
            <div className="draft-field">
              <label>Template</label>
              <div className="draft-template-info">
                <span className="draft-template-icon">{template.icon || '📋'}</span>
                <span className="draft-template-name">{template.name}</span>
                <span className={`draft-template-source ${templateSource}`}>
                  {templateSource === 'system' ? 'System' : 'User'}
                </span>
              </div>
            </div>
          </div>

          {/* Warnings section */}
          {resolvedWarnings.length > 0 && (
            <div className="draft-section draft-warnings-section">
              <h3 className="draft-section-title">⚠ Warnings</h3>
              {blockingWarnings.length > 0 && (
                <div className="draft-warning-banner blocking">
                  {blockingWarnings.length} blocking issue{blockingWarnings.length > 1 ? 's' : ''} must be resolved before creating the task.
                </div>
              )}
              <div className="draft-warnings-list">
                {resolvedWarnings.map((warning, idx) => (
                  <div
                    key={idx}
                    className={`draft-warning-item ${warning.blocking ? 'blocking' : 'info'}`}
                  >
                    <span className="draft-warning-icon">
                      {warning.blocking ? '🚫' : 'ℹ️'}
                    </span>
                    <span className="draft-warning-text">{warning.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Roles section */}
          <div className="draft-section">
            <h3 className="draft-section-title">
              Roles ({resolvedRoles.length})
            </h3>
            <p className="draft-section-hint">
              You can adjust the provider and model for each role before creating.
              {/* TODO: role name and archetype editing pending backend contract support
                  See handoff notes for bob/alice alignment */}
            </p>
            <div className="draft-roles-list">
              {resolvedRoles.map((role, idx) => {
                const hasProviderWarning = !role.provider || role.provider.trim() === '';
                const hasModelWarning = !role.model || role.model.trim() === '';
                return (
                  <div key={idx} className="draft-role-card">
                    <div className="draft-role-card-header">
                      <div className="draft-role-name">{role.name}</div>
                      <div className="draft-role-identity">{role.identity}</div>
                      {role.archetype_id && (
                        <span className="draft-role-archetype-badge">
                          {role.archetype_id}
                        </span>
                      )}
                    </div>
                    <div className="draft-role-card-body">
                      <div className="draft-role-field">
                        <label>Provider</label>
                        <select
                          className={`draft-role-select ${hasProviderWarning ? 'draft-role-warning-field' : ''}`}
                          value={role.provider}
                          onChange={(e) =>
                            updateRoleOverride(idx, { provider: e.target.value })
                          }
                        >
                          <option value="">Select provider...</option>
                          <option value="anthropic">Anthropic</option>
                          <option value="openai">OpenAI</option>
                          <option value="ollama">Ollama</option>
                          <option value="openrouter">OpenRouter</option>
                        </select>
                        {hasProviderWarning && (
                          <span className="draft-role-field-warning">Required</span>
                        )}
                      </div>
                      <div className="draft-role-field">
                        <label>Model</label>
                        <select
                          className={`draft-role-select ${hasModelWarning ? 'draft-role-warning-field' : ''}`}
                          value={role.model}
                          onChange={(e) =>
                            updateRoleOverride(idx, { model: e.target.value })
                          }
                        >
                          <option value="">Select model...</option>
                          <option value="claude-sonnet-4-20250514">claude-sonnet-4-20250514</option>
                          <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet-20241022</option>
                          <option value="gpt-4o">gpt-4o</option>
                          <option value="gpt-4o-mini">gpt-4o-mini</option>
                          <option value="llama3.2">llama3.2</option>
                        </select>
                        {hasModelWarning && (
                          <span className="draft-role-field-warning">Required</span>
                        )}
                      </div>
                      <div className="draft-role-field readonly">
                        <label>Handoff</label>
                        <span className="draft-role-readonly-value">
                          {role.handoff_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      {/* Pending backend support: role name & archetype editing
                      <div className="draft-role-field">
                        <label>Role Name</label>
                        <input type="text" value={role.name} disabled />
                        <span className="draft-role-field-note">Editing not yet supported</span>
                      </div>
                      */}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="draft-editor-footer">
          <button className="draft-editor-cancel" onClick={onBack}>
            ← Choose Another Template
          </button>
          <button
            className="draft-editor-create"
            onClick={handleCreate}
            disabled={!taskName.trim() || hasBlockingWarnings}
          >
            {hasBlockingWarnings
              ? `Resolve ${blockingWarnings.length} Issue${blockingWarnings.length > 1 ? 's' : ''}`
              : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
