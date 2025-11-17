/**
 * LLM Service - Utility for managing AI provider API keys and model selection
 * Supports OpenAI and Anthropic providers
 * Stores configuration in browser localStorage for client-side persistence
 */

const OPENAI_API_KEY_STORAGE_KEY = 'openai-api-key'
const ANTHROPIC_API_KEY_STORAGE_KEY = 'anthropic-api-key'
const MODEL_STORAGE_KEY = 'llm-model'
const PROVIDER_STORAGE_KEY = 'llm-provider'

export type AIProvider = 'openai' | 'anthropic'

export type OpenAIModel = 'gpt-5-nano' | 'gpt-5-mini' | 'gpt-5'
export type AnthropicModel = 'claude-sonnet-4-5' | 'claude-haiku-4-5'

export type AIModel = OpenAIModel | AnthropicModel

export const DEFAULT_PROVIDER: AIProvider = 'openai'
export const DEFAULT_OPENAI_MODEL: OpenAIModel = 'gpt-5-nano'
export const DEFAULT_ANTHROPIC_MODEL: AnthropicModel = 'claude-haiku-4-5'

export const OPENAI_MODELS: Array<{
  value: OpenAIModel
  label: string
  description: string
}> = [
  {
    value: 'gpt-5-nano',
    label: 'GPT-5 Nano',
    description: 'Fastest and most cost-effective ($0.05 input / $0.40 output)',
  },
  {
    value: 'gpt-5-mini',
    label: 'GPT-5 Mini',
    description: 'Balanced performance and cost ($0.25 input / $2.00 output)',
  },
  {
    value: 'gpt-5',
    label: 'GPT-5',
    description: 'Most capable model ($1.25 input / $10.00 output)',
  },
]

export const ANTHROPIC_MODELS: Array<{
  value: AnthropicModel
  label: string
  description: string
}> = [
  {
    value: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    description: 'Fastest and most cost-effective ($0.30/M input, $1.50/M output)',
  },
  {
    value: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    description: 'Most capable Anthropic model ($3.00/M input, $15.00/M output)',
  },
]

/**
 * Save provider selection to localStorage
 */
export function saveProvider(provider: AIProvider): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(PROVIDER_STORAGE_KEY, provider)
}

/**
 * Get provider selection from localStorage
 */
export function getProvider(): AIProvider {
  if (typeof window === 'undefined') return DEFAULT_PROVIDER

  const stored = localStorage.getItem(PROVIDER_STORAGE_KEY)
  if (stored === 'openai' || stored === 'anthropic') {
    return stored
  }

  return DEFAULT_PROVIDER
}

/**
 * Save API key to localStorage for the specified provider
 */
export function saveApiKey(apiKey: string, provider: AIProvider): void {
  if (typeof window === 'undefined') return

  const storageKey = provider === 'openai' ? OPENAI_API_KEY_STORAGE_KEY : ANTHROPIC_API_KEY_STORAGE_KEY

  if (!apiKey || apiKey.trim() === '') {
    localStorage.removeItem(storageKey)
    return
  }

  localStorage.setItem(storageKey, apiKey.trim())
}

/**
 * Get API key from localStorage for the specified provider
 */
export function getApiKey(provider: AIProvider): string | null {
  if (typeof window === 'undefined') return null
  const storageKey = provider === 'openai' ? OPENAI_API_KEY_STORAGE_KEY : ANTHROPIC_API_KEY_STORAGE_KEY
  return localStorage.getItem(storageKey)
}

/**
 * Check if API key is configured for the specified provider
 */
export function hasApiKey(provider: AIProvider): boolean {
  return !!getApiKey(provider)
}

/**
 * Validate API key format for the specified provider
 */
export function isValidApiKey(apiKey: string, provider: AIProvider): boolean {
  if (!apiKey) return false
  const trimmed = apiKey.trim()

  if (provider === 'openai') {
    // OpenAI keys start with 'sk-' and are at least 20 characters
    return trimmed.startsWith('sk-') && trimmed.length >= 20
  } else {
    // Anthropic keys start with 'sk-ant-' and are at least 20 characters
    return trimmed.startsWith('sk-ant-') && trimmed.length >= 20
  }
}

/**
 * Save model selection to localStorage
 */
export function saveModel(model: AIModel): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(MODEL_STORAGE_KEY, model)
}

/**
 * Get model selection from localStorage
 */
export function getModel(): AIModel {
  if (typeof window === 'undefined') {
    const provider = getProvider()
    return provider === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL
  }

  const stored = localStorage.getItem(MODEL_STORAGE_KEY)
  const provider = getProvider()

  // Validate stored model matches provider
  if (stored) {
    if (provider === 'openai' && (stored === 'gpt-5-nano' || stored === 'gpt-5-mini' || stored === 'gpt-5')) {
      return stored as OpenAIModel
    }
    if (provider === 'anthropic' && (stored === 'claude-sonnet-4-5' || stored === 'claude-haiku-4-5')) {
      return stored as AnthropicModel
    }
  }

  // Return default for current provider
  return provider === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL
}

/**
 * Get available models for the specified provider
 */
export function getAvailableModels(provider: AIProvider) {
  return provider === 'openai' ? OPENAI_MODELS : ANTHROPIC_MODELS
}

/**
 * Get the human-readable label for a model
 */
export function getModelLabel(model: AIModel): string {
  const allModels = [...OPENAI_MODELS, ...ANTHROPIC_MODELS]
  const modelInfo = allModels.find(m => m.value === model)
  return modelInfo?.label || model
}

/**
 * Clear all LLM configuration from localStorage
 */
export function clearConfig(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY)
  localStorage.removeItem(ANTHROPIC_API_KEY_STORAGE_KEY)
  localStorage.removeItem(MODEL_STORAGE_KEY)
  localStorage.removeItem(PROVIDER_STORAGE_KEY)
}
