/**
 * Efficient Frontier Calculations
 *
 * Calculates optimal portfolio allocations across multiple trading strategies
 * using Modern Portfolio Theory (MPT). Performs Monte Carlo simulation to
 * generate random portfolio weight combinations and identifies the efficient
 * frontier (Pareto-optimal points).
 *
 * Uses math.js for statistical consistency with existing portfolio calculations.
 */

import { mean, std, variance } from 'mathjs'
import { Trade } from '../models/trade'
import { DEFAULT_ANALYSIS_CONFIG } from './portfolio-stats'

/**
 * Configuration for portfolio constraints
 */
export interface PortfolioConstraints {
  /** Minimum weight per strategy (0 = no short positions) */
  minWeight: number
  /** Maximum weight per strategy (1 = 100%) */
  maxWeight: number
  /** Whether weights must sum to exactly 1 (100%) */
  fullyInvested: boolean
  /** Whether to allow leverage (weights sum > 1) */
  allowLeverage: boolean
}

/**
 * Default constraints: long-only, fully invested, no leverage
 */
export const DEFAULT_CONSTRAINTS: PortfolioConstraints = {
  minWeight: 0,
  maxWeight: 1,
  fullyInvested: true,
  allowLeverage: false,
}

/**
 * Daily returns for a single strategy
 */
export interface StrategyReturns {
  strategy: string
  dates: string[] // ISO date strings
  returns: number[] // Daily returns as decimals
  trades: Trade[] // Original trades for reference
}

/**
 * Portfolio simulation result
 */
export interface PortfolioResult {
  /** Strategy weights (sums to 1 if fully invested) */
  weights: Record<string, number>
  /** Annualized return (percentage) */
  annualizedReturn: number
  /** Annualized volatility/standard deviation (percentage) */
  annualizedVolatility: number
  /** Sharpe ratio (assuming risk-free rate from config) */
  sharpeRatio: number
  /** Whether this point is on the efficient frontier */
  isEfficient?: boolean
}

/**
 * Extract daily returns for each strategy from trades
 * Groups trades by strategy and date, then calculates equity curve returns
 */
export function extractStrategyReturns(trades: Trade[]): StrategyReturns[] {
  // Group trades by strategy
  const tradesByStrategy = trades.reduce((acc, trade) => {
    const strategy = trade.strategy || 'Unknown'
    if (!acc[strategy]) {
      acc[strategy] = []
    }
    acc[strategy].push(trade)
    return acc
  }, {} as Record<string, Trade[]>)

  const strategyReturns: StrategyReturns[] = []

  for (const [strategy, strategyTrades] of Object.entries(tradesByStrategy)) {
    // Sort trades by date
    const sortedTrades = [...strategyTrades].sort((a, b) => {
      const dateCompare = new Date(a.dateOpened).getTime() - new Date(b.dateOpened).getTime()
      if (dateCompare !== 0) return dateCompare
      return a.timeOpened.localeCompare(b.timeOpened)
    })

    // Group P&L by date
    const dailyPl = new Map<string, number>()

    sortedTrades.forEach(trade => {
      try {
        const date = new Date(trade.dateOpened)
        if (!isNaN(date.getTime())) {
          const dateKey = date.toISOString().split('T')[0]
          const currentPl = dailyPl.get(dateKey) || 0
          dailyPl.set(dateKey, currentPl + trade.pl)
        }
      } catch {
        // Skip invalid dates
      }
    })

    // Calculate initial portfolio value for this strategy
    let portfolioValue = sortedTrades[0]?.fundsAtClose - sortedTrades[0]?.pl || 10000

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

    // Only include strategies with at least 2 data points
    if (returns.length >= 2) {
      strategyReturns.push({
        strategy,
        dates,
        returns,
        trades: strategyTrades,
      })
    }
  }

  return strategyReturns
}

/**
 * Align strategy returns to common dates
 * For dates where a strategy has no trades, use 0% return
 */
