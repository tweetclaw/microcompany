import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SettingsData,
  ProviderConfig,
  ProviderDraft,
  ProviderInfo,
  ProviderType,
  createCustomProviderId,
  ensureValidActiveProvider,
  getDefaultBaseUrlForType,
  getProviderTypeLabel,
  isProviderEditableType,
  providerRequiresApiKey,
  toProviderConfig,
  toProviderDraft,
} from '../types/settings';
import './Settings.css';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  config: SettingsData | null;
  availableProviders: ProviderInfo[];
  onSaveConfig: (config: SettingsData) => Promise<void>;
  themePreference: 'light' | 'dark' | 'ocean';
  onThemeChange: (theme: 'light' | 'dark' | 'ocean') => void;
}

type SettingsSection = 'providers' | 'search' | 'theme';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const CUSTOM_PROVIDER_TYPE_OPTIONS: ProviderType[] = [
  'anthropic',
  'openai',
  'openai-compatible',
  'ollama',
  'custom',
];

const SEARCH_PROVIDER_NAME = 'Brave Search';

function buildCustomProviderDraft(type: ProviderType): ProviderDraft {
  return {
    id: createCustomProviderId(),
    name: '',
    type,
    apiKey: '',
    baseUrl: getDefaultBaseUrlForType(type),
    model: '',
    enabled: true,
  };
}

function getProviderValidationMessage(provider: ProviderDraft | null) {
  if (!provider) return null;
  if (!provider.name.trim()) return 'Provider name is required.';
  if (!provider.model.trim()) return 'Model is required.';
  if (provider.type !== 'ollama' && !provider.baseUrl?.trim()) return 'Base URL is required for this provider.';
  if (providerRequiresApiKey(provider.type) && !provider.apiKey.trim()) return 'API key is required for this provider.';
  return null;
}

