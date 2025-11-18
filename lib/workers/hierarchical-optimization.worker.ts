/**
 * Web Worker for Hierarchical Portfolio Optimization
 *
 * Runs two-phase optimization in a background thread:
 * - Phase 1: Optimize strategy weights within each block
 * - Phase 2: Optimize block weights using Phase 1 results
 *
 * Message Protocol:
 * - Input: HierarchicalOptimizationRequest with blocks and configuration
 * - Output: Stream of PhaseProgressUpdate messages with progress for each phase
 * - Final: HierarchicalCompletionMessage with complete results
 */

import {
  runHierarchicalOptimization,
  type HierarchicalConfig,
  type HierarchicalResult,
  DEFAULT_HIERARCHICAL_CONFIG,
} from '../calculations/hierarchical-optimizer'

import type { Trade } from '../models/trade'

/**
 * Request message to start hierarchical optimization
 */
export interface HierarchicalOptimizationRequest {
  type: 'start'
  blocks: Array<{
    blockId: string
    blockName: string
    trades: Trade[]
  }>
  config?: HierarchicalConfig
}

/**
 * Progress update message for Phase 1 or Phase 2
 */
export interface PhaseProgressUpdate {
  type: 'phase-progress'
  phase: 1 | 2
  progress: number // 0-100 within this phase
  message: string
  overallProgress: number // 0-100 overall (Phase 1 = 0-50%, Phase 2 = 50-100%)
}

/**
 * Completion message with full hierarchical results
 */
export interface HierarchicalCompletionMessage {
  type: 'complete'
  result: HierarchicalResult
  duration: number // milliseconds
}

/**
 * Error message
 */
export interface HierarchicalErrorMessage {
  type: 'error'
  error: string
  details?: string
}

export type HierarchicalWorkerResponse =
  | PhaseProgressUpdate
  | HierarchicalCompletionMessage
  | HierarchicalErrorMessage

/**
 * Main worker event handler
 */
self.onmessage = async (event: MessageEvent<HierarchicalOptimizationRequest>) => {
  const request = event.data

  if (request.type !== 'start') {
    const error: HierarchicalErrorMessage = {
      type: 'error',
      error: 'Invalid message type',
      details: `Expected 'start', got '${request.type}'`,
    }
    self.postMessage(error)
    return
  }

  try {
    const startTime = performance.now()

    // Validate input
    if (!request.blocks || request.blocks.length < 2) {
      const error: HierarchicalErrorMessage = {
        type: 'error',
        error: 'Insufficient blocks',
        details: 'At least 2 blocks are required for hierarchical optimization',
      }
      self.postMessage(error)
      return
    }

    const config = request.config || DEFAULT_HIERARCHICAL_CONFIG

    // Progress callback to send updates to main thread
    const progressCallback = (phase: 1 | 2, phaseProgress: number, message: string) => {
      // Calculate overall progress (Phase 1 = 0-50%, Phase 2 = 50-100%)
      const overallProgress = phase === 1
        ? phaseProgress * 0.5
        : 50 + phaseProgress * 0.5

      const update: PhaseProgressUpdate = {
        type: 'phase-progress',
        phase,
        progress: phaseProgress,
        message,
        overallProgress,
      }

      self.postMessage(update)
    }

    // Run hierarchical optimization
    const result = await runHierarchicalOptimization(
      request.blocks,
      config,
      progressCallback
    )

    const endTime = performance.now()
    const duration = endTime - startTime

    // Send completion message
    const completion: HierarchicalCompletionMessage = {
      type: 'complete',
      result,
      duration,
    }

    self.postMessage(completion)
  } catch (error) {
    const errorMessage: HierarchicalErrorMessage = {
      type: 'error',
      error: 'Hierarchical optimization failed',
      details: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(errorMessage)
  }
}
