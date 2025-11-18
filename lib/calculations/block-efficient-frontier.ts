/**
 * Block-Level Efficient Frontier Calculations
 *
 * Extends the strategy-level efficient frontier calculations to work with
 * entire trade blocks (portfolios). Allows optimization of allocation across
 * multiple trading portfolios/strategies rather than within a single block.
 *
 * Uses the same Monte Carlo and MPT algorithms as strategy-level optimization,
 * but treats each block as a single allocation unit.
 */

import { mean, std } from 'mathjs'
import { Trade } from '../models/trade'
import { DEFAULT_ANALYSIS_CONFIG } from './portfolio-stats'
import {
  PortfolioConstraints,
  PortfolioResult,
  EquityCurvePoint,
  DEFAULT_CONSTRAINTS,
  generateRandomWeights,
  calculatePortfolioMetrics,
  identifyEfficientFrontier,
  simulateWeightedPortfolioEquity,
} from './efficient-frontier'

/**
 * Daily returns for a single block (aggregated across all strategies)
 */
export interface BlockReturns {
  blockId: string
  blockName: string
  dates: string[] // ISO date strings
  returns: number[] // Daily returns as decimals
  trades: Trade[] // Original trades for reference
  portfolioStats?: {
    totalPl: number
    sharpeRatio: number
    winRate: number
    tradeCount: number
  }
}

/**
 * Date alignment strategy for blocks with non-overlapping periods
 */
export type DateAlignmentMode = 'overlapping' | 'zero-padding'

/**
 * Configuration for block-level optimization
 */
export interface BlockOptimizationConfig {
  /** Date alignment strategy */
  dateAlignment: DateAlignmentMode
  /** Risk-free rate for Sharpe calculation */
  riskFreeRate: number
  /** Annualization factor (252 for daily data) */
  annualizationFactor: number
  /** Portfolio constraints */
  constraints: PortfolioConstraints
}

/**
 * Default block optimization configuration
 */
export const DEFAULT_BLOCK_CONFIG: BlockOptimizationConfig = {
  dateAlignment: 'overlapping',
  riskFreeRate: DEFAULT_ANALYSIS_CONFIG.riskFreeRate,
  annualizationFactor: DEFAULT_ANALYSIS_CONFIG.annualizationFactor,
  constraints: DEFAULT_CONSTRAINTS,
}

/**
 * Helper function to safely extract numeric fundsAtClose value
 * Detects and handles data corruption (Date objects, timestamps, invalid numbers)
 */
function getNumericFundsAtClose(trade: Trade, context: string): number {
  const funds = trade.fundsAtClose as unknown

  // Handle Date objects (should never happen but IndexedDB can cause this)
  if (funds instanceof Date) {
    console.warn(`[${context}] Data corruption detected: fundsAtClose is a Date object for trade on ${trade.dateOpened}`)
    return NaN
  }

  // Handle timestamp numbers (likely corruption if > 1 billion)
  // Normal fundsAtClose should be portfolio value like $10,000 to $10,000,000
  if (typeof funds === 'number' && funds > 1_000_000_000) {
    console.warn(`[${context}] Suspicious fundsAtClose value (${funds}) - appears to be a timestamp. Trade date: ${trade.dateOpened}`)
    return NaN
  }

  // Normal case: valid finite number
  if (typeof funds === 'number' && isFinite(funds) && funds > 0) {
    return funds
  }

  // Invalid or missing
  return NaN
}

/**
 * Extract daily returns for an entire block (all strategies aggregated)
 *
 * This differs from extractStrategyReturns() in that it treats the entire
 * block as a single portfolio, summing all P&L across strategies for each day.
 */
