/**
 * Unit tests for margin filtering in hierarchical optimizer
 */

import { Trade } from "@/lib/models/trade";
import {
  calculateStrategyMarginRequirements,
  applyMinimumMarginFilter,
  type HierarchicalResult,
  type OptimizedBlock,
} from "@/lib/calculations/hierarchical-optimizer";

/**
 * Helper function to create mock trades
 */
function createMockTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    strategy: "Test Strategy",
    dateOpened: new Date("2024-01-01"),
    timeOpened: "09:30:00",
    dateClosed: new Date("2024-01-02"),
    timeClosed: "15:30:00",
    openingPrice: 100,
    closingPrice: 110,
    legs: "SPY 100C",
    premium: 500,
    pl: 1000,
    numContracts: 1,
    openingCommissionsFees: 5,
    closingCommissionsFees: 5,
    fundsAtClose: 101000,
    marginReq: 1000,
    openingShortLongRatio: 1.0,
    ...overrides,
  };
}

describe("calculateStrategyMarginRequirements", () => {
  it("should calculate average margin per strategy", () => {
    const trades = [
      createMockTrade({ strategy: "Strategy A", marginReq: 1000 }),
      createMockTrade({ strategy: "Strategy A", marginReq: 1200 }),
      createMockTrade({ strategy: "Strategy B", marginReq: 500 }),
    ];

    const margins = calculateStrategyMarginRequirements(trades);

    expect(margins["Strategy A"]).toBe(1100); // (1000 + 1200) / 2
    expect(margins["Strategy B"]).toBe(500);
  });

  it("should handle missing margin data", () => {
    const trades: Trade[] = [
      createMockTrade({ strategy: "Strategy A", marginReq: 1000 }),
      createMockTrade({ strategy: "Strategy B", marginReq: 0 }), // Zero margin
      { ...createMockTrade({ strategy: "Strategy B" }), marginReq: undefined } as Trade, // Explicitly undefined
    ];

    const margins = calculateStrategyMarginRequirements(trades);

    expect(margins["Strategy A"]).toBe(1000);
    expect(margins["Strategy B"]).toBeUndefined(); // No valid margin data
  });

  it("should handle empty trades array", () => {
    const margins = calculateStrategyMarginRequirements([]);
    expect(Object.keys(margins)).toHaveLength(0);
  });

  it("should ignore trades with zero or negative margin", () => {
    const trades = [
      createMockTrade({ strategy: "Strategy A", marginReq: 1000 }),
      createMockTrade({ strategy: "Strategy A", marginReq: 0 }),
      createMockTrade({ strategy: "Strategy A", marginReq: -100 }),
    ];

    const margins = calculateStrategyMarginRequirements(trades);

    expect(margins["Strategy A"]).toBe(1000); // Only counts the 1000
  });
});

