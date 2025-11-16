"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useBlockStore } from "@/lib/stores/block-store"
import { getTradesByBlock } from "@/lib/db/trades-store"
import {
  extractStrategyReturns,
  validateTradesForOptimization,
  DEFAULT_CONSTRAINTS,
  simulateWeightedPortfolioEquity,
  alignStrategyReturns,
  type PortfolioResult,
  type PortfolioConstraints,
  type StrategyReturns,
  type EquityCurvePoint,
} from "@/lib/calculations/efficient-frontier"
import type {
  OptimizationRequest,
  WorkerResponse,
  ProgressUpdate,
  CompletionMessage,
  ErrorMessage,
} from "@/lib/workers/optimization.worker"
import { FrontierChart } from "@/components/efficient-frontier/frontier-chart"
import { OptimizationControls } from "@/components/efficient-frontier/optimization-controls"
import { AllocationDisplay } from "@/components/efficient-frontier/allocation-display"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { IconAlertCircle, IconInfoCircle, IconChartDots } from "@tabler/icons-react"
import { ChartWrapper, createLineChartLayout } from "@/components/performance-charts/chart-wrapper"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type OptimizationState = 'idle' | 'loading-data' | 'optimizing' | 'complete' | 'error'

export default function EfficientFrontierPage() {
  // Block and data state
  const activeBlockId = useBlockStore((state) => state.blocks.find((b) => b.isActive)?.id)
  const [strategyReturns, setStrategyReturns] = useState<StrategyReturns[]>([])
  const [availableStrategies, setAvailableStrategies] = useState<string[]>([])

  // Optimization state
  const [state, setState] = useState<OptimizationState>('idle')
  const [error, setError] = useState<string>('')
  const [progress, setProgress] = useState(0)

  // Configuration state
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([])
  const [constraints, setConstraints] = useState<PortfolioConstraints>(DEFAULT_CONSTRAINTS)
  const [numSimulations, setNumSimulations] = useState(2000)

  // Results state
  const [portfolios, setPortfolios] = useState<PortfolioResult[]>([])
  const [efficientFrontier, setEfficientFrontier] = useState<PortfolioResult[]>([])
  const [selectedPortfolio, setSelectedPortfolio] = useState<PortfolioResult | null>(null)

  // Simulation state
  const [equityCurveData, setEquityCurveData] = useState<EquityCurvePoint[]>([])
  const [startingCapital, setStartingCapital] = useState<number>(100000)
  const [alignedData, setAlignedData] = useState<{
    strategies: string[]
    dates: string[]
    returns: number[][]
  } | null>(null)

  // Worker ref
  const workerRef = useRef<Worker | null>(null)

  // Load trades when active block changes
  useEffect(() => {
    async function loadTrades() {
      if (!activeBlockId) {
        setState('idle')
        return
      }

      setState('loading-data')
      setError('')

      try {
        const loadedTrades = await getTradesByBlock(activeBlockId)

        // Validate trades for optimization
        const validation = validateTradesForOptimization(loadedTrades)

        if (!validation.valid) {
          setError(validation.error || 'Invalid trades data')
          setState('error')
          return
        }

        // Extract strategy returns
        const returns = extractStrategyReturns(loadedTrades)
        setStrategyReturns(returns)

        // Set available strategies
        const strategies = returns.map(sr => sr.strategy).sort()
        setAvailableStrategies(strategies)
        setSelectedStrategies(strategies) // Select all by default

        // Calculate initial capital from first trade
        const sortedTrades = [...loadedTrades].sort((a, b) => {
          const dateCompare = new Date(a.dateOpened).getTime() - new Date(b.dateOpened).getTime()
          if (dateCompare !== 0) return dateCompare
          return a.timeOpened.localeCompare(b.timeOpened)
        })
        if (sortedTrades.length > 0 && sortedTrades[0].fundsAtClose) {
          const initialCapital = sortedTrades[0].fundsAtClose - sortedTrades[0].pl
          setStartingCapital(initialCapital > 0 ? initialCapital : 100000)
        }

        // Align strategy returns for simulation
        const aligned = alignStrategyReturns(returns)
        setAlignedData(aligned)

        setState('idle')
      } catch (err) {
        console.error('Failed to load trades:', err)
        setError('Failed to load trade data')
        setState('error')
      }
    }

    loadTrades()
  }, [activeBlockId])

  // Initialize Web Worker
  useEffect(() => {
    // Create worker instance
    workerRef.current = new Worker(
      new URL('@/lib/workers/optimization.worker.ts', import.meta.url)
    )

    // Set up message handler
    workerRef.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data

      if (message.type === 'progress') {
        handleProgressUpdate(message as ProgressUpdate)
      } else if (message.type === 'complete') {
        handleCompletion(message as CompletionMessage)
      } else if (message.type === 'error') {
        handleError(message as ErrorMessage)
      }
    }

    // Clean up worker on unmount
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle progress updates from worker
  const handleProgressUpdate = useCallback((update: ProgressUpdate) => {
    setProgress(update.progress)
    // Optionally add the portfolio to the list in real-time
    // This creates the cool real-time visualization effect
    setPortfolios(prev => [...prev, update.portfolio])
  }, [])

  // Handle optimization completion
  const handleCompletion = useCallback((message: CompletionMessage) => {
    setPortfolios(message.portfolios)
    setEfficientFrontier(message.efficientFrontier)
    setState('complete')
    setProgress(100)

    // Auto-select the portfolio with highest Sharpe ratio
    if (message.efficientFrontier.length > 0) {
      const bestPortfolio = message.efficientFrontier.reduce((best, current) =>
        current.sharpeRatio > best.sharpeRatio ? current : best
      )
      setSelectedPortfolio(bestPortfolio)
    }
  }, [])

  // Handle worker errors
  const handleError = useCallback((message: ErrorMessage) => {
    setError(message.details || message.error)
    setState('error')
    setProgress(0)
  }, [])

  // Run optimization
  const handleRunOptimization = useCallback(() => {
    if (!workerRef.current || selectedStrategies.length < 2) return

    // Filter strategy returns to only selected strategies
    const selectedReturns = strategyReturns.filter(sr =>
      selectedStrategies.includes(sr.strategy)
    )

    if (selectedReturns.length < 2) {
      setError('Please select at least 2 strategies')
      return
    }

    // Reset state
    setPortfolios([])
    setEfficientFrontier([])
    setSelectedPortfolio(null)
    setProgress(0)
    setState('optimizing')
    setError('')

    // Get risk-free rate (default to 2.0%)
    const riskFreeRate = 2.0

    // Send optimization request to worker
    const request: OptimizationRequest = {
      type: 'start',
      strategyReturns: selectedReturns,
      numSimulations,
      constraints,
      riskFreeRate,
    }

    workerRef.current.postMessage(request)
  }, [
    strategyReturns,
    selectedStrategies,
    numSimulations,
    constraints,
  ])

  // Reset optimization
  const handleReset = useCallback(() => {
    setPortfolios([])
    setEfficientFrontier([])
    setSelectedPortfolio(null)
    setProgress(0)
    setState('idle')
    setError('')
    setEquityCurveData([])
    // Reset to all strategies selected
    setSelectedStrategies(availableStrategies)
    setConstraints(DEFAULT_CONSTRAINTS)
    setNumSimulations(2000)
  }, [availableStrategies])

  // Handle portfolio selection from chart
  const handlePortfolioSelect = useCallback(
    (portfolio: PortfolioResult) => {
      setSelectedPortfolio(portfolio)

      // Simulate equity curve with selected weights
      if (!alignedData) {
        return
      }

      // Filter aligned data to only include selected strategies
      const selectedIndices = alignedData.strategies
        .map((strategy, idx) => (selectedStrategies.includes(strategy) ? idx : -1))
        .filter(idx => idx !== -1)

      const filteredStrategies = selectedIndices.map(idx => alignedData.strategies[idx])
      const filteredReturns = selectedIndices.map(idx => alignedData.returns[idx])

      // Get weights in same order as filtered strategies
      const weights = filteredStrategies.map(strategy => portfolio.weights[strategy] || 0)

      // Simulate equity curve
      const equityCurve = simulateWeightedPortfolioEquity(
        weights,
        filteredReturns,
        alignedData.dates,
        startingCapital
      )

      setEquityCurveData(equityCurve)

      // Scroll to results
      setTimeout(() => {
        const resultsSection = document.getElementById('simulation-results')
        if (resultsSection) {
          resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    },
    [alignedData, selectedStrategies, startingCapital]
  )

  // Render empty state if no active block
  if (!activeBlockId) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Efficient Frontier Optimizer</h1>
          <p className="text-muted-foreground">
            Optimize portfolio allocations across trading strategies using Modern Portfolio Theory
          </p>
        </div>

        <Alert>
          <IconInfoCircle className="h-4 w-4" />
          <AlertTitle>No Active Block</AlertTitle>
          <AlertDescription>
            Please select or create a block to use the Efficient Frontier optimizer.
            You need at least 2 strategies with trade history to run the optimization.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Render error state
  if (state === 'error' && error) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Efficient Frontier Optimizer</h1>
          <p className="text-muted-foreground">
            Optimize portfolio allocations across trading strategies
          </p>
        </div>

        <Alert variant="destructive">
          <IconAlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>

        <OptimizationControls
          strategies={availableStrategies}
          selectedStrategies={selectedStrategies}
          onSelectedStrategiesChange={setSelectedStrategies}
          constraints={constraints}
          onConstraintsChange={setConstraints}
          numSimulations={numSimulations}
          onNumSimulationsChange={setNumSimulations}
          onRunOptimization={handleRunOptimization}
          onReset={handleReset}
          isOptimizing={false}
          disabled
        />
      </div>
    )
  }

  const isLoading = state === 'loading-data'
  const isOptimizing = state === 'optimizing'
  const hasResults = portfolios.length > 0

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <IconChartDots size={32} className="text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">
            Efficient Frontier Optimizer
          </h1>
        </div>
        <p className="text-muted-foreground">
          Find optimal strategy allocations using Monte Carlo simulation and Modern Portfolio Theory.
          The efficient frontier shows portfolios with the best risk-adjusted returns.
        </p>
      </div>

      {/* Info Banner */}
      <Alert>
        <IconInfoCircle className="h-4 w-4" />
        <AlertTitle>How It Works</AlertTitle>
        <AlertDescription>
          This optimizer generates {numSimulations.toLocaleString()} random portfolio allocations
          across your selected strategies, calculates their risk/return profiles, and identifies
          the efficient frontier - the set of portfolios offering the highest return for each level of risk.
        </AlertDescription>
      </Alert>

      {/* Optimization Controls */}
      <OptimizationControls
        strategies={availableStrategies}
        selectedStrategies={selectedStrategies}
        onSelectedStrategiesChange={setSelectedStrategies}
        constraints={constraints}
        onConstraintsChange={setConstraints}
        numSimulations={numSimulations}
        onNumSimulationsChange={setNumSimulations}
        onRunOptimization={handleRunOptimization}
        onReset={handleReset}
        isOptimizing={isOptimizing}
        disabled={isLoading}
      />

      {/* Progress Bar (shown during optimization) */}
      {isOptimizing && (
        <Card>
          <CardHeader>
            <CardTitle>Optimization in Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-muted-foreground text-center">
              {Math.round(progress)}% complete - Simulating portfolio combinations...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results Section */}
      {hasResults && (
        <>
          <FrontierChart
            portfolios={portfolios}
            efficientFrontier={efficientFrontier}
            selectedPortfolio={selectedPortfolio || undefined}
            onPortfolioSelect={handlePortfolioSelect}
          />

          <AllocationDisplay portfolio={selectedPortfolio} />

          {/* Simulation Results */}
          {equityCurveData.length > 0 && selectedPortfolio && (
            <div id="simulation-results" className="space-y-6">
              {/* Summary Statistics Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Portfolio Performance Simulation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Starting Capital Input */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="starting-capital">Starting Capital</Label>
                      <Input
                        id="starting-capital"
                        type="number"
                        value={startingCapital}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value)
                          if (!isNaN(value) && value > 0) {
                            setStartingCapital(value)
                            // Re-simulate with new capital
                            handlePortfolioSelect(selectedPortfolio)
                          }
                        }}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="text-right"
                      />
                    </div>
                  </div>

                  {/* Performance Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Final Value</p>
                      <p className="text-2xl font-bold">
                        ${equityCurveData[equityCurveData.length - 1].equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Total Return</p>
                      <p className="text-2xl font-bold">
                        {(((equityCurveData[equityCurveData.length - 1].equity - startingCapital) / startingCapital) * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">CAGR</p>
                      <p className="text-2xl font-bold">{selectedPortfolio.annualizedReturn.toFixed(1)}%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Max Drawdown</p>
                      <p className="text-2xl font-bold text-destructive">
                        {Math.min(...equityCurveData.map(d => d.drawdownPct)).toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {/* Additional Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2 border-t">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Sharpe Ratio</p>
                      <p className="text-lg font-semibold">{selectedPortfolio.sharpeRatio.toFixed(3)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Volatility</p>
                      <p className="text-lg font-semibold">{selectedPortfolio.annualizedVolatility.toFixed(1)}%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Trading Days</p>
                      <p className="text-lg font-semibold">{equityCurveData.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Equity Curve Chart */}
              <ChartWrapper
                title="📈 Simulated Equity Curve"
                description="Historical portfolio value with selected weights"
                data={[
                  {
                    x: equityCurveData.map(d => d.date),
                    y: equityCurveData.map(d => d.equity),
                    type: "scatter" as const,
                    mode: "lines",
                    name: "Portfolio Value",
                    line: { color: "#3b82f6", width: 3 },
                    hovertemplate: "<b>Date:</b> %{x}<br><b>Value:</b> $%{y:,.2f}<br><extra></extra>",
                  },
                  {
                    x: equityCurveData.map(d => d.date),
                    y: equityCurveData.map(d => d.highWaterMark),
                    type: "scatter" as const,
                    mode: "lines",
                    name: "High Water Mark",
                    line: { color: "#10b981", width: 2, dash: "dot" },
                    hovertemplate: "<b>Date:</b> %{x}<br><b>HWM:</b> $%{y:,.2f}<br><extra></extra>",
                  },
                ]}
                layout={{
                  ...createLineChartLayout("", "Date", "Portfolio Value ($)"),
                  yaxis: {
                    title: { text: "Portfolio Value ($)", standoff: 50 },
                    showgrid: true,
                    zeroline: false,
                    tickformat: "$,.0f",
                  },
                  legend: {
                    orientation: "h",
                    yanchor: "bottom",
                    y: 1.02,
                    xanchor: "right",
                    x: 1,
                  },
                }}
                style={{ height: "400px" }}
              />

              {/* Drawdown Chart */}
              <ChartWrapper
                title="📉 Drawdown Analysis"
                description="Portfolio drawdown from peak values"
                data={(() => {
                  const maxDrawdown = equityCurveData.reduce((max, current) =>
                    current.drawdownPct < max.drawdownPct ? current : max
                  )
                  return [
                    {
                      x: equityCurveData.map(d => d.date),
                      y: Array(equityCurveData.length).fill(0),
                      type: "scatter" as const,
                      mode: "lines",
                      name: "No Drawdown",
                      line: { color: "rgba(0,0,0,0.3)", width: 1 },
                      showlegend: false,
                      hoverinfo: "skip",
                    },
                    {
                      x: equityCurveData.map(d => d.date),
                      y: equityCurveData.map(d => d.drawdownPct),
                      type: "scatter" as const,
                      mode: "lines+markers",
                      name: "Drawdown %",
                      line: { color: "#ef4444", width: 1 },
                      marker: { color: "#ef4444", size: 2, opacity: 0.6 },
                      fill: "tozeroy",
                      fillcolor: "rgba(239, 68, 68, 0.3)",
                      hovertemplate: "<b>Date:</b> %{x}<br><b>Drawdown:</b> %{y:.2f}%<br><extra></extra>",
                    },
                    {
                      x: [maxDrawdown.date],
                      y: [maxDrawdown.drawdownPct],
                      type: "scatter" as const,
                      mode: "markers",
                      name: `Max DD: ${maxDrawdown.drawdownPct.toFixed(1)}%`,
                      marker: {
                        color: "#dc2626",
                        size: 12,
                        symbol: "x",
                        line: { width: 2, color: "#991b1b" },
                      },
                      hovertemplate: "<b>Max Drawdown</b><br><b>Date:</b> %{x}<br><b>DD:</b> %{y:.2f}%<br><extra></extra>",
                    },
                  ]
                })()}
                layout={{
                  ...createLineChartLayout("", "Date", "Drawdown (%)"),
                  yaxis: {
                    title: { text: "Drawdown (%)", standoff: 50 },
                    showgrid: true,
                    zeroline: true,
                    zerolinecolor: "#000",
                    zerolinewidth: 1,
                    tickformat: ".1f",
                    range: [Math.min(...equityCurveData.map(d => d.drawdownPct)) * 1.1, 5],
                  },
                  legend: {
                    orientation: "h",
                    yanchor: "bottom",
                    y: 1.02,
                    xanchor: "right",
                    x: 1,
                  },
                }}
                style={{ height: "400px" }}
              />
            </div>
          )}
        </>
      )}

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="flex items-center justify-center h-32">
            <p className="text-muted-foreground">Loading trade data...</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
