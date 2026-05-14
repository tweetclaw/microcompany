import { ProviderConfig } from './settings';
import { TaskRole } from './index';

export function buildProviderNameMap(providers: ProviderConfig[]) {
  const entries = providers.flatMap((provider) => {
    const pairs: Array<[string, string]> = [[provider.id, provider.name]];
    if (provider.model) {
      pairs.push([`${provider.id}::${provider.model}`, provider.name]);
    }
    return pairs;
  });

  return new Map(entries);
}

export function getProviderDisplayName(
  role: Pick<TaskRole, 'provider' | 'model'>,
  providerNameMap?: Map<string, string>,
) {
  const providerId = role.provider || '';
  const providerWithModel = `${providerId}::${role.model || ''}`;

  return (
    providerNameMap?.get(providerWithModel)
    || providerNameMap?.get(providerId)
    || providerId
  );
}

export function looksLikeProviderId(value?: string | null) {
  if (!value) return false;

  return /^(custom-|anthropic|openai|ollama|deepseek|groq|moonshot|zhipuai)/i.test(value);
}

export function normalizeRoleProviderModel(
  role: Pick<TaskRole, 'provider' | 'model'>,
  providerNameMap?: Map<string, string>,
  providers?: ProviderConfig[],
) {
  const providerId = role.provider || '';
  const model = role.model || '';
  const matchedProvider = providers?.find((provider) => provider.id === providerId);

  if (!providerId) {
    return {
      provider: providerId,
      model,
      changed: false,
    };
  }

  if (matchedProvider && (!model || looksLikeProviderId(model))) {
    return {
      provider: providerId,
      model: matchedProvider.model,
      changed: matchedProvider.model !== model,
    };
  }

  const hasProviderMapping = Boolean(
    providerNameMap?.get(`${providerId}::${model}`) || providerNameMap?.get(providerId),
  );

  if (!hasProviderMapping && looksLikeProviderId(model) && matchedProvider?.model) {
    return {
      provider: providerId,
      model: matchedProvider.model,
      changed: matchedProvider.model !== model,
    };
  }

  return {
    provider: providerId,
    model,
    changed: false,
  };
}
