/**
 * LLM Service - Utility for managing OpenAI API key and model selection
 * Stores configuration in browser localStorage for client-side persistence
 */

const API_KEY_STORAGE_KEY = 'openai-api-key'
const MODEL_STORAGE_KEY = 'openai-model'

export type OpenAIModel = 'gpt-5-nano' | 'gpt-5-mini' | 'gpt-5'

export const DEFAULT_MODEL: OpenAIModel = 'gpt-5-nano'

export const AVAILABLE_MODELS: Array<{
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

/**
 * Save OpenAI API key to localStorage
 */
export function saveApiKey(apiKey: string): void {
  if (typeof window === 'undefined') return

  if (!apiKey || apiKey.trim() === '') {
    localStorage.removeItem(API_KEY_STORAGE_KEY)
    return
  }

  localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim())
}

/**
 * Get OpenAI API key from localStorage
 */
export function getApiKey(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(API_KEY_STORAGE_KEY)
}

/**
 * Check if API key is configured
 */
export function hasApiKey(): boolean {
  return !!getApiKey()
}

/**
 * Validate API key format (basic check)
 */
export function isValidApiKey(apiKey: string): boolean {
  if (!apiKey) return false
  const trimmed = apiKey.trim()
  // OpenAI keys start with 'sk-' and are at least 20 characters
  return trimmed.startsWith('sk-') && trimmed.length >= 20
}

/**
 * Save model selection to localStorage
 */
export function saveModel(model: OpenAIModel): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(MODEL_STORAGE_KEY, model)
}

/**
 * Get model selection from localStorage
 */
export function getModel(): OpenAIModel {
  if (typeof window === 'undefined') return DEFAULT_MODEL

  const stored = localStorage.getItem(MODEL_STORAGE_KEY)
  if (stored && (stored === 'gpt-5-nano' || stored === 'gpt-5-mini' || stored === 'gpt-5')) {
    return stored as OpenAIModel
  }

  return DEFAULT_MODEL
}

/**
 * Clear all LLM configuration from localStorage
 */
export function clearConfig(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(API_KEY_STORAGE_KEY)
  localStorage.removeItem(MODEL_STORAGE_KEY)
}
