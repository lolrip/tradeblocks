/**
 * Kelly Tab - Kelly-optimal position sizing for optimized allocation
 */

"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { IconGauge } from "@tabler/icons-react"
import type { HierarchicalResult } from "@/lib/calculations/hierarchical-optimizer"
import { getTradesByBlock } from "@/lib/db/trades-store"
import type { Trade } from "@/lib/models/trade"
import {
  calculateStrategyKellyMetrics,
  type KellyMetrics,
} from "@/lib/calculations/kelly"

interface KellyTabProps {
  result: HierarchicalResult | null
  totalCapital: number
}

export function KellyTabImpl({ result, totalCapital }: KellyTabProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kellyMetrics, setKellyMetrics] = useState<Record<string, KellyMetrics>>({})

  useEffect(() => {
    if (!result) {
      setKellyMetrics({})
      return
    }

    async function calculateKelly() {
      if (!result) return

      setLoading(true)
      setError(null)

      try {
        // Load all trades
        const allTrades: Trade[] = []
        for (const block of result.optimizedBlocks) {
          const trades = await getTradesByBlock(block.blockId)
          allTrades.push(...trades)
        }

        if (allTrades.length === 0) {
          setError("No trades found for selected blocks")
          setLoading(false)
          return
        }

        // Calculate Kelly metrics for all strategies at once
        const metricsMap = calculateStrategyKellyMetrics(allTrades, totalCapital)

        // Convert Map to Record for easier React usage
        const metrics: Record<string, KellyMetrics> = {}
        metricsMap.forEach((value, key) => {
          metrics[key] = value
        })

        setKellyMetrics(metrics)
        setLoading(false)
      } catch (err) {
        console.error("Kelly calculation error:", err)
        setError("Failed to calculate Kelly metrics")
        setLoading(false)
      }
    }

    calculateKelly()
  }, [result, totalCapital])

  if (!result) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">No results yet</p>
          <p className="text-sm">Run an optimization to see Kelly sizing recommendations</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">Calculating Kelly metrics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (Object.keys(kellyMetrics).length === 0) {
    return (
      <Alert>
        <AlertDescription>No Kelly metrics available</AlertDescription>
      </Alert>
    )
  }

  // Calculate weighted Kelly percentage for optimized portfolio
  let portfolioKelly = 0
  let totalOptimizedWeight = 0

  for (const block of result.optimizedBlocks) {
    const blockWeight = result.blockWeights[block.blockName] || 0
    for (const [strategy, strategyWeight] of Object.entries(block.strategyWeights)) {
      const combinedWeight = blockWeight * strategyWeight
      const kelly = kellyMetrics[strategy]
      if (kelly && kelly.hasValidKelly) {
        portfolioKelly += combinedWeight * kelly.percent
        totalOptimizedWeight += combinedWeight
      }
    }
  }

  const avgKelly = totalOptimizedWeight > 0 ? portfolioKelly / totalOptimizedWeight : 0

  return (
    <div className="space-y-6">
      <Alert>
        <IconGauge className="h-4 w-4" />
        <AlertDescription>
          Kelly Criterion shows the optimal position size to maximize long-term growth.
          Values are shown for each strategy based on historical performance.
        </AlertDescription>
      </Alert>

      {/* Kelly vs Optimization Weights Explanation */}
      <Alert>
        <AlertDescription>
          <p className="font-semibold mb-2">Why do Kelly percentages differ from optimization weights?</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              <strong>Kelly optimizes each strategy in isolation</strong> - It maximizes geometric growth for that strategy alone, without considering correlations.
            </li>
            <li>
              <strong>Portfolio optimization uses Sharpe ratios</strong> - It considers how strategies interact and diversify the overall portfolio.
            </li>
            <li>
              <strong>Diversification can trump Kelly</strong> - A strategy with lower Kelly % but low/negative correlation with other strategies may receive higher allocation for better risk-adjusted returns.
            </li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            Kelly percentages are informational and do not directly influence the optimization. Portfolio optimization prioritizes diversification and risk-adjusted returns.
          </p>
        </AlertDescription>
      </Alert>

      {/* Portfolio Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Kelly Summary</CardTitle>
          <CardDescription>
            Weighted Kelly percentage for optimized allocation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Weighted Portfolio Kelly</p>
              <p className="text-3xl font-bold">
                {avgKelly.toFixed(2)}%
              </p>
              <p className="text-xs text-muted-foreground">
                {avgKelly > 50
                  ? "⚠ Very aggressive - consider fractional Kelly"
                  : avgKelly > 25
                  ? "Aggressive - half Kelly (÷2) recommended"
                  : avgKelly > 10
                  ? "Moderate - quarter Kelly (÷4) may be safer"
                  : "Conservative sizing"}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Recommended Capital Allocation</p>
              <p className="text-3xl font-bold">
                ${((avgKelly / 100) * totalCapital).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-muted-foreground">
                With ${totalCapital.toLocaleString()} total capital
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Strategy Kelly Table */}
      <Card>
        <CardHeader>
          <CardTitle>Kelly Percentage by Strategy</CardTitle>
          <CardDescription>
            Optimal position sizing for each strategy in your portfolio
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Strategy</TableHead>
                  <TableHead className="text-right">Optimized Weight</TableHead>
                  <TableHead className="text-right">Kelly %</TableHead>
                  <TableHead className="text-right">Win Rate</TableHead>
                  <TableHead className="text-right">Avg Win/Loss Ratio</TableHead>
                  <TableHead className="text-right">Total Trades</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(kellyMetrics).map(([strategy, kelly]) => {
                  // Find optimized weight for this strategy
                  let optimizedWeight = 0
                  for (const block of result.optimizedBlocks) {
                    const blockWeight = result.blockWeights[block.blockName] || 0
                    const strategyWeight = block.strategyWeights[strategy] || 0
                    optimizedWeight += blockWeight * strategyWeight
                  }

                  return (
                    <TableRow key={strategy}>
                      <TableCell className="font-medium">{strategy}</TableCell>
                      <TableCell className="text-right font-mono">
                        {(optimizedWeight * 100).toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {kelly.hasValidKelly
                          ? `${kelly.percent.toFixed(2)}%`
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(kelly.winRate * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {kelly.avgWin !== 0 && kelly.avgLoss !== 0
                          ? (Math.abs(kelly.avgWin / kelly.avgLoss)).toFixed(2)
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        -
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Interpretation Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Kelly Criterion Guide</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <p>
              <strong>Full Kelly:</strong> Theoretically optimal for maximizing long-term growth, but very aggressive.
              Can lead to large drawdowns.
            </p>
            <p>
              <strong>Half Kelly (÷2):</strong> Widely recommended. Provides 75% of Full Kelly growth with 50% of the volatility.
            </p>
            <p>
              <strong>Quarter Kelly (÷4):</strong> Conservative approach. Good for risk-averse traders or uncertain edge.
            </p>
            <p className="text-muted-foreground mt-4">
              <strong>Note:</strong> Kelly assumes accurate win rate and win/loss ratio estimates. Use fractional Kelly in practice to account for estimation errors.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
