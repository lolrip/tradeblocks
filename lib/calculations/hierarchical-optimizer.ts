/**
 * Hierarchical Portfolio Optimizer
 *
 * Implements two-level optimization:
 * 1. Level 1 (Within-Block): Optimize strategy weights within each selected block
 * 2. Level 2 (Across-Blocks): Optimize block weights using Level 1 optimized returns
 *
 * This approach is more powerful than simple block optimization because it considers
 * the optimal internal allocation of each block before determining the overall
 * portfolio allocation.
 */

import {
  runMonteCarloSimulation,
  identifyEfficientFrontier,
  extractStrategyReturns,
  alignStrategyReturns,
  type PortfolioConstraints,
  type PortfolioResult,
  DEFAULT_CONSTRAINTS,
} from './efficient-frontier'

import {
  runBlockMonteCarloSimulation,
  type BlockReturns,
  type BlockOptimizationConfig,
  DEFAULT_BLOCK_CONFIG,
} from './block-efficient-frontier'

import { Trade } from '../models/trade'
import { DEFAULT_ANALYSIS_CONFIG } from './portfolio-stats'

/**
 * Optimization objective for Level 1 (within-block strategy optimization)
 */
export type OptimizationObjective = 'max-sharpe' | 'min-volatility' | 'max-return'

/**
 * Configuration for Level 1 (strategy optimization within blocks)
 */
export interface Level1Config {
  /** Optimization objective */
  objective: OptimizationObjective
  /** Number of simulations per block */
  numSimulations: number
  /** Strategy constraints */
  constraints: PortfolioConstraints
  /** Risk-free rate */
  riskFreeRate: number
}

/**
 * Configuration for Level 2 (block allocation optimization)
 */
export interface Level2Config {
  /** Block-level configuration */
  blockConfig: BlockOptimizationConfig
  /** Number of simulations */
  numSimulations: number
}

/**
 * Complete hierarchical optimization configuration
 */
export interface HierarchicalConfig {
  level1: Level1Config
  level2: Level2Config
}

/**
 * Default hierarchical configuration
 */
export const DEFAULT_HIERARCHICAL_CONFIG: HierarchicalConfig = {
  level1: {
    objective: 'max-sharpe',
    numSimulations: 1000,
    constraints: DEFAULT_CONSTRAINTS,
    riskFreeRate: DEFAULT_ANALYSIS_CONFIG.riskFreeRate,
  },
  level2: {
    blockConfig: DEFAULT_BLOCK_CONFIG,
    numSimulations: 2000,
  },
}

/**
 * Result from Level 1 optimization for a single block
 */
export interface OptimizedBlock {
  blockId: string
  blockName: string
  /** Optimal strategy weights selected for this block */
  strategyWeights: Record<string, number>
  /** Performance metrics of the optimized block */
  metrics: {
    annualizedReturn: number
    annualizedVolatility: number
    sharpeRatio: number
  }
  /** Optimized daily returns series */
  dates: string[]
  returns: number[]
  /** Original trades */
  trades: Trade[]
  /** Whether this block has a single strategy and is locked at 100% */
  isLocked?: boolean
  /** All portfolios generated (for debugging/visualization) */
  allPortfolios?: PortfolioResult[]
  /** Efficient frontier */
  efficientFrontier?: PortfolioResult[]
}

/**
 * Complete hierarchical optimization result
 */
export interface HierarchicalResult {
  /** Level 1: Optimized blocks with strategy weights */
  optimizedBlocks: OptimizedBlock[]
  /** Level 2: Block weights in final portfolio */
  blockWeights: Record<string, number>
  /** Level 2: Final portfolio metrics */
  portfolioMetrics: {
    annualizedReturn: number
    annualizedVolatility: number
    sharpeRatio: number
  }
  /** Level 2: All block-level portfolios generated */
  blockPortfolios: PortfolioResult[]
  /** Level 2: Block-level efficient frontier */
  blockEfficientFrontier: PortfolioResult[]
  /** Combined allocation: strategy weights in overall portfolio */
  combinedAllocation: Record<string, Record<string, number>> // blockName -> { strategyName -> weight }
}

/**
 * Select optimal portfolio from efficient frontier based on objective
 */
