/**
 * Unit tests for Monte Carlo time period conversion
 *
 * These tests verify that the Monte Carlo simulation correctly converts
 * months to number of trades when projecting forward returns.
 */

import { Trade } from "@/lib/models/trade";
import {
  runMonteCarloSimulation,
  type MonteCarloParams,
} from "@/lib/calculations/monte-carlo";

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

describe("Monte Carlo Time Period Conversion", () => {
  describe("Simulation length matches expected duration", () => {
    it("should simulate ~250 trades for 12 months (1 year)", () => {
      // Create a portfolio with positive expected return
      const trades = Array.from({ length: 100 }, (_, i) =>
        createMockTrade({
          pl: i % 2 === 0 ? 200 : -100, // Positive expectancy
          dateOpened: new Date(2024, 0, i + 1),
        })
      );

      // Simulate 12 months with 250 trades/year
      const tradesPerYear = 250;
      const months = 12;
      const tradesPerMonth = tradesPerYear / 12; // ~20.83
      const simulationLength = Math.round(months * tradesPerMonth); // 250 trades

      const params: MonteCarloParams = {
        numSimulations: 1000,
        simulationLength: simulationLength, // 250 trades for 12 months
        resampleMethod: "trades",
        initialCapital: 100000,
        tradesPerYear: tradesPerYear,
        randomSeed: 42,
      };

      const result = runMonteCarloSimulation(trades, params);

      // Verify simulation ran for 250 steps
      expect(result.simulations[0].equityCurve).toHaveLength(250);
      expect(result.percentiles.steps).toHaveLength(250);

      // Verify final value is consistent with annualized return
      // With positive expectancy, median should be > initial capital
      expect(result.statistics.medianFinalValue).toBeGreaterThan(params.initialCapital);

      // The annualized return should be reasonable (not near zero)
      // If we were simulating only 12 trades instead of 250, the return would be much smaller
      const totalReturn = (result.statistics.medianFinalValue - params.initialCapital) / params.initialCapital;
      expect(Math.abs(totalReturn)).toBeGreaterThan(0.01); // At least 1% return over a year
    });

    it("should simulate ~21 trades for 1 month", () => {
      const trades = Array.from({ length: 100 }, (_, i) =>
        createMockTrade({
          pl: i % 2 === 0 ? 200 : -100,
          dateOpened: new Date(2024, 0, i + 1),
        })
      );

      const tradesPerYear = 250;
      const months = 1;
      const tradesPerMonth = tradesPerYear / 12; // ~20.83
      const simulationLength = Math.round(months * tradesPerMonth); // 21 trades

      const params: MonteCarloParams = {
        numSimulations: 100,
        simulationLength: simulationLength, // 21 trades for 1 month
        resampleMethod: "trades",
        initialCapital: 100000,
        tradesPerYear: tradesPerYear,
        randomSeed: 42,
      };

      const result = runMonteCarloSimulation(trades, params);

      // Verify simulation ran for 21 steps
      expect(result.simulations[0].equityCurve).toHaveLength(21);
      expect(result.percentiles.steps).toHaveLength(21);
    });

    it("should simulate ~125 trades for 6 months", () => {
      const trades = Array.from({ length: 100 }, (_, i) =>
        createMockTrade({
          pl: i % 2 === 0 ? 200 : -100,
          dateOpened: new Date(2024, 0, i + 1),
        })
      );

      const tradesPerYear = 250;
      const months = 6;
      const tradesPerMonth = tradesPerYear / 12; // ~20.83
      const simulationLength = Math.round(months * tradesPerMonth); // 125 trades

      const params: MonteCarloParams = {
        numSimulations: 100,
        simulationLength: simulationLength, // 125 trades for 6 months
        resampleMethod: "trades",
        initialCapital: 100000,
        tradesPerYear: tradesPerYear,
        randomSeed: 42,
      };

      const result = runMonteCarloSimulation(trades, params);

      // Verify simulation ran for 125 steps
      expect(result.simulations[0].equityCurve).toHaveLength(125);
      expect(result.percentiles.steps).toHaveLength(125);
    });

    it("should project significantly different outcomes for 12 months vs 12 trades", () => {
      // This test verifies the bug fix: 12 months should NOT equal 12 trades
      const trades = Array.from({ length: 100 }, (_, i) =>
        createMockTrade({
          pl: 1000, // $1000 profit per trade
          dateOpened: new Date(2024, 0, i + 1),
        })
      );

      const initialCapital = 100000;
      const tradesPerYear = 250;

      // Simulate 12 TRADES (the old buggy behavior)
      const params12Trades: MonteCarloParams = {
        numSimulations: 1000,
        simulationLength: 12, // Only 12 trades
        resampleMethod: "trades",
        initialCapital: initialCapital,
        tradesPerYear: tradesPerYear,
        randomSeed: 42,
      };

      const result12Trades = runMonteCarloSimulation(trades, params12Trades);

      // Simulate 12 MONTHS = 250 trades (the correct behavior)
      const months = 12;
      const tradesPerMonth = tradesPerYear / 12;
      const simulationLength = Math.round(months * tradesPerMonth); // 250 trades

      const params12Months: MonteCarloParams = {
        numSimulations: 1000,
        simulationLength: simulationLength, // 250 trades
        resampleMethod: "trades",
        initialCapital: initialCapital,
        tradesPerYear: tradesPerYear,
        randomSeed: 42,
      };

      const result12Months = runMonteCarloSimulation(trades, params12Months);

      // The 12-month projection should have MUCH higher expected value than 12 trades
      const gain12Trades = result12Trades.statistics.medianFinalValue - initialCapital;
      const gain12Months = result12Months.statistics.medianFinalValue - initialCapital;

      // 12 months should gain roughly 250/12 ≈ 20x more than 12 trades
      expect(gain12Months).toBeGreaterThan(gain12Trades * 15); // At least 15x more

      // With $1000 per trade:
      // - 12 trades should gain ~$12,000
      // - 250 trades should gain ~$250,000
      expect(gain12Trades).toBeCloseTo(12000, -2); // Within $100
      expect(gain12Months).toBeCloseTo(250000, -3); // Within $1000
    });
  });

  describe("Annualized return calculation verification", () => {
    it("should correctly annualize returns for 12-month projection", () => {
      // Create trades with known return profile
      const trades = Array.from({ length: 100 }, (_, i) =>
        createMockTrade({
          pl: 100, // Constant $100 profit per trade
          dateOpened: new Date(2024, 0, i + 1),
        })
      );

      const tradesPerYear = 250;
      const months = 12;
      const tradesPerMonth = tradesPerYear / 12;
      const simulationLength = Math.round(months * tradesPerMonth); // 250 trades

      const initialCapital = 100000;

      const params: MonteCarloParams = {
        numSimulations: 1000,
        simulationLength: simulationLength,
        resampleMethod: "trades",
        initialCapital: initialCapital,
        tradesPerYear: tradesPerYear,
        randomSeed: 42,
      };

      const result = runMonteCarloSimulation(trades, params);

      // Expected gain: 250 trades × $100 = $25,000
      // Expected return: $25,000 / $100,000 = 25%
      const expectedGain = simulationLength * 100;
      const expectedFinalValue = initialCapital + expectedGain;
      const expectedReturn = expectedGain / initialCapital;

      // Verify the median final value is close to expected
      expect(result.statistics.medianFinalValue).toBeCloseTo(expectedFinalValue, -2);

      // Verify annualized return is reasonable
      // For a 12-month period, annualized return ≈ total return
      expect(result.statistics.medianAnnualizedReturn).toBeCloseTo(expectedReturn, 1);
    });
  });
});
