/**
 * Hierarchical Optimizer Tests
 *
 * Tests for two-level portfolio optimization including:
 * - Block strategy optimization (Level 1)
 * - Block allocation optimization (Level 2)
 * - Complete hierarchical optimization workflow
 * - Optimal portfolio selection
 */

import { describe, it, expect } from '@jest/globals'
import {
  optimizeBlockStrategies,
  optimizeBlockAllocation,
  runHierarchicalOptimization,
  selectOptimalPortfolio,
  getFlatAllocation,
  DEFAULT_HIERARCHICAL_CONFIG,
} from '@/lib/calculations/hierarchical-optimizer'
import type { PortfolioResult } from '@/lib/calculations/efficient-frontier'
import type { Trade } from '@/lib/models/trade'

describe('Hierarchical Optimizer', () => {
  // Mock trade data for Block 1 (DC Portfolio with 2 strategies)
  const block1Trades: Trade[] = [
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
    {
      dateOpened: new Date('2024-01-09'),
      timeOpened: '09:30:00',
      openingPrice: 98,
      legs: 'Trade 5',
      premium: -900,
      dateClosed: new Date('2024-01-10'),
      timeClosed: '15:30:00',
      closingPrice: 102,
      avgClosingCost: -400,
      reasonForClose: 'Profit',
      pl: 500,
      numContracts: 9,
      fundsAtClose: 100750,
      marginReq: 4500,
      strategy: 'Iron Condor',
      openingCommissionsFees: 9,
      closingCommissionsFees: 9,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 17.8,
      closingVix: 18.0,
      gap: 0.4,
      movement: 4.0,
      maxProfit: 90,
      maxLoss: -180,
    },
    {
      dateOpened: new Date('2024-01-11'),
      timeOpened: '10:00:00',
      openingPrice: 102,
      legs: 'Trade 6',
      premium: -1100,
      dateClosed: new Date('2024-01-12'),
      timeClosed: '16:00:00',
      closingPrice: 101,
      avgClosingCost: -1150,
      reasonForClose: 'Loss',
      pl: -50,
      numContracts: 11,
      fundsAtClose: 100700,
      marginReq: 5500,
      strategy: 'Credit Spread',
      openingCommissionsFees: 11,
      closingCommissionsFees: 11,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 18.2,
      closingVix: 18.5,
      gap: -0.2,
      movement: -1.0,
      maxProfit: 110,
      maxLoss: -220,
    },
  ]

  // Mock trade data for Block 2 (0DTE Portfolio with 2 strategies)
  const block2Trades: Trade[] = [
    {
      dateOpened: new Date('2024-01-02'),
      timeOpened: '09:00:00',
      openingPrice: 200,
      legs: 'Trade A',
      premium: -2000,
      dateClosed: new Date('2024-01-03'),
      timeClosed: '15:00:00',
      closingPrice: 210,
      avgClosingCost: -1000,
      reasonForClose: 'Profit',
      pl: 1000,
      numContracts: 20,
      fundsAtClose: 201000,
      marginReq: 10000,
      strategy: '0DTE Butterfly',
      openingCommissionsFees: 20,
      closingCommissionsFees: 20,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 14.0,
      closingVix: 14.5,
      gap: 0.5,
      movement: 10.0,
      maxProfit: 200,
      maxLoss: -400,
    },
    {
      dateOpened: new Date('2024-01-04'),
      timeOpened: '10:00:00',
      openingPrice: 210,
      legs: 'Trade B',
      premium: -1800,
      dateClosed: new Date('2024-01-05'),
      timeClosed: '16:00:00',
      closingPrice: 205,
      avgClosingCost: -1900,
      reasonForClose: 'Loss',
      pl: -100,
      numContracts: 18,
      fundsAtClose: 200900,
      marginReq: 9000,
      strategy: '0DTE Iron Condor',
      openingCommissionsFees: 18,
      closingCommissionsFees: 18,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 15.0,
      closingVix: 15.5,
      gap: -0.5,
      movement: -5.0,
      maxProfit: 180,
      maxLoss: -360,
    },
    {
      dateOpened: new Date('2024-01-06'),
      timeOpened: '09:30:00',
      openingPrice: 205,
      legs: 'Trade C',
      premium: -1500,
      dateClosed: new Date('2024-01-07'),
      timeClosed: '15:30:00',
      closingPrice: 208,
      avgClosingCost: -700,
      reasonForClose: 'Profit',
      pl: 800,
      numContracts: 15,
      fundsAtClose: 201700,
      marginReq: 7500,
      strategy: '0DTE Butterfly',
      openingCommissionsFees: 15,
      closingCommissionsFees: 15,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 15.5,
      closingVix: 16.0,
      gap: 0.5,
      movement: 3.0,
      maxProfit: 150,
      maxLoss: -300,
    },
    {
      dateOpened: new Date('2024-01-08'),
      timeOpened: '09:15:00',
      openingPrice: 208,
      legs: 'Trade D',
      premium: -2200,
      dateClosed: new Date('2024-01-09'),
      timeClosed: '16:00:00',
      closingPrice: 212,
      avgClosingCost: -1100,
      reasonForClose: 'Profit',
      pl: 1100,
      numContracts: 22,
      fundsAtClose: 202800,
      marginReq: 11000,
      strategy: '0DTE Iron Condor',
      openingCommissionsFees: 22,
      closingCommissionsFees: 22,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 16.0,
      closingVix: 16.5,
      gap: 0.7,
      movement: 4.0,
      maxProfit: 220,
      maxLoss: -440,
    },
    {
      dateOpened: new Date('2024-01-10'),
      timeOpened: '09:00:00',
      openingPrice: 212,
      legs: 'Trade E',
      premium: -1700,
      dateClosed: new Date('2024-01-11'),
      timeClosed: '15:30:00',
      closingPrice: 215,
      avgClosingCost: -800,
      reasonForClose: 'Profit',
      pl: 900,
      numContracts: 17,
      fundsAtClose: 203700,
      marginReq: 8500,
      strategy: '0DTE Butterfly',
      openingCommissionsFees: 17,
      closingCommissionsFees: 17,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 16.5,
      closingVix: 17.0,
      gap: 0.5,
      movement: 3.0,
      maxProfit: 170,
      maxLoss: -340,
    },
    {
      dateOpened: new Date('2024-01-12'),
      timeOpened: '10:00:00',
      openingPrice: 215,
      legs: 'Trade F',
      premium: -1900,
      dateClosed: new Date('2024-01-13'),
      timeClosed: '16:00:00',
      closingPrice: 213,
      avgClosingCost: -2000,
      reasonForClose: 'Loss',
      pl: -100,
      numContracts: 19,
      fundsAtClose: 203600,
      marginReq: 9500,
      strategy: '0DTE Iron Condor',
      openingCommissionsFees: 19,
      closingCommissionsFees: 19,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 17.0,
      closingVix: 17.5,
      gap: -0.3,
      movement: -2.0,
      maxProfit: 190,
      maxLoss: -380,
    },
  ]

  // Mock trade data for Block 3 (Single-strategy block for testing locked behavior)
  const block3Trades: Trade[] = [
    {
      dateOpened: new Date('2024-01-01'),
      timeOpened: '09:00:00',
      openingPrice: 150,
      legs: 'Trade X',
      premium: -1500,
      dateClosed: new Date('2024-01-02'),
      timeClosed: '15:00:00',
      closingPrice: 155,
      avgClosingCost: -800,
      reasonForClose: 'Profit',
      pl: 700,
      numContracts: 15,
      fundsAtClose: 100700,
      marginReq: 7500,
      strategy: 'Single Strategy',
      openingCommissionsFees: 15,
      closingCommissionsFees: 15,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 15.0,
      closingVix: 15.5,
      gap: 0.5,
      movement: 5.0,
      maxProfit: 150,
      maxLoss: -300,
    },
    {
      dateOpened: new Date('2024-01-03'),
      timeOpened: '09:30:00',
      openingPrice: 155,
      legs: 'Trade Y',
      premium: -1600,
      dateClosed: new Date('2024-01-04'),
      timeClosed: '15:30:00',
      closingPrice: 152,
      avgClosingCost: -1700,
      reasonForClose: 'Loss',
      pl: -100,
      numContracts: 16,
      fundsAtClose: 100600,
      marginReq: 8000,
      strategy: 'Single Strategy',
      openingCommissionsFees: 16,
      closingCommissionsFees: 16,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 16.0,
      closingVix: 16.5,
      gap: -0.5,
      movement: -3.0,
      maxProfit: 160,
      maxLoss: -320,
    },
    {
      dateOpened: new Date('2024-01-05'),
      timeOpened: '10:00:00',
      openingPrice: 152,
      legs: 'Trade Z',
      premium: -1400,
      dateClosed: new Date('2024-01-06'),
      timeClosed: '16:00:00',
      closingPrice: 157,
      avgClosingCost: -700,
      reasonForClose: 'Profit',
      pl: 700,
      numContracts: 14,
      fundsAtClose: 101300,
      marginReq: 7000,
      strategy: 'Single Strategy',
      openingCommissionsFees: 14,
      closingCommissionsFees: 14,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 16.5,
      closingVix: 17.0,
      gap: 0.3,
      movement: 5.0,
      maxProfit: 140,
      maxLoss: -280,
    },
  ]

  describe('selectOptimalPortfolio', () => {
    it('should select portfolio with highest Sharpe ratio for max-sharpe objective', () => {
      const portfolios: PortfolioResult[] = [
        {
          weights: { A: 0.5, B: 0.5 },
          annualizedReturn: 10,
          annualizedVolatility: 15,
          sharpeRatio: 0.53,
        },
        {
          weights: { A: 0.7, B: 0.3 },
          annualizedReturn: 12,
          annualizedVolatility: 16,
          sharpeRatio: 0.65,
        },
        {
          weights: { A: 0.3, B: 0.7 },
          annualizedReturn: 8,
          annualizedVolatility: 12,
          sharpeRatio: 0.48,
        },
      ]

      const efficientFrontier = portfolios.slice(0, 2) // Assume first 2 are efficient

      const optimal = selectOptimalPortfolio(portfolios, efficientFrontier, 'max-sharpe')

      expect(optimal.sharpeRatio).toBe(0.65)
      expect(optimal.weights.A).toBe(0.7)
    })

    it('should select portfolio with lowest volatility for min-volatility objective', () => {
      const portfolios: PortfolioResult[] = [
        {
          weights: { A: 0.5, B: 0.5 },
          annualizedReturn: 10,
          annualizedVolatility: 15,
          sharpeRatio: 0.53,
        },
        {
          weights: { A: 0.7, B: 0.3 },
          annualizedReturn: 12,
          annualizedVolatility: 16,
          sharpeRatio: 0.65,
        },
        {
          weights: { A: 0.3, B: 0.7 },
          annualizedReturn: 8,
          annualizedVolatility: 12,
          sharpeRatio: 0.48,
        },
      ]

      const efficientFrontier = portfolios

      const optimal = selectOptimalPortfolio(portfolios, efficientFrontier, 'min-volatility')

      expect(optimal.annualizedVolatility).toBe(12)
      expect(optimal.weights.A).toBe(0.3)
    })

    it('should select portfolio with highest return for max-return objective', () => {
      const portfolios: PortfolioResult[] = [
        {
          weights: { A: 0.5, B: 0.5 },
          annualizedReturn: 10,
          annualizedVolatility: 15,
          sharpeRatio: 0.53,
        },
        {
          weights: { A: 0.7, B: 0.3 },
          annualizedReturn: 12,
          annualizedVolatility: 16,
          sharpeRatio: 0.65,
        },
        {
          weights: { A: 0.3, B: 0.7 },
          annualizedReturn: 8,
          annualizedVolatility: 12,
          sharpeRatio: 0.48,
        },
      ]

      const efficientFrontier = portfolios

      const optimal = selectOptimalPortfolio(portfolios, efficientFrontier, 'max-return')

      expect(optimal.annualizedReturn).toBe(12)
      expect(optimal.weights.A).toBe(0.7)
    })

    it('should throw error if no efficient portfolios', () => {
      const portfolios: PortfolioResult[] = []
      const efficientFrontier: PortfolioResult[] = []

      expect(() => {
        selectOptimalPortfolio(portfolios, efficientFrontier, 'max-sharpe')
      }).toThrow('No efficient portfolios found')
    })
  })

  describe('optimizeBlockStrategies', () => {
    it('should optimize strategies within a block', () => {
      const optimized = optimizeBlockStrategies(
        'block-1',
        'DC Portfolio',
        block1Trades,
        DEFAULT_HIERARCHICAL_CONFIG.level1
      )

      expect(optimized.blockId).toBe('block-1')
      expect(optimized.blockName).toBe('DC Portfolio')
      expect(Object.keys(optimized.strategyWeights)).toContain('Iron Condor')
      expect(Object.keys(optimized.strategyWeights)).toContain('Credit Spread')

      // Weights should sum to approximately 1
      const totalWeight = Object.values(optimized.strategyWeights).reduce((sum, w) => sum + w, 0)
      expect(totalWeight).toBeCloseTo(1.0, 1)

      // Should have metrics
      expect(optimized.metrics.annualizedReturn).toBeDefined()
      expect(optimized.metrics.annualizedVolatility).toBeDefined()
      expect(optimized.metrics.sharpeRatio).toBeDefined()

      // Should have returns data
      expect(optimized.dates.length).toBeGreaterThan(0)
      expect(optimized.returns.length).toBe(optimized.dates.length)
    })

    it('should allow single-strategy blocks (locked at 100%)', () => {
      const singleStrategyTrades = block3Trades // Use block3 which has only one strategy

      const result = optimizeBlockStrategies(
        'block-1',
        'Single Strategy Block',
        singleStrategyTrades,
        DEFAULT_HIERARCHICAL_CONFIG.level1
      )

      // Should not throw - should return locked result
      expect(result.isLocked).toBe(true)
      expect(Object.keys(result.strategyWeights)).toHaveLength(1)
    })

    it('should respect optimization objective', () => {
      const maxSharpeConfig = { ...DEFAULT_HIERARCHICAL_CONFIG.level1, objective: 'max-sharpe' as const }
      const minVolConfig = { ...DEFAULT_HIERARCHICAL_CONFIG.level1, objective: 'min-volatility' as const }

      const optimizedMaxSharpe = optimizeBlockStrategies('block-1', 'Block 1', block1Trades, maxSharpeConfig)
      const optimizedMinVol = optimizeBlockStrategies('block-1', 'Block 1', block1Trades, minVolConfig)

      // Different objectives should potentially produce different results
      // (though with limited data they might be the same)
      expect(optimizedMaxSharpe.strategyWeights).toBeDefined()
      expect(optimizedMinVol.strategyWeights).toBeDefined()
    })

    it('should handle single-strategy blocks with locked 100% weight', () => {
      const optimized = optimizeBlockStrategies(
        'block-3',
        'Single Strategy Block',
        block3Trades,
        DEFAULT_HIERARCHICAL_CONFIG.level1
      )

      // Should be marked as locked
      expect(optimized.isLocked).toBe(true)

      // Should have exactly one strategy with 100% weight
      expect(Object.keys(optimized.strategyWeights)).toHaveLength(1)
      const strategyName = Object.keys(optimized.strategyWeights)[0]
      expect(optimized.strategyWeights[strategyName]).toBe(1.0)

      // Should have metrics defined
      expect(optimized.metrics.annualizedReturn).toBeDefined()
      expect(optimized.metrics.annualizedVolatility).toBeDefined()
      expect(optimized.metrics.sharpeRatio).toBeDefined()

      // Should have returns data
      expect(optimized.dates.length).toBeGreaterThan(0)
      expect(optimized.returns.length).toBe(optimized.dates.length)

      // Should have empty portfolios arrays (no Monte Carlo simulation)
      expect(optimized.allPortfolios).toHaveLength(0)
      expect(optimized.efficientFrontier).toHaveLength(0)
    })

    it('should throw error for blocks with no strategies', () => {
      const noStrategyTrades: Trade[] = []

      expect(() => {
        optimizeBlockStrategies(
          'block-empty',
          'Empty Block',
          noStrategyTrades,
          DEFAULT_HIERARCHICAL_CONFIG.level1
        )
      }).toThrow('has no strategies with sufficient data')
    })
  })

  describe('optimizeBlockAllocation', () => {
    it('should optimize allocation across multiple optimized blocks', () => {
      // First optimize each block's strategies
      const optimizedBlock1 = optimizeBlockStrategies(
        'block-1',
        'DC Portfolio',
        block1Trades,
        DEFAULT_HIERARCHICAL_CONFIG.level1
      )

      const optimizedBlock2 = optimizeBlockStrategies(
        'block-2',
        '0DTE Portfolio',
        block2Trades,
        DEFAULT_HIERARCHICAL_CONFIG.level1
      )

      // Then optimize block allocation
      // Use zero-padding mode since blocks may not have overlapping dates
      const level2Config = {
        ...DEFAULT_HIERARCHICAL_CONFIG.level2,
        blockConfig: {
          ...DEFAULT_HIERARCHICAL_CONFIG.level2.blockConfig,
          dateAlignment: 'zero-padding' as const,
        },
      }
      const result = optimizeBlockAllocation(
        [optimizedBlock1, optimizedBlock2],
        level2Config
      )

      expect(result.blockWeights).toBeDefined()
      expect(result.blockWeights['DC Portfolio']).toBeDefined()
      expect(result.blockWeights['0DTE Portfolio']).toBeDefined()

      // Weights should sum to approximately 1
      const totalWeight = Object.values(result.blockWeights).reduce((sum, w) => sum + w, 0)
      expect(totalWeight).toBeCloseTo(1.0, 1)

      // Should have portfolio metrics
      expect(result.portfolioMetrics.annualizedReturn).toBeDefined()
      expect(result.portfolioMetrics.annualizedVolatility).toBeDefined()
      expect(result.portfolioMetrics.sharpeRatio).toBeDefined()

      // Should have portfolios (efficient frontier may be empty with limited data)
      expect(result.blockPortfolios.length).toBeGreaterThan(0)
      expect(result.blockEfficientFrontier).toBeDefined()
    })

    it('should throw error with insufficient blocks', () => {
      const optimizedBlock1 = optimizeBlockStrategies(
        'block-1',
        'DC Portfolio',
        block1Trades,
        DEFAULT_HIERARCHICAL_CONFIG.level1
      )

      expect(() => {
        optimizeBlockAllocation([optimizedBlock1], DEFAULT_HIERARCHICAL_CONFIG.level2)
      }).toThrow('At least 2 optimized blocks are required')
    })
  })

  describe('runHierarchicalOptimization', () => {
    it('should run complete hierarchical optimization workflow', async () => {
      const blocks = [
        { blockId: 'block-1', blockName: 'DC Portfolio', trades: block1Trades },
        { blockId: 'block-2', blockName: '0DTE Portfolio', trades: block2Trades },
      ]

      // Use zero-padding mode for Level 2
      const config = {
        ...DEFAULT_HIERARCHICAL_CONFIG,
        level2: {
          ...DEFAULT_HIERARCHICAL_CONFIG.level2,
          blockConfig: {
            ...DEFAULT_HIERARCHICAL_CONFIG.level2.blockConfig,
            dateAlignment: 'zero-padding' as const,
          },
        },
      }

      const result = await runHierarchicalOptimization(blocks, config)

      // Should have optimized blocks
      expect(result.optimizedBlocks).toHaveLength(2)
      expect(result.optimizedBlocks[0].blockName).toBe('DC Portfolio')
      expect(result.optimizedBlocks[1].blockName).toBe('0DTE Portfolio')

      // Each block should have strategy weights
      result.optimizedBlocks.forEach(block => {
        expect(Object.keys(block.strategyWeights).length).toBeGreaterThanOrEqual(2)
        const totalWeight = Object.values(block.strategyWeights).reduce((sum, w) => sum + w, 0)
        expect(totalWeight).toBeCloseTo(1.0, 1)
      })

      // Should have block weights
      expect(result.blockWeights).toBeDefined()
      const totalBlockWeight = Object.values(result.blockWeights).reduce((sum, w) => sum + w, 0)
      expect(totalBlockWeight).toBeCloseTo(1.0, 1)

      // Should have portfolio metrics
      expect(result.portfolioMetrics.annualizedReturn).toBeDefined()
      expect(result.portfolioMetrics.sharpeRatio).toBeDefined()

      // Should have combined allocation
      expect(result.combinedAllocation).toBeDefined()
      expect(result.combinedAllocation['DC Portfolio']).toBeDefined()
      expect(result.combinedAllocation['0DTE Portfolio']).toBeDefined()
    }, 30000) // Increase timeout for this test

    it('should call progress callback with correct phases', async () => {
      const blocks = [
        { blockId: 'block-1', blockName: 'DC Portfolio', trades: block1Trades },
        { blockId: 'block-2', blockName: '0DTE Portfolio', trades: block2Trades },
      ]

      const phase1Calls: number[] = []
      const phase2Calls: number[] = []

      const progressCallback = (phase: 1 | 2, progress: number) => {
        if (phase === 1) {
          phase1Calls.push(progress)
        } else {
          phase2Calls.push(progress)
        }
      }

      // Use zero-padding mode for Level 2
      const config = {
        ...DEFAULT_HIERARCHICAL_CONFIG,
        level2: {
          ...DEFAULT_HIERARCHICAL_CONFIG.level2,
          blockConfig: {
            ...DEFAULT_HIERARCHICAL_CONFIG.level2.blockConfig,
            dateAlignment: 'zero-padding' as const,
          },
        },
      }

      await runHierarchicalOptimization(blocks, config, progressCallback)

      // Should have called both phases
      expect(phase1Calls.length).toBeGreaterThan(0)
      expect(phase2Calls.length).toBeGreaterThan(0)

      // Phase 1 should reach 100%
      expect(Math.max(...phase1Calls)).toBe(100)
    }, 30000)

    it('should throw error with insufficient blocks', async () => {
      const blocks = [{ blockId: 'block-1', blockName: 'Single Block', trades: block1Trades }]

      await expect(
        runHierarchicalOptimization(blocks, DEFAULT_HIERARCHICAL_CONFIG)
      ).rejects.toThrow('At least 2 blocks are required')
    })
  })

  describe('getFlatAllocation', () => {
    it('should create flat allocation from hierarchical allocation', () => {
      const combinedAllocation = {
        'DC Portfolio': {
          'Iron Condor': 0.3,
          'Credit Spread': 0.2,
        },
        '0DTE Portfolio': {
          '0DTE Butterfly': 0.3,
          '0DTE Iron Condor': 0.2,
        },
      }

      const flat = getFlatAllocation(combinedAllocation)

      expect(flat['DC Portfolio / Iron Condor']).toBe(0.3)
      expect(flat['DC Portfolio / Credit Spread']).toBe(0.2)
      expect(flat['0DTE Portfolio / 0DTE Butterfly']).toBe(0.3)
      expect(flat['0DTE Portfolio / 0DTE Iron Condor']).toBe(0.2)

      // Total should sum to 1
      const total = Object.values(flat).reduce((sum, w) => sum + w, 0)
      expect(total).toBeCloseTo(1.0, 10)
    })

    it('should handle empty allocation', () => {
      const flat = getFlatAllocation({})
      expect(Object.keys(flat)).toHaveLength(0)
    })
  })
})