export function selectOptimalPortfolio(
  portfolios: PortfolioResult[],
  efficientFrontier: PortfolioResult[],
  objective: OptimizationObjective
): PortfolioResult {
  if (efficientFrontier.length === 0) {
    throw new Error('No efficient portfolios found')
  }

  switch (objective) {
    case 'max-sharpe':
      // Select portfolio with highest Sharpe ratio
      return efficientFrontier.reduce((best, current) =>
        current.sharpeRatio > best.sharpeRatio ? current : best
      )

    case 'min-volatility':
      // Select portfolio with lowest volatility on efficient frontier
      return efficientFrontier.reduce((best, current) =>
        current.annualizedVolatility < best.annualizedVolatility ? current : best
      )

    case 'max-return':
      // Select portfolio with highest return on efficient frontier
      return efficientFrontier.reduce((best, current) =>
        current.annualizedReturn > best.annualizedReturn ? current : best
      )

    default:
      // Default to max Sharpe
      return efficientFrontier.reduce((best, current) =>
        current.sharpeRatio > best.sharpeRatio ? current : best
      )
  }
}

/**
 * Level 1: Optimize strategies within a single block
 */
export function optimizeBlockStrategies(
  blockId: string,
  blockName: string,
  trades: Trade[],
  config: Level1Config
): OptimizedBlock {
  // Extract strategy returns from trades
  const strategyReturns = extractStrategyReturns(trades)

  if (strategyReturns.length === 0) {
    throw new Error(`Block "${blockName}" has no strategies with sufficient data for optimization`)
  }

  // Handle single-strategy blocks - lock at 100%
  if (strategyReturns.length === 1) {
    const singleStrategy = strategyReturns[0]
    const strategyName = singleStrategy.strategy

    // Calculate metrics for the single strategy
    const aligned = alignStrategyReturns(strategyReturns)
    const returns = aligned.returns[0]

    // Calculate annualized metrics
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length
    const annualizedReturn = meanReturn * 252 * 100 // Assuming daily returns, annualize to percentage

    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1)
    const stdDev = Math.sqrt(variance)
    const annualizedVolatility = stdDev * Math.sqrt(252) * 100

    const sharpeRatio = annualizedVolatility > 0
      ? (annualizedReturn - config.riskFreeRate) / annualizedVolatility
      : 0

    return {
      blockId,
      blockName,
      strategyWeights: { [strategyName]: 1.0 },
      metrics: {
        annualizedReturn,
        annualizedVolatility,
        sharpeRatio,
      },
      dates: aligned.dates,
      returns,
      trades,
      isLocked: true,
      allPortfolios: [],
      efficientFrontier: [],
    }
  }

  // Normal multi-strategy optimization
  // Run Monte Carlo simulation to generate portfolios
  const portfolios = runMonteCarloSimulation(
    strategyReturns,
    config.numSimulations,
    config.constraints,
    config.riskFreeRate
  )

  if (portfolios.length === 0) {
    throw new Error(`No valid portfolios generated for block "${blockName}"`)
  }

  // Identify efficient frontier
  const efficientFrontier = identifyEfficientFrontier(portfolios)

  // Select optimal portfolio based on objective
  const optimalPortfolio = selectOptimalPortfolio(portfolios, efficientFrontier, config.objective)

  // Calculate optimized returns series
  const aligned = alignStrategyReturns(strategyReturns)
  const weightsArray = aligned.strategies.map(strategy => optimalPortfolio.weights[strategy] || 0)

  const optimizedReturns: number[] = []
  for (let dateIdx = 0; dateIdx < aligned.dates.length; dateIdx++) {
    let portfolioReturn = 0
    for (let stratIdx = 0; stratIdx < aligned.strategies.length; stratIdx++) {
      portfolioReturn += weightsArray[stratIdx] * aligned.returns[stratIdx][dateIdx]
    }
    optimizedReturns.push(portfolioReturn)
  }

  return {
    blockId,
    blockName,
    strategyWeights: optimalPortfolio.weights,
    metrics: {
      annualizedReturn: optimalPortfolio.annualizedReturn,
      annualizedVolatility: optimalPortfolio.annualizedVolatility,
      sharpeRatio: optimalPortfolio.sharpeRatio,
    },
    dates: aligned.dates,
    returns: optimizedReturns,
    trades,
    isLocked: false,
    allPortfolios: portfolios,
    efficientFrontier,
  }
}

/**
 * Level 2: Optimize block allocation using Level 1 optimized blocks
 */