export function Settings({ isOpen, onClose, config, availableProviders, onSaveConfig, themePreference, onThemeChange }: SettingsProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('providers');
  const [editingProvider, setEditingProvider] = useState<ProviderDraft | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [searchApiKey, setSearchApiKey] = useState('');
  const [showProviderApiKey, setShowProviderApiKey] = useState(false);
  const [showSearchApiKey, setShowSearchApiKey] = useState(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const searchApiKeyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen && config) {
      setSearchApiKey(config.braveSearchApiKey || '');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setActiveSection('providers');
      setEditingProvider(null);
      setSaveState('idle');
      setError(null);
      setShowProviderApiKey(false);
      setShowSearchApiKey(false);
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (searchApiKeyTimerRef.current) {
        window.clearTimeout(searchApiKeyTimerRef.current);
        searchApiKeyTimerRef.current = null;
      }
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      if (searchApiKeyTimerRef.current) {
        window.clearTimeout(searchApiKeyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (saveState !== 'saved') return undefined;
    const timer = window.setTimeout(() => setSaveState('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  const providerInfoMap = useMemo(() => {
    return new Map(availableProviders.map((provider) => [provider.id, provider]));
  }, [availableProviders]);

  const providerList = useMemo(() => {
    if (!config) return [];
    return config.providers.map((provider) => ({
      ...provider,
      draft: toProviderDraft(provider, providerInfoMap.get(provider.id)),
    }));
  }, [config, providerInfoMap]);

  const editingProviderInfo = editingProvider ? providerInfoMap.get(editingProvider.id) : undefined;
  const editingTypeLocked = editingProvider ? !isProviderEditableType(editingProvider.id) : false;
  const apiKeyRequired = editingProvider ? providerRequiresApiKey(editingProvider.type) : true;
  const providerValidationMessage = getProviderValidationMessage(editingProvider);
  const providerFormInvalid = Boolean(providerValidationMessage);

  const persistConfig = async (nextConfig: SettingsData) => {
    setSaveState('saving');
    setError(null);

    try {
      const validConfig = ensureValidActiveProvider(nextConfig);
      await onSaveConfig(validConfig);
      setSaveState('saved');
    } catch (e) {
      setSaveState('error');
      setError(`Failed to save settings: ${e}`);
      throw e;
    }
  };

  const handleEditProvider = (provider: ProviderConfig) => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setEditingProvider(toProviderDraft(provider, providerInfoMap.get(provider.id)));
    setActiveSection('providers');
    setError(null);
  };

  const handleAddProvider = () => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setEditingProvider(buildCustomProviderDraft('custom'));
    setActiveSection('providers');
    setError(null);
  };

  const buildNextConfigWithProvider = (providerDraft: ProviderDraft, sourceConfig = config) => {
    if (!sourceConfig) return null;

    const nextProvider = toProviderConfig(providerDraft);
    const existingIndex = sourceConfig.providers.findIndex((provider) => provider.id === nextProvider.id);
    const nextProviders = [...sourceConfig.providers];

    if (existingIndex >= 0) {
      nextProviders[existingIndex] = nextProvider;
    } else {
      nextProviders.push(nextProvider);
    }

    return {
      ...sourceConfig,
      providers: nextProviders,
    };
  };

  const scheduleProviderAutosave = (nextDraft: ProviderDraft) => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    if (!config || getProviderValidationMessage(nextDraft)) {
      return;
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      const nextConfig = buildNextConfigWithProvider(nextDraft);
      if (!nextConfig) return;
      void persistConfig(nextConfig);
      autosaveTimerRef.current = null;
    }, 700);
  };

  const updateEditingProvider = (updater: (current: ProviderDraft) => ProviderDraft) => {
    setEditingProvider((current) => {
      if (!current) return current;
      const nextDraft = updater(current);
      scheduleProviderAutosave(nextDraft);
      return nextDraft;
    });
  };

  const handleSaveProvider = async () => {
    if (!editingProvider || providerFormInvalid) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    const nextConfig = buildNextConfigWithProvider(editingProvider);
    if (!nextConfig) return;

    await persistConfig(nextConfig);
    setEditingProvider(null);
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (!config) return;

    const nextProviders = config.providers.filter((provider) => provider.id !== providerId);
    if (nextProviders.length === 0) {
      setError('At least one provider must remain configured.');
      return;
    }

    const nextConfig = ensureValidActiveProvider({
      ...config,
      providers: nextProviders,
      activeProvider: config.activeProvider === providerId
        ? nextProviders[0]?.id ?? ''
        : config.activeProvider,
    });

    await persistConfig(nextConfig);
    if (editingProvider?.id === providerId) {
      setEditingProvider(null);
    }
  };

  const handleSetActive = async (providerId: string) => {
    if (!config || config.activeProvider === providerId) return;
    await persistConfig({
      ...config,
      activeProvider: providerId,
    });
  };

  const updateEditingType = (type: ProviderType) => {
    if (!editingProvider) return;
    const nextBaseUrl = editingProvider.baseUrl?.trim()
      ? editingProvider.baseUrl
      : getDefaultBaseUrlForType(type, editingProviderInfo);

    updateEditingProvider((current) => ({
      ...current,
      type,
      baseUrl: nextBaseUrl,
      apiKey: type === 'ollama' ? '' : current.apiKey,
    }));
  };

  const renderSaveStatus = () => {
    if (saveState === 'saving') {
      return <span className="settings-status settings-status-saving">Saving...</span>;
    }
    if (saveState === 'saved') {
      return <span className="settings-status settings-status-saved">Changes saved</span>;
    }
    if (saveState === 'error') {
      return <span className="settings-status settings-status-error">Save failed</span>;
    }
    return null;
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay">
      <div className="settings-dialog settings-dialog-wide">
        <div className="settings-header">
          <div>
            <h2>Settings</h2>
            <p className="settings-subtitle">Manage providers now, and preview upcoming search and theme settings.</p>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close settings">✕</button>
        </div>

        <div className="settings-layout">
          <aside className="settings-nav">
            <button
              className={`settings-nav-item ${activeSection === 'providers' ? 'active' : ''}`}
              onClick={() => setActiveSection('providers')}
            >
              AI Providers
            </button>
            <button
              className={`settings-nav-item ${activeSection === 'search' ? 'active' : ''}`}
              onClick={() => setActiveSection('search')}
            >
              Search Engine
            </button>
            <button
              className={`settings-nav-item ${activeSection === 'theme' ? 'active' : ''}`}
              onClick={() => setActiveSection('theme')}
            >
              Theme
            </button>
          </aside>

          <div className="settings-content settings-panel-stack">
            {error && <div className="error-message">{error}</div>}

            {activeSection === 'providers' && config && (
              <div className="settings-section-card">
                <div className="settings-section-header-row">
                  <div>
                    <h3>AI Providers</h3>
                    <p className="section-description">Add, edit, and activate providers that are immediately usable for new sessions.</p>
                  </div>
                  <button className="btn-primary" onClick={handleAddProvider}>Add Provider</button>
                </div>

                {!editingProvider && (
                  <div className="providers-list providers-list-modern">
                    {providerList.map(({ draft, ...provider }) => (
                      <div key={provider.id} className="provider-item provider-card">
                        <div className="provider-info">
                          <div className="provider-name-row">
                            <div className="provider-name">{provider.name}</div>
                            <span className="provider-type-badge">{getProviderTypeLabel(draft.type)}</span>
                            <span className={`provider-kind-badge ${isProviderEditableType(provider.id) ? 'custom' : 'builtin'}`}>
                              {isProviderEditableType(provider.id) ? 'Custom' : 'Built-in'}
                            </span>
                            {config.activeProvider === provider.id && (
                              <span className="active-badge">Active</span>
                            )}
                          </div>
                          <div className="provider-details">Model: {provider.model}</div>
                          <div className="provider-details provider-secondary-line">
                            {provider.baseUrl || 'Uses provider default endpoint'}
                          </div>
                        </div>
                        <div className="provider-actions">
                          {config.activeProvider !== provider.id && (
                            <button className="btn-secondary" onClick={() => void handleSetActive(provider.id)}>
                              Set Active
                            </button>
                          )}
                          <button className="btn-secondary" onClick={() => handleEditProvider(provider)}>
                            Edit
                          </button>
                          <button className="btn-danger" onClick={() => void handleDeleteProvider(provider.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {editingProvider && (
                  <div className="provider-editor-card">
                    <div className="provider-editor-header">
                      <button className="text-button" onClick={() => setEditingProvider(null)}>
                        ← Back to list
                      </button>
                      <div>
                        <h4>{config.providers.some((provider) => provider.id === editingProvider.id) ? 'Edit Provider' : 'Add Provider'}</h4>
                        <p className="section-description">Provider changes auto-save after a short pause, and you can still use Save Provider to commit immediately.</p>
                      </div>
                    </div>

                    <div className="provider-editor-meta-row">
                      <span className={`provider-kind-badge ${editingTypeLocked ? 'builtin' : 'custom'}`}>
                        {editingTypeLocked ? 'Built-in provider' : 'Custom provider'}
                      </span>
                      {renderSaveStatus()}
                    </div>

                    <div className="form-group">
                      <label>Provider Name *</label>
                      <input
                        type="text"
                        value={editingProvider.name}
                        onChange={(e) => updateEditingProvider((current) => ({ ...current, name: e.target.value }))}
                        placeholder="e.g., My Work Anthropic"
                      />
                    </div>

                    <div className="form-group">
                      <label>Type *</label>
                      <select
                        value={editingProvider.type}
                        onChange={(e) => updateEditingType(e.target.value as ProviderType)}
                        disabled={editingTypeLocked}
                        className={editingTypeLocked ? 'input-disabled' : ''}
                      >
                        {editingTypeLocked ? (
                          <option value={editingProvider.type}>{getProviderTypeLabel(editingProvider.type)}</option>
                        ) : (
                          CUSTOM_PROVIDER_TYPE_OPTIONS.map((type) => (
                            <option key={type} value={type}>{getProviderTypeLabel(type)}</option>
                          ))
                        )}
                      </select>
                      <div className="field-hint">
                        {editingTypeLocked
                          ? 'Built-in providers keep a fixed type so saved ids remain stable and usable.'
                          : 'Custom providers can switch type to update required fields and defaults.'}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>{apiKeyRequired ? 'API Key *' : 'API Key (optional)'}</label>
                      <div className="input-with-toggle">
                        <input
                          type={showProviderApiKey ? 'text' : 'password'}
                          value={editingProvider.apiKey}
                          onChange={(e) => updateEditingProvider((current) => ({ ...current, apiKey: e.target.value }))}
                          placeholder={apiKeyRequired ? 'Enter API key' : 'Optional for this provider type'}
                          disabled={editingProvider.type === 'ollama'}
                          className={editingProvider.type === 'ollama' ? 'input-disabled' : ''}
                        />
                        {editingProvider.type !== 'ollama' && (
                          <button
                            type="button"
                            className="toggle-visibility-btn"
                            onClick={() => setShowProviderApiKey(!showProviderApiKey)}
                            aria-label={showProviderApiKey ? 'Hide API key' : 'Show API key'}
                          >
                            {showProviderApiKey ? '👁️' : '👁️‍🗨️'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>{editingProvider.type === 'ollama' ? 'Base URL *' : 'Base URL *'}</label>
                      <input
                        type="text"
                        value={editingProvider.baseUrl || ''}
                        onChange={(e) => updateEditingProvider((current) => ({ ...current, baseUrl: e.target.value }))}
                        placeholder={editingProvider.type === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com'}
                      />
                    </div>

                    <div className="form-group">
                      <label>Model *</label>
                      <input
                        type="text"
                        value={editingProvider.model}
                        onChange={(e) => updateEditingProvider((current) => ({ ...current, model: e.target.value }))}
                        placeholder="e.g., claude-opus-4-6"
                      />
                      <div className="field-hint">TODO: add model suggestions/validation later to reduce typos.</div>
                    </div>

                    {providerValidationMessage && (
                      <div className="validation-message">{providerValidationMessage}</div>
                    )}

                    <div className="form-actions">
                      <button className="btn-secondary" onClick={() => setEditingProvider(null)}>
                        Cancel
                      </button>
                      <button className="btn-primary" onClick={() => void handleSaveProvider()} disabled={providerFormInvalid}>
                        Save Provider
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'search' && (
              <div className="settings-section-card">
                <div className="settings-section-header-row">
                  <div>
                    <h3>Search Engine</h3>
                    <p className="section-description">Configure web search provider for AI-powered search capabilities.</p>
                  </div>
                </div>

                <div className="placeholder-block enhanced-placeholder-block">
                  <div className="placeholder-summary-card">
                    <div>
                      <div className="placeholder-summary-label">Search provider</div>
                      <div className="placeholder-summary-title">{SEARCH_PROVIDER_NAME}</div>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Search Provider</label>
                    <input type="text" value={SEARCH_PROVIDER_NAME} disabled className="input-disabled" />
                  </div>
                  <div className="form-group">
                    <label>API Key (optional)</label>
                    <div className="input-with-toggle">
                      <input
                        type={showSearchApiKey ? 'text' : 'password'}
                        value={searchApiKey}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setSearchApiKey(newValue);

                          // Debounce save to avoid frequent updates
                          if (searchApiKeyTimerRef.current) {
                            window.clearTimeout(searchApiKeyTimerRef.current);
                          }

                          searchApiKeyTimerRef.current = window.setTimeout(() => {
                            if (config) {
                              void persistConfig({
                                ...config,
                                braveSearchApiKey: newValue || undefined,
                              });
                            }
                            searchApiKeyTimerRef.current = null;
                          }, 1000);
                        }}
                        placeholder="Enter Brave Search API key (optional)"
                      />
                      <button
                        type="button"
                        className="toggle-visibility-btn"
                        onClick={() => setShowSearchApiKey(!showSearchApiKey)}
                        aria-label={showSearchApiKey ? 'Hide API key' : 'Show API key'}
                      >
                        {showSearchApiKey ? '👁️' : '👁️‍🗨️'}
                      </button>
                    </div>
                    <div className="field-hint">Changes are saved automatically. Clear the field to disable Brave Search and use free DuckDuckGo search instead.</div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'theme' && (
              <div className="settings-section-card">
                <div className="settings-section-header-row">
                  <div>
                    <h3>Theme</h3>
                    <p className="section-description">Choose your preferred visual theme. Changes apply immediately.</p>
                  </div>
                </div>

                <div className="theme-preview-options">
                  {(['light', 'dark', 'ocean'] as const).map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      className={`theme-option ${themePreference === theme ? 'active' : ''}`}
                      onClick={() => {
                        onThemeChange(theme);
                        if (config) {
                          void persistConfig({
                            ...config,
                            theme,
                          });
                        }
                      }}
                    >
                      <span className="theme-option-title">
                        {theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'Ocean'}
                      </span>
                      <span className="theme-option-subtitle">
                        {theme === 'light' ? 'Bright and clean' : theme === 'dark' ? 'Deep and focused' : 'Calm and soothing'}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="placeholder-note theme-placeholder-note">
                  Theme changes take effect immediately and persist across sessions.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="settings-footer settings-footer-minimal">
          {renderSaveStatus()}
        </div>
      </div>
    </div>
  );
}
