import React, { useMemo, useState } from 'react';
import { listRoleArchetypes } from '../api';
import { RoleArchetype, RoleConfig } from '../types';
import { ProviderConfig } from '../types/settings';
import './AddRoleModal.css';

const CUSTOM_ARCHETYPE_ID = 'custom';

interface AddRoleModalProps {
  workingDirectory: string;
  availableProviders: ProviderConfig[];
  onRoleCreated: (role: RoleConfig) => void;
  onCancel: () => void;
}

function getArchetypeIdentity(archetype: RoleArchetype | null): string {
  if (!archetype) {
    return '';
  }

  return archetype.label;
}

function AddRoleModal({
  availableProviders,
  onRoleCreated,
  onCancel,
}: AddRoleModalProps) {
  const [roleName, setRoleName] = useState('');
  const [selectedArchetypeId, setSelectedArchetypeId] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [systemPromptAppend, setSystemPromptAppend] = useState('');
  const [customSystemPrompt, setCustomSystemPrompt] = useState('');
  const [handoffEnabled, setHandoffEnabled] = useState(true);
  const [archetypes, setArchetypes] = useState<RoleArchetype[]>([]);
  const [isLoadingArchetypes, setIsLoadingArchetypes] = useState(true);
  const [error, setError] = useState('');

  const usableProviders = availableProviders.filter(
    (p) => p.enabled && p.model.trim() && (p.id === 'ollama' || p.apiKey.trim())
  );

  React.useEffect(() => {
    let cancelled = false;

    const loadArchetypes = async () => {
      setIsLoadingArchetypes(true);
      try {
        const loadedArchetypes = await listRoleArchetypes();
        if (!cancelled) {
          setArchetypes(loadedArchetypes);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Failed to load role archetypes';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingArchetypes(false);
        }
      }
    };

    loadArchetypes();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedArchetype = useMemo(
    () => archetypes.find((archetype) => archetype.id === selectedArchetypeId) ?? null,
    [archetypes, selectedArchetypeId]
  );
  const isCustomArchetype = selectedArchetypeId === CUSTOM_ARCHETYPE_ID;

  const handleCreate = async () => {
    setError('');

    if (!roleName.trim()) {
      setError('Role name is required');
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

    const role: RoleConfig = {
      name: roleName.trim(),
      identity: isCustomArchetype ? 'Custom' : getArchetypeIdentity(selectedArchetype),
      archetype_id: selectedArchetypeId || null,
      system_prompt_append: isCustomArchetype ? null : systemPromptAppend.trim() || null,
      custom_system_prompt: isCustomArchetype ? customSystemPrompt.trim() : null,
      model: provider.model,
      provider: provider.id,
      handoff_enabled: handoffEnabled,
      display_order: 0,
    };

    onRoleCreated(role);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="add-role-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Role</h3>
          <button className="modal-close" onClick={onCancel} aria-label="Close add role modal">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="form-field">
            <label>Role Archetype</label>
            {isLoadingArchetypes ? (
              <p className="form-helper-text">Loading role archetypes…</p>
            ) : archetypes.length === 0 ? (
              <p className="no-providers-warning">No role archetypes available.</p>
            ) : (
              <select
                value={selectedArchetypeId}
                onChange={(e) => setSelectedArchetypeId(e.target.value)}
              >
                <option value="">Select archetype</option>
                {archetypes.map((archetype) => (
                  <option key={archetype.id} value={archetype.id}>
                    {archetype.label}
                  </option>
                ))}
                <option value={CUSTOM_ARCHETYPE_ID}>Custom</option>
              </select>
            )}
          </div>

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

          <div className="form-field">
            <label>Role Name</label>
            <input
              type="text"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="e.g., Alice"
            />
            <p className="form-helper-text">Role names are always user-authored and are not filled from the selected archetype.</p>
          </div>

          <div className="form-field">
            <label>Provider & Model</label>
            {usableProviders.length === 0 ? (
              <p className="no-providers-warning">
                No usable providers. Please configure at least one provider in settings.
              </p>
            ) : (
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
              >
                <option value="">Select provider</option>
                {usableProviders.map((provider) => (
                  <option key={`${provider.id}::${provider.model}`} value={`${provider.id}::${provider.model}`}>
                    {provider.name} · {provider.model}
                  </option>
                ))}
              </select>
            )}
          </div>

          {!isCustomArchetype ? (
            <div className="form-field">
              <label>Additional System Instructions</label>
              <textarea
                value={systemPromptAppend}
                onChange={(e) => setSystemPromptAppend(e.target.value)}
                placeholder="Optional extra instructions appended after the built-in archetype prompt"
              />
            </div>
          ) : (
            <div className="form-field">
              <label>Custom System Prompt</label>
              <textarea
                value={customSystemPrompt}
                onChange={(e) => setCustomSystemPrompt(e.target.value)}
                placeholder="Write the complete system prompt for this custom role"
              />
            </div>
          )}

          <label className="form-checkbox">
            <input
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
          <button className="modal-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="modal-create"
            onClick={handleCreate}
            disabled={usableProviders.length === 0 || isLoadingArchetypes}
          >
            Create Role
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddRoleModal;
