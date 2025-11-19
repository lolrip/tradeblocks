/**
 * Efficient Frontier Tab - Shows risk/return frontier for optimized strategies
 */

"use client"

import React, { useEffect, useState, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { IconRefresh, IconChartDots } from "@tabler/icons-react"
import type { HierarchicalResult } from "@/lib/calculations/hierarchical-optimizer"
import { getTradesByBlock } from "@/lib/db/trades-store"
import type { Trade } from "@/lib/models/trade"
import {
  extractStrategyReturns,
  alignStrategyReturns,
  simulateWeightedPortfolioEquity,
  type PortfolioResult,
  type EquityCurvePoint,
} from "@/lib/calculations/efficient-frontier"
import type {
  StrategyOptimizationRequest,
  WorkerResponse,
  ProgressUpdate,
  CompletionMessage,
  ErrorMessage,
} from "@/lib/workers/optimization.worker"

type OptimizationRequest = StrategyOptimizationRequest
import { FrontierChart } from "@/components/efficient-frontier/frontier-chart"
import { AllocationDisplay } from "@/components/efficient-frontier/allocation-display"
import { ChartWrapper, createLineChartLayout } from "@/components/performance-charts/chart-wrapper"

interface EfficientFrontierTabProps {
  result: HierarchicalResult | null
  totalCapital: number
}

type OptimizationState = 'idle' | 'loading-data' | 'optimizing' | 'complete' | 'error'

export function EfficientFrontierTabImpl({ result, totalCapital }: EfficientFrontierTabProps) {
  const [state, setState] = useState<OptimizationState>('idle')
  const [error, setError] = useState<string>('')
  const [progress, setProgress] = useState(0)

  const [portfolios, setPortfolios] = useState<PortfolioResult[]>([])
  const [efficientFrontier, setEfficientFrontier] = useState<PortfolioResult[]>([])
  const [selectedPortfolio, setSelectedPortfolio] = useState<PortfolioResult | null>(null)
  const [equityCurveData, setEquityCurveData] = useState<EquityCurvePoint[]>([])
  const [alignedData, setAlignedData] = useState<{
    strategies: string[]
    dates: string[]
    returns: number[][]
  } | null>(null)

  const workerRef = useRef<Worker | null>(null)

  // Initialize Web Worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('@/lib/workers/optimization.worker.ts', import.meta.url)
    )

    workerRef.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data

      if (message.type === 'progress') {
        const progressMsg = message as ProgressUpdate
        setProgress(progressMsg.progress)
      } else if (message.type === 'complete') {
        const completeMsg = message as CompletionMessage
        setPortfolios(completeMsg.portfolios)
        setEfficientFrontier(completeMsg.efficientFrontier)
        setState('complete')
        setProgress(100)
      } else if (message.type === 'error') {
        const errorMsg = message as ErrorMessage
        setError(errorMsg.error)
        setState('error')
        setProgress(0)
      }
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [])

  // Load data and run optimization when result changes
  useEffect(() => {
    if (!result) {
      setState('idle')
      setPortfolios([])
      setEfficientFrontier([])
      setSelectedPortfolio(null)
      setEquityCurveData([])
      setAlignedData(null)
      return
    }

    async function runFrontierOptimization() {
      if (!workerRef.current) return

      if (!result) return

      setState('loading-data')
      setError('')

      try {
        // Load all trades
        const allTrades: Trade[] = []
        for (const block of result.optimizedBlocks) {
          const trades = await getTradesByBlock(block.blockId)
          allTrades.push(...trades)
        }

        if (allTrades.length === 0) {
          setError("No trades found for selected blocks")
          setState('error')
          return
        }

        // Extract and align strategy returns
        const strategyReturns = extractStrategyReturns(allTrades)
        const aligned = alignStrategyReturns(strategyReturns)

        if (aligned.dates.length < 30) {
          setError("Insufficient overlapping data (need at least 30 trading days)")
          setState('error')
          return
        }

        setAlignedData(aligned)

        // Start optimization
        setState('optimizing')
        setProgress(0)

        // Transform aligned data into StrategyReturns format for worker
        const strategyReturnsForWorker = aligned.strategies.map((strategy, idx) => ({
          strategy,
          dates: aligned.dates,
          returns: aligned.returns[idx],
          trades: allTrades.filter(t => (t.strategy || 'Unknown') === strategy),
        }))

        const request: OptimizationRequest = {
          type: 'start',
          mode: 'strategy',
          strategyReturns: strategyReturnsForWorker,
          constraints: {
            minWeight: 0,
            maxWeight: 1,
            fullyInvested: true,
            allowLeverage: false,
          },
          numSimulations: 2000,
          riskFreeRate: 2.0,
          randomSeed: 42,
        }

        workerRef.current.postMessage(request)
      } catch (err) {
        console.error("Frontier optimization error:", err)
        setError("Failed to run efficient frontier optimization")
        setState('error')
      }
    }

    runFrontierOptimization()
  }, [result])

  // When a portfolio is selected, simulate its equity curve
  useEffect(() => {
    if (!selectedPortfolio || !alignedData) {
      setEquityCurveData([])
      return
    }

    // Convert weights object to array matching aligned strategies order
    const weightsArray = alignedData.strategies.map(
      strategy => selectedPortfolio.weights[strategy] || 0
    )

    const equity = simulateWeightedPortfolioEquity(
      weightsArray,
      alignedData.returns,
      alignedData.dates,
      totalCapital
    )

    setEquityCurveData(equity)
  }, [selectedPortfolio, alignedData, totalCapital])

  const handlePortfolioSelect = useCallback((portfolio: PortfolioResult) => {
    setSelectedPortfolio(portfolio)
  }, [])

  const handleReset = useCallback(() => {
    setSelectedPortfolio(null)
    setEquityCurveData([])
  }, [])

  if (!result) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">No results yet</p>
          <p className="text-sm">Run an optimization to see the efficient frontier</p>
        </div>
      </div>
    )
  }

  if (state === 'loading-data') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">Loading trade data...</p>
        </div>
      </div>
    )
  }

  if (state === 'optimizing') {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Generating Efficient Frontier</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Running Monte Carlo simulations...</span>
                <span className="text-muted-foreground">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
            <p className="text-sm text-muted-foreground">
              Generating 2000 random portfolios and identifying optimal allocations
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  const equityChartData = equityCurveData.length > 0 ? [
    {
      x: equityCurveData.map(p => p.date),
      y: equityCurveData.map(p => p.equity),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'Portfolio Value',
      line: { color: '#3b82f6', width: 2 },
    },
  ] : null

  const drawdownChartData = equityCurveData.length > 0 ? [
    {
      x: equityCurveData.map(p => p.date),
      y: equityCurveData.map(p => p.drawdownPct),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'Drawdown',
      line: { color: '#ef4444', width: 2 },
      fill: 'tozeroy' as const,
      fillcolor: 'rgba(239, 68, 68, 0.2)',
    },
  ] : null

  return (
    <div className="space-y-6">
      <Alert>
        <IconChartDots className="h-4 w-4" />
        <AlertDescription>
          The efficient frontier shows the optimal risk/return tradeoffs. Each point represents a portfolio allocation.
          Click any point to see its weights and historical performance.
        </AlertDescription>
      </Alert>

      {/* Frontier Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Efficient Frontier</CardTitle>
          <CardDescription>
            Risk vs Return for {portfolios.length.toLocaleString()} simulated portfolios
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FrontierChart
            portfolios={portfolios}
            efficientFrontier={efficientFrontier}
            selectedPortfolio={selectedPortfolio || undefined}
            onPortfolioSelect={handlePortfolioSelect}
          />
        </CardContent>
      </Card>

      {/* Selected Portfolio Details */}
      {selectedPortfolio && alignedData && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Selected Portfolio Allocation</CardTitle>
                  <CardDescription>
                    Strategy weights and capital allocation
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <IconRefresh size={16} className="mr-2" />
                  Clear Selection
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <AllocationDisplay
                portfolio={selectedPortfolio}
              />
            </CardContent>
          </Card>

          {/* Equity Curve */}
          {equityChartData && (
            <Card>
              <CardHeader>
                <CardTitle>Historical Performance</CardTitle>
                <CardDescription>
                  Backtest of selected portfolio using historical returns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartWrapper
                  title="Portfolio Value"
                  data={equityChartData}
                  layout={createLineChartLayout(
                    'Portfolio Value Over Time',
                    'Date',
                    'Portfolio Value ($)'
                  )}
                />
              </CardContent>
            </Card>
          )}

          {/* Drawdown Chart */}
          {drawdownChartData && (
            <Card>
              <CardHeader>
                <CardTitle>Drawdown from Peak</CardTitle>
                <CardDescription>
                  Maximum decline from highest portfolio value
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartWrapper
                  title="Drawdown"
                  data={drawdownChartData}
                  layout={createLineChartLayout(
                    'Drawdown from Peak',
                    'Date',
                    'Drawdown (%)'
                  )}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
