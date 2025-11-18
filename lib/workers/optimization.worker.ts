/**
 * Web Worker for Efficient Frontier Optimization
 *
 * Runs Monte Carlo simulation for portfolio optimization in a background thread
 * to prevent blocking the main UI thread during intensive calculations.
 *
 * Supports both strategy-level and block-level optimization using the same
 * Monte Carlo algorithm.
 *
 * Message Protocol:
 * - Input: OptimizationRequest with strategy/block returns and configuration
 * - Output: Stream of ProgressUpdate messages with portfolio results
 * - Final: CompletionMessage with all portfolios and efficient frontier
 */

import {
  runMonteCarloSimulation,
  identifyEfficientFrontier,
  type StrategyReturns,
  type PortfolioConstraints,
  type PortfolioResult,
  DEFAULT_CONSTRAINTS,
} from '../calculations/efficient-frontier'

import {
  runBlockMonteCarloSimulation,
  type BlockReturns,
  type BlockOptimizationConfig,
  DEFAULT_BLOCK_CONFIG,
} from '../calculations/block-efficient-frontier'

/**
 * Request message to start strategy-level optimization
 */
export interface StrategyOptimizationRequest {
  type: 'start'
  mode: 'strategy'
  strategyReturns: StrategyReturns[]
  numSimulations: number
  constraints?: PortfolioConstraints
  riskFreeRate?: number
  randomSeed?: number
}

/**
 * Request message to start block-level optimization
 */
export interface BlockOptimizationRequest {
  type: 'start'
  mode: 'block'
  blockReturns: BlockReturns[]
  numSimulations: number
  config?: BlockOptimizationConfig
  randomSeed?: number
}

/**
 * Union type for all optimization requests
 */
export type OptimizationRequest = StrategyOptimizationRequest | BlockOptimizationRequest

/**
 * Progress update message with latest portfolio
 */
export interface ProgressUpdate {
  type: 'progress'
  progress: number // 0-100
  portfolio: PortfolioResult
  currentSimulation: number
  totalSimulations: number
}

/**
 * Completion message with all results
 */
export interface CompletionMessage {
  type: 'complete'
  portfolios: PortfolioResult[]
  efficientFrontier: PortfolioResult[]
  totalSimulations: number
  duration: number // milliseconds
}

/**
 * Error message
 */
export interface ErrorMessage {
  type: 'error'
  error: string
  details?: string
}

export type WorkerResponse = ProgressUpdate | CompletionMessage | ErrorMessage

/**
 * Main worker event handler
 */
self.onmessage = (event: MessageEvent<OptimizationRequest>) => {
  const request = event.data

  if (request.type !== 'start') {
    const error: ErrorMessage = {
      type: 'error',
      error: 'Invalid message type',
      details: `Expected 'start', got '${request.type}'`,
    }
    self.postMessage(error)
    return
  }

  try {
    const startTime = performance.now()
    const numSimulations = request.numSimulations || 2000
    let currentSimulation = 0

    // Progress callback to send updates to main thread
    const progressCallback = (progress: number, portfolio: PortfolioResult) => {
      currentSimulation++

      const update: ProgressUpdate = {
        type: 'progress',
        progress,
        portfolio,
        currentSimulation,
        totalSimulations: numSimulations,
      }

      self.postMessage(update)
    }

    let portfolios: PortfolioResult[]

    if (request.mode === 'strategy') {
      // Strategy-level optimization
      if (!request.strategyReturns || request.strategyReturns.length < 2) {
        const error: ErrorMessage = {
          type: 'error',
          error: 'Insufficient strategies',
          details: 'At least 2 strategies are required for optimization',
        }
        self.postMessage(error)
        return
      }

      const constraints = request.constraints || DEFAULT_CONSTRAINTS
      const riskFreeRate = request.riskFreeRate || 2.0

      portfolios = runMonteCarloSimulation(
        request.strategyReturns,
        numSimulations,
        constraints,
        riskFreeRate,
        progressCallback,
        request.randomSeed
      )
    } else if (request.mode === 'block') {
      // Block-level optimization
      if (!request.blockReturns || request.blockReturns.length < 2) {
        const error: ErrorMessage = {
          type: 'error',
          error: 'Insufficient blocks',
          details: 'At least 2 blocks are required for optimization',
        }
        self.postMessage(error)
        return
      }

      const config = request.config || DEFAULT_BLOCK_CONFIG

      portfolios = runBlockMonteCarloSimulation(
        request.blockReturns,
        config,
        numSimulations,
        progressCallback,
        request.randomSeed
      )
    } else {
      const error: ErrorMessage = {
        type: 'error',
        error: 'Invalid mode',
        details: `Expected 'strategy' or 'block', got unknown mode`,
      }
      self.postMessage(error)
      return
    }

    // Identify efficient frontier
    const efficientFrontier = identifyEfficientFrontier(portfolios)

    const endTime = performance.now()
    const duration = endTime - startTime

    // Send completion message
    const completion: CompletionMessage = {
      type: 'complete',
      portfolios,
      efficientFrontier,
      totalSimulations: numSimulations,
      duration,
    }

    self.postMessage(completion)
  } catch (error) {
    const errorMessage: ErrorMessage = {
      type: 'error',
      error: 'Optimization failed',
      details: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(errorMessage)
  }
}
