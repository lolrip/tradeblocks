/**
 * Hook for managing optimization presets
 * Stores presets in localStorage
 */

import { useState, useEffect, useCallback } from 'react'
import type { OptimizationPreset } from '@/lib/types/portfolio-optimizer-types'

const PRESETS_STORAGE_KEY = 'portfolio-optimizer-presets'
const MAX_PRESETS = 50

/**
 * Hook for managing optimization presets
 */
export function useOptimizationPresets() {
  const [presets, setPresets] = useState<OptimizationPreset[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Load presets from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PRESETS_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as OptimizationPreset[]
        setPresets(parsed)
      }
    } catch (error) {
      console.error('Failed to load optimization presets:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Save presets to localStorage whenever they change
  const saveToStorage = useCallback((updatedPresets: OptimizationPreset[]) => {
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updatedPresets))
    } catch (error) {
      console.error('Failed to save optimization presets:', error)
    }
  }, [])

  // Create a new preset
  const createPreset = useCallback((preset: Omit<OptimizationPreset, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newPreset: OptimizationPreset = {
      ...preset,
      id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setPresets(prev => {
      // Add new preset at the beginning
      let updated = [newPreset, ...prev]

      // Enforce max presets limit
      if (updated.length > MAX_PRESETS) {
        updated = updated.slice(0, MAX_PRESETS)
      }

      saveToStorage(updated)
      return updated
    })

    return newPreset
  }, [saveToStorage])

  // Update an existing preset
  const updatePreset = useCallback((id: string, updates: Partial<Omit<OptimizationPreset, 'id' | 'createdAt'>>) => {
    setPresets(prev => {
      const updated = prev.map(preset =>
        preset.id === id
          ? { ...preset, ...updates, updatedAt: new Date().toISOString() }
          : preset
      )
      saveToStorage(updated)
      return updated
    })
  }, [saveToStorage])

  // Delete a preset
  const deletePreset = useCallback((id: string) => {
    setPresets(prev => {
      const updated = prev.filter(preset => preset.id !== id)
      saveToStorage(updated)
      return updated
    })
  }, [saveToStorage])

  // Get a preset by ID
  const getPreset = useCallback((id: string) => {
    return presets.find(preset => preset.id === id)
  }, [presets])

  // Clear all presets
  const clearAllPresets = useCallback(() => {
    setPresets([])
    localStorage.removeItem(PRESETS_STORAGE_KEY)
  }, [])

  return {
    presets,
    isLoading,
    createPreset,
    updatePreset,
    deletePreset,
    getPreset,
    clearAllPresets,
  }
}