export function extractBlockReturns(
  blockId: string,
  blockName: string,
  trades: Trade[]
): BlockReturns | null {
  if (trades.length === 0) {
    return null
  }

  // Early validation: detect corrupted trades
  const corruptedTrades = trades.filter(t => {
    const funds = getNumericFundsAtClose(t, `Block: ${blockName}`)
    return isNaN(funds)
  })

  if (corruptedTrades.length > 0) {
    console.error(`[Block: ${blockName}] Found ${corruptedTrades.length} trades with corrupted fundsAtClose values. Using fallback portfolio value.`)
  }

  // Sort trades by date
  const sortedTrades = [...trades].sort((a, b) => {
    const dateCompare = new Date(a.dateOpened).getTime() - new Date(b.dateOpened).getTime()
    if (dateCompare !== 0) return dateCompare
    return a.timeOpened.localeCompare(b.timeOpened)
  })

  // Group P&L by date (aggregate across ALL strategies)
  const dailyPl = new Map<string, number>()

  sortedTrades.forEach(trade => {
    try {
      const date = new Date(trade.dateOpened)
      if (!isNaN(date.getTime())) {
        const dateKey = date.toISOString().split('T')[0]
        const currentPl = dailyPl.get(dateKey) || 0
        // Sum P&L across all strategies for this date
        dailyPl.set(dateKey, currentPl + trade.pl)
      }
    } catch {
      // Skip invalid dates
    }
  })

  // Calculate initial portfolio value for this block
  const firstTradeFunds = getNumericFundsAtClose(sortedTrades[0], `Block: ${blockName}`)
  const firstTradePl = sortedTrades[0]?.pl || 0
  let portfolioValue = !isNaN(firstTradeFunds) && firstTradeFunds > firstTradePl
    ? firstTradeFunds - firstTradePl
    : 10000 // Fallback to $10,000 if data is corrupted or missing

  // Convert P&L to returns
  const dates: string[] = []
  const returns: number[] = []
  const sortedDates = Array.from(dailyPl.keys()).sort()

  for (const date of sortedDates) {
    const dayPl = dailyPl.get(date)!
    if (portfolioValue > 0) {
      const dailyReturn = dayPl / portfolioValue
      dates.push(date)
      returns.push(dailyReturn)
      portfolioValue += dayPl
    }
  }

  // Only include blocks with at least 2 data points
  if (returns.length < 2) {
    return null
  }

  // Calculate basic stats for display
  const totalPl = sortedTrades.reduce((sum, t) => sum + t.pl, 0)
  const winners = sortedTrades.filter(t => t.pl > 0).length
  const winRate = sortedTrades.length > 0 ? (winners / sortedTrades.length) * 100 : 0

  // Calculate Sharpe ratio
  const avgReturn = mean(returns) as number
  const stdDev = std(returns, 'uncorrected') as number
  const riskFreeDaily = DEFAULT_ANALYSIS_CONFIG.riskFreeRate / 100 / DEFAULT_ANALYSIS_CONFIG.annualizationFactor
  const sharpeRatio = stdDev > 0
    ? ((avgReturn - riskFreeDaily) / stdDev) * Math.sqrt(DEFAULT_ANALYSIS_CONFIG.annualizationFactor)
    : 0

  return {
    blockId,
    blockName,
    dates,
    returns,
    trades: sortedTrades,
    portfolioStats: {
      totalPl,
      sharpeRatio,
      winRate,
      tradeCount: sortedTrades.length,
    },
  }
}

/**
 * Align block returns to common dates
 *
 * Two modes:
 * - 'overlapping': Only use dates where all blocks have data (more accurate correlations)
 * - 'zero-padding': Use all dates, fill missing with 0% return (includes all data)
 */
export function alignBlockReturns(
  blockReturns: BlockReturns[],
  mode: DateAlignmentMode = 'overlapping'
): { blocks: string[]; dates: string[]; returns: number[][] } {
  if (blockReturns.length === 0) {
    return { blocks: [], dates: [], returns: [] }
  }

  if (mode === 'overlapping') {
    // Find dates that exist in ALL blocks
    const dateSets = blockReturns.map(br => new Set(br.dates))
    const firstSet = dateSets[0]
    const overlappingDates = Array.from(firstSet).filter(date =>
      dateSets.every(set => set.has(date))
    ).sort()

    if (overlappingDates.length === 0) {
      console.warn('No overlapping dates found between blocks. Consider using zero-padding mode.')
      return { blocks: [], dates: [], returns: [] }
    }

    // Extract returns for overlapping dates only
    const blocks = blockReturns.map(br => br.blockName)
    const returns: number[][] = []

    for (const br of blockReturns) {
      const dateToReturn = new Map<string, number>()
      br.dates.forEach((date, i) => dateToReturn.set(date, br.returns[i]))

      const alignedReturns = overlappingDates.map(date => dateToReturn.get(date) || 0)
      returns.push(alignedReturns)
    }

    return { blocks, dates: overlappingDates, returns }
  } else {
    // Zero-padding mode: use all dates from all blocks
    const allDates = new Set<string>()
    blockReturns.forEach(br => br.dates.forEach(d => allDates.add(d)))
    const sortedDates = Array.from(allDates).sort()

    const blocks = blockReturns.map(br => br.blockName)
    const returns: number[][] = []

    for (const br of blockReturns) {
      const dateToReturn = new Map<string, number>()
      br.dates.forEach((date, i) => dateToReturn.set(date, br.returns[i]))

      const alignedReturns = sortedDates.map(date => dateToReturn.get(date) || 0)
      returns.push(alignedReturns)
    }

    return { blocks, dates: sortedDates, returns }
  }
}