describe("applyMinimumMarginFilter", () => {
  const mockBlock: OptimizedBlock = {
    blockId: "block1",
    blockName: "Block 1",
    strategyWeights: {
      "Strategy A": 1.0,
    },
    metrics: {
      annualizedReturn: 20,
      annualizedVolatility: 10,
      sharpeRatio: 2.0,
    },
    dates: ["2024-01-01"],
    returns: [0.01],
    trades: [
      createMockTrade({ strategy: "Strategy A", marginReq: 1000 }),
      createMockTrade({ strategy: "Strategy A", marginReq: 1200 }),
      createMockTrade({ strategy: "Strategy B", marginReq: 500 }),
    ],
  };

  const mockResult: HierarchicalResult = {
    optimizedBlocks: [mockBlock],
    blockWeights: {
      "Block 1": 1.0,
    },
    portfolioMetrics: {
      annualizedReturn: 20,
      annualizedVolatility: 10,
      sharpeRatio: 2.0,
    },
    blockPortfolios: [],
    blockEfficientFrontier: [],
    combinedAllocation: {
      "Block 1": {
        "Strategy A": 0.001, // 0.1% allocation
        "Strategy B": 0.999, // 99.9% allocation
      },
    },
  };

  it("should filter out strategies below minimum margin", () => {
    const totalCapital = 100000;
    // Strategy A gets $100 (0.001 * 100000) but needs $1100 average margin
    // Strategy B gets $99,900 (0.999 * 100000) and needs $500 margin - OK

    const filtered = applyMinimumMarginFilter(mockResult, totalCapital, [mockBlock]);

    expect(filtered).toBeDefined();
    expect(filtered!.filteredStrategies).toHaveLength(1);
    expect(filtered!.filteredStrategies[0].strategyName).toBe("Strategy A");
    expect(filtered!.filteredStrategies[0].allocatedCapital).toBe(100);
    expect(filtered!.filteredStrategies[0].requiredMargin).toBe(1100);
  });

  it("should redistribute filtered weight to remaining strategies", () => {
    const totalCapital = 100000;

    const filtered = applyMinimumMarginFilter(mockResult, totalCapital, [mockBlock]);

    expect(filtered).toBeDefined();
    // Strategy A had 0.001 weight, Strategy B had 0.999 weight
    // After filtering, Strategy B should get all weight
    const strategyBWeight = filtered!.combinedAllocation["Block 1"]["Strategy B"];
    expect(strategyBWeight).toBeCloseTo(1.0, 5); // Should be 100%
  });

  it("should return undefined when no strategies are filtered", () => {
    const allTradeableResult: HierarchicalResult = {
      ...mockResult,
      combinedAllocation: {
        "Block 1": {
          "Strategy A": 0.5, // $50,000 - well above $1100 margin
          "Strategy B": 0.5, // $50,000 - well above $500 margin
        },
      },
    };

    const filtered = applyMinimumMarginFilter(allTradeableResult, 100000, [mockBlock]);

    expect(filtered).toBeUndefined(); // No filtering needed
  });

  it("should handle strategies with no margin data (not filtered)", () => {
    const blockWithNoMargin: OptimizedBlock = {
      ...mockBlock,
      trades: [
        createMockTrade({ strategy: "Strategy C", marginReq: 0 }), // No margin data
      ],
    };

    const resultWithNoMargin: HierarchicalResult = {
      ...mockResult,
      optimizedBlocks: [blockWithNoMargin],
      combinedAllocation: {
        "Block 1": {
          "Strategy C": 0.001, // Low allocation but no margin data
        },
      },
    };

    const filtered = applyMinimumMarginFilter(resultWithNoMargin, 100000, [blockWithNoMargin]);

    // Should not filter Strategy C because no margin data exists
    expect(filtered).toBeUndefined();
  });

  it("should calculate correct total filtered weight", () => {
    const multiStrategyResult: HierarchicalResult = {
      ...mockResult,
      combinedAllocation: {
        "Block 1": {
          "Strategy A": 0.001, // Will be filtered (needs $1100)
          "Strategy B": 0.989, // OK
          "Strategy C": 0.01,  // Will be filtered if it has high margin req
        },
      },
    };

    const blockWithThreeStrategies: OptimizedBlock = {
      ...mockBlock,
      trades: [
        createMockTrade({ strategy: "Strategy A", marginReq: 1100 }),
        createMockTrade({ strategy: "Strategy B", marginReq: 500 }),
        createMockTrade({ strategy: "Strategy C", marginReq: 2000 }), // Needs $2000
      ],
    };

    const filtered = applyMinimumMarginFilter(multiStrategyResult, 100000, [blockWithThreeStrategies]);

    expect(filtered).toBeDefined();
    // Strategy A: $100 < $1100 → filtered
    // Strategy C: $1000 < $2000 → filtered
    expect(filtered!.filteredStrategies).toHaveLength(2);
    expect(filtered!.totalFilteredWeight).toBeCloseTo(0.011, 5); // 0.001 + 0.01
  });

  it("should recalculate portfolio metrics after filtering", () => {
    const totalCapital = 100000;

    const filtered = applyMinimumMarginFilter(mockResult, totalCapital, [mockBlock]);

    expect(filtered).toBeDefined();
    // Metrics should be recalculated based on remaining strategies
    expect(filtered!.portfolioMetrics.annualizedReturn).toBeDefined();
    expect(filtered!.portfolioMetrics.annualizedVolatility).toBeDefined();
    expect(filtered!.portfolioMetrics.sharpeRatio).toBeDefined();
    expect(filtered!.portfolioMetrics.sharpeRatio).toBeGreaterThanOrEqual(0);
  });
});
