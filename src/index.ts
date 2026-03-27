import type { LLMProviderPlugin } from '@quilltap/plugin-types';
import { DeepSeekProvider } from './provider';
import { DeepSeekIcon } from './icon';

const BASE_URL = 'https://api.deepseek.com';

export const plugin: LLMProviderPlugin = {
  metadata: {
    providerName: 'DEEPSEEK',
    displayName: 'DeepSeek',
    description: 'Chat completions and reasoning via DeepSeek API',
    abbreviation: 'DS',
    colors: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      icon: 'text-blue-600',
    },
  },

  config: {
    requiresApiKey: true,
    requiresBaseUrl: false,
    apiKeyLabel: 'DeepSeek API Key',
  },

  capabilities: {
    chat: true,
    imageGeneration: false,
    embeddings: false,
    webSearch: false,
  },

  attachmentSupport: {
    supportsAttachments: false,
    supportedMimeTypes: [],
    description: 'DeepSeek does not support file attachments',
    maxBase64Size: 0,
  },

  createProvider: (baseUrl?: string) => {
    return new DeepSeekProvider(baseUrl);
  },

  getAvailableModels: async (apiKey: string, baseUrl?: string) => {
    try {
      const url = baseUrl || BASE_URL;
      const response = await fetch(`${url}/v1/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.data || []).map((m: any) => m.id);
    } catch {
      return [];
    }
  },

  validateApiKey: async (apiKey: string, baseUrl?: string) => {
    try {
      const url = baseUrl || BASE_URL;
      const response = await fetch(`${url}/v1/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  getModelInfo: () => [
    {
      id: 'deepseek-chat',
      name: 'DeepSeek Chat (V3.2)',
      contextWindow: 128000,
      maxOutputTokens: 8192,
      supportsImages: false,
      supportsTools: true,
      pricing: { input: 0.28, output: 0.42 },
    },
    {
      id: 'deepseek-reasoner',
      name: 'DeepSeek Reasoner (V3.2 Thinking)',
      contextWindow: 128000,
      maxOutputTokens: 64000,
      supportsImages: false,
      supportsTools: true,
      pricing: { input: 0.28, output: 0.42 },
    },
  ],

  icon: {
    viewBox: '0 0 24 24',
    paths: [
      {
        d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.5v-2.14c-1.72-.45-3-2-3-3.86h2c0 1.1.9 2 2 2s2-.9 2-2c0-1.1-.9-2-2-2-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4h-2c0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2c2.21 0 4 1.79 4 4 0 1.86-1.28 3.41-3 3.86v2.14h-2z',
        fill: 'currentColor',
      },
    ],
  },

  toolFormat: 'openai',

  charsPerToken: 4,

  cheapModels: {
    defaultModel: 'deepseek-chat',
    recommendedModels: ['deepseek-chat'],
  },

  defaultContextWindow: 128000,

  messageFormat: {
    supportsNameField: true,
    supportedRoles: ['user', 'assistant'],
    maxNameLength: 64,
  },
};

export default plugin;
