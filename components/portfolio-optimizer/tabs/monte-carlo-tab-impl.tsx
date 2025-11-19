/**
 * Monte Carlo Tab - Forward projections using optimized weights
 */

"use client"

import React, { useEffect, useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { IconChartArea, IconRefresh } from "@tabler/icons-react"
import type { HierarchicalResult } from "@/lib/calculations/hierarchical-optimizer"
import { getTradesByBlock } from "@/lib/db/trades-store"
import type { Trade } from "@/lib/models/trade"
import {
  runMonteCarloSimulation,
  type MonteCarloResult,
} from "@/lib/calculations/monte-carlo"
import { ChartWrapper, createLineChartLayout } from "@/components/performance-charts/chart-wrapper"
import type { Layout } from "plotly.js"

interface MonteCarloTabProps {
  result: HierarchicalResult | null
  totalCapital: number
}

export function MonteCarloTabImpl({ result, totalCapital }: MonteCarloTabProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null)

  const [simLength, setSimLength] = useState(12) // months
  const [numSims, setNumSims] = useState(1000)

  useEffect(() => {
    if (!result) {
      setMcResult(null)
      return
    }

    async function runProjections() {
      if (!result) return

      setLoading(true)
      setError(null)

      try {
        // Load all trades and organize by block
        const blockTrades: Array<{ blockName: string; trades: Trade[]; weight: number }> = []

        for (const block of result.optimizedBlocks) {
          const trades = await getTradesByBlock(block.blockId)
          const blockWeight = result.blockWeights[block.blockName] || 0

          // Apply strategy weights within the block
          const weightedTrades: Trade[] = []
          for (const trade of trades) {
            const strategy = trade.strategy || 'Unknown'
            const strategyWeight = block.strategyWeights[strategy] || 0
            const combinedWeight = blockWeight * strategyWeight

            if (combinedWeight > 0) {
              // Create weighted copies of trades
              weightedTrades.push({
                ...trade,
                pl: trade.pl * combinedWeight,
                // Scale commissions proportionally
                openingCommissionsFees: (trade.openingCommissionsFees || 0) * combinedWeight,
                closingCommissionsFees: (trade.closingCommissionsFees || 0) * combinedWeight,
              })
            }
          }

          if (weightedTrades.length > 0) {
            blockTrades.push({
              blockName: block.blockName,
              trades: weightedTrades,
              weight: blockWeight,
            })
          }
        }

        if (blockTrades.length === 0 || blockTrades.every(b => b.trades.length === 0)) {
          setError("No trades available for Monte Carlo simulation")
          setLoading(false)
          return
        }

        // Combine all weighted trades
        const allTrades = blockTrades.flatMap(b => b.trades)

        // Run Monte Carlo simulation
        const simulationResult = runMonteCarloSimulation(allTrades, {
          numSimulations: numSims,
          simulationLength: simLength,
          initialCapital: totalCapital,
          resampleMethod: 'trades', // Resample individual trades
          tradesPerYear: 250, // Assume ~250 trading days per year
          randomSeed: 42,
        })

        setMcResult(simulationResult)
        setLoading(false)
      } catch (err) {
        console.error("Monte Carlo simulation error:", err)
        setError("Failed to run Monte Carlo simulation")
        setLoading(false)
      }
    }

    runProjections()
  }, [result, totalCapital, simLength, numSims])

  // Memoize fan chart data
  const fanChartData = useMemo(() => {
    if (!mcResult) return null

    const { percentiles } = mcResult
    const dates = Array.from({ length: simLength + 1 }, (_, i) => `Month ${i}`)

    return [
      // P5-P95 band
      {
        x: dates,
        y: percentiles.p95,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'P95',
        line: { color: '#3b82f6', width: 0 },
        showlegend: false,
      },
      {
        x: dates,
        y: percentiles.p5,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: '5th-95th Percentile',
        line: { color: '#3b82f6', width: 0 },
        fill: 'tonexty' as const,
        fillcolor: 'rgba(59, 130, 246, 0.1)',
      },
      // P25-P75 band
      {
        x: dates,
        y: percentiles.p75,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'P75',
        line: { color: '#3b82f6', width: 0 },
        showlegend: false,
      },
      {
        x: dates,
        y: percentiles.p25,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: '25th-75th Percentile',
        line: { color: '#3b82f6', width: 0 },
        fill: 'tonexty' as const,
        fillcolor: 'rgba(59, 130, 246, 0.3)',
      },
      // Median line
      {
        x: dates,
        y: percentiles.p50,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'Median (P50)',
        line: { color: '#ef4444', width: 3 },
      },
    ]
  }, [mcResult, simLength])

  // Memoize histogram data
  const histogramData = useMemo(() => {
    if (!mcResult) return null

    const finalValues = mcResult.simulations.map(sim => sim.finalValue)

    return [{
      x: finalValues,
      type: 'histogram' as const,
      name: 'Final Value Distribution',
      marker: { color: '#3b82f6' },
      opacity: 0.7,
    }]
  }, [mcResult])

  const histogramLayout: Partial<Layout> = useMemo(() => ({
    title: {
      text: `Final Portfolio Value Distribution (${numSims} simulations)`,
      font: { size: 16 },
    },
    xaxis: { title: { text: 'Final Portfolio Value ($)' } },
    yaxis: { title: { text: 'Frequency' } },
    margin: { l: 60, r: 40, t: 60, b: 60 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
  }), [numSims])

  const handleRun = () => {
    // Trigger re-run by changing key dependencies
    setMcResult(null)
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">No results yet</p>
          <p className="text-sm">Run an optimization to see Monte Carlo projections</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Alert>
        <IconChartArea className="h-4 w-4" />
        <AlertDescription>
          Monte Carlo simulation shows possible future paths for your optimized portfolio.
          Uses bootstrap resampling of historical trades to project forward returns.
        </AlertDescription>
      </Alert>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Simulation Parameters</CardTitle>
          <CardDescription>
            Configure forward projection settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sim-length">Projection Length (months)</Label>
              <Input
                id="sim-length"
                type="number"
                min={1}
                max={60}
                value={simLength}
                onChange={(e) => setSimLength(parseInt(e.target.value) || 12)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="num-sims">Number of Simulations</Label>
              <Input
                id="num-sims"
                type="number"
                min={100}
                max={5000}
                step={100}
                value={numSims}
                onChange={(e) => setNumSims(parseInt(e.target.value) || 1000)}
                disabled={loading}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleRun} disabled={loading} className="w-full">
                <IconRefresh size={16} className="mr-2" />
                Re-run Simulation
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center space-y-4">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-muted-foreground">Running {numSims} simulations...</p>
          </div>
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : mcResult ? (
        <>
          {/* Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Projection Statistics</CardTitle>
              <CardDescription>
                Expected outcomes after {simLength} months
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Expected Value (Median)</p>
                  <p className="text-2xl font-bold">
                    ${mcResult.statistics.medianFinalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">5th Percentile (Worst)</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-500">
                    ${mcResult.statistics.valueAtRisk.p5.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">95th Percentile (Best)</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-500">
                    ${mcResult.percentiles.p95[mcResult.percentiles.p95.length - 1].toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Prob. of Profit</p>
                  <p className="text-2xl font-bold">
                    {(mcResult.statistics.probabilityOfProfit * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fan Chart */}
          {fanChartData && (
            <Card>
              <CardHeader>
                <CardTitle>Forward Projection Fan Chart</CardTitle>
                <CardDescription>
                  Percentile bands showing range of possible outcomes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartWrapper
                  title="Monte Carlo Projection"
                  data={fanChartData}
                  layout={createLineChartLayout(
                    'Monte Carlo Projection',
                    'Time Period',
                    'Portfolio Value ($)'
                  )}
                />
              </CardContent>
            </Card>
          )}

          {/* Histogram */}
          {histogramData && (
            <Card>
              <CardHeader>
                <CardTitle>Final Value Distribution</CardTitle>
                <CardDescription>
                  Distribution of portfolio values at end of simulation period
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartWrapper
                  title="Final Value Distribution"
                  data={histogramData}
                  layout={histogramLayout}
                />
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  )
}
