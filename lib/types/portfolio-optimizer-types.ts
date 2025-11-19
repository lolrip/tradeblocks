/**
 * Types for Portfolio Optimizer
 * Includes presets, history, and optimization modes
 */

import type { HierarchicalConfig, HierarchicalResult } from "@/lib/calculations/hierarchical-optimizer"

/**
 * Optimization modes available in the Portfolio Optimizer
 */
export type OptimizationMode =
  | 'single-block'      // Optimize strategies within a single block
  | 'multi-block'       // Optimize allocation across blocks (treat as atomic units)
  | 'hierarchical'      // Two-level: optimize strategies within blocks, then optimize block allocation

/**
 * Preset for saving optimization configurations
 */
export interface OptimizationPreset {
  id: string
  name: string
  description?: string
  mode: OptimizationMode
  selectedBlockIds: string[]
  config: HierarchicalConfig
  totalCapital: number
  allowSingleStrategyBlocks: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Historical optimization run with results
 */
export interface OptimizationHistoryEntry {
  id: string
  presetId?: string  // Reference to preset if one was used
  presetName?: string
  mode: OptimizationMode
  selectedBlockIds: string[]
  selectedBlockNames: string[]
  config: HierarchicalConfig
  totalCapital: number
  result: HierarchicalResult
  duration: number  // milliseconds
  timestamp: string
}

/**
 * Export format for optimization results
 */
export interface OptimizationExport {
  // Metadata
  exportedAt: string
  optimizationMode: OptimizationMode
  totalCapital: number
  duration: number

  // Configuration
  config: HierarchicalConfig

  // Results summary
  portfolioMetrics: {
    annualizedReturn: number
    annualizedVolatility: number
    sharpeRatio: number
  }

  // Allocation data
  blockWeights: Array<{
    blockName: string
    weight: number
    capitalAllocation: number
    sharpeRatio: number
    annualizedReturn: number
    annualizedVolatility: number
  }>

  // Strategy-level allocation (for hierarchical mode)
  strategyWeights?: Array<{
    blockName: string
    strategyName: string
    weightInBlock: number
    weightInPortfolio: number
    capitalAllocation: number
  }>
}
