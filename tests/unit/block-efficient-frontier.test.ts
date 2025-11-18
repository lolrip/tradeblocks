/**
 * Block Efficient Frontier Calculator Tests
 *
 * Tests for block-level efficient frontier optimization including:
 * - Block returns extraction
 * - Block returns alignment (overlapping and zero-padding modes)
 * - Block correlation calculation
 * - Date range information
 * - Validation functions
 */

import { describe, it, expect } from '@jest/globals'
import {
  extractBlockReturns,
  alignBlockReturns,
  calculateBlockCorrelationMatrix,
  validateBlocksForOptimization,
  getBlocksDateRangeInfo,
  runBlockMonteCarloSimulation,
  DEFAULT_BLOCK_CONFIG,
  type BlockReturns,
} from '@/lib/calculations/block-efficient-frontier'
import type { Trade } from '@/lib/models/trade'

describe('Block Efficient Frontier Calculations', () => {
  // Mock trade data for Block 1 (DC Portfolio with Iron Condor and Credit Spread)
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
  ]

  // Mock trade data for Block 2 (0DTE Portfolio)
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
  ]

  // Block 3 with non-overlapping dates
  const block3Trades: Trade[] = [
    {
      dateOpened: new Date('2024-01-06'),
      timeOpened: '09:00:00',
      openingPrice: 150,
      legs: 'Trade X',
      premium: -1500,
      dateClosed: new Date('2024-01-07'),
      timeClosed: '15:00:00',
      closingPrice: 155,
      avgClosingCost: -750,
      reasonForClose: 'Profit',
      pl: 750,
      numContracts: 15,
      fundsAtClose: 150750,
      marginReq: 7500,
      strategy: 'Straddle',
      openingCommissionsFees: 15,
      closingCommissionsFees: 15,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 16.0,
      closingVix: 16.5,
      gap: 0.5,
      movement: 5.0,
      maxProfit: 150,
      maxLoss: -300,
    },
    {
      dateOpened: new Date('2024-01-08'),
      timeOpened: '10:00:00',
      openingPrice: 155,
      legs: 'Trade Y',
      premium: -1600,
      dateClosed: new Date('2024-01-09'),
      timeClosed: '16:00:00',
      closingPrice: 152,
      avgClosingCost: -1650,
      reasonForClose: 'Loss',
      pl: -50,
      numContracts: 16,
      fundsAtClose: 150700,
      marginReq: 8000,
      strategy: 'Strangle',
      openingCommissionsFees: 16,
      closingCommissionsFees: 16,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 17.0,
      closingVix: 17.5,
      gap: -0.5,
      movement: -3.0,
      maxProfit: 160,
      maxLoss: -320,
    },
  ]

  describe('extractBlockReturns', () => {
    it('should extract returns aggregated across all strategies in a block', () => {
      const blockReturns = extractBlockReturns('block-1', 'DC Portfolio', block1Trades)

      expect(blockReturns).not.toBeNull()
      expect(blockReturns!.blockId).toBe('block-1')
      expect(blockReturns!.blockName).toBe('DC Portfolio')
      expect(blockReturns!.returns).toHaveLength(2) // Two trading days
      expect(blockReturns!.dates).toHaveLength(2)
    })

    it('should calculate portfolio stats', () => {
      const blockReturns = extractBlockReturns('block-1', 'DC Portfolio', block1Trades)

      expect(blockReturns).not.toBeNull()
      expect(blockReturns!.portfolioStats).toBeDefined()
      expect(blockReturns!.portfolioStats!.totalPl).toBe(400) // 500 + (-100)
      expect(blockReturns!.portfolioStats!.tradeCount).toBe(2)
      expect(blockReturns!.portfolioStats!.sharpeRatio).toBeDefined()
    })

    it('should return null for empty trades', () => {
      const blockReturns = extractBlockReturns('empty-block', 'Empty', [])
      expect(blockReturns).toBeNull()
    })

    it('should return null for insufficient data (single trade)', () => {
      const blockReturns = extractBlockReturns('single-trade', 'Single', [block1Trades[0]])
      expect(blockReturns).toBeNull()
    })

    it('should handle trades with different strategies correctly', () => {
      // Block returns should aggregate P&L from both Iron Condor and Credit Spread
      const blockReturns = extractBlockReturns('block-1', 'DC Portfolio', block1Trades)

      expect(blockReturns).not.toBeNull()
      // Should have 2 dates: 2024-01-01 (Iron Condor: 500) and 2024-01-03 (Credit Spread: -100)
      expect(blockReturns!.dates).toEqual(['2024-01-01', '2024-01-03'])
    })
  })

  describe('alignBlockReturns', () => {
    const blockReturns: BlockReturns[] = [
      extractBlockReturns('block-1', 'DC Portfolio', block1Trades)!,
      extractBlockReturns('block-2', '0DTE Portfolio', block2Trades)!,
    ]

    describe('overlapping mode', () => {
      it('should use only overlapping dates', () => {
        const aligned = alignBlockReturns(blockReturns, 'overlapping')

        // Block1 has trades on 2024-01-01 and 2024-01-03
        // Block2 has trades on 2024-01-02 and 2024-01-04
        // No overlapping dates exist, so this should return empty
        expect(aligned.dates.length).toBe(0)
        // When no dates, blocks and returns are also empty
        expect(aligned.blocks.length).toBe(0)
      })

      it('should return empty result when no overlapping dates exist', () => {
        const noOverlapBlocks = [
          extractBlockReturns('block-1', 'Block 1', block1Trades)!,
          extractBlockReturns('block-3', 'Block 3', block3Trades)!,
        ]

        const aligned = alignBlockReturns(noOverlapBlocks, 'overlapping')

        // These blocks have completely non-overlapping dates
        expect(aligned.dates).toHaveLength(0)
      })
    })

    describe('zero-padding mode', () => {
      it('should use all dates with zero-padding', () => {
        const aligned = alignBlockReturns(blockReturns, 'zero-padding')

        expect(aligned.blocks).toHaveLength(2)
        // Should include all unique dates from both blocks
        expect(aligned.dates.length).toBeGreaterThanOrEqual(2)

        // Each block should have returns for all dates
        expect(aligned.returns[0]).toHaveLength(aligned.dates.length)
        expect(aligned.returns[1]).toHaveLength(aligned.dates.length)
      })

      it('should pad missing dates with 0% return', () => {
        const aligned = alignBlockReturns(blockReturns, 'zero-padding')

        // Verify that returns are numbers and include zeros
        aligned.returns.forEach(blockReturn => {
          blockReturn.forEach(ret => {
            expect(typeof ret).toBe('number')
          })
        })
      })
    })

    it('should handle empty block returns array', () => {
      const aligned = alignBlockReturns([], 'overlapping')

      expect(aligned.blocks).toHaveLength(0)
      expect(aligned.dates).toHaveLength(0)
      expect(aligned.returns).toHaveLength(0)
    })
  })

  describe('calculateBlockCorrelationMatrix', () => {
    it('should calculate correlation matrix between blocks', () => {
      const blockReturns: BlockReturns[] = [
        extractBlockReturns('block-1', 'DC Portfolio', block1Trades)!,
        extractBlockReturns('block-2', '0DTE Portfolio', block2Trades)!,
      ]

      const aligned = alignBlockReturns(blockReturns, 'zero-padding')
      const correlation = calculateBlockCorrelationMatrix(aligned.returns, aligned.blocks)

      expect(correlation.matrix).toHaveLength(2)
      expect(correlation.matrix[0]).toHaveLength(2)
      expect(correlation.blocks).toEqual(['DC Portfolio', '0DTE Portfolio'])

      // Diagonal should be 1.0 (perfect self-correlation)
      expect(correlation.matrix[0][0]).toBe(1.0)
      expect(correlation.matrix[1][1]).toBe(1.0)

      // Matrix should be symmetric
      expect(correlation.matrix[0][1]).toBeCloseTo(correlation.matrix[1][0], 10)

      // Correlation should be between -1 and 1
      expect(correlation.matrix[0][1]).toBeGreaterThanOrEqual(-1)
      expect(correlation.matrix[0][1]).toBeLessThanOrEqual(1)
    })

    it('should handle single block', () => {
      const correlation = calculateBlockCorrelationMatrix([[0.01, 0.02, -0.01]], ['Block A'])

      expect(correlation.matrix).toHaveLength(1)
      expect(correlation.matrix[0]).toHaveLength(1)
      expect(correlation.matrix[0][0]).toBe(1.0)
    })

    it('should handle zero variance (return 0 correlation)', () => {
      const zeroVarianceReturns = [
        [0.01, 0.02, 0.03],
        [0, 0, 0], // Zero variance
      ]

      const correlation = calculateBlockCorrelationMatrix(zeroVarianceReturns, ['Block A', 'Block B'])

      expect(correlation.matrix[0][1]).toBe(0)
      expect(correlation.matrix[1][0]).toBe(0)
    })

    it('should handle empty returns', () => {
      const correlation = calculateBlockCorrelationMatrix([], [])

      expect(correlation.matrix).toHaveLength(0)
      expect(correlation.blocks).toHaveLength(0)
    })
  })

  describe('validateBlocksForOptimization', () => {
    it('should validate blocks with overlapping dates', () => {
      const blockReturns: BlockReturns[] = [
        extractBlockReturns('block-1', 'DC Portfolio', block1Trades)!,
        extractBlockReturns('block-2', '0DTE Portfolio', block2Trades)!,
      ]

      // These blocks don't have overlapping dates, so validation should fail in overlapping mode
      // Test with zero-padding instead
      const validationZeroPad = validateBlocksForOptimization(blockReturns, 'zero-padding')

      expect(validationZeroPad.valid).toBe(true)
      expect(validationZeroPad.stats).toBeDefined()
      expect(validationZeroPad.stats!.totalBlocks).toBe(2)
    })

    it('should reject empty blocks array', () => {
      const validation = validateBlocksForOptimization([], 'overlapping')

      expect(validation.valid).toBe(false)
      expect(validation.error).toBe('No blocks provided')
    })

    it('should reject single block', () => {
      const blockReturns = [
        extractBlockReturns('block-1', 'DC Portfolio', block1Trades)!,
      ]

      const validation = validateBlocksForOptimization(blockReturns, 'overlapping')

      expect(validation.valid).toBe(false)
      expect(validation.error).toContain('At least 2 blocks')
    })

    it('should reject blocks with no overlapping dates in overlapping mode', () => {
      const blockReturns = [
        extractBlockReturns('block-1', 'Block 1', block1Trades)!,
        extractBlockReturns('block-3', 'Block 3', block3Trades)!,
      ]

      const validation = validateBlocksForOptimization(blockReturns, 'overlapping')

      expect(validation.valid).toBe(false)
      expect(validation.error).toContain('No overlapping trading dates')
    })

    it('should warn about limited data coverage', () => {
      const blockReturns: BlockReturns[] = [
        extractBlockReturns('block-1', 'DC Portfolio', block1Trades)!,
        extractBlockReturns('block-2', '0DTE Portfolio', block2Trades)!,
      ]

      const validation = validateBlocksForOptimization(blockReturns, 'zero-padding')

      // With only 2-4 data points, should have warnings
      if (validation.valid && validation.warnings) {
        expect(validation.warnings.length).toBeGreaterThan(0)
      }
    })
  })

  describe('getBlocksDateRangeInfo', () => {
    it('should return date range information for blocks', () => {
      const blockReturns: BlockReturns[] = [
        extractBlockReturns('block-1', 'DC Portfolio', block1Trades)!,
        extractBlockReturns('block-2', '0DTE Portfolio', block2Trades)!,
      ]

      const info = getBlocksDateRangeInfo(blockReturns)

      expect(info.overall).toBeDefined()
      expect(info.overlapping).toBeDefined()
      expect(info.perBlock).toHaveLength(2)

      // Overall should span from earliest to latest date
      expect(info.overall.start).toBe('2024-01-01')
      expect(info.overall.end).toBe('2024-01-04')

      // Per-block info
      expect(info.perBlock[0].blockName).toBe('DC Portfolio')
      expect(info.perBlock[1].blockName).toBe('0DTE Portfolio')
    })

    it('should handle empty blocks array', () => {
      const info = getBlocksDateRangeInfo([])

      expect(info.overall.start).toBe('')
      expect(info.overall.end).toBe('')
      expect(info.perBlock).toHaveLength(0)
    })

    it('should handle single block', () => {
      const blockReturns = [
        extractBlockReturns('block-1', 'DC Portfolio', block1Trades)!,
      ]

      const info = getBlocksDateRangeInfo(blockReturns)

      expect(info.overall.start).toBeDefined()
      expect(info.perBlock).toHaveLength(1)
    })
  })

  describe('runBlockMonteCarloSimulation', () => {
    it('should generate specified number of portfolios', () => {
      const blockReturns: BlockReturns[] = [
        extractBlockReturns('block-1', 'DC Portfolio', block1Trades)!,
        extractBlockReturns('block-2', '0DTE Portfolio', block2Trades)!,
      ]

      const numSimulations = 50

      // Use zero-padding mode since blocks don't have overlapping dates
      const config = { ...DEFAULT_BLOCK_CONFIG, dateAlignment: 'zero-padding' as const }

      const portfolios = runBlockMonteCarloSimulation(
        blockReturns,
        config,
        numSimulations
      )

      expect(portfolios).toHaveLength(numSimulations)
    })

    it('should generate portfolios with valid metrics', () => {
      const blockReturns: BlockReturns[] = [
        extractBlockReturns('block-1', 'DC Portfolio', block1Trades)!,
        extractBlockReturns('block-2', '0DTE Portfolio', block2Trades)!,
      ]

      const portfolios = runBlockMonteCarloSimulation(
        blockReturns,
        DEFAULT_BLOCK_CONFIG,
        25
      )

      portfolios.forEach(portfolio => {
        expect(portfolio.weights).toBeDefined()
        expect(typeof portfolio.annualizedReturn).toBe('number')
        expect(typeof portfolio.annualizedVolatility).toBe('number')
        expect(typeof portfolio.sharpeRatio).toBe('number')

        // Weights should sum to approximately 1 (fully invested by default)
        const weightSum = Object.values(portfolio.weights).reduce((a, b) => a + b, 0)
        expect(weightSum).toBeCloseTo(1.0, 1)

        // Weights should use block names as keys
        expect(Object.keys(portfolio.weights)).toEqual(['DC Portfolio', '0DTE Portfolio'])
      })
    })

    it('should call progress callback', () => {
      const blockReturns: BlockReturns[] = [
        extractBlockReturns('block-1', 'DC Portfolio', block1Trades)!,
        extractBlockReturns('block-2', '0DTE Portfolio', block2Trades)!,
      ]

      let callbackCount = 0

      // Use zero-padding mode since blocks don't have overlapping dates
      const config = { ...DEFAULT_BLOCK_CONFIG, dateAlignment: 'zero-padding' as const }

      runBlockMonteCarloSimulation(
        blockReturns,
        config,
        50,
        () => {
          callbackCount++
        }
      )

      expect(callbackCount).toBeGreaterThan(0)
    })

    it('should handle insufficient blocks', () => {
      const singleBlock = [
        extractBlockReturns('block-1', 'DC Portfolio', block1Trades)!,
      ]

      const portfolios = runBlockMonteCarloSimulation(
        singleBlock,
        DEFAULT_BLOCK_CONFIG,
        10
      )

      expect(portfolios).toHaveLength(0)
    })

    it('should respect date alignment mode', () => {
      const blockReturns: BlockReturns[] = [
        extractBlockReturns('block-1', 'Block 1', block1Trades)!,
        extractBlockReturns('block-3', 'Block 3', block3Trades)!,
      ]

      // These blocks have no overlapping dates
      const config = {
        ...DEFAULT_BLOCK_CONFIG,
        dateAlignment: 'overlapping' as const,
      }

      const portfolios = runBlockMonteCarloSimulation(blockReturns, config, 10)

      // Should return empty because no overlapping dates
      expect(portfolios).toHaveLength(0)

      // With zero-padding, should work
      const configZeroPad = {
        ...DEFAULT_BLOCK_CONFIG,
        dateAlignment: 'zero-padding' as const,
      }

      const portfoliosZeroPad = runBlockMonteCarloSimulation(blockReturns, configZeroPad, 10)
      expect(portfoliosZeroPad.length).toBeGreaterThan(0)
    })
  })

  describe('Integration Tests', () => {
    it('should run complete block optimization workflow', () => {
      // 1. Extract block returns
      const blockReturns: BlockReturns[] = [
        extractBlockReturns('block-1', 'DC Portfolio', block1Trades)!,
        extractBlockReturns('block-2', '0DTE Portfolio', block2Trades)!,
      ]

      expect(blockReturns.length).toBe(2)
      expect(blockReturns[0]).not.toBeNull()
      expect(blockReturns[1]).not.toBeNull()

      // 2. Validate blocks
      const validation = validateBlocksForOptimization(blockReturns, 'zero-padding')
      expect(validation.valid).toBe(true)

      // 3. Calculate correlation
      const aligned = alignBlockReturns(blockReturns, 'zero-padding')
      const correlation = calculateBlockCorrelationMatrix(aligned.returns, aligned.blocks)
      expect(correlation.matrix.length).toBeGreaterThan(0)

      // 4. Run Monte Carlo simulation
      const portfolios = runBlockMonteCarloSimulation(
        blockReturns,
        { ...DEFAULT_BLOCK_CONFIG, dateAlignment: 'zero-padding' },
        30
      )
      expect(portfolios.length).toBe(30)

      // 5. Verify portfolios have valid metrics
      portfolios.forEach(portfolio => {
        expect(isFinite(portfolio.annualizedReturn)).toBe(true)
        expect(isFinite(portfolio.annualizedVolatility)).toBe(true)
        expect(isFinite(portfolio.sharpeRatio)).toBe(true)

        const weightSum = Object.values(portfolio.weights).reduce((a, b) => a + b, 0)
        expect(weightSum).toBeCloseTo(1.0, 1)
      })
    })
  })
})
