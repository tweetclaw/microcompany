import React, { useEffect, useMemo, useState } from 'react';
import * as apiClient from '../api';
import {
  deleteUserTemplate,
  duplicateTemplateAsUserTemplate,
  updateUserTemplate,
} from '../api/templates';
import type { RoleArchetype } from '../types/api';
import type { UserTemplate, SystemTemplate } from '../types/template';
import type { ProviderConfig } from '../types/settings';
import './EditTemplateModal.css';

interface EditTemplateModalProps {
  template: UserTemplate | SystemTemplate;
  availableProviders: ProviderConfig[];
  onClose: () => void;
  onSaved: (savedTemplate?: UserTemplate) => void;
  onDeleted?: (templateId: string) => void;
  embedded?: boolean;
  allowSystemTemplateEditing?: boolean;
}

interface RoleConfig {
  id: string;
  name: string;
  identity: string;
  archetype_id?: string;
  provider?: string;
  model?: string;
  handoff_enabled?: boolean;
  system_prompt_append?: string;
  custom_system_prompt?: string;
}

function createRoleId() {
  return `role-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function createEmptyRole(defaultProvider?: ProviderConfig): RoleConfig {
  return {
    id: createRoleId(),
    name: '',
    identity: '',
    archetype_id: '',
    provider: defaultProvider?.id ?? '',
    model: defaultProvider?.model ?? '',
    handoff_enabled: true,
    system_prompt_append: '',
    custom_system_prompt: '',
  };
}

function createRoleFromArchetype(archetype: RoleArchetype, defaultProvider?: ProviderConfig): RoleConfig {
  return {
    id: createRoleId(),
    name: archetype.label,
    identity: archetype.summary || archetype.description,
    archetype_id: archetype.id,
    provider: defaultProvider?.id ?? '',
    model: defaultProvider?.model ?? '',
    handoff_enabled: true,
    system_prompt_append: '',
    custom_system_prompt: '',
  };
}

function createRoleConfigFromTemplateRole(
  role: UserTemplate['roles'][number] | SystemTemplate['roles'][number]
): RoleConfig {
  return {
    id: createRoleId(),
    name: role.name,
    identity: role.identity,
    archetype_id: role.archetype_id || '',
    provider: role.provider,
    model: role.model,
    handoff_enabled: role.handoff_enabled ?? true,
    system_prompt_append: role.system_prompt_append || '',
    custom_system_prompt: role.custom_system_prompt || '',
  };
}

function normalizeRoleConfig(role: RoleConfig) {
  return {
    name: role.name,
    identity: role.identity,
    archetype_id: role.archetype_id || '',
    provider: role.provider || '',
    model: role.model || '',
    handoff_enabled: role.handoff_enabled ?? true,
    system_prompt_append: role.system_prompt_append || '',
    custom_system_prompt: role.custom_system_prompt || '',
  };
}

function buildTemplateSnapshot(name: string, description: string, roles: RoleConfig[]) {
  return JSON.stringify({
    name,
    description,
    roles: roles.map(normalizeRoleConfig),
  });
}

function buildMissingProviderMap(providers: ProviderConfig[], roles: RoleConfig[]) {
  const knownProviderIds = new Set(providers.map((provider) => provider.id));
  const missingProviders = new Map<string, { roleNames: string[]; models: Set<string> }>();

  for (const role of roles) {
    const providerId = role.provider?.trim();
    if (!providerId || knownProviderIds.has(providerId)) {
      continue;
    }

    const existing = missingProviders.get(providerId) ?? {
      roleNames: [],
      models: new Set<string>(),
    };
    existing.roleNames.push(role.name || '(unnamed role)');
    if (role.model?.trim()) {
      existing.models.add(role.model.trim());
    }
    missingProviders.set(providerId, existing);
  }

  return missingProviders;
}

function buildMissingArchetypeMap(archetypes: RoleArchetype[], roles: RoleConfig[]) {
  const knownArchetypeIds = new Set(archetypes.map((archetype) => archetype.id));
  const missingArchetypes = new Map<string, string[]>();

  for (const role of roles) {
    const archetypeId = role.archetype_id?.trim();
    if (!archetypeId || knownArchetypeIds.has(archetypeId)) {
      continue;
    }

    const existing = missingArchetypes.get(archetypeId) ?? [];
    existing.push(role.name || '(unnamed role)');
    missingArchetypes.set(archetypeId, existing);
  }

  return missingArchetypes;
}

export default function EditTemplateModal(props: EditTemplateModalProps) {
  const isSystemTemplate = 'category' in props.template;
  const canEditSystemTemplateProviderOnly = isSystemTemplate && props.allowSystemTemplateEditing === true;
  const canEditTemplate = !isSystemTemplate;
  const canEditTemplateMetadata = !isSystemTemplate;
  const canManageRoles = !isSystemTemplate;
  const defaultProvider = props.availableProviders[0];

  const [templateName, setTemplateName] = useState(props.template.name);
  const [templateDescription, setTemplateDescription] = useState(props.template.description);
  const [roles, setRoles] = useState<RoleConfig[]>(props.template.roles.map(createRoleConfigFromTemplateRole));
  const [archetypes, setArchetypes] = useState<RoleArchetype[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[EditTemplateModal] Hydrating template into editor state', {
      templateId: props.template.id,
      templateName: props.template.name,
      source: isSystemTemplate ? 'system' : 'user',
      roleCount: props.template.roles.length,
    });
    setTemplateName(props.template.name);
    setTemplateDescription(props.template.description);
    setRoles(props.template.roles.map(createRoleConfigFromTemplateRole));
    setError(null);
  }, [props.template, isSystemTemplate]);

  useEffect(() => {
    let cancelled = false;
    console.log('[EditTemplateModal] Loading role archetypes for template editor', {
      templateId: props.template.id,
    });
    Promise.resolve(apiClient.listRoleArchetypes())
      .then((items) => {
        const safeItems = Array.isArray(items) ? items : [];
        if (!cancelled) {
          console.log('[EditTemplateModal] Role archetypes loaded', {
            templateId: props.template.id,
            archetypeCount: safeItems.length,
          });
          setArchetypes(safeItems);
        }
      })
      .catch((err) => {
        console.error('[EditTemplateModal] Failed to load archetypes:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [props.template.id]);

  const archetypeMap = useMemo(
    () => new Map(archetypes.map((archetype) => [archetype.id, archetype])),
    [archetypes]
  );
  const missingProviders = useMemo(
    () => buildMissingProviderMap(props.availableProviders, roles),
    [props.availableProviders, roles]
  );
  const missingArchetypes = useMemo(
    () => buildMissingArchetypeMap(archetypes, roles),
    [archetypes, roles]
  );

  useEffect(() => {
    if (missingProviders.size === 0) {
      return;
    }

    console.warn('[EditTemplateModal] Template references missing providers', {
      templateId: props.template.id,
      missingProviderIds: Array.from(missingProviders.keys()),
    });
  }, [props.template.id, missingProviders]);

  useEffect(() => {
    if (missingArchetypes.size === 0) {
      return;
    }

    console.warn('[EditTemplateModal] Template references missing archetypes', {
      templateId: props.template.id,
      missingArchetypeIds: Array.from(missingArchetypes.keys()),
    });
  }, [props.template.id, missingArchetypes]);

  const initialSnapshot = useMemo(
    () => buildTemplateSnapshot(
      props.template.name,
      props.template.description,
      props.template.roles.map(createRoleConfigFromTemplateRole)
    ),
    [props.template]
  );
  const currentSnapshot = useMemo(
    () => buildTemplateSnapshot(templateName, templateDescription, roles),
    [templateName, templateDescription, roles]
  );
  const hasUnsavedChanges = (canEditTemplate || canEditSystemTemplateProviderOnly) && initialSnapshot !== currentSnapshot;

  useEffect(() => {
    console.log('[EditTemplateModal] Dirty state changed', {
      templateId: props.template.id,
      hasUnsavedChanges,
      roleCount: roles.length,
    });
  }, [props.template.id, hasUnsavedChanges, roles.length]);

  const updateRole = (index: number, updater: (role: RoleConfig) => RoleConfig) => {
    setRoles((current) => current.map((role, roleIndex) => (roleIndex === index ? updater(role) : role)));
  };

  const handleRoleFieldChange = (index: number, field: keyof RoleConfig, value: string | boolean) => {
    updateRole(index, (role) => {
      const nextRole = { ...role, [field]: value };

      if (field === 'provider') {
        const provider = props.availableProviders.find((item) => item.id === value);
        nextRole.provider = String(value);
        nextRole.model = provider?.model ?? role.model ?? '';
        if (!provider && String(value).trim()) {
          console.warn('[EditTemplateModal] Selected provider not found in available providers', {
            templateId: props.template.id,
            roleId: role.id,
            providerId: String(value),
          });
        }
      }

      if (field === 'archetype_id') {
        const archetype = archetypeMap.get(String(value));
        nextRole.archetype_id = String(value);
        if (archetype) {
          if (!nextRole.name.trim()) {
            nextRole.name = archetype.label;
          }
          if (!nextRole.identity.trim()) {
            nextRole.identity = archetype.summary || archetype.description;
          }
        } else if (String(value).trim()) {
          console.warn('[EditTemplateModal] Selected archetype not found in current archetype list', {
            templateId: props.template.id,
            roleId: role.id,
            archetypeId: String(value),
          });
        }
      }

      return nextRole;
    });
  };

  const handleAddEmptyRole = () => {
    setRoles((current) => {
      const newRole = createEmptyRole(defaultProvider);
      console.log('[EditTemplateModal] Adding empty role', {
        templateId: props.template.id,
        newRoleId: newRole.id,
        nextRoleCount: current.length + 1,
      });
      return [...current, newRole];
    });
  };

  const handleAddArchetypeRole = (archetypeId: string) => {
    if (!archetypeId) return;
    const archetype = archetypeMap.get(archetypeId);
    if (!archetype) {
      console.warn('[EditTemplateModal] Failed to add role from archetype: archetype not found', {
        templateId: props.template.id,
        archetypeId,
      });
      return;
    }

    setRoles((current) => {
      const newRole = createRoleFromArchetype(archetype, defaultProvider);
      console.log('[EditTemplateModal] Adding role from archetype', {
        templateId: props.template.id,
        archetypeId,
        archetypeLabel: archetype.label,
        newRoleId: newRole.id,
        nextRoleCount: current.length + 1,
      });
      return [...current, newRole];
    });
  };

  const handleDeleteRole = (index: number) => {
    setRoles((current) => {
      const role = current[index];
      console.log('[EditTemplateModal] Deleting role from template editor', {
        templateId: props.template.id,
        index,
        roleId: role?.id,
        roleName: role?.name,
        nextRoleCount: Math.max(current.length - 1, 0),
      });
      return current.filter((_, roleIndex) => roleIndex !== index);
    });
  };

  const handleMoveRole = (index: number, direction: -1 | 1) => {
    setRoles((current) => {
      const nextIndex = index + direction;
      console.log('[EditTemplateModal] Moving role with buttons', {
        templateId: props.template.id,
        fromIndex: index,
        toIndex: nextIndex,
        roleId: current[index]?.id,
        roleName: current[index]?.name,
      });
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const copied = [...current];
      const [item] = copied.splice(index, 1);
      copied.splice(nextIndex, 0, item);
      return copied;
    });
  };

  const validate = () => {
    if (!templateName.trim()) {
      return 'Template name is required';
    }

    if (roles.length === 0) {
      return 'At least one team member is required';
    }

    if (missingProviders.size > 0) {
      return 'Some roles reference missing providers. Please reselect a valid provider before saving.';
    }

    for (const [index, role] of roles.entries()) {
      if (!role.name?.trim()) {
        return `Role #${index + 1} is missing a name`;
      }
      if (!role.identity?.trim()) {
        return `Role #${index + 1} is missing an identity`;
      }
      if (!role.provider?.trim()) {
        return `Role #${index + 1} is missing an AI provider`;
      }
    }

    return null;
  };

  const handleRequestClose = () => {
    if (hasUnsavedChanges && !isSaving && !isDeleting && !isDuplicating) {
      console.warn('[EditTemplateModal] Close blocked by unsaved changes confirmation', {
        templateId: props.template.id,
        templateName,
      });
      const confirmed = window.confirm('你有未保存的修改，确定要放弃并关闭吗？');
      if (!confirmed) {
        return;
      }
    }

    console.log('[EditTemplateModal] Closing template editor', {
      templateId: props.template.id,
      hasUnsavedChanges,
      source: isSystemTemplate ? 'system' : 'user',
    });
    props.onClose();
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      console.warn('[EditTemplateModal] Template save validation failed', {
        templateId: props.template.id,
        validationError,
      });
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      console.log('[EditTemplateModal] Saving user template', {
        templateId: props.template.id,
        templateName: templateName.trim(),
        roleCount: roles.length,
      });
      const savedTemplate = await updateUserTemplate(props.template.id, {
        name: templateName.trim(),
        description: templateDescription.trim(),
        roles: roles.map((role) => ({
          name: role.name.trim(),
          identity: role.identity.trim(),
          archetype_id: role.archetype_id?.trim() || null,
          provider: role.provider?.trim() || '',
          model: role.model?.trim() || '',
          handoff_enabled: role.handoff_enabled ?? true,
          system_prompt_append: role.system_prompt_append?.trim() || null,
          custom_system_prompt: role.custom_system_prompt?.trim() || null,
        })),
      });

      console.log('[EditTemplateModal] User template saved successfully', {
        templateId: savedTemplate.id,
        templateName: savedTemplate.name,
        roleCount: savedTemplate.roles.length,
      });
      props.onSaved(savedTemplate);
    } catch (err) {
      console.error('[EditTemplateModal] Failed to update template:', err);
      setError(err instanceof Error ? err.message : 'Failed to update template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicateSystemTemplate = async () => {
    setIsDuplicating(true);
    setError(null);

    try {
      console.log('[EditTemplateModal] Duplicating system template as user template', {
        templateId: props.template.id,
        templateName: props.template.name,
        roleCount: props.template.roles.length,
      });
      const duplicatedTemplate = await duplicateTemplateAsUserTemplate(props.template.id);
      console.log('[EditTemplateModal] System template duplicated successfully', {
        sourceTemplateId: props.template.id,
        duplicatedTemplateId: duplicatedTemplate.id,
        duplicatedTemplateName: duplicatedTemplate.name,
      });
      props.onSaved(duplicatedTemplate);
    } catch (err) {
      console.error('[EditTemplateModal] Failed to duplicate template:', err);
      setError(err instanceof Error ? err.message : 'Failed to duplicate template');
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (isSystemTemplate) {
      console.warn('[EditTemplateModal] Ignored delete request for system template', {
        templateId: props.template.id,
      });
      return;
    }

    const confirmed = window.confirm(`确定删除模板“${props.template.name}”吗？此操作不可撤销。`);
    if (!confirmed) {
      console.log('[EditTemplateModal] User cancelled template deletion', {
        templateId: props.template.id,
        templateName: props.template.name,
      });
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      console.log('[EditTemplateModal] Deleting user template', {
        templateId: props.template.id,
        templateName: props.template.name,
      });
      await deleteUserTemplate(props.template.id);
      console.log('[EditTemplateModal] User template deleted successfully', {
        templateId: props.template.id,
      });
      props.onDeleted?.(props.template.id);
    } catch (err) {
      console.error('[EditTemplateModal] Failed to delete template:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={props.embedded ? 'edit-template-modal-overlay embedded' : 'edit-template-modal-overlay'}>
      <div className={props.embedded ? 'edit-template-modal embedded' : 'edit-template-modal'}>
        <div className={props.embedded ? 'edit-template-modal-header embedded' : 'edit-template-modal-header'}>
          <div className="edit-template-modal-header-main">
            <h2>{canEditTemplate ? '编辑模板' : '查看模板'}</h2>
            {props.embedded ? null : (
              <p className="edit-template-modal-subtitle">
                {canEditTemplate ? '在这里直接编辑模板名称、成员、身份、原型绑定与模型配置。' : '查看模板详情。'}
              </p>
            )}
          </div>
          {props.embedded ? null : (
            <button
              className={props.embedded ? 'edit-template-modal-close embedded' : 'edit-template-modal-close'}
              onClick={handleRequestClose}
              aria-label="关闭"
              title="关闭"
            >
              ✕
            </button>
          )}
        </div>

        <div className="edit-template-modal-content">
          {error && <div className="edit-template-error">{error}</div>}

          {hasUnsavedChanges && (
            <div className="edit-template-dirty-notice">你有未保存的修改</div>
          )}

          <div className="edit-template-section">
            <label>Template Name</label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Enter template name"
              disabled={!canEditTemplateMetadata}
            />
          </div>

          <div className="edit-template-section">
            <label>Description</label>
            <textarea
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              placeholder="Enter template description"
              rows={3}
              disabled={!canEditTemplateMetadata}
            />
          </div>

          <div className="edit-template-section">
            <div className="edit-template-section-header">
              <label>成员组成 ({roles.length})</label>
              {canManageRoles && (
                <div className="edit-template-section-actions">
                  <button type="button" className="edit-template-secondary-btn" onClick={handleAddEmptyRole}>
                    + 添加空白成员
                  </button>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      handleAddArchetypeRole(e.target.value);
                      e.currentTarget.value = '';
                    }}
                  >
                    <option value="">从 Archetype 添加成员</option>
                    {archetypes.map((archetype) => (
                      <option key={archetype.id} value={archetype.id}>
                        {archetype.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="edit-template-roles">
              {roles.map((role, index) => {
                const selectedProvider = props.availableProviders.find((p) => p.id === role.provider);
                const isMissingProvider = Boolean(role.provider?.trim()) && !selectedProvider;
                const selectedArchetype = role.archetype_id ? archetypeMap.get(role.archetype_id) : null;
                const isMissingArchetype = Boolean(role.archetype_id?.trim()) && !selectedArchetype;

                return (
                  <div key={role.id} className="edit-template-role-card">
                    <div className="edit-template-role-header">
                      <div className="edit-template-role-header-main">
                        <span className="edit-template-role-number">#{index + 1}</span>
                      </div>
                      {canManageRoles && (
                        <div className="edit-template-role-actions">
                          <button type="button" onClick={() => handleMoveRole(index, -1)} disabled={index === 0}>
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveRole(index, 1)}
                            disabled={index === roles.length - 1}
                          >
                            ↓
                          </button>
                          <button type="button" className="danger" onClick={() => handleDeleteRole(index)}>
                            删除
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="edit-template-role-grid">
                      <div className="edit-template-role-field">
                        <label>Role Name</label>
                        <input
                          type="text"
                          value={role.name}
                          onChange={(e) => handleRoleFieldChange(index, 'name', e.target.value)}
                          placeholder="e.g., Alice"
                          disabled={!canEditTemplateMetadata}
                        />
                      </div>

                      <div className="edit-template-role-field">
                        <label>Archetype</label>
                        <select
                          value={role.archetype_id || ''}
                          onChange={(e) => handleRoleFieldChange(index, 'archetype_id', e.target.value)}
                          disabled={!canEditTemplateMetadata}
                        >
                          <option value="">-- None --</option>
                          {isMissingArchetype && (
                            <option value={role.archetype_id || ''}>
                              Missing archetype: {role.archetype_id}
                            </option>
                          )}
                          {archetypes.map((archetype) => (
                            <option key={archetype.id} value={archetype.id}>
                              {archetype.label}
                            </option>
                          ))}
                        </select>
                        {selectedArchetype && (
                          <p className="edit-template-provider-info">{selectedArchetype.summary || selectedArchetype.description}</p>
                        )}
                        {!isSystemTemplate && isMissingArchetype && (
                          <p className="edit-template-provider-warning">
                            当前绑定的 archetype 不存在：{role.archetype_id}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="edit-template-role-field">
                      <label>Identity</label>
                      <textarea
                        value={role.identity}
                        onChange={(e) => handleRoleFieldChange(index, 'identity', e.target.value)}
                        placeholder="e.g., Product Manager"
                        rows={2}
                        disabled={!canEditTemplateMetadata}
                      />
                    </div>

                    <div className="edit-template-role-grid">
                      <div className="edit-template-role-field">
                        <label>AI Provider</label>
                        <select
                          value={role.provider || ''}
                          onChange={(e) => handleRoleFieldChange(index, 'provider', e.target.value)}
                          disabled={!canEditSystemTemplateProviderOnly && !canEditTemplate}
                        >
                          <option value="">-- Select Provider --</option>
                          {isMissingProvider && (
                            <option value={role.provider || ''}>
                              缺失的 Provider（{role.provider}）
                            </option>
                          )}
                          {props.availableProviders.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        {selectedProvider && (
                          <p className="edit-template-provider-info">
                            使用 {selectedProvider.name} 的 {selectedProvider.model} 模型
                          </p>
                        )}
                        {isMissingProvider && (
                          <p className="edit-template-provider-warning">
                            当前绑定的 provider 不存在：{role.provider}
                          </p>
                        )}
                      </div>

                      <div className="edit-template-role-field">
                        <label>Model</label>
                        <input type="text" value={role.model || ''} readOnly disabled />
                      </div>
                    </div>

                    <div className="edit-template-role-field">
                      <label>System Prompt Append</label>
                      <textarea
                        value={role.system_prompt_append || ''}
                        onChange={(e) => handleRoleFieldChange(index, 'system_prompt_append', e.target.value)}
                        rows={2}
                        disabled={!canEditTemplateMetadata}
                      />
                    </div>

                    <div className="edit-template-role-field">
                      <label>Custom System Prompt</label>
                      <textarea
                        value={role.custom_system_prompt || ''}
                        onChange={(e) => handleRoleFieldChange(index, 'custom_system_prompt', e.target.value)}
                        rows={3}
                        disabled={!canEditTemplateMetadata}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="edit-template-modal-footer">
          {canEditTemplate && (
            <button
              className="edit-template-delete-btn"
              onClick={handleDeleteTemplate}
              disabled={isDeleting || isSaving}
            >
              {isDeleting ? '删除中...' : '删除模板'}
            </button>
          )}
          <button className="edit-template-cancel-btn" onClick={handleRequestClose}>
            关闭
          </button>
          {isSystemTemplate ? (
            <>
              {canEditSystemTemplateProviderOnly && (
                <button className="edit-template-save-btn" onClick={handleSave} disabled={isSaving || isDeleting || !hasUnsavedChanges}>
                  {isSaving ? '保存中...' : '保存 Provider 配置'}
                </button>
              )}
              <button
                className="edit-template-save-btn"
                onClick={handleDuplicateSystemTemplate}
                disabled={isDuplicating}
              >
                {isDuplicating ? '复制中...' : '复制为自定义模板'}
              </button>
            </>
          ) : (
            <button className="edit-template-save-btn" onClick={handleSave} disabled={isSaving || isDeleting || !hasUnsavedChanges}>
              {isSaving ? 'Saving...' : 'Save Template'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
