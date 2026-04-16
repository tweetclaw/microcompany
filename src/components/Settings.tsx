import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  SettingsData,
  ProviderConfig,
  ProviderInfo,
  normalizeProviderInfo,
  normalizeSettingsData,
  toBackendSettingsData,
} from '../types/settings';
import './Settings.css';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

function createCustomProviderId() {
  return `custom-${Date.now().toString(36)}`;
}

export function Settings({ isOpen, onClose }: SettingsProps) {
  const [config, setConfig] = useState<SettingsData | null>(null);
  const [availableProviders, setAvailableProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);

  const editingProviderInfo = editingProvider
    ? availableProviders.find((provider) => provider.id === editingProvider.id)
    : undefined;
  const isCustomProvider = Boolean(editingProvider && !editingProviderInfo);
  const apiKeyRequired = editingProvider ? (editingProviderInfo?.requiresApiKey ?? true) : true;
  const providerFormInvalid = !editingProvider
    || !editingProvider.name.trim()
    || !editingProvider.model.trim()
    || (apiKeyRequired && !editingProvider.apiKey.trim())
    || (isCustomProvider && !editingProvider.baseUrl?.trim());

  useEffect(() => {
    if (isOpen) {
      loadConfig();
      loadAvailableProviders();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke('get_config');
      setConfig(normalizeSettingsData(data));
    } catch (e) {
      setError(`Failed to load config: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableProviders = async () => {
    try {
      const providers = await invoke<unknown[]>('get_available_providers');
      setAvailableProviders(providers.map(normalizeProviderInfo));
    } catch (e) {
      console.error('Failed to load available providers:', e);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await invoke('save_config', { config: toBackendSettingsData(config) });
      setSuccessMessage('Settings saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e) {
      setError(`Failed to save config: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleProviderSelect = (providerId: string) => {
    if (!providerId) return;

    const providerInfo = availableProviders.find(p => p.id === providerId);
    if (!providerInfo) return;

    const existingProvider = config?.providers.find(p => p.id === providerId);

    if (existingProvider) {
      setEditingProvider(existingProvider);
    } else {
      setEditingProvider({
        id: providerInfo.id,
        name: providerInfo.name,
        apiKey: '',
        baseUrl: providerInfo.defaultBaseUrl,
        model: providerInfo.defaultModels[0] || '',
        enabled: true,
      });
    }
  };

  const handleCreateCustomProvider = () => {
    setEditingProvider({
      id: createCustomProviderId(),
      name: '',
      apiKey: '',
      baseUrl: '',
      model: '',
      enabled: true,
    });
  };

  const handleSaveProvider = () => {
    if (!editingProvider || !config) return;

    const existingIndex = config.providers.findIndex(p => p.id === editingProvider.id);

    if (existingIndex >= 0) {
      const newProviders = [...config.providers];
      newProviders[existingIndex] = editingProvider;
      setConfig({ ...config, providers: newProviders });
    } else {
      setConfig({
        ...config,
        providers: [...config.providers, editingProvider],
      });
    }

    setEditingProvider(null);
  };

  const handleDeleteProvider = (providerId: string) => {
    if (!config) return;

    setConfig({
      ...config,
      providers: config.providers.filter(p => p.id !== providerId),
      activeProvider: config.activeProvider === providerId
        ? (config.providers[0]?.id || '')
        : config.activeProvider,
    });
  };

  const handleSetActive = (providerId: string) => {
    if (!config) return;
    setConfig({ ...config, activeProvider: providerId });
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        <div className="settings-content">
          {loading && <div className="loading">Loading settings...</div>}

          {error && <div className="error-message">{error}</div>}
          {successMessage && <div className="success-message">{successMessage}</div>}

          {config && !editingProvider && (
            <>
              <div className="settings-section">
                <h3>AI Providers</h3>
                <p className="section-description">
                  Configure AI providers and switch between them
                </p>

                <div className="providers-list">
                  {config.providers.map((provider) => (
                    <div key={provider.id} className="provider-item">
                      <div className="provider-info">
                        <div className="provider-name">
                          {provider.name}
                          {config.activeProvider === provider.id && (
                            <span className="active-badge">Active</span>
                          )}
                        </div>
                        <div className="provider-details">
                          Model: {provider.model}
                        </div>
                      </div>
                      <div className="provider-actions">
                        {config.activeProvider !== provider.id && (
                          <button
                            className="btn-secondary"
                            onClick={() => handleSetActive(provider.id)}
                          >
                            Set Active
                          </button>
                        )}
                        <button
                          className="btn-secondary"
                          onClick={() => setEditingProvider(provider)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => handleDeleteProvider(provider.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="add-provider-section">
                  <label>Add Provider:</label>
                  <select
                    onChange={(e) => {
                      handleProviderSelect(e.target.value);
                      e.currentTarget.value = '';
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>Select a provider...</option>
                    {availableProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-secondary"
                    onClick={handleCreateCustomProvider}
                  >
                    自定义模型
                  </button>
                </div>
              </div>
            </>
          )}

          {editingProvider && (
            <div className="settings-section">
              <h3>
                {isCustomProvider
                  ? 'Add Custom Provider'
                  : config?.providers.find(p => p.id === editingProvider.id)
                    ? 'Edit Provider'
                    : 'Add Provider'}
              </h3>

              <div className="form-group">
                <label>Provider Name *</label>
                <input
                  type="text"
                  value={editingProvider.name}
                  onChange={(e) =>
                    setEditingProvider({ ...editingProvider, name: e.target.value })
                  }
                  placeholder="e.g., My OpenAI Compatible"
                  disabled={!isCustomProvider}
                  className={!isCustomProvider ? 'input-disabled' : ''}
                />
              </div>

              <div className="form-group">
                <label>{apiKeyRequired ? 'API Key *' : 'API Key (optional)'}</label>
                <input
                  type="password"
                  value={editingProvider.apiKey}
                  onChange={(e) =>
                    setEditingProvider({ ...editingProvider, apiKey: e.target.value })
                  }
                  placeholder="Enter API key"
                />
              </div>

              <div className="form-group">
                <label>{isCustomProvider ? 'Base URL *' : 'Base URL (optional)'}</label>
                <input
                  type="text"
                  value={editingProvider.baseUrl || ''}
                  onChange={(e) =>
                    setEditingProvider({ ...editingProvider, baseUrl: e.target.value })
                  }
                  placeholder={isCustomProvider ? 'https://api.example.com' : 'Default URL will be used if empty'}
                />
              </div>

              <div className="form-group">
                <label>Model *</label>
                <input
                  type="text"
                  value={editingProvider.model}
                  onChange={(e) =>
                    setEditingProvider({ ...editingProvider, model: e.target.value })
                  }
                  placeholder="e.g., claude-opus-4-6"
                />
              </div>

              <div className="form-actions">
                <button
                  className="btn-secondary"
                  onClick={() => setEditingProvider(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSaveProvider}
                  disabled={providerFormInvalid}
                >
                  Save Provider
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="settings-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || !config}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
