import type { AIProvider } from "@/types/locax";

const PROVIDER_STORAGE_KEY = "locax-ai-provider";
const KEY_STORAGE_PREFIX = "locax-ai-key";
const MODEL_STORAGE_PREFIX = "locax-ai-model";
const ENDPOINT_STORAGE_PREFIX = "locax-ai-endpoint";
const LEGACY_OPENAI_KEY = "locax-ai-key";

export const DEFAULT_AI_PROVIDER: AIProvider = "openai";

type MaybeStorage = Storage | undefined;

function getStorage(): MaybeStorage {
  if (typeof window === "undefined" || !window.localStorage) {
    return undefined;
  }
 
  return window.localStorage;
}

export function getStoredAiProvider(): AIProvider {
  const storage = getStorage();
  if (!storage) {
    return DEFAULT_AI_PROVIDER;
  }

  const stored = storage.getItem(PROVIDER_STORAGE_KEY);
  if (stored === "gemini" || stored === "openrouter" || stored === "ollama") {
    return stored;
  }

  return DEFAULT_AI_PROVIDER;
}

export function getStoredApiKey(provider: AIProvider = DEFAULT_AI_PROVIDER): string | undefined {
  const storage = getStorage();
  if (!storage) {
    return undefined;
  }

  const stored = storage.getItem(`${KEY_STORAGE_PREFIX}-${provider}`);
  if (stored) {
    return stored;
  }

  if (provider === "openai") {
    return storage.getItem(LEGACY_OPENAI_KEY) || undefined;
  }

  return undefined;
}

export function getStoredModel(provider: AIProvider = DEFAULT_AI_PROVIDER): string | undefined {
  const storage = getStorage();
  if (!storage) {
    return undefined;
  }

  return storage.getItem(`${MODEL_STORAGE_PREFIX}-${provider}`) || undefined;
}

interface ProviderSettings {
  apiKey?: string;
  model?: string;
  endpoint?: string;
}

export function getStoredProviderSettings(provider: AIProvider = DEFAULT_AI_PROVIDER): ProviderSettings {
  return {
    apiKey: getStoredApiKey(provider),
    model: getStoredModel(provider),
    endpoint: getStoredEndpoint(provider),
  };
}

export function getStoredEndpoint(provider: AIProvider = DEFAULT_AI_PROVIDER): string | undefined {
  const storage = getStorage();
  if (!storage) {
    return undefined;
  }

  return storage.getItem(`${ENDPOINT_STORAGE_PREFIX}-${provider}`) || undefined;
}

export function persistAiSettings(provider: AIProvider, settings: ProviderSettings = {}): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(PROVIDER_STORAGE_KEY, provider);
  const keyName = `${KEY_STORAGE_PREFIX}-${provider}`;
  const modelName = `${MODEL_STORAGE_PREFIX}-${provider}`;
  const endpointName = `${ENDPOINT_STORAGE_PREFIX}-${provider}`;

  if (settings.apiKey) {
    storage.setItem(keyName, settings.apiKey);
    if (provider === "openai") {
      storage.setItem(LEGACY_OPENAI_KEY, settings.apiKey);
    }
  } else {
    storage.removeItem(keyName);
    if (provider === "openai") {
      storage.removeItem(LEGACY_OPENAI_KEY);
    }
  }

  if (settings.model) {
    storage.setItem(modelName, settings.model);
  } else {
    storage.removeItem(modelName);
  }

  if (settings.endpoint) {
    storage.setItem(endpointName, settings.endpoint);
  } else {
    storage.removeItem(endpointName);
  }
}
