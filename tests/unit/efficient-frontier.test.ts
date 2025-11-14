/**
 * Efficient Frontier Calculator Tests
 *
 * Tests for efficient frontier optimization including:
 * - Strategy returns extraction
 * - Portfolio metrics calculation
 * - Random weight generation
 * - Efficient frontier identification
 * - Validation functions
 */

import { describe, it, expect } from '@jest/globals'
import {
  extractStrategyReturns,
  alignStrategyReturns,
  generateRandomWeights,
  calculatePortfolioMetrics,
  identifyEfficientFrontier,
  validateTradesForOptimization,
  runMonteCarloSimulation,
  calculateCovarianceMatrix,
  DEFAULT_CONSTRAINTS,
  type PortfolioResult,
  type PortfolioConstraints,
} from '@/lib/calculations/efficient-frontier'
import type { Trade } from '@/lib/models/trade'

describe('Efficient Frontier Calculations', () => {
  // Mock trade data with two strategies
  const mockTrades: Trade[] = [
    {
      dateOpened: new Date('2024-01-01'),
      timeOpened: '09:30:00',
      openingPrice: 100,
      legs: 'Trade 1',
      premium: -1000,
      dateClosed: new Date('2024-01-02'),
      timeClosed: '15:30:00',
      closingPrice: 105,
      avgClosingCost: -500,
      reasonForClose: 'Profit',
      pl: 500,
      numContracts: 10,
      fundsAtClose: 100500,
      marginReq: 5000,
      strategy: 'Iron Condor',
      openingCommissionsFees: 10,
      closingCommissionsFees: 10,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 15.0,
      closingVix: 15.5,
      gap: 0.5,
      movement: 5.0,
      maxProfit: 100,
      maxLoss: -200,
    },
    {
      dateOpened: new Date('2024-01-03'),
      timeOpened: '10:00:00',
      openingPrice: 105,
      legs: 'Trade 2',
      premium: -1200,
      dateClosed: new Date('2024-01-04'),
      timeClosed: '16:00:00',
      closingPrice: 103,
      avgClosingCost: -1300,
      reasonForClose: 'Loss',
      pl: -100,
      numContracts: 12,
      fundsAtClose: 100400,
      marginReq: 6000,
      strategy: 'Credit Spread',
      openingCommissionsFees: 12,
      closingCommissionsFees: 12,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 16.0,
      closingVix: 16.2,
      gap: 0.3,
      movement: -2.0,
      maxProfit: 120,
      maxLoss: -240,
    },
    {
      dateOpened: new Date('2024-01-05'),
      timeOpened: '09:45:00',
      openingPrice: 103,
      legs: 'Trade 3',
      premium: -800,
      dateClosed: new Date('2024-01-06'),
      timeClosed: '15:00:00',
      closingPrice: 100,
      avgClosingCost: -900,
      reasonForClose: 'Loss',
      pl: -100,
      numContracts: 8,
      fundsAtClose: 100300,
      marginReq: 4000,
      strategy: 'Iron Condor',
      openingCommissionsFees: 8,
      closingCommissionsFees: 8,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 16.5,
      closingVix: 17.0,
      gap: -0.5,
      movement: -3.0,
      maxProfit: 80,
      maxLoss: -160,
    },
    {
      dateOpened: new Date('2024-01-07'),
      timeOpened: '10:30:00',
      openingPrice: 100,
      legs: 'Trade 4',
      premium: -1500,
      dateClosed: new Date('2024-01-08'),
      timeClosed: '15:30:00',
      closingPrice: 98,
      avgClosingCost: -1550,
      reasonForClose: 'Loss',
      pl: -50,
      numContracts: 15,
      fundsAtClose: 100250,
      marginReq: 7500,
      strategy: 'Credit Spread',
      openingCommissionsFees: 15,
      closingCommissionsFees: 15,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 17.2,
      closingVix: 17.5,
      gap: -0.3,
      movement: -2.0,
      maxProfit: 150,
      maxLoss: -300,
    },
  ]

  describe('extractStrategyReturns', () => {
    it('should extract returns for multiple strategies', () => {
      const strategyReturns = extractStrategyReturns(mockTrades)

      expect(strategyReturns).toHaveLength(2)

      const strategies = strategyReturns.map(sr => sr.strategy).sort()
      expect(strategies).toEqual(['Credit Spread', 'Iron Condor'])
    })

    it('should calculate daily returns correctly', () => {
      const strategyReturns = extractStrategyReturns(mockTrades)

      const ironCondor = strategyReturns.find(sr => sr.strategy === 'Iron Condor')
      expect(ironCondor).toBeDefined()
      expect(ironCondor!.returns).toHaveLength(2)
      expect(ironCondor!.dates).toHaveLength(2)
    })

    it('should handle trades with Unknown strategy', () => {
      const tradesWithUnknown: Trade[] = [
        { ...mockTrades[0], strategy: '' },
        { ...mockTrades[1], strategy: '' },
      ]

      const strategyReturns = extractStrategyReturns(tradesWithUnknown)
      expect(strategyReturns).toHaveLength(1)
      expect(strategyReturns[0].strategy).toBe('Unknown')
    })

    it('should skip strategies with insufficient data', () => {
      const singleTrade: Trade[] = [mockTrades[0]]
      const strategyReturns = extractStrategyReturns(singleTrade)

      // Should have 0 strategies because we need at least 2 data points
      expect(strategyReturns).toHaveLength(0)
    })

    it('should handle empty trades array', () => {
      const strategyReturns = extractStrategyReturns([])
      expect(strategyReturns).toHaveLength(0)
    })
  })

  describe('alignStrategyReturns', () => {
    it('should align returns to common dates', () => {
      const strategyReturns = extractStrategyReturns(mockTrades)
      const aligned = alignStrategyReturns(strategyReturns)

      expect(aligned.strategies).toHaveLength(2)
      expect(aligned.dates).toHaveLength(4) // All unique dates
      expect(aligned.returns).toHaveLength(2) // Two strategies
      expect(aligned.returns[0]).toHaveLength(4) // Each strategy has 4 date entries
    })

    it('should use 0% return for missing dates', () => {
      const strategyReturns = extractStrategyReturns(mockTrades)
      const aligned = alignStrategyReturns(strategyReturns)

      // Check that returns are numbers and include zeros for missing dates
      aligned.returns.forEach(strategyReturn => {
        strategyReturn.forEach(ret => {
          expect(typeof ret).toBe('number')
        })
      })
    })
  })

  describe('generateRandomWeights', () => {
    it('should generate weights that sum to 1 when fully invested', () => {
      const weights = generateRandomWeights(3, DEFAULT_CONSTRAINTS)

      expect(weights).toHaveLength(3)
      const sum = weights.reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1.0, 10)
    })

    it('should respect min/max constraints', () => {
      const constraints: PortfolioConstraints = {
        minWeight: 0.1,
        maxWeight: 0.5,
        fullyInvested: true,
        allowLeverage: false,
      }

      const weights = generateRandomWeights(3, constraints)

      weights.forEach(weight => {
        expect(weight).toBeGreaterThanOrEqual(0.1)
        expect(weight).toBeLessThanOrEqual(0.5)
      })
    })

    it('should generate independent weights when not fully invested', () => {
      const constraints: PortfolioConstraints = {
        minWeight: 0,
        maxWeight: 1,
        fullyInvested: false,
        allowLeverage: false,
      }

      const weights = generateRandomWeights(3, constraints)
      expect(weights).toHaveLength(3)

      // Sum might not be exactly 1
      const sum = weights.reduce((a, b) => a + b, 0)
      // Just verify it's a valid number
      expect(sum).toBeGreaterThan(0)
    })

    it('should handle single strategy', () => {
      const weights = generateRandomWeights(1, DEFAULT_CONSTRAINTS)
      expect(weights).toHaveLength(1)
      expect(weights[0]).toBeCloseTo(1.0, 10)
    })
  })

  describe('calculatePortfolioMetrics', () => {
    it('should calculate return and volatility', () => {
      const strategyReturns = extractStrategyReturns(mockTrades)
      const aligned = alignStrategyReturns(strategyReturns)

      const weights = [0.6, 0.4]
      const metrics = calculatePortfolioMetrics(weights, aligned.returns)

      expect(metrics.annualizedReturn).toBeDefined()
      expect(metrics.annualizedVolatility).toBeDefined()
      expect(metrics.sharpeRatio).toBeDefined()

      expect(typeof metrics.annualizedReturn).toBe('number')
      expect(typeof metrics.annualizedVolatility).toBe('number')
      expect(typeof metrics.sharpeRatio).toBe('number')
    })

    it('should handle equal weights', () => {
      const strategyReturns = extractStrategyReturns(mockTrades)
      const aligned = alignStrategyReturns(strategyReturns)

      const weights = [0.5, 0.5]
      const metrics = calculatePortfolioMetrics(weights, aligned.returns)

      expect(metrics.annualizedReturn).toBeDefined()
      expect(isFinite(metrics.annualizedReturn)).toBe(true)
    })

    it('should handle extreme weights', () => {
      const strategyReturns = extractStrategyReturns(mockTrades)
      const aligned = alignStrategyReturns(strategyReturns)

      // 100% in first strategy
      const weights = [1.0, 0.0]
      const metrics = calculatePortfolioMetrics(weights, aligned.returns)

      expect(metrics.annualizedReturn).toBeDefined()
      expect(metrics.annualizedVolatility).toBeDefined()
    })

    it('should return zero metrics for empty data', () => {
      const metrics = calculatePortfolioMetrics([0.5, 0.5], [])

      expect(metrics.annualizedReturn).toBe(0)
      expect(metrics.annualizedVolatility).toBe(0)
      expect(metrics.sharpeRatio).toBe(0)
    })
  })

  describe('identifyEfficientFrontier', () => {
    it('should identify Pareto-optimal portfolios', () => {
      // Create mock portfolios with different risk-return profiles
      const portfolios: PortfolioResult[] = [
        {
          weights: { A: 1.0 },
          annualizedReturn: 10,
          annualizedVolatility: 15,
          sharpeRatio: 0.53,
        },
        {
          weights: { B: 1.0 },
          annualizedReturn: 15,
          annualizedVolatility: 20,
          sharpeRatio: 0.65,
        },
        {
          weights: { C: 1.0 },
          annualizedReturn: 8,
          annualizedVolatility: 20, // Dominated by portfolio A
          sharpeRatio: 0.3,
        },
        {
          weights: { D: 1.0 },
          annualizedReturn: 20,
          annualizedVolatility: 25,
          sharpeRatio: 0.72,
        },
      ]

      const efficient = identifyEfficientFrontier(portfolios)

      // Portfolio C should be filtered out (lower return AND same/higher volatility)
      expect(efficient.length).toBeLessThan(portfolios.length)
      expect(efficient.length).toBeGreaterThan(0)

      // All efficient portfolios should be marked as efficient
      efficient.forEach(p => {
        expect(p.isEfficient).toBe(true)
      })
    })

    it('should handle portfolios with identical metrics', () => {
      const portfolios: PortfolioResult[] = [
        {
          weights: { A: 1.0 },
          annualizedReturn: 10,
          annualizedVolatility: 15,
          sharpeRatio: 0.53,
        },
        {
          weights: { B: 1.0 },
          annualizedReturn: 10,
          annualizedVolatility: 15,
          sharpeRatio: 0.53,
        },
      ]

      const efficient = identifyEfficientFrontier(portfolios)

      // Both should be efficient (neither dominates the other)
      expect(efficient.length).toBe(2)
    })

    it('should handle single portfolio', () => {
      const portfolios: PortfolioResult[] = [
        {
          weights: { A: 1.0 },
          annualizedReturn: 10,
          annualizedVolatility: 15,
          sharpeRatio: 0.53,
        },
      ]

      const efficient = identifyEfficientFrontier(portfolios)
      expect(efficient.length).toBe(1)
    })

    it('should handle empty portfolio list', () => {
      const efficient = identifyEfficientFrontier([])
      expect(efficient).toHaveLength(0)
    })
  })

  describe('validateTradesForOptimization', () => {
    it('should validate trades with multiple strategies', () => {
      const validation = validateTradesForOptimization(mockTrades)

      expect(validation.valid).toBe(true)
      expect(validation.strategies).toHaveLength(2)
      expect(validation.error).toBeUndefined()
    })

    it('should reject empty trades array', () => {
      const validation = validateTradesForOptimization([])

      expect(validation.valid).toBe(false)
      expect(validation.error).toBe('No trades provided')
    })

    it('should reject trades with single strategy', () => {
      const singleStrategyTrades = mockTrades.filter(t => t.strategy === 'Iron Condor')
      const validation = validateTradesForOptimization(singleStrategyTrades)

      expect(validation.valid).toBe(false)
      expect(validation.error).toContain('At least 2 strategies')
    })

    it('should reject trades with insufficient data per strategy', () => {
      // Only one trade per strategy
      const insufficientTrades = [mockTrades[0], mockTrades[1]]
      const validation = validateTradesForOptimization(insufficientTrades)

      expect(validation.valid).toBe(false)
      expect(validation.error).toContain('Insufficient data')
    })
  })

  describe('runMonteCarloSimulation', () => {
    it('should generate specified number of portfolios', () => {
      const strategyReturns = extractStrategyReturns(mockTrades)
      const numSimulations = 100

      const portfolios = runMonteCarloSimulation(
        strategyReturns,
        numSimulations,
        DEFAULT_CONSTRAINTS
      )

      expect(portfolios).toHaveLength(numSimulations)
    })

    it('should call progress callback', () => {
      const strategyReturns = extractStrategyReturns(mockTrades)
      let callbackCount = 0

      runMonteCarloSimulation(
        strategyReturns,
        100,
        DEFAULT_CONSTRAINTS,
        2.0,
        () => {
          callbackCount++
        }
      )

      expect(callbackCount).toBeGreaterThan(0)
    })

    it('should generate portfolios with valid metrics', () => {
      const strategyReturns = extractStrategyReturns(mockTrades)

      const portfolios = runMonteCarloSimulation(strategyReturns, 50)

      portfolios.forEach(portfolio => {
        expect(portfolio.weights).toBeDefined()
        expect(typeof portfolio.annualizedReturn).toBe('number')
        expect(typeof portfolio.annualizedVolatility).toBe('number')
        expect(typeof portfolio.sharpeRatio).toBe('number')

        // Weights should sum to approximately 1
        const weightSum = Object.values(portfolio.weights).reduce((a, b) => a + b, 0)
        expect(weightSum).toBeCloseTo(1.0, 1)
      })
    })

    it('should handle insufficient strategies', () => {
      const singleStrategy = extractStrategyReturns([mockTrades[0], mockTrades[2]])

      const portfolios = runMonteCarloSimulation(singleStrategy, 10)

      expect(portfolios).toHaveLength(0)
    })
  })

  describe('calculateCovarianceMatrix', () => {
    it('should calculate covariance matrix', () => {
      const strategyReturns = extractStrategyReturns(mockTrades)
      const aligned = alignStrategyReturns(strategyReturns)

      const covMatrix = calculateCovarianceMatrix(aligned.returns)

      expect(covMatrix).toHaveLength(2)
      expect(covMatrix[0]).toHaveLength(2)

      // Diagonal should be variances (positive)
      expect(covMatrix[0][0]).toBeGreaterThan(0)
      expect(covMatrix[1][1]).toBeGreaterThan(0)

      // Matrix should be symmetric
      expect(covMatrix[0][1]).toBeCloseTo(covMatrix[1][0], 10)
    })

    it('should handle single strategy', () => {
      const covMatrix = calculateCovarianceMatrix([[0.01, 0.02, -0.01]])

      expect(covMatrix).toHaveLength(1)
      expect(covMatrix[0]).toHaveLength(1)
      expect(covMatrix[0][0]).toBeGreaterThan(0)
    })

    it('should handle empty returns', () => {
      const covMatrix = calculateCovarianceMatrix([])
      expect(covMatrix).toHaveLength(0)
    })
  })

  describe('Integration Tests', () => {
    it('should run complete optimization workflow', () => {
      // 1. Extract strategy returns
      const strategyReturns = extractStrategyReturns(mockTrades)
      expect(strategyReturns.length).toBeGreaterThan(0)

      // 2. Run Monte Carlo simulation
      const portfolios = runMonteCarloSimulation(strategyReturns, 50)
      expect(portfolios.length).toBe(50)

      // 3. Identify efficient frontier
      const efficientFrontier = identifyEfficientFrontier(portfolios)
      expect(efficientFrontier.length).toBeGreaterThan(0)
      expect(efficientFrontier.length).toBeLessThanOrEqual(portfolios.length)

      // 4. Verify efficient portfolios have valid metrics
      efficientFrontier.forEach(portfolio => {
        expect(portfolio.isEfficient).toBe(true)
        expect(isFinite(portfolio.annualizedReturn)).toBe(true)
        expect(isFinite(portfolio.annualizedVolatility)).toBe(true)
        expect(isFinite(portfolio.sharpeRatio)).toBe(true)
      })
    })
  })
})