export function alignStrategyReturns(
  strategyReturns: StrategyReturns[]
): { strategies: string[]; dates: string[]; returns: number[][] } {
  // Get all unique dates
  const allDates = new Set<string>()
  strategyReturns.forEach(sr => sr.dates.forEach(d => allDates.add(d)))
  const sortedDates = Array.from(allDates).sort()

  // Create aligned return matrix
  const strategies = strategyReturns.map(sr => sr.strategy)
  const returns: number[][] = []

  for (const sr of strategyReturns) {
    const dateToReturn = new Map<string, number>()
    sr.dates.forEach((date, i) => dateToReturn.set(date, sr.returns[i]))

    const alignedReturns = sortedDates.map(date => dateToReturn.get(date) || 0)
    returns.push(alignedReturns)
  }

  return { strategies, dates: sortedDates, returns }
}

/**
 * Generate random portfolio weights that satisfy constraints
 * Uses iterative normalization to respect min/max bounds while summing to 1
 */
export function generateRandomWeights(
  numStrategies: number,
  constraints: PortfolioConstraints = DEFAULT_CONSTRAINTS
): number[] {
  if (constraints.fullyInvested) {
    // Generate random weights using Dirichlet distribution approximation
    const maxIterations = 100
    let iteration = 0

    while (iteration < maxIterations) {
      const gammaValues: number[] = []
      for (let i = 0; i < numStrategies; i++) {
        gammaValues.push(-Math.log(Math.random()))
      }
      const sum = gammaValues.reduce((a, b) => a + b, 0)

      // Normalize to sum to 1
      let weights = gammaValues.map(g => g / sum)

      // Iteratively adjust weights to satisfy constraints
      let needsAdjustment = true
      let adjustmentIterations = 0

      while (needsAdjustment && adjustmentIterations < 50) {
        needsAdjustment = false
        adjustmentIterations++

        // Find weights that violate constraints
        const violations: number[] = []
        const adjustableIndices: number[] = []
        let excessWeight = 0
        let deficitWeight = 0

        weights.forEach((w, i) => {
          if (w > constraints.maxWeight) {
            violations.push(i)
            excessWeight += w - constraints.maxWeight
            needsAdjustment = true
          } else if (w < constraints.minWeight) {
            violations.push(i)
            deficitWeight += constraints.minWeight - w
            needsAdjustment = true
          } else {
            adjustableIndices.push(i)
          }
        })

        if (!needsAdjustment) break

        // Apply constraint corrections
        weights = weights.map((w) => {
          if (w > constraints.maxWeight) return constraints.maxWeight
          if (w < constraints.minWeight) return constraints.minWeight
          return w
        })

        // Redistribute excess/deficit to adjustable weights
        if (adjustableIndices.length > 0) {
          const netAdjustment = excessWeight - deficitWeight
          const adjustmentPerWeight = netAdjustment / adjustableIndices.length

          weights = weights.map((w, i) => {
            if (adjustableIndices.includes(i)) {
              const adjusted = w + adjustmentPerWeight
              return Math.max(constraints.minWeight, Math.min(constraints.maxWeight, adjusted))
            }
            return w
          })
        }
      }

      // Final normalization
      const totalWeight = weights.reduce((a, b) => a + b, 0)
      weights = weights.map(w => w / totalWeight)

      // Check if all constraints are satisfied (with small tolerance)
      const allValid = weights.every(
        w => w >= constraints.minWeight - 0.001 && w <= constraints.maxWeight + 0.001
      )

      if (allValid) {
        return weights
      }

      iteration++
    }

    // Fallback: equal weights
    const equalWeight = 1.0 / numStrategies
    return new Array(numStrategies).fill(equalWeight)
  } else {
    // Generate independent random weights
    const weights: number[] = []
    for (let i = 0; i < numStrategies; i++) {
      const weight = Math.random() * (constraints.maxWeight - constraints.minWeight) + constraints.minWeight
      weights.push(weight)
    }
    return weights
  }
}

/**
 * Calculate portfolio return and volatility given weights and strategy returns
 * Returns annualized metrics
 */