/**
 * Calculate correlation matrix between blocks
 * Uses Pearson correlation coefficient
 */
export function calculateBlockCorrelationMatrix(
  blockReturns: number[][],
  blockNames: string[]
): { matrix: number[][]; blocks: string[] } {
  const numBlocks = blockReturns.length
  const numDates = blockReturns[0]?.length || 0

  if (numBlocks === 0 || numDates === 0) {
    return { matrix: [], blocks: [] }
  }

  const matrix: number[][] = []

  for (let i = 0; i < numBlocks; i++) {
    const row: number[] = []
    for (let j = 0; j < numBlocks; j++) {
      if (i === j) {
        row.push(1.0) // Perfect correlation with self
      } else {
        // Calculate Pearson correlation
        const returns1 = blockReturns[i]
        const returns2 = blockReturns[j]
        const mean1 = mean(returns1) as number
        const mean2 = mean(returns2) as number
        const std1 = std(returns1, 'uncorrected') as number
        const std2 = std(returns2, 'uncorrected') as number

        if (std1 === 0 || std2 === 0) {
          row.push(0) // No correlation if either has zero variance
        } else {
          let correlation = 0
          for (let k = 0; k < numDates; k++) {
            correlation += (returns1[k] - mean1) * (returns2[k] - mean2)
          }
          correlation /= (numDates - 1) * std1 * std2
          row.push(correlation)
        }
      }
    }
    matrix.push(row)
  }

  return { matrix, blocks: blockNames }
}

/**
 * Run Monte Carlo simulation for block-level optimization
 * Reuses core algorithm from efficient-frontier.ts but with block data
 *
 * @param blockReturns - Returns data for each block
 * @param config - Block optimization configuration
 * @param numSimulations - Number of random portfolios to generate
 * @param progressCallback - Optional callback for progress updates
 * @param seed - Optional seed for reproducible results
 */
export function runBlockMonteCarloSimulation(
  blockReturns: BlockReturns[],
  config: BlockOptimizationConfig = DEFAULT_BLOCK_CONFIG,
  numSimulations: number = 2000,
  progressCallback?: (progress: number, portfolio: PortfolioResult) => void,
  seed?: number
): PortfolioResult[] {
  // Align returns to common dates
  const { blocks, returns } = alignBlockReturns(blockReturns, config.dateAlignment)
  const numBlocks = blocks.length

  if (numBlocks < 2) {
    console.warn('At least 2 blocks required for optimization')
    return []
  }

  if (returns[0].length < 2) {
    console.warn('Insufficient overlapping data between blocks')
    return []
  }

  const portfolios: PortfolioResult[] = []

  for (let i = 0; i < numSimulations; i++) {
    // Generate random weights with unique seed per simulation
    const simulationSeed = seed !== undefined ? seed + i : undefined
    const weightsArray = generateRandomWeights(numBlocks, config.constraints, simulationSeed)

    // Convert to dictionary (using block names)
    const weights: Record<string, number> = {}
    blocks.forEach((block, idx) => {
      weights[block] = weightsArray[idx]
    })

    // Calculate metrics
    const metrics = calculatePortfolioMetrics(
      weightsArray,
      returns,
      config.riskFreeRate,
      config.annualizationFactor
    )

    const portfolio: PortfolioResult = {
      weights,
      ...metrics,
    }

    portfolios.push(portfolio)

    // Report progress
    if (progressCallback && (i % 50 === 0 || i === numSimulations - 1)) {
      const progress = ((i + 1) / numSimulations) * 100
      progressCallback(progress, portfolio)
    }
  }

  return portfolios
}

/**
 * Validate that blocks have sufficient data for optimization
 */
