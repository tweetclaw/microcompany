export interface ProviderConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  enabled: boolean;
}

export interface SettingsData {
  activeProvider: string;
  providers: ProviderConfig[];
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

  return {
    activeProvider,
    providers,
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
