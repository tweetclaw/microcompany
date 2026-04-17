export interface ProviderConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  enabled: boolean;
}

export type ProviderType = 'anthropic' | 'openai' | 'openai-compatible' | 'ollama' | 'custom';

export interface ProviderDraft extends ProviderConfig {
  type: ProviderType;
}

export interface SettingsData {
  activeProvider: string;
  providers: ProviderConfig[];
  braveSearchApiKey?: string;
  theme?: 'light' | 'dark' | 'ocean';
}

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
  defaultModels: string[];
}

interface BackendProviderConfig {
  id: string;
  name: string;
  api_key?: string;
  apiKey?: string;
  base_url?: string;
  baseUrl?: string;
  model: string;
  enabled: boolean;
}

interface BackendSettingsData {
  active_provider?: string;
  activeProvider?: string;
  providers?: BackendProviderConfig[];
  brave_search_api_key?: string;
  braveSearchApiKey?: string;
  theme?: string;
}

interface BackendProviderInfo {
  id: string;
  name: string;
  description: string;
  requires_api_key?: boolean;
  requiresApiKey?: boolean;
  default_base_url?: string;
  defaultBaseUrl?: string;
  default_models?: string[];
  defaultModels?: string[];
}

const BUILT_IN_PROVIDER_TYPES: Record<string, ProviderType> = {
  anthropic: 'anthropic',
  openai: 'openai',
  ollama: 'ollama',
  deepseek: 'openai-compatible',
  groq: 'openai-compatible',
  moonshot: 'openai-compatible',
  zhipuai: 'openai-compatible',
};

export function createCustomProviderId() {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getProviderType(provider: Pick<ProviderConfig, 'id' | 'baseUrl'>, providerInfo?: ProviderInfo): ProviderType {
  if (providerInfo && BUILT_IN_PROVIDER_TYPES[providerInfo.id]) {
    return BUILT_IN_PROVIDER_TYPES[providerInfo.id];
  }

  if (BUILT_IN_PROVIDER_TYPES[provider.id]) {
    return BUILT_IN_PROVIDER_TYPES[provider.id];
  }

  const normalizedBaseUrl = provider.baseUrl?.toLowerCase() ?? '';
  if (normalizedBaseUrl.includes('localhost:11434') || normalizedBaseUrl.includes('127.0.0.1:11434')) {
    return 'ollama';
  }

  return normalizedBaseUrl ? 'openai-compatible' : 'custom';
}

export function isProviderEditableType(providerId: string) {
  return !BUILT_IN_PROVIDER_TYPES[providerId];
}

export function providerRequiresApiKey(type: ProviderType) {
  return type !== 'ollama';
}

export function isProviderUsable(provider: ProviderConfig, providerInfo?: ProviderInfo) {
  const type = getProviderType(provider, providerInfo);
  return provider.enabled && (!providerRequiresApiKey(type) || provider.apiKey.trim().length > 0);
}

export function toProviderDraft(provider: ProviderConfig, providerInfo?: ProviderInfo): ProviderDraft {
  return {
    ...provider,
    type: getProviderType(provider, providerInfo),
  };
}

export function toProviderConfig(draft: ProviderDraft): ProviderConfig {
  return {
    id: draft.id,
    name: draft.name,
    apiKey: draft.apiKey,
    baseUrl: draft.baseUrl,
    model: draft.model,
    enabled: draft.enabled,
  };
}

export function getDefaultBaseUrlForType(type: ProviderType, providerInfo?: ProviderInfo) {
  if (providerInfo?.defaultBaseUrl) {
    return providerInfo.defaultBaseUrl;
  }

  switch (type) {
    case 'anthropic':
      return 'https://api.anthropic.com';
    case 'openai':
      return 'https://api.openai.com';
    case 'ollama':
      return 'http://localhost:11434';
    case 'openai-compatible':
      return '';
    case 'custom':
    default:
      return '';
  }
}

export function getProviderTypeLabel(type: ProviderType) {
  switch (type) {
    case 'anthropic':
      return 'Anthropic';
    case 'openai':
      return 'OpenAI';
    case 'openai-compatible':
      return 'OpenAI Compatible';
    case 'ollama':
      return 'Ollama';
    case 'custom':
    default:
      return 'Custom';
  }
}

export function ensureValidActiveProvider(config: SettingsData): SettingsData {
  if (config.providers.some((provider) => provider.id === config.activeProvider)) {
    return config;
  }

  return {
    ...config,
    activeProvider: config.providers[0]?.id ?? '',
  };
}

export function normalizeSettingsData(raw: unknown): SettingsData {
  const source = (raw as BackendSettingsData) || {};
  const providers = (source.providers || []).map((provider) => ({
    id: provider.id,
    name: provider.name,
    apiKey: provider.apiKey ?? provider.api_key ?? '',
    baseUrl: provider.baseUrl ?? provider.base_url,
    model: provider.model,
    enabled: provider.enabled,
  }));

  const activeProvider = source.activeProvider
    ?? source.active_provider
    ?? providers[0]?.id
    ?? '';

  const braveSearchApiKey = source.braveSearchApiKey ?? source.brave_search_api_key;
  const theme = source.theme as 'light' | 'dark' | 'ocean' | undefined;

  return {
    activeProvider,
    providers,
    braveSearchApiKey,
    theme,
  };
}

export function toBackendSettingsData(config: SettingsData) {
  return {
    active_provider: config.activeProvider,
    providers: config.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      api_key: provider.apiKey,
      base_url: provider.baseUrl,
      model: provider.model,
      enabled: provider.enabled,
    })),
    brave_search_api_key: config.braveSearchApiKey,
    theme: config.theme,
  };
}

export function normalizeProviderInfo(raw: unknown): ProviderInfo {
  const source = raw as BackendProviderInfo;
  return {
    id: source.id,
    name: source.name,
    description: source.description,
    requiresApiKey: source.requiresApiKey ?? source.requires_api_key ?? false,
    defaultBaseUrl: source.defaultBaseUrl ?? source.default_base_url,
    defaultModels: source.defaultModels ?? source.default_models ?? [],
  };
}