export function calculatePortfolioMetrics(
  weights: number[],
  strategyReturns: number[][],
  riskFreeRate: number = DEFAULT_ANALYSIS_CONFIG.riskFreeRate,
  annualizationFactor: number = DEFAULT_ANALYSIS_CONFIG.annualizationFactor
): Omit<PortfolioResult, 'weights'> {
  const numDates = strategyReturns[0]?.length || 0
  const numStrategies = weights.length

  if (numDates === 0 || numStrategies === 0) {
    return {
      annualizedReturn: 0,
      annualizedVolatility: 0,
      sharpeRatio: 0,
    }
  }

  // Calculate portfolio daily returns
  const portfolioReturns: number[] = []
  for (let dateIdx = 0; dateIdx < numDates; dateIdx++) {
    let portfolioReturn = 0
    for (let stratIdx = 0; stratIdx < numStrategies; stratIdx++) {
      portfolioReturn += weights[stratIdx] * strategyReturns[stratIdx][dateIdx]
    }
    portfolioReturns.push(portfolioReturn)
  }

  // Calculate annualized return (geometric mean)
  const avgDailyReturn = mean(portfolioReturns) as number
  const annualizedReturn = avgDailyReturn * annualizationFactor * 100 // Convert to percentage

  // Calculate annualized volatility
  const dailyStd = std(portfolioReturns, 'uncorrected') as number // Sample std (N-1)
  const annualizedVolatility = dailyStd * Math.sqrt(annualizationFactor) * 100 // Convert to percentage

  // Calculate Sharpe ratio
  const dailyRiskFreeRate = riskFreeRate / 100 / annualizationFactor
  const excessReturn = avgDailyReturn - dailyRiskFreeRate
  const sharpeRatio = annualizedVolatility > 0 ? (excessReturn / dailyStd) * Math.sqrt(annualizationFactor) : 0

  return {
    annualizedReturn,
    annualizedVolatility,
    sharpeRatio,
  }
}

/**
 * Equity curve data point for portfolio simulation
 */
export interface EquityCurvePoint {
  date: string
  equity: number
  highWaterMark: number
  drawdownPct: number
}

/**
 * Simulate historical equity curve for a weighted portfolio
 * Combines strategy returns using given weights to create unified equity curve
 */
export function simulateWeightedPortfolioEquity(
  weights: number[],
  strategyReturns: number[][],
  dates: string[],
  startingCapital: number = 100000
): EquityCurvePoint[] {
  const numDates = dates.length
  const numStrategies = weights.length

  if (numDates === 0 || numStrategies === 0 || strategyReturns.length !== numStrategies) {
    return []
  }

  const equityCurve: EquityCurvePoint[] = []
  let portfolioValue = startingCapital
  let highWaterMark = startingCapital

  for (let dateIdx = 0; dateIdx < numDates; dateIdx++) {
    // Calculate weighted portfolio return for this date
    let portfolioReturn = 0
    for (let stratIdx = 0; stratIdx < numStrategies; stratIdx++) {
      portfolioReturn += weights[stratIdx] * strategyReturns[stratIdx][dateIdx]
    }

    // Update portfolio value
    portfolioValue *= 1 + portfolioReturn

    // Update high water mark
    if (portfolioValue > highWaterMark) {
      highWaterMark = portfolioValue
    }

    // Calculate drawdown percentage
    const drawdownPct = highWaterMark > 0 ? ((portfolioValue - highWaterMark) / highWaterMark) * 100 : 0

    equityCurve.push({
      date: dates[dateIdx],
      equity: portfolioValue,
      highWaterMark,
      drawdownPct,
    })
  }

  return equityCurve
}

/**
 * Identify points on the efficient frontier
 * Uses Pareto frontier approach: a point is efficient if no other point
 * has both higher return AND lower volatility
 */