export function validateBlocksForOptimization(
  blockReturns: BlockReturns[],
  mode: DateAlignmentMode = 'overlapping'
): {
  valid: boolean
  error?: string
  warnings?: string[]
  stats?: {
    totalBlocks: number
    overlappingDates: number
    dateRange: { start: string; end: string }
  }
} {
  const warnings: string[] = []

  if (blockReturns.length === 0) {
    return { valid: false, error: 'No blocks provided' }
  }

  if (blockReturns.length < 2) {
    return {
      valid: false,
      error: 'At least 2 blocks are required for portfolio optimization',
    }
  }

  // Check for overlapping dates
  const aligned = alignBlockReturns(blockReturns, mode)

  if (aligned.dates.length < 2) {
    return {
      valid: false,
      error: mode === 'overlapping'
        ? 'No overlapping trading dates found between blocks. Try zero-padding mode.'
        : 'Insufficient data for optimization',
    }
  }

  // Warn if limited overlap
  if (mode === 'overlapping' && aligned.dates.length < 30) {
    warnings.push(`Limited overlapping data: only ${aligned.dates.length} days`)
  }

  // Check for blocks with very different date ranges
  const allDates = blockReturns.flatMap(br => br.dates)
  const minDate = allDates.reduce((min, d) => d < min ? d : min, allDates[0])
  const maxDate = allDates.reduce((max, d) => d > max ? d : max, allDates[0])

  // Check each block's coverage
  blockReturns.forEach(br => {
    const coverage = br.dates.length / aligned.dates.length
    if (coverage < 0.5) {
      warnings.push(`${br.blockName} has limited data coverage (${(coverage * 100).toFixed(0)}%)`)
    }
  })

  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    stats: {
      totalBlocks: blockReturns.length,
      overlappingDates: aligned.dates.length,
      dateRange: { start: minDate, end: maxDate },
    },
  }
}

/**
 * Simulate historical equity curve for a weighted block portfolio
 * Wrapper around the generic simulation function
 */
export function simulateBlockPortfolioEquity(
  weights: Record<string, number>,
  blockReturns: BlockReturns[],
  config: BlockOptimizationConfig = DEFAULT_BLOCK_CONFIG,
  startingCapital: number = 100000
): EquityCurvePoint[] {
  const aligned = alignBlockReturns(blockReturns, config.dateAlignment)

  if (aligned.blocks.length === 0 || aligned.dates.length === 0) {
    return []
  }

  // Convert weights object to array matching aligned order
  const weightsArray = aligned.blocks.map(blockName => weights[blockName] || 0)

  return simulateWeightedPortfolioEquity(
    weightsArray,
    aligned.returns,
    aligned.dates,
    startingCapital
  )
}

/**
 * Get date range information for a set of blocks
 * Useful for UI display
 */
export function getBlocksDateRangeInfo(blockReturns: BlockReturns[]): {
  overall: { start: string; end: string; days: number }
  overlapping: { start: string; end: string; days: number }
  perBlock: Array<{ blockName: string; start: string; end: string; days: number }>
} {
  if (blockReturns.length === 0) {
    return {
      overall: { start: '', end: '', days: 0 },
      overlapping: { start: '', end: '', days: 0 },
      perBlock: [],
    }
  }

  // Overall date range (union of all dates)
  const allDates = blockReturns.flatMap(br => br.dates).sort()
  const overallStart = allDates[0]
  const overallEnd = allDates[allDates.length - 1]

  // Overlapping date range (intersection of all dates)
  const dateSets = blockReturns.map(br => new Set(br.dates))
  const firstSet = dateSets[0]
  const overlappingDates = Array.from(firstSet)
    .filter(date => dateSets.every(set => set.has(date)))
    .sort()

  const overlappingStart = overlappingDates[0] || ''
  const overlappingEnd = overlappingDates[overlappingDates.length - 1] || ''

  // Per-block date ranges
  const perBlock = blockReturns.map(br => ({
    blockName: br.blockName,
    start: br.dates[0],
    end: br.dates[br.dates.length - 1],
    days: br.dates.length,
  }))

  return {
    overall: {
      start: overallStart,
      end: overallEnd,
      days: allDates.length,
    },
    overlapping: {
      start: overlappingStart,
      end: overlappingEnd,
      days: overlappingDates.length,
    },
    perBlock,
  }
}

/**
 * Identify efficient frontier for block portfolios
 * Wrapper that reuses the generic implementation
 */
export function identifyBlockEfficientFrontier(portfolios: PortfolioResult[]): PortfolioResult[] {
  return identifyEfficientFrontier(portfolios)
}
