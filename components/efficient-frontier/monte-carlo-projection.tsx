"use client"

import React, { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { IconChartArea, IconReload } from "@tabler/icons-react"
import type { PortfolioResult, StrategyReturns } from "@/lib/calculations/efficient-frontier"
import type { Trade } from "@/lib/models/trade"
import type { MonteCarloResult, MonteCarloParams } from "@/lib/calculations/monte-carlo"
import { runMonteCarloSimulation } from "@/lib/calculations/monte-carlo"
import { ChartWrapper } from "@/components/performance-charts/chart-wrapper"

interface MonteCarloProjectionProps {
  selectedPortfolio: PortfolioResult
  strategyReturns: StrategyReturns[]
  alignedData: {
    strategies: string[]
    dates: string[]
    returns: number[][]
  }
  initialCapital: number
}

/**
 * Convert portfolio-weighted returns into synthetic trades for Monte Carlo simulation
 */
function createPortfolioTrades(
  weights: Record<string, number>,
  alignedData: {
    strategies: string[]
    dates: string[]
    returns: number[][]
  },
  initialCapital: number
): Trade[] {
  const { strategies, dates, returns } = alignedData
  const trades: Trade[] = []

  let currentCapital = initialCapital

  // For each date, create a synthetic "trade" representing the portfolio's daily return
  for (let dateIdx = 0; dateIdx < dates.length; dateIdx++) {
    // Calculate weighted portfolio return for this date
    let portfolioReturn = 0
    strategies.forEach((strategy, strategyIdx) => {
      const weight = weights[strategy] || 0
      const strategyReturn = returns[strategyIdx][dateIdx]
      portfolioReturn += weight * strategyReturn
    })

    // Calculate P&L based on portfolio return
    const pl = currentCapital * portfolioReturn
    currentCapital += pl

    // Create synthetic trade
    const date = new Date(dates[dateIdx])
    const trade: Trade = {
      dateOpened: date,
      timeOpened: "09:30:00",
      openingPrice: 100,
      legs: `Portfolio Day ${dateIdx + 1}`,
      premium: 0,
      dateClosed: new Date(date.getTime() + 24 * 60 * 60 * 1000), // Next day
      timeClosed: "16:00:00",
      closingPrice: 100,
      avgClosingCost: 0,
      reasonForClose: pl >= 0 ? "Profit" : "Loss",
      pl,
      numContracts: 1,
      fundsAtClose: currentCapital,
      marginReq: currentCapital * 0.1, // Assume 10% margin
      strategy: "Portfolio",
      openingCommissionsFees: 0,
      closingCommissionsFees: 0,
      openingShortLongRatio: 1.0,
      closingShortLongRatio: 1.0,
      openingVix: 15.0,
      closingVix: 15.0,
      gap: 0,
      movement: portfolioReturn * 100,
      maxProfit: Math.abs(pl),
      maxLoss: -Math.abs(pl),
    }

    trades.push(trade)
  }

  return trades
}

export function MonteCarloProjection({
  selectedPortfolio,
  alignedData,
  initialCapital,
}: MonteCarloProjectionProps) {
  // Configuration state
  const [timeHorizon, setTimeHorizon] = useState(100)
  const [numSimulations, setNumSimulations] = useState(1000)
  const [randomSeed, setRandomSeed] = useState<number | undefined>(12345)
  const [isRunning, setIsRunning] = useState(false)

  // Results state
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null)

  // User-adjustable weights (initialized from selected portfolio)
  const [weights, setWeights] = useState<Record<string, number>>(selectedPortfolio.weights)

  // Run Monte Carlo simulation
  const runProjection = () => {
    setIsRunning(true)

    try {
      // Create synthetic trades from portfolio weights
      const portfolioTrades = createPortfolioTrades(weights, alignedData, initialCapital)

      // Set up simulation parameters
      const params: MonteCarloParams = {
        numSimulations,
        simulationLength: timeHorizon,
        resampleMethod: "daily",
        initialCapital,
        tradesPerYear: 252, // Assume daily trading
        randomSeed,
      }

      // Run simulation
      const result = runMonteCarloSimulation(portfolioTrades, params)
      setMcResult(result)
    } catch (error) {
      console.error("Monte Carlo simulation failed:", error)
      alert(error instanceof Error ? error.message : "Simulation failed")
    } finally {
      setIsRunning(false)
    }
  }

  // Update weight for a strategy
  const updateWeight = (strategy: string, value: number) => {
    setWeights(prev => ({ ...prev, [strategy]: value / 100 }))
  }

  // Normalize weights to sum to 100%
  const normalizeWeights = () => {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0)
    if (sum > 0) {
      const normalized: Record<string, number> = {}
      Object.entries(weights).forEach(([strategy, weight]) => {
        normalized[strategy] = weight / sum
      })
      setWeights(normalized)
    }
  }

  // Reset weights to selected portfolio
  const resetWeights = () => {
    setWeights(selectedPortfolio.weights)
  }

  const strategies = Object.keys(weights)
  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconChartArea size={20} />
            Forward Projection Settings
          </CardTitle>
          <CardDescription>
            Configure Monte Carlo simulation parameters to project future portfolio performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Portfolio Weights */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">
                Portfolio Allocation (Total: {(weightSum * 100).toFixed(1)}%)
              </Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={normalizeWeights}>
                  Normalize
                </Button>
                <Button variant="ghost" size="sm" onClick={resetWeights}>
                  <IconReload size={14} className="mr-1" />
                  Reset
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {strategies.map(strategy => (
                <div key={strategy} className="space-y-2">
                  <Label>
                    {strategy}: {(weights[strategy] * 100).toFixed(1)}%
                  </Label>
                  <Slider
                    value={[weights[strategy] * 100]}
                    onValueChange={([value]) => updateWeight(strategy, value)}
                    min={0}
                    max={100}
                    step={1}
                    disabled={isRunning}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Simulation Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="time-horizon">Time Horizon (trades)</Label>
              <Input
                id="time-horizon"
                type="number"
                value={timeHorizon}
                onChange={(e) => setTimeHorizon(parseInt(e.target.value) || 100)}
                min={10}
                max={500}
                disabled={isRunning}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="num-sims">Number of Simulations</Label>
              <Input
                id="num-sims"
                type="number"
                value={numSimulations}
                onChange={(e) => setNumSimulations(parseInt(e.target.value) || 1000)}
                min={100}
                max={10000}
                step={100}
                disabled={isRunning}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mc-seed">Random Seed (optional)</Label>
              <Input
                id="mc-seed"
                type="number"
                value={randomSeed ?? ""}
                onChange={(e) => setRandomSeed(e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="Leave empty for random"
                disabled={isRunning}
              />
            </div>
          </div>

          {/* Run Button */}
          <Button
            onClick={runProjection}
            disabled={isRunning || weightSum === 0}
            className="w-full"
            size="lg"
          >
            {isRunning ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Running Simulation...
              </>
            ) : (
              <>
                <IconChartArea size={18} className="mr-2" />
                Run Forward Projection
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {mcResult && (
        <div className="space-y-6">
          {/* Statistics Card */}
          <Card>
            <CardHeader>
              <CardTitle>Projection Statistics</CardTitle>
              <CardDescription>
                Based on {mcResult.parameters.numSimulations} simulations over {mcResult.parameters.simulationLength} trades
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Median Final Value</div>
                  <div className="text-2xl font-bold">
                    ${mcResult.statistics.medianFinalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Mean Final Value</div>
                  <div className="text-2xl font-bold">
                    ${mcResult.statistics.meanFinalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Probability of Profit</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {mcResult.statistics.probabilityOfProfit.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Mean Max Drawdown</div>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {mcResult.statistics.meanMaxDrawdown.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Median Return</div>
                  <div className="text-2xl font-bold">
                    {mcResult.statistics.medianTotalReturn.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">VaR (5%)</div>
                  <div className="text-2xl font-bold">
                    ${mcResult.statistics.valueAtRisk.p5.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Mean Sharpe</div>
                  <div className="text-2xl font-bold">
                    {mcResult.statistics.meanSharpeRatio.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Std Dev</div>
                  <div className="text-2xl font-bold">
                    ${mcResult.statistics.stdFinalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fan Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Projected Equity Curves</CardTitle>
              <CardDescription>Percentile bands showing range of possible outcomes</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartWrapper
                title="Projected Equity Curves"
                data={[
                  {
                    x: mcResult.percentiles.steps,
                    y: mcResult.percentiles.p95,
                    type: 'scatter',
                    mode: 'lines',
                    name: '95th Percentile',
                    line: { color: '#22c55e', width: 2 },
                    fill: 'tonexty',
                    fillcolor: 'rgba(34, 197, 94, 0.1)',
                  },
                  {
                    x: mcResult.percentiles.steps,
                    y: mcResult.percentiles.p75,
                    type: 'scatter',
                    mode: 'lines',
                    name: '75th Percentile',
                    line: { color: '#3b82f6', width: 2 },
                    fill: 'tonexty',
                    fillcolor: 'rgba(59, 130, 246, 0.2)',
                  },
                  {
                    x: mcResult.percentiles.steps,
                    y: mcResult.percentiles.p50,
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Median (50th)',
                    line: { color: '#6366f1', width: 3 },
                  },
                  {
                    x: mcResult.percentiles.steps,
                    y: mcResult.percentiles.p25,
                    type: 'scatter',
                    mode: 'lines',
                    name: '25th Percentile',
                    line: { color: '#f59e0b', width: 2 },
                    fill: 'tonexty',
                    fillcolor: 'rgba(245, 158, 11, 0.2)',
                  },
                  {
                    x: mcResult.percentiles.steps,
                    y: mcResult.percentiles.p5,
                    type: 'scatter',
                    mode: 'lines',
                    name: '5th Percentile',
                    line: { color: '#ef4444', width: 2 },
                    fill: 'tonexty',
                    fillcolor: 'rgba(239, 68, 68, 0.1)',
                  },
                  // Initial capital line
                  {
                    x: [0, mcResult.percentiles.steps[mcResult.percentiles.steps.length - 1]],
                    y: [initialCapital, initialCapital],
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Initial Capital',
                    line: { color: '#94a3b8', width: 2, dash: 'dash' },
                  },
                ]}
                layout={{
                  xaxis: { title: { text: 'Trade Number' } },
                  yaxis: { title: { text: 'Portfolio Value ($)' } },
                  height: 400,
                  showlegend: true,
                  legend: { orientation: 'h', y: -0.2 },
                }}
                config={{ displayModeBar: true }}
              />
            </CardContent>
          </Card>

          {/* Distribution Histogram */}
          <Card>
            <CardHeader>
              <CardTitle>Final Value Distribution</CardTitle>
              <CardDescription>Distribution of ending portfolio values across all simulations</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartWrapper
                title="Final Value Distribution"
                data={[
                  {
                    x: mcResult.simulations.map(sim => sim.finalValue),
                    type: 'histogram',
                    name: 'Final Values',
                    marker: {
                      color: '#6366f1',
                      line: { color: '#4f46e5', width: 1 },
                    },
                    xbins: { size: (Math.max(...mcResult.simulations.map(s => s.finalValue)) - Math.min(...mcResult.simulations.map(s => s.finalValue))) / 50 },
                  } as Partial<Plotly.PlotData>,
                ]}
                layout={{
                  xaxis: { title: { text: 'Final Portfolio Value ($)' } },
                  yaxis: { title: { text: 'Frequency' } },
                  height: 400,
                  shapes: [
                    // Initial capital line
                    {
                      type: 'line',
                      x0: initialCapital,
                      x1: initialCapital,
                      y0: 0,
                      y1: 1,
                      yref: 'paper',
                      line: {
                        color: '#94a3b8',
                        width: 2,
                        dash: 'dash',
                      },
                    },
                    // Median line
                    {
                      type: 'line',
                      x0: mcResult.statistics.medianFinalValue,
                      x1: mcResult.statistics.medianFinalValue,
                      y0: 0,
                      y1: 1,
                      yref: 'paper',
                      line: {
                        color: '#6366f1',
                        width: 3,
                      },
                    },
                  ],
                  annotations: [
                    {
                      x: initialCapital,
                      y: 1.05,
                      yref: 'paper',
                      text: 'Initial',
                      showarrow: false,
                      font: { color: '#94a3b8' },
                    },
                    {
                      x: mcResult.statistics.medianFinalValue,
                      y: 1.05,
                      yref: 'paper',
                      text: 'Median',
                      showarrow: false,
                      font: { color: '#6366f1' },
                    },
                  ],
                }}
                config={{ displayModeBar: true }}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
