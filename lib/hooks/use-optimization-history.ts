/**
 * Hook for managing optimization history
 * Stores history entries in localStorage with automatic compaction
 */

import { useState, useEffect, useCallback } from 'react'
import type { OptimizationHistoryEntry } from '@/lib/types/portfolio-optimizer-types'
import type { HierarchicalResult } from '@/lib/calculations/hierarchical-optimizer'

const HISTORY_STORAGE_KEY = 'portfolio-optimizer-history'
const MAX_HISTORY_ENTRIES = 50

/**
 * Create a compact version of the result by removing bulky data
 * This dramatically reduces localStorage usage
 */
function compactResult(result: HierarchicalResult): HierarchicalResult {
  return {
    // Compact optimized blocks - remove trades, allPortfolios, efficientFrontier, and daily series
    optimizedBlocks: result.optimizedBlocks.map(block => ({
      blockId: block.blockId,
      blockName: block.blockName,
      strategyWeights: block.strategyWeights,
      metrics: block.metrics,
      // Remove bulky fields
      dates: [],
      returns: [],
      trades: [],
      isLocked: block.isLocked,
      // Don't include allPortfolios and efficientFrontier in compact version
    })),
    blockWeights: result.blockWeights,
    portfolioMetrics: result.portfolioMetrics,
    // Keep only the optimal portfolio, not all portfolios
    blockPortfolios: result.blockPortfolios.length > 0 ? [result.blockPortfolios[0]] : [],
    // Reduce efficient frontier to just a few key points
    blockEfficientFrontier: result.blockEfficientFrontier.length > 0
      ? [result.blockEfficientFrontier[0], result.blockEfficientFrontier[Math.floor(result.blockEfficientFrontier.length / 2)], result.blockEfficientFrontier[result.blockEfficientFrontier.length - 1]]
      : [],
    combinedAllocation: result.combinedAllocation,
  }
}

/**
 * Hook for managing optimization history
 */
export function useOptimizationHistory() {
  const [history, setHistory] = useState<OptimizationHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as OptimizationHistoryEntry[]
        setHistory(parsed)
      }
    } catch (error) {
      console.error('Failed to load optimization history:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Save history to localStorage with automatic cleanup on quota errors
  const saveToStorage = useCallback((updatedHistory: OptimizationHistoryEntry[]) => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updatedHistory))
    } catch (error) {
      // Handle quota exceeded errors
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded. Attempting to free up space...')

        // Strategy 1: Try saving with fewer entries (keep most recent 25)
        if (updatedHistory.length > 25) {
          try {
            const reducedHistory = updatedHistory.slice(0, 25)
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(reducedHistory))
            console.log('Successfully saved history with reduced entries (25)')
            setHistory(reducedHistory)
            return
          } catch {
            console.warn('Failed to save with 25 entries')
          }
        }

        // Strategy 2: Try with even fewer entries (keep most recent 10)
        if (updatedHistory.length > 10) {
          try {
            const minimalHistory = updatedHistory.slice(0, 10)
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(minimalHistory))
            console.log('Successfully saved history with minimal entries (10)')
            setHistory(minimalHistory)
            return
          } catch {
            console.warn('Failed to save with 10 entries')
          }
        }

        // Strategy 3: Clear history completely as last resort
        console.error('Unable to save optimization history due to storage quota. Clearing old history.')
        localStorage.removeItem(HISTORY_STORAGE_KEY)
        setHistory([])
      } else {
        console.error('Failed to save optimization history:', error)
      }
    }
  }, [])

  // Add a new history entry with automatic compaction
  const addHistoryEntry = useCallback((entry: Omit<OptimizationHistoryEntry, 'id' | 'timestamp'>) => {
    // Compact the result to reduce storage size
    const compactedEntry: OptimizationHistoryEntry = {
      ...entry,
      result: compactResult(entry.result),
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    }

    setHistory(prev => {
      // Add new entry at the beginning (most recent first)
      let updated = [compactedEntry, ...prev]

      // Enforce max history limit
      if (updated.length > MAX_HISTORY_ENTRIES) {
        updated = updated.slice(0, MAX_HISTORY_ENTRIES)
      }

      saveToStorage(updated)
      return updated
    })

    return compactedEntry
  }, [saveToStorage])

  // Delete a history entry
  const deleteHistoryEntry = useCallback((id: string) => {
    setHistory(prev => {
      const updated = prev.filter(entry => entry.id !== id)
      saveToStorage(updated)
      return updated
    })
  }, [saveToStorage])

  // Get a history entry by ID
  const getHistoryEntry = useCallback((id: string) => {
    return history.find(entry => entry.id === id)
  }, [history])

  // Get recent history entries (default: 10 most recent)
  const getRecentHistory = useCallback((count: number = 10) => {
    return history.slice(0, count)
  }, [history])

  // Clear all history
  const clearAllHistory = useCallback(() => {
    setHistory([])
    localStorage.removeItem(HISTORY_STORAGE_KEY)
  }, [])

  // Get history filtered by mode
  const getHistoryByMode = useCallback((mode: OptimizationHistoryEntry['mode']) => {
    return history.filter(entry => entry.mode === mode)
  }, [history])

  return {
    history,
    isLoading,
    addHistoryEntry,
    deleteHistoryEntry,
    getHistoryEntry,
    getRecentHistory,
    clearAllHistory,
    getHistoryByMode,
  }
}
