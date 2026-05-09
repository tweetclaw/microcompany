import React, { useState, useEffect } from 'react';
import { updateUserTemplate } from '../api/templates';
import type { UserTemplate, SystemTemplate } from '../types/template';
import type { ProviderConfig } from '../types/settings';
import './EditTemplateModal.css';

interface EditTemplateModalProps {
  template: UserTemplate | SystemTemplate;
  availableProviders: ProviderConfig[];
  onClose: () => void;
  onSaved: () => void;
}

interface RoleConfig {
  name: string;
  identity: string;
  archetype_id?: string;
  provider?: string;
  model?: string;
  handoff_enabled?: boolean;
}

export default function EditTemplateModal(props: EditTemplateModalProps) {
  const [templateName, setTemplateName] = useState(props.template.name);
  const [templateDescription, setTemplateDescription] = useState(props.template.description);
  const [roles, setRoles] = useState<RoleConfig[]>(
    props.template.roles.map((r) => ({
      name: r.name,
      identity: r.identity,
      archetype_id: r.archetype_id || undefined,
      provider: r.provider,
      model: r.model,
      handoff_enabled: r.handoff_enabled ?? true,
    }))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSystemTemplate = (props.template as SystemTemplate).category !== undefined;

  console.log('[EditTemplateModal] Initialized with template:', props.template.id);
  console.log('[EditTemplateModal] Is system template:', isSystemTemplate);
  console.log('[EditTemplateModal] Available providers:', props.availableProviders.length);

  const handleRoleChange = (index: number, field: keyof RoleConfig, value: string) => {
    console.log(`[EditTemplateModal] Updating role ${index} field "${field}" to:`, value);
    const newRoles = [...roles];
    newRoles[index] = { ...newRoles[index], [field]: value };

    // If provider changed, update model automatically
    if (field === 'provider') {
      const provider = props.availableProviders.find((p) => p.id === value);
      if (provider) {
        newRoles[index].model = provider.model;
        console.log(`[EditTemplateModal] Auto-updated model to: ${provider.model}`);
      }
    }

    setRoles(newRoles);
  };

  const handleSave = async () => {
    console.log('[EditTemplateModal] handleSave: Starting save process');

    if (isSystemTemplate) {
      setError('System templates cannot be edited');
      console.error('[EditTemplateModal] handleSave: Attempted to edit system template');
      return;
    }

    // Validation
    if (!templateName.trim()) {
      setError('Template name is required');
      console.warn('[EditTemplateModal] handleSave: Template name is empty');
      return;
    }

    // Check if all roles have provider
    const missingProvider = roles.some((r) => !r.provider || r.provider.trim() === '');
    if (missingProvider) {
      setError('All roles must have an AI Provider configured');
      console.warn('[EditTemplateModal] handleSave: Some roles missing provider');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      console.log('[EditTemplateModal] handleSave: Calling updateUserTemplate API');
      console.log('[EditTemplateModal] handleSave: Template ID:', props.template.id);
      console.log('[EditTemplateModal] handleSave: Updates:', {
        name: templateName,
        description: templateDescription,
        roles: roles.length,
      });

      await updateUserTemplate(props.template.id, {
        name: templateName,
        description: templateDescription,
        roles: roles,
      });

      console.log('[EditTemplateModal] handleSave: Template updated successfully');
      alert('Template updated successfully!');
      props.onSaved();
    } catch (err) {
      console.error('[EditTemplateModal] handleSave: Failed to update template:', err);
      setError(err instanceof Error ? err.message : 'Failed to update template');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="edit-template-modal-overlay" onClick={props.onClose}>
      <div className="edit-template-modal" onClick={(e) => e.stopPropagation()}>
        <div className="edit-template-modal-header">
          <h2>✏️ Edit Template</h2>
          <button className="edit-template-modal-close" onClick={props.onClose}>
            ✕
          </button>
        </div>

        <div className="edit-template-modal-content">
          {isSystemTemplate && (
            <div className="edit-template-warning">
              ⚠️ System templates are read-only. You can only view their configuration.
            </div>
          )}

          {error && <div className="edit-template-error">{error}</div>}

          <div className="edit-template-section">
            <label>Template Name</label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              disabled={isSystemTemplate}
              placeholder="Enter template name"
            />
          </div>

          <div className="edit-template-section">
            <label>Description</label>
            <textarea
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              disabled={isSystemTemplate}
              placeholder="Enter template description"
              rows={3}
            />
          </div>

          <div className="edit-template-section">
            <label>Roles ({roles.length})</label>
            <div className="edit-template-roles">
              {roles.map((role, index) => (
                <div key={index} className="edit-template-role-card">
                  <div className="edit-template-role-header">
                    <span className="edit-template-role-number">#{index + 1}</span>
                  </div>

                  <div className="edit-template-role-field">
                    <label>Role Name</label>
                    <input
                      type="text"
                      value={role.name}
                      onChange={(e) => handleRoleChange(index, 'name', e.target.value)}
                      disabled={isSystemTemplate}
                      placeholder="e.g., Alice"
                    />
                  </div>

                  <div className="edit-template-role-field">
                    <label>Identity</label>
                    <input
                      type="text"
                      value={role.identity}
                      onChange={(e) => handleRoleChange(index, 'identity', e.target.value)}
                      disabled={isSystemTemplate}
                      placeholder="e.g., Product Manager"
                    />
                  </div>

                  <div className="edit-template-role-field">
                    <label>AI Provider</label>
                    <select
                      value={role.provider || ''}
                      onChange={(e) => handleRoleChange(index, 'provider', e.target.value)}
                      disabled={isSystemTemplate}
                    >
                      <option value="">-- Select Provider --</option>
                      {props.availableProviders.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.model})
                        </option>
                      ))}
                    </select>
                    {role.provider && (() => {
                      const selectedProvider = props.availableProviders.find(p => p.id === role.provider);
                      return selectedProvider ? (
                        <p className="edit-template-provider-info">
                          💡 使用 {selectedProvider.name} 的 {selectedProvider.model} 模型
                        </p>
                      ) : null;
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="edit-template-modal-footer">
          <button className="edit-template-cancel-btn" onClick={props.onClose}>
            Cancel
          </button>
          {!isSystemTemplate && (
            <button
              className="edit-template-save-btn"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Template'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