export function identifyEfficientFrontier(portfolios: PortfolioResult[]): PortfolioResult[] {
  const efficientPortfolios: PortfolioResult[] = []

  for (const portfolio of portfolios) {
    let isEfficient = true

    // Check if any other portfolio dominates this one
    for (const other of portfolios) {
      if (other === portfolio) continue

      // Other portfolio dominates if it has:
      // - Higher or equal return AND lower volatility, OR
      // - Higher return AND equal or lower volatility
      const higherReturn = other.annualizedReturn > portfolio.annualizedReturn
      const equalReturn = Math.abs(other.annualizedReturn - portfolio.annualizedReturn) < 0.01
      const lowerVolatility = other.annualizedVolatility < portfolio.annualizedVolatility
      const equalVolatility = Math.abs(other.annualizedVolatility - portfolio.annualizedVolatility) < 0.01

      if (
        (higherReturn && (lowerVolatility || equalVolatility)) ||
        (equalReturn && lowerVolatility)
      ) {
        isEfficient = false
        break
      }
    }

    if (isEfficient) {
      efficientPortfolios.push({ ...portfolio, isEfficient: true })
    }
  }

  return efficientPortfolios
}

/**
 * Run Monte Carlo simulation to generate random portfolios
 * This is the main function that should be called from the web worker
 */
export function runMonteCarloSimulation(
  strategyReturns: StrategyReturns[],
  numSimulations: number = 2000,
  constraints: PortfolioConstraints = DEFAULT_CONSTRAINTS,
  riskFreeRate: number = DEFAULT_ANALYSIS_CONFIG.riskFreeRate,
  progressCallback?: (progress: number, portfolio: PortfolioResult) => void
): PortfolioResult[] {
  // Align returns to common dates
  const { strategies, returns } = alignStrategyReturns(strategyReturns)
  const numStrategies = strategies.length

  if (numStrategies < 2) {
    return []
  }

  const portfolios: PortfolioResult[] = []

  for (let i = 0; i < numSimulations; i++) {
    // Generate random weights
    const weightsArray = generateRandomWeights(numStrategies, constraints)

    // Convert to dictionary
    const weights: Record<string, number> = {}
    strategies.forEach((strategy, idx) => {
      weights[strategy] = weightsArray[idx]
    })

    // Calculate metrics
    const metrics = calculatePortfolioMetrics(weightsArray, returns, riskFreeRate)

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
 * Calculate covariance matrix between strategies
 * Useful for advanced portfolio optimization algorithms
 */
export function calculateCovarianceMatrix(strategyReturns: number[][]): number[][] {
  const numStrategies = strategyReturns.length
  const numDates = strategyReturns[0]?.length || 0

  if (numStrategies === 0 || numDates === 0) {
    return []
  }

  const covMatrix: number[][] = []

  for (let i = 0; i < numStrategies; i++) {
    const row: number[] = []
    for (let j = 0; j < numStrategies; j++) {
      if (i === j) {
        // Variance on diagonal
        row.push(variance(strategyReturns[i], 'uncorrected') as number)
      } else {
        // Covariance off diagonal
        const returns1 = strategyReturns[i]
        const returns2 = strategyReturns[j]
        const mean1 = mean(returns1) as number
        const mean2 = mean(returns2) as number

        let covariance = 0
        for (let k = 0; k < numDates; k++) {
          covariance += (returns1[k] - mean1) * (returns2[k] - mean2)
        }
        covariance /= numDates - 1 // Sample covariance (N-1)

        row.push(covariance)
      }
    }
    covMatrix.push(row)
  }

  return covMatrix
}

/**
 * Validate that trades have sufficient data for optimization
 */
export function validateTradesForOptimization(trades: Trade[]): {
  valid: boolean
  error?: string
  strategies?: string[]
} {
  if (trades.length === 0) {
    return { valid: false, error: 'No trades provided' }
  }

  // Extract strategies
  const strategies = Array.from(new Set(trades.map(t => t.strategy || 'Unknown')))

  if (strategies.length < 2) {
    return {
      valid: false,
      error: 'At least 2 strategies are required for portfolio optimization',
      strategies,
    }
  }

  // Check that each strategy has enough data
  const strategyReturns = extractStrategyReturns(trades)

  if (strategyReturns.length < 2) {
    return {
      valid: false,
      error: 'Insufficient data: Each strategy needs at least 2 trades with valid dates',
      strategies,
    }
  }

  return {
    valid: true,
    strategies,
  }
}
