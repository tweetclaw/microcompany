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
