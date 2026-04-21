import React, { useState } from 'react';
import { RoleConfig } from '../types';
import { ProviderConfig } from '../types/settings';
import './AddRoleModal.css';

interface AddRoleModalProps {
  workingDirectory: string;
  availableProviders: ProviderConfig[];
  onRoleCreated: (role: RoleConfig) => void;
  onCancel: () => void;
}

function AddRoleModal({
  availableProviders,
  onRoleCreated,
  onCancel,
}: AddRoleModalProps) {
  const [roleName, setRoleName] = useState('');
  const [roleIdentity, setRoleIdentity] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
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

    const provider = usableProviders.find((p) => `${p.id}::${p.model}` === selectedProvider);
    if (!provider) {
      setError('Selected provider not found');
      return;
    }

    const role: RoleConfig = {
      name: roleName.trim(),
      identity: roleIdentity.trim(),
      model: provider.model,
      provider: provider.id,
    };

    onRoleCreated(role);
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
            />
          </div>

          <div className="form-field">
            <label>Role Identity</label>
            <select
              value={roleIdentity}
              onChange={(e) => setRoleIdentity(e.target.value)}
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

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="modal-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="modal-create"
            onClick={handleCreate}
            disabled={usableProviders.length === 0}
          >
            Create Role
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddRoleModal;
