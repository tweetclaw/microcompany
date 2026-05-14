import React, { useState, useMemo } from 'react';
import type { SystemTemplate, TemplateSummary, TemplateRole, TemplateWarning, CreateFromTemplateRequest, TemplateDraft, UserTemplate } from '../types/template';
import type { ProviderConfig } from '../types/settings';
import './TemplateDraftEditor.css';

interface TemplateDraftEditorProps {
  template: SystemTemplate | UserTemplate | TemplateSummary;
  availableProviders: ProviderConfig[];
  onConfirm: (request: CreateFromTemplateRequest) => void;
  onBack: () => void;
  onCancel: () => void;
}

type RoleOverride = {
  provider?: string;
  model?: string;
};

function buildDraftFromTemplate(template: SystemTemplate | UserTemplate | TemplateSummary, taskName: string): TemplateDraft {
  const roles: TemplateRole[] = 'roles' in template ? [...template.roles] : [];
  const pmFirstWorkflow = 'pm_first_workflow' in template ? template.pm_first_workflow : false;
  const warnings: TemplateWarning[] = [];

  roles.forEach((role, idx) => {
    const hasProvider = role.provider;
    if (!hasProvider || (typeof hasProvider === 'string' && hasProvider.trim() === '')) {
      warnings.push({
        type: 'missing_provider',
        role_index: idx,
        role_name: role.name,
        message: `Role "${role.name}" is missing a Provider. Please select one before creating.`,
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
  availableProviders,
  onConfirm,
  onBack,
}: TemplateDraftEditorProps) {
  const templateId = template.id;
  const templateSource = 'source' in template ? template.source : 'system';
  const initialTaskName = template.name;

  const [taskName, setTaskName] = useState(initialTaskName);

  console.log('[TemplateDraftEditor] Initializing with template:', template.name);

  // Derive the draft from the template
  const draft = useMemo(
    () => buildDraftFromTemplate(template, taskName),
    [template, taskName]
  );

  // Per-role overrides
  const [overrides, setOverrides] = useState<Record<number, RoleOverride>>({});

  const updateRoleOverride = (roleIndex: number, patch: Partial<RoleOverride>) => {
    console.log('[TemplateDraftEditor] Updating role override:', { roleIndex, patch });
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
    return draft.roles.map((role, idx) => {
      const provider = overrides[idx]?.provider ?? role.provider;
      const model = overrides[idx]?.model ?? role.model;
      return {
        ...role,
        provider,
        model,
      };
    });
  }, [draft.roles, overrides]);

  // Re-check warnings after overrides
  const resolvedWarnings = useMemo(() => {
    const warnings: TemplateWarning[] = [];
    resolvedRoles.forEach((role, idx) => {
      const provider = role.provider;
      if (!provider || provider.trim() === '') {
        warnings.push({
          type: 'missing_provider',
          role_index: idx,
          role_name: role.name,
          message: `Role "${role.name}" is missing a Provider. Please select one before creating.`,
          blocking: true,
        });
      }
    });
    return warnings;
  }, [resolvedRoles]);

  const blockingWarnings = resolvedWarnings.filter((w) => w.blocking);
  const hasBlockingWarnings = blockingWarnings.length > 0;

  const handleCreate = () => {
    console.log('[TemplateDraftEditor] Creating task from template:', {
      templateId,
      taskName: taskName.trim(),
      overrides,
    });

    // Build role_overrides record keyed by role name
    const roleOverrides: Record<string, { provider?: string; model?: string }> = {};
    Object.entries(overrides).forEach(([idx, override]) => {
      const roleName = draft.roles[Number(idx)]?.name;
      if (roleName && (override.provider || override.model)) {
        roleOverrides[roleName] = {
          provider: override.provider,
          model: override.model,
        };
      }
    });

    const request: CreateFromTemplateRequest = {
      template_id: templateId,
      template_source: templateSource,
      task_name: taskName.trim(),
      role_overrides: Object.keys(roleOverrides).length > 0 ? roleOverrides : undefined,
    };

    console.log('[TemplateDraftEditor] Sending create request:', request);
    onConfirm(request);
  };

  return (
    <div className="template-draft-editor">
      <div className="template-draft-header">
        <button className="template-draft-back" onClick={onBack}>
          ← Back
        </button>
        <h3>Confirm Task Configuration</h3>
        <p>Review and customize the template before creating your task</p>
      </div>

      <div className="template-draft-content">
        {/* Task Name */}
        <div className="template-draft-section">
          <h3 className="template-draft-section-title">Task Details</h3>
          <div className="template-draft-field">
            <label htmlFor="draft-task-name">Task Name</label>
            <input
              id="draft-task-name"
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="Enter task name"
            />
          </div>
        </div>

        {/* Warnings */}
        {resolvedWarnings.length > 0 && (
          <div className="template-draft-warnings">
            {resolvedWarnings.map((warning, idx) => (
              <div
                key={idx}
                className={`template-draft-warning ${warning.blocking ? 'error' : 'warning'}`}
              >
                <span className="template-draft-warning-icon">
                  {warning.blocking ? '🚫' : '⚠️'}
                </span>
                <div className="template-draft-warning-content">
                  <p className="template-draft-warning-message">{warning.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Roles */}
        <div className="template-draft-section">
          <h3 className="template-draft-section-title">
            Roles Configuration ({resolvedRoles.length})
          </h3>
          <div className="template-draft-roles">
            {resolvedRoles.map((role, idx) => {
              const provider = role.provider;
              const hasProviderWarning = !provider || provider.trim() === '';
              return (
                <div key={idx} className="template-draft-role-card">
                  <div className="template-draft-role-header">
                    <div className="template-draft-role-info">
                      <h4 className="template-draft-role-name">{role.name}</h4>
                      <p className="template-draft-role-identity">{role.identity}</p>
                    </div>
                  </div>
                  <div className="template-draft-role-overrides">
                    <div className="template-draft-role-override-field">
                      <label>AI Provider {hasProviderWarning && <span style={{color: '#ef4444'}}>*</span>}</label>
                      <select
                        value={role.provider || ''}
                        onChange={(e) => {
                          const providerId = e.target.value;
                          const matchedProvider = availableProviders.find((provider) => provider.id === providerId);
                          updateRoleOverride(idx, {
                            provider: providerId,
                            model: matchedProvider?.model || '',
                          });
                        }}
                      >
                        <option value="">Select AI Provider...</option>
                        {availableProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} ({provider.model})
                          </option>
                        ))}
                      </select>
                      {availableProviders.length === 0 && (
                        <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                          No AI Providers configured. Please configure in Settings.
                        </p>
                      )}
                      {(() => {
                        const selectedProvider = availableProviders.find(p => p.id === role.provider);
                        return selectedProvider ? (
                          <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '4px' }}>
                            💡 使用 {selectedProvider.name} 的 {selectedProvider.model} 模型
                          </p>
                        ) : null;
                      })()}
                    </div>
                    {role.archetype_id && (
                      <div className="template-draft-role-override-field">
                        <label>Archetype</label>
                        <div className="template-draft-role-default">{role.archetype_id}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        <div className="template-draft-summary">
          <h3 className="template-draft-summary-title">Summary</h3>
          <div className="template-draft-summary-grid">
            <div className="template-draft-summary-item">
              <p className="template-draft-summary-label">Template</p>
              <p className="template-draft-summary-value">{template.name}</p>
            </div>
            <div className="template-draft-summary-item">
              <p className="template-draft-summary-label">Roles</p>
              <p className="template-draft-summary-value">{resolvedRoles.length}</p>
            </div>
            <div className="template-draft-summary-item">
              <p className="template-draft-summary-label">Source</p>
              <p className="template-draft-summary-value">{templateSource === 'system' ? 'System' : 'User'}</p>
            </div>
            <div className="template-draft-summary-item">
              <p className="template-draft-summary-label">Status</p>
              <p className="template-draft-summary-value">
                {hasBlockingWarnings ? '⚠️ Issues' : '✓ Ready'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="template-draft-actions">
        <button className="template-draft-cancel-btn" onClick={onBack}>
          ← Back to Templates
        </button>
        <button
          className="template-draft-create-btn"
          onClick={handleCreate}
          disabled={!taskName.trim() || hasBlockingWarnings}
        >
          {hasBlockingWarnings
            ? `Resolve ${blockingWarnings.length} Issue${blockingWarnings.length > 1 ? 's' : ''}`
            : 'Create Task'}
        </button>
      </div>
    </div>
  );
}
