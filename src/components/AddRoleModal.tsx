import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TaskRole } from '../types';
import { ProviderConfig } from '../types/settings';
import './AddRoleModal.css';

interface AddRoleModalProps {
  workingDirectory: string;
  availableProviders: ProviderConfig[];
  onRoleCreated: (role: TaskRole) => void;
  onCancel: () => void;
}

function AddRoleModal({
  workingDirectory,
  availableProviders,
  onRoleCreated,
  onCancel,
}: AddRoleModalProps) {
  const [roleName, setRoleName] = useState('');
  const [roleIdentity, setRoleIdentity] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const usableProviders = availableProviders.filter(
    (p) => p.enabled && p.model.trim() && (p.id === 'ollama' || p.apiKey.trim())
  );

  const handleCreate = async () => {
    setError('');

    if (!roleName.trim()) {
      setError('Role name is required');
      return;
    }

    if (!roleIdentity.trim()) {
      setError('Role identity is required');
      return;
    }

    if (!selectedProvider) {
      setError('Please select a model');
      return;
    }

    setIsCreating(true);

    const provider = usableProviders.find((p) => `${p.id}::${p.model}` === selectedProvider);
    if (!provider) {
      setError('Selected provider not found');
      setIsCreating(false);
      return;
    }

    try {
      // 立即创建真实 session
      const sessionId = await invoke<string>('init_session', {
        workingDir: workingDirectory,
        sessionId: null,
        providerId: provider.id,
      });

      const role: TaskRole = {
        id: `role-${Date.now()}`,
        name: roleName.trim(),
        identity: roleIdentity.trim(),
        providerId: provider.id,
        providerName: provider.name,
        model: provider.model,
        systemPrompt: systemPrompt.trim() || undefined,
        sessionId,
        sessionReady: true,
      };

      onRoleCreated(role);
    } catch (err) {
      setError(`Failed to create session: ${err}`);
      setIsCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="add-role-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Role</h3>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="form-field">
            <label>Role Name</label>
            <input
              type="text"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="e.g., Alice"
              disabled={isCreating}
            />
          </div>

          <div className="form-field">
            <label>Role Identity</label>
            <select
              value={roleIdentity}
              onChange={(e) => setRoleIdentity(e.target.value)}
              disabled={isCreating}
            >
              <option value="">Select identity</option>
              <option value="Product Manager">Product Manager</option>
              <option value="Developer">Developer</option>
              <option value="Reviewer">Reviewer</option>
              <option value="Tester">Tester</option>
            </select>
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
                disabled={isCreating}
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

          <div className="form-field">
            <label>System Prompt (optional)</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are responsible for..."
              rows={4}
              disabled={isCreating}
            />
          </div>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="modal-cancel" onClick={onCancel} disabled={isCreating}>
            Cancel
          </button>
          <button
            className="modal-create"
            onClick={handleCreate}
            disabled={isCreating || usableProviders.length === 0}
          >
            {isCreating ? 'Creating...' : 'Create Role'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddRoleModal;
