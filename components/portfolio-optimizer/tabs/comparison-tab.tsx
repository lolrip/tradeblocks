/**
 * Comparison Tab - Compare equal-weight vs optimized allocation
 */

"use client"

import React, { useEffect, useState, useMemo } from "react"
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
import { IconArrowUp, IconArrowDown, IconMinus, IconTrendingUp, IconScale } from "@tabler/icons-react"
import type { HierarchicalResult } from "@/lib/calculations/hierarchical-optimizer"
import { getTradesByBlock } from "@/lib/db/trades-store"
import type { Trade } from "@/lib/models/trade"
import {
  extractStrategyReturns,
  alignStrategyReturns,
  simulateWeightedPortfolioEquity,
  calculatePortfolioMetrics,
  type EquityCurvePoint,
} from "@/lib/calculations/efficient-frontier"
import { ChartWrapper, createLineChartLayout } from "@/components/performance-charts/chart-wrapper"

interface ComparisonTabProps {
  result: HierarchicalResult | null
  totalCapital: number
}

interface ComparisonMetrics {
  annualizedReturn: number
  annualizedVolatility: number
  sharpeRatio: number
  maxDrawdown: number
  calmarRatio: number
  finalValue: number
}

export function ComparisonTab({ result, totalCapital }: ComparisonTabProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [equalWeightMetrics, setEqualWeightMetrics] = useState<ComparisonMetrics | null>(null)
  const [optimizedMetrics, setOptimizedMetrics] = useState<ComparisonMetrics | null>(null)
  const [equalWeightEquity, setEqualWeightEquity] = useState<EquityCurvePoint[]>([])
  const [optimizedEquity, setOptimizedEquity] = useState<EquityCurvePoint[]>([])

  useEffect(() => {
    if (!result) {
      setEqualWeightMetrics(null)
      setOptimizedMetrics(null)
      setEqualWeightEquity([])
      setOptimizedEquity([])
      return
    }

    async function runComparison() {
      if (!result) return

      setLoading(true)
      setError(null)

      try {
        // Load all trades for the optimized blocks
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

        // Extract strategy returns
        const strategyReturns = extractStrategyReturns(allTrades)

        // Align strategy returns to common date range
        const aligned = alignStrategyReturns(strategyReturns)

        if (aligned.dates.length === 0) {
          setError("No overlapping dates found between strategies")
          setLoading(false)
          return
        }

        // Create equal-weight allocation
        const numStrategies = aligned.strategies.length
        const equalWeights = Array(numStrategies).fill(1 / numStrategies)

        // Create optimized allocation weights array
        const optimizedWeights: number[] = []
        for (const strategy of aligned.strategies) {
          // Find which block this strategy belongs to
          let weight = 0
          for (const block of result.optimizedBlocks) {
            const blockWeight = result.blockWeights[block.blockName] || 0
            const strategyWeight = block.strategyWeights[strategy] || 0
            weight += blockWeight * strategyWeight
          }
          optimizedWeights.push(weight)
        }

        // Simulate both portfolios
        const equalWeightCurve = simulateWeightedPortfolioEquity(
          equalWeights,
          aligned.returns,
          aligned.dates,
          totalCapital
        )

        const optimizedCurve = simulateWeightedPortfolioEquity(
          optimizedWeights,
          aligned.returns,
          aligned.dates,
          totalCapital
        )

        setEqualWeightEquity(equalWeightCurve)
        setOptimizedEquity(optimizedCurve)

        // Calculate metrics for equal-weight
        const ewMetrics = calculatePortfolioMetrics(equalWeights, aligned.returns, 2.0)
        const ewMaxDD = Math.min(...equalWeightCurve.map(p => p.drawdownPct))
        const ewFinalValue = equalWeightCurve[equalWeightCurve.length - 1]?.equity || totalCapital
        const ewCalmar = ewMetrics.annualizedReturn / Math.abs(ewMaxDD)

        setEqualWeightMetrics({
          annualizedReturn: ewMetrics.annualizedReturn,
          annualizedVolatility: ewMetrics.annualizedVolatility,
          sharpeRatio: ewMetrics.sharpeRatio,
          maxDrawdown: ewMaxDD,
          calmarRatio: isFinite(ewCalmar) ? ewCalmar : 0,
          finalValue: ewFinalValue,
        })

        // Calculate metrics for optimized
        const optMetrics = calculatePortfolioMetrics(optimizedWeights, aligned.returns, 2.0)
        const optMaxDD = Math.min(...optimizedCurve.map(p => p.drawdownPct))
        const optFinalValue = optimizedCurve[optimizedCurve.length - 1]?.equity || totalCapital
        const optCalmar = optMetrics.annualizedReturn / Math.abs(optMaxDD)

        setOptimizedMetrics({
          annualizedReturn: optMetrics.annualizedReturn,
          annualizedVolatility: optMetrics.annualizedVolatility,
          sharpeRatio: optMetrics.sharpeRatio,
          maxDrawdown: optMaxDD,
          calmarRatio: isFinite(optCalmar) ? optCalmar : 0,
          finalValue: optFinalValue,
        })

        setLoading(false)
      } catch (err) {
        console.error("Comparison calculation error:", err)
        setError("Failed to calculate comparison metrics")
        setLoading(false)
      }
    }

    runComparison()
  }, [result, totalCapital])

  // Memoize chart data
  const equityChartData = useMemo(() => {
    if (equalWeightEquity.length === 0 || optimizedEquity.length === 0) return null

    return [
      {
        x: equalWeightEquity.map(p => p.date),
        y: equalWeightEquity.map(p => p.equity),
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'Equal Weight',
        line: { color: '#94a3b8', width: 2 },
      },
      {
        x: optimizedEquity.map(p => p.date),
        y: optimizedEquity.map(p => p.equity),
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'Optimized',
        line: { color: '#3b82f6', width: 2 },
      },
    ]
  }, [equalWeightEquity, optimizedEquity])

  const drawdownChartData = useMemo(() => {
    if (equalWeightEquity.length === 0 || optimizedEquity.length === 0) return null

    return [
      {
        x: equalWeightEquity.map(p => p.date),
        y: equalWeightEquity.map(p => p.drawdownPct),
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'Equal Weight',
        line: { color: '#94a3b8', width: 2 },
        fill: 'tozeroy' as const,
        fillcolor: 'rgba(148, 163, 184, 0.2)',
      },
      {
        x: optimizedEquity.map(p => p.date),
        y: optimizedEquity.map(p => p.drawdownPct),
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'Optimized',
        line: { color: '#3b82f6', width: 2 },
        fill: 'tozeroy' as const,
        fillcolor: 'rgba(59, 130, 246, 0.2)',
      },
    ]
  }, [equalWeightEquity, optimizedEquity])

  if (!result) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">No results yet</p>
          <p className="text-sm">Run an optimization to see performance comparison</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">Calculating comparison metrics...</p>
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

  if (!equalWeightMetrics || !optimizedMetrics) {
    return (
      <Alert>
        <AlertDescription>Unable to calculate comparison metrics</AlertDescription>
      </Alert>
    )
  }

  const MetricComparison = ({
    label,
    equalWeight,
    optimized,
    format = (v: number) => v.toFixed(2),
    higherIsBetter = true,
    suffix = ''
  }: {
    label: string
    equalWeight: number
    optimized: number
    format?: (v: number) => string
    higherIsBetter?: boolean
    suffix?: string
  }) => {
    const diff = optimized - equalWeight
    const pctChange = equalWeight !== 0 ? (diff / Math.abs(equalWeight)) * 100 : 0
    const isImprovement = higherIsBetter ? diff > 0 : diff < 0
    const isNeutral = Math.abs(diff) < 0.01

    return (
      <TableRow>
        <TableCell className="font-medium">{label}</TableCell>
        <TableCell className="text-right font-mono">{format(equalWeight)}{suffix}</TableCell>
        <TableCell className="text-right font-mono">{format(optimized)}{suffix}</TableCell>
        <TableCell className="text-right">
          {isNeutral ? (
            <span className="inline-flex items-center text-muted-foreground">
              <IconMinus size={16} className="mr-1" />
              {format(Math.abs(diff))}{suffix}
            </span>
          ) : isImprovement ? (
            <span className="inline-flex items-center text-green-600 dark:text-green-500">
              <IconArrowUp size={16} className="mr-1" />
              {format(Math.abs(diff))}{suffix}
            </span>
          ) : (
            <span className="inline-flex items-center text-red-600 dark:text-red-500">
              <IconArrowDown size={16} className="mr-1" />
              {format(Math.abs(diff))}{suffix}
            </span>
          )}
        </TableCell>
        <TableCell className="text-right font-mono">
          {isNeutral ? (
            <span className="text-muted-foreground">~0%</span>
          ) : isImprovement ? (
            <span className="text-green-600 dark:text-green-500">
              +{pctChange.toFixed(1)}%
            </span>
          ) : (
            <span className="text-red-600 dark:text-red-500">
              {pctChange.toFixed(1)}%
            </span>
          )}
        </TableCell>
      </TableRow>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Alert>
        <IconScale className="h-4 w-4" />
        <AlertDescription>
          Comparing equal-weight baseline (all strategies weighted equally) vs your optimized allocation.
          This shows the improvement from optimization.
        </AlertDescription>
      </Alert>

      {/* Metrics Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics Comparison</CardTitle>
          <CardDescription>
            Side-by-side comparison of equal-weight baseline vs optimized allocation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">Equal Weight</TableHead>
                  <TableHead className="text-right">Optimized</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead className="text-right">% Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <MetricComparison
                  label="Annualized Return"
                  equalWeight={equalWeightMetrics.annualizedReturn}
                  optimized={optimizedMetrics.annualizedReturn}
                  higherIsBetter={true}
                  suffix="%"
                />
                <MetricComparison
                  label="Annualized Volatility"
                  equalWeight={equalWeightMetrics.annualizedVolatility}
                  optimized={optimizedMetrics.annualizedVolatility}
                  higherIsBetter={false}
                  suffix="%"
                />
                <MetricComparison
                  label="Sharpe Ratio"
                  equalWeight={equalWeightMetrics.sharpeRatio}
                  optimized={optimizedMetrics.sharpeRatio}
                  format={(v) => v.toFixed(3)}
                  higherIsBetter={true}
                />
                <MetricComparison
                  label="Max Drawdown"
                  equalWeight={equalWeightMetrics.maxDrawdown}
                  optimized={optimizedMetrics.maxDrawdown}
                  higherIsBetter={false}
                  suffix="%"
                />
                <MetricComparison
                  label="Calmar Ratio"
                  equalWeight={equalWeightMetrics.calmarRatio}
                  optimized={optimizedMetrics.calmarRatio}
                  format={(v) => v.toFixed(3)}
                  higherIsBetter={true}
                />
                <MetricComparison
                  label="Final Portfolio Value"
                  equalWeight={equalWeightMetrics.finalValue}
                  optimized={optimizedMetrics.finalValue}
                  format={(v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  higherIsBetter={true}
                  suffix=""
                />
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Equity Curves */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconTrendingUp size={20} />
            Equity Curve Comparison
          </CardTitle>
          <CardDescription>
            Historical backtest of equal-weight vs optimized allocation
          </CardDescription>
        </CardHeader>
        <CardContent>
          {equityChartData && (
            <ChartWrapper
              title="Equity Curve"
              data={equityChartData}
              layout={createLineChartLayout(
                'Portfolio Value Over Time',
                'Date',
                'Portfolio Value ($)'
              )}
            />
          )}
        </CardContent>
      </Card>

      {/* Drawdown Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Drawdown Comparison</CardTitle>
          <CardDescription>
            Drawdown from peak for both allocations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {drawdownChartData && (
            <ChartWrapper
              title="Drawdown"
              data={drawdownChartData}
              layout={createLineChartLayout(
                'Drawdown from Peak',
                'Date',
                'Drawdown (%)'
              )}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
