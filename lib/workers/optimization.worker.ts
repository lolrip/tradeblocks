/**
 * Web Worker for Efficient Frontier Optimization
 *
 * Runs Monte Carlo simulation for portfolio optimization in a background thread
 * to prevent blocking the main UI thread during intensive calculations.
 *
 * Message Protocol:
 * - Input: OptimizationRequest with strategy returns and configuration
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

/**
 * Request message to start optimization
 */
export interface OptimizationRequest {
  type: 'start'
  strategyReturns: StrategyReturns[]
  numSimulations: number
  constraints?: PortfolioConstraints
  riskFreeRate?: number
}

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

    // Validate input
    if (!request.strategyReturns || request.strategyReturns.length < 2) {
      const error: ErrorMessage = {
        type: 'error',
        error: 'Insufficient strategies',
        details: 'At least 2 strategies are required for optimization',
      }
      self.postMessage(error)
      return
    }

    const numSimulations = request.numSimulations || 2000
    const constraints = request.constraints || DEFAULT_CONSTRAINTS
    const riskFreeRate = request.riskFreeRate || 2.0

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

    // Run the simulation
    const portfolios = runMonteCarloSimulation(
      request.strategyReturns,
      numSimulations,
      constraints,
      riskFreeRate,
      progressCallback
    )

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
