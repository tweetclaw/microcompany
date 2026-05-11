import { useState, useEffect, useMemo } from 'react';
import { listRoleArchetypes } from '../api';
import { RoleArchetype } from '../types';
import { ProviderConfig } from '../types/settings';
import './AddRoleModal.css';

const CUSTOM_ARCHETYPE_ID = 'custom';

export interface RoleConfig {
  name: string;
  identity: string;
  archetypeId: string | null;
  provider: string;
  model: string;
  displayOrder?: number;
  handoffEnabled: boolean;
  systemPromptAppend: string | null;
  customSystemPrompt: string | null;
}

interface AddRoleMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: RoleConfig) => Promise<void>;
  availableProviders: ProviderConfig[];
  existingRoleNames: string[];
}

function getArchetypeIdentity(archetype: RoleArchetype | null): string {
  if (!archetype) return '';
  return archetype.label;
}

export default function AddRoleMemberModal(props: AddRoleMemberModalProps) {
  const [roleName, setRoleName] = useState('');
  const [selectedArchetypeId, setSelectedArchetypeId] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [systemPromptAppend, setSystemPromptAppend] = useState('');
  const [customSystemPrompt, setCustomSystemPrompt] = useState('');
  const [handoffEnabled, setHandoffEnabled] = useState(true);
  const [archetypes, setArchetypes] = useState<RoleArchetype[]>([]);
  const [isLoadingArchetypes, setIsLoadingArchetypes] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const usableProviders = props.availableProviders.filter(
    (p) => p.enabled && p.model.trim() && (p.id === 'ollama' || p.apiKey.trim())
  );

  // Reset form when modal opens
  useEffect(() => {
    if (props.isOpen) {
      setRoleName('');
      setSelectedArchetypeId('');
      setSelectedProvider('');
      setSystemPromptAppend('');
      setCustomSystemPrompt('');
      setHandoffEnabled(true);
      setError('');
      setIsSubmitting(false);
    }
  }, [props.isOpen]);

  // Load archetypes when modal opens
  useEffect(() => {
    if (!props.isOpen) return;
    let cancelled = false;

    setIsLoadingArchetypes(true);
    listRoleArchetypes()
      .then((loaded) => {
        if (!cancelled) setArchetypes(loaded);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load archetypes');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingArchetypes(false);
      });

    return () => { cancelled = true; };
  }, [props.isOpen]);

  const selectedArchetype = useMemo(
    () => archetypes.find((a) => a.id === selectedArchetypeId) ?? null,
    [archetypes, selectedArchetypeId]
  );
  const isCustomArchetype = selectedArchetypeId === CUSTOM_ARCHETYPE_ID;

  const handleSubmit = async () => {
    setError('');

    if (!roleName.trim()) {
      setError('Role name is required');
      return;
    }
    if (props.existingRoleNames.includes(roleName.trim())) {
      setError('角色名称已存在，请使用不同的名称');
      return;
    }
    if (!selectedArchetypeId) {
      setError('Please select an archetype');
      return;
    }
    if (!selectedProvider) {
      setError('Please select a model');
      return;
    }
    if (isCustomArchetype && !customSystemPrompt.trim()) {
      setError('Custom system prompt is required for the custom archetype');
      return;
    }

    const provider = usableProviders.find((p) => `${p.id}::${p.model}` === selectedProvider);
    if (!provider) {
      setError('Selected provider not found');
      return;
    }

    setIsSubmitting(true);
    try {
      const config: RoleConfig = {
        name: roleName.trim(),
        identity: isCustomArchetype ? 'Custom' : getArchetypeIdentity(selectedArchetype),
        archetypeId: isCustomArchetype ? null : (selectedArchetypeId || null),
        provider: provider.id,
        model: provider.model,
        handoffEnabled,
        systemPromptAppend: isCustomArchetype ? null : (systemPromptAppend.trim() || null),
        customSystemPrompt: isCustomArchetype ? customSystemPrompt.trim() : null,
      };
      await props.onConfirm(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加角色失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!props.isOpen) return null;

  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div
        className="add-role-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="arm-modal-title"
      >
        <div className="modal-header">
          <div className="modal-header-copy">
            <h3 id="arm-modal-title">Add Role</h3>
            <p className="modal-subtitle">
              Add a new role to this running task.
            </p>
          </div>
          <button className="modal-close" onClick={props.onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Archetype picker */}
          <div className="form-field">
            <label htmlFor="arm-archetype-select">Role Archetype</label>
            <p className="form-helper-text">
              Choose a built-in archetype for guided prompts, or select Custom to provide the full system prompt yourself.
            </p>
            {isLoadingArchetypes ? (
              <p className="form-helper-text">Loading role archetypes…</p>
            ) : archetypes.length === 0 && !error ? (
              <p className="no-providers-warning">No role archetypes available.</p>
            ) : (
              <select
                id="arm-archetype-select"
                value={selectedArchetypeId}
                onChange={(e) => setSelectedArchetypeId(e.target.value)}
              >
                <option value="">Select archetype</option>
                {archetypes.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
                <option value={CUSTOM_ARCHETYPE_ID}>Custom</option>
              </select>
            )}
          </div>

          {/* Archetype preview card — built-in */}
          {selectedArchetype && !isCustomArchetype && (
            <div className="archetype-preview" aria-live="polite">
              <div className="archetype-preview-header">
                <div>
                  <h4>{selectedArchetype.label}</h4>
                  <p>{selectedArchetype.summary}</p>
                </div>
                <span className="archetype-preview-tag">{selectedArchetype.id}</span>
              </div>
              <p className="archetype-preview-description">{selectedArchetype.description}</p>
              <div className="archetype-preview-grid">
                <div className="archetype-preview-section">
                  <h5>Responsibilities</h5>
                  <ul>
                    {selectedArchetype.responsibilities.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="archetype-preview-section">
                  <h5>Recommended Next Roles</h5>
                  {selectedArchetype.recommendedNextArchetypes.length > 0 ? (
                    <div className="archetype-chip-list">
                      {selectedArchetype.recommendedNextArchetypes.map((item) => (
                        <span key={item} className="archetype-chip">{item}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="form-helper-text">No recommended next roles.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Archetype preview card — custom */}
          {isCustomArchetype && (
            <div className="archetype-preview archetype-preview-custom" aria-live="polite">
              <div className="archetype-preview-header">
                <div>
                  <h4>Custom Archetype</h4>
                  <p>Use your own complete system prompt for this role.</p>
                </div>
                <span className="archetype-preview-tag">custom</span>
              </div>
              <p className="archetype-preview-description">
                The app will not attach any built-in role prompt. The prompt you enter below becomes the full system prompt for this role.
              </p>
            </div>
          )}

          {/* Role name */}
          <div className="form-field">
            <label htmlFor="arm-role-name">Role Name</label>
            <p className="form-helper-text">
              This name appears in task seats, role switching, and message attribution. It is never auto-filled from the archetype.
            </p>
            <input
              id="arm-role-name"
              type="text"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="e.g., Alice"
              autoFocus
            />
          </div>

          {/* Provider & Model */}
          <div className="form-field">
            <label htmlFor="arm-provider-select">Provider & Model</label>
            <p className="form-helper-text">
              Only enabled providers with a configured model are shown here.
            </p>
            {usableProviders.length === 0 ? (
              <p className="no-providers-warning">
                No usable providers. Please configure at least one provider in settings before creating this role.
              </p>
            ) : (
              <select
                id="arm-provider-select"
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
              >
                <option value="">Select provider</option>
                {usableProviders.map((p) => (
                  <option key={`${p.id}::${p.model}`} value={`${p.id}::${p.model}`}>
                    {p.name} · {p.model}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* System prompt area */}
          {!isCustomArchetype ? (
            <div className="form-field">
              <label htmlFor="arm-prompt-append">Additional System Instructions</label>
              <p className="form-helper-text">
                Optional guidance appended after the built-in archetype prompt for this specific role.
              </p>
              <textarea
                id="arm-prompt-append"
                value={systemPromptAppend}
                onChange={(e) => setSystemPromptAppend(e.target.value)}
                placeholder="Optional extra instructions appended after the built-in archetype prompt"
              />
            </div>
          ) : (
            <div className="form-field">
              <label htmlFor="arm-custom-prompt">Custom System Prompt</label>
              <p className="form-helper-text">
                Write the full system prompt for this role. No built-in archetype prompt will be added.
              </p>
              <textarea
                id="arm-custom-prompt"
                value={customSystemPrompt}
                onChange={(e) => setCustomSystemPrompt(e.target.value)}
                placeholder="Write the complete system prompt for this custom role"
              />
            </div>
          )}

          {/* Handoff toggle */}
          <label className="form-checkbox" htmlFor="arm-handoff-enabled">
            <input
              id="arm-handoff-enabled"
              type="checkbox"
              checked={handoffEnabled}
              onChange={(e) => setHandoffEnabled(e.target.checked)}
            />
            <span>Allow this role to propose handoffs</span>
          </label>
          <p className="form-helper-text form-checkbox-helper">
            Enabled by default. Turn this off only for roles that should not suggest handing work to another role.
          </p>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="modal-cancel" onClick={props.onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className="modal-create"
            onClick={handleSubmit}
            disabled={isSubmitting || usableProviders.length === 0 || isLoadingArchetypes}
          >
            {isSubmitting ? 'Adding…' : 'Add Role'}
          </button>
        </div>
      </div>
    </div>
  );
}