export function optimizeBlockAllocation(
  optimizedBlocks: OptimizedBlock[],
  config: Level2Config
): {
  blockWeights: Record<string, number>
  portfolioMetrics: { annualizedReturn: number; annualizedVolatility: number; sharpeRatio: number }
  blockPortfolios: PortfolioResult[]
  blockEfficientFrontier: PortfolioResult[]
} {
  if (optimizedBlocks.length < 2) {
    throw new Error('At least 2 optimized blocks are required for Level 2 optimization')
  }

  // Convert optimized blocks to BlockReturns format
  const blockReturns: BlockReturns[] = optimizedBlocks.map(block => ({
    blockId: block.blockId,
    blockName: block.blockName,
    dates: block.dates,
    returns: block.returns,
    trades: block.trades,
    portfolioStats: {
      totalPl: block.trades.reduce((sum, t) => sum + t.pl, 0),
      sharpeRatio: block.metrics.sharpeRatio,
      winRate: block.trades.filter(t => t.pl > 0).length / block.trades.length * 100,
      tradeCount: block.trades.length,
    },
  }))

  // Run block-level Monte Carlo simulation
  const blockPortfolios = runBlockMonteCarloSimulation(
    blockReturns,
    config.blockConfig,
    config.numSimulations
  )

  if (blockPortfolios.length === 0) {
    throw new Error('No valid block portfolios generated')
  }

  // Identify efficient frontier
  const blockEfficientFrontier = identifyEfficientFrontier(blockPortfolios)

  // If efficient frontier is empty (can happen with limited data), use all portfolios
  const portfoliosToConsider = blockEfficientFrontier.length > 0 ? blockEfficientFrontier : blockPortfolios

  // Select optimal block allocation (max Sharpe for simplicity)
  const optimalBlockPortfolio = portfoliosToConsider.reduce((best, current) =>
    current.sharpeRatio > best.sharpeRatio ? current : best
  )

  return {
    blockWeights: optimalBlockPortfolio.weights,
    portfolioMetrics: {
      annualizedReturn: optimalBlockPortfolio.annualizedReturn,
      annualizedVolatility: optimalBlockPortfolio.annualizedVolatility,
      sharpeRatio: optimalBlockPortfolio.sharpeRatio,
    },
    blockPortfolios,
    blockEfficientFrontier,
  }
}

/**
 * Run complete hierarchical optimization
 * This is the main function that orchestrates both levels
 */
export async function runHierarchicalOptimization(
  blocks: Array<{ blockId: string; blockName: string; trades: Trade[] }>,
  config: HierarchicalConfig = DEFAULT_HIERARCHICAL_CONFIG,
  progressCallback?: (phase: 1 | 2, progress: number, message: string) => void
): Promise<HierarchicalResult> {
  if (blocks.length < 2) {
    throw new Error('At least 2 blocks are required for hierarchical optimization')
  }

  // Phase 1: Optimize strategies within each block
  const optimizedBlocks: OptimizedBlock[] = []

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const phaseProgress = ((i + 1) / blocks.length) * 100

    if (progressCallback) {
      progressCallback(1, phaseProgress, `Optimizing ${block.blockName} (${i + 1}/${blocks.length})`)
    }

    try {
      const optimizedBlock = optimizeBlockStrategies(
        block.blockId,
        block.blockName,
        block.trades,
        config.level1
      )
      optimizedBlocks.push(optimizedBlock)
    } catch (error) {
      console.error(`Failed to optimize block "${block.blockName}":`, error)
      throw error
    }
  }

  // Phase 2: Optimize block allocation
  if (progressCallback) {
    progressCallback(2, 0, 'Optimizing block allocation...')
  }

  const level2Result = optimizeBlockAllocation(optimizedBlocks, config.level2)

  if (progressCallback) {
    progressCallback(2, 100, 'Optimization complete')
  }

  // Calculate combined allocation (strategy weights in overall portfolio)
  const combinedAllocation: Record<string, Record<string, number>> = {}

  for (const block of optimizedBlocks) {
    const blockWeight = level2Result.blockWeights[block.blockName] || 0
    combinedAllocation[block.blockName] = {}

    for (const [strategy, strategyWeight] of Object.entries(block.strategyWeights)) {
      // Combined weight = block weight × strategy weight within block
      combinedAllocation[block.blockName][strategy] = blockWeight * strategyWeight
    }
  }

  return {
    optimizedBlocks,
    blockWeights: level2Result.blockWeights,
    portfolioMetrics: level2Result.portfolioMetrics,
    blockPortfolios: level2Result.blockPortfolios,
    blockEfficientFrontier: level2Result.blockEfficientFrontier,
    combinedAllocation,
  }
}

/**
 * Calculate total weight for a strategy across all blocks
 * Useful for creating a flat view of the final allocation
 */
export function getFlatAllocation(combinedAllocation: Record<string, Record<string, number>>): Record<string, number> {
  const flatAllocation: Record<string, number> = {}

  for (const [blockName, strategies] of Object.entries(combinedAllocation)) {
    for (const [strategy, weight] of Object.entries(strategies)) {
      const key = `${blockName} / ${strategy}`
      flatAllocation[key] = weight
    }
  }

  return flatAllocation
}
