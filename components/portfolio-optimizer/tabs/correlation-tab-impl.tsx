/**
 * Correlation Tab - Show correlation heatmap for optimized strategies
 */

"use client"

import React, { useEffect, useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { IconChartHistogram } from "@tabler/icons-react"
import type { HierarchicalResult } from "@/lib/calculations/hierarchical-optimizer"
import { getTradesByBlock } from "@/lib/db/trades-store"
import type { Trade } from "@/lib/models/trade"
import {
  calculateCorrelationMatrix,
  calculateCorrelationAnalytics,
  type CorrelationMatrix,
  type CorrelationAnalytics,
} from "@/lib/calculations/correlation"
import { ChartWrapper } from "@/components/performance-charts/chart-wrapper"
import type { Layout } from "plotly.js"

interface CorrelationTabProps {
  result: HierarchicalResult | null
}

export function CorrelationTabImpl({ result }: CorrelationTabProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [corrMatrix, setCorrMatrix] = useState<CorrelationMatrix | null>(null)
  const [analytics, setAnalytics] = useState<CorrelationAnalytics | null>(null)

  useEffect(() => {
    if (!result) {
      setCorrMatrix(null)
      setAnalytics(null)
      return
    }

    async function calculateCorrelations() {
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

        // Calculate correlation matrix (using Pearson, shared dates, raw returns)
        const matrix = calculateCorrelationMatrix(allTrades, {
          method: 'pearson',
          alignment: 'shared',
          normalization: 'raw',
          dateBasis: 'opened',
        })

        setCorrMatrix(matrix)

        // Calculate analytics
        const analyticsResult = calculateCorrelationAnalytics(matrix)
        setAnalytics(analyticsResult)

        setLoading(false)
      } catch (err) {
        console.error("Correlation calculation error:", err)
        setError("Failed to calculate correlation matrix")
        setLoading(false)
      }
    }

    calculateCorrelations()
  }, [result])

  // Memoize heatmap data
  const heatmapData = useMemo(() => {
    if (!corrMatrix) return null

    // Format correlation values for text display
    const textValues = corrMatrix.correlationData.map(row =>
      row.map(val => val.toFixed(2))
    )

    return [{
      z: corrMatrix.correlationData,
      x: corrMatrix.strategies,
      y: corrMatrix.strategies,
      type: 'heatmap' as const,
      colorscale: 'RdBu' as const,
      reversescale: true,
      zmid: 0,
      zmin: -1,
      zmax: 1,
      text: textValues as unknown as string[],
      texttemplate: '%{text}',
      textfont: {
        size: 10,
      },
      colorbar: {
        title: { text: 'Correlation' },
        thickness: 15,
        len: 0.7,
      },
      hovertemplate: '<b>%{y}</b> vs <b>%{x}</b><br>Correlation: %{z:.3f}<extra></extra>',
    }]
  }, [corrMatrix])

  const heatmapLayout: Partial<Layout> = useMemo(() => ({
    title: {
      text: 'Strategy Correlation Matrix',
      font: { size: 16 },
    },
    xaxis: {
      tickangle: -45,
      side: 'bottom' as const,
    },
    yaxis: {
      autorange: 'reversed' as const,
    },
    margin: { l: 150, r: 80, t: 60, b: 150 },
    height: Math.max(500, (corrMatrix?.strategies.length || 10) * 40),
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
  }), [corrMatrix])

  if (!result) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">No results yet</p>
          <p className="text-sm">Run an optimization to see correlation analysis</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">Calculating correlations...</p>
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

  if (!corrMatrix || !analytics) {
    return (
      <Alert>
        <AlertDescription>Unable to calculate correlation matrix</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <Alert>
        <IconChartHistogram className="h-4 w-4" />
        <AlertDescription>
          The correlation matrix shows how strategies move together. Low correlation (blue) indicates good diversification.
          High correlation (red) means strategies tend to profit/loss together.
        </AlertDescription>
      </Alert>

      {/* Quick Analytics */}
      <Card>
        <CardHeader>
          <CardTitle>Correlation Analytics</CardTitle>
          <CardDescription>
            Summary statistics for {analytics.strategyCount} strategies
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Average Correlation</p>
              <p className="text-2xl font-bold">
                {analytics.averageCorrelation.toFixed(3)}
              </p>
              <p className="text-xs text-muted-foreground">
                {analytics.averageCorrelation < 0.3
                  ? "✓ Excellent diversification"
                  : analytics.averageCorrelation < 0.6
                  ? "Good diversification"
                  : "⚠ Limited diversification"}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Strongest Pair</p>
              <p className="text-sm font-mono">
                {analytics.strongest.pair[0]} ↔ {analytics.strongest.pair[1]}
              </p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-500">
                {analytics.strongest.value.toFixed(3)}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Weakest Pair</p>
              <p className="text-sm font-mono">
                {analytics.weakest.pair[0]} ↔ {analytics.weakest.pair[1]}
              </p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-500">
                {analytics.weakest.value.toFixed(3)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Correlation Heatmap</CardTitle>
          <CardDescription>
            Pearson correlation using shared trading days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {heatmapData && (
            <ChartWrapper
              title="Correlation Heatmap"
              data={heatmapData}
              layout={heatmapLayout}
            />
          )}
        </CardContent>
      </Card>

      {/* Interpretation Guide */}
      <Card>
        <CardHeader>
          <CardTitle>How to Interpret</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p>
              <strong>+1.0 (Red):</strong> Perfect positive correlation - strategies move exactly together
            </p>
            <p>
              <strong>0.0 (White):</strong> No correlation - strategies move independently
            </p>
            <p>
              <strong>-1.0 (Blue):</strong> Perfect negative correlation - strategies move in opposite directions
            </p>
            <p className="text-muted-foreground mt-4">
              <strong>For diversification:</strong> Look for strategies with low or negative correlations.
              The optimizer naturally balances correlated strategies to reduce overall portfolio risk.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
