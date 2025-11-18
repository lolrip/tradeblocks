"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useBlockStore } from "@/lib/stores/block-store"
import { getTradesByBlock } from "@/lib/db/trades-store"
import {
  extractBlockReturns,
  validateBlocksForOptimization,
  simulateBlockPortfolioEquity,
  alignBlockReturns,
  calculateBlockCorrelationMatrix,
  type BlockReturns,
  type BlockOptimizationConfig,
  type DateAlignmentMode,
  getBlocksDateRangeInfo,
} from "@/lib/calculations/block-efficient-frontier"
import {
  DEFAULT_CONSTRAINTS,
  type PortfolioResult,
  type PortfolioConstraints,
  type EquityCurvePoint,
} from "@/lib/calculations/efficient-frontier"
import type {
  BlockOptimizationRequest,
  WorkerResponse,
  ProgressUpdate,
  CompletionMessage,
  ErrorMessage,
} from "@/lib/workers/optimization.worker"
import { FrontierChart } from "@/components/efficient-frontier/frontier-chart"
import { BlockSelectionGrid } from "@/components/block-optimizer/block-selection-grid"
import { BlockOptimizationControls } from "@/components/block-optimizer/block-optimization-controls"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { IconAlertCircle, IconInfoCircle, IconChartDots3, IconLayoutGrid } from "@tabler/icons-react"
import { ChartWrapper, createLineChartLayout } from "@/components/performance-charts/chart-wrapper"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type OptimizationState = 'idle' | 'loading-data' | 'optimizing' | 'complete' | 'error'

export default function BlockOptimizerPage() {
  // Block state
  const blocks = useBlockStore((state) => state.blocks)
  const [blockReturns, setBlockReturns] = useState<BlockReturns[]>([])

  // Optimization state
  const [state, setState] = useState<OptimizationState>('idle')
  const [error, setError] = useState<string>('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [progress, setProgress] = useState(0)

  // Configuration state
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([])
  const [constraints, setConstraints] = useState<PortfolioConstraints>(DEFAULT_CONSTRAINTS)
  const [dateAlignment, setDateAlignment] = useState<DateAlignmentMode>('overlapping')
  const [numSimulations, setNumSimulations] = useState(2000)
  const [totalCapital, setTotalCapital] = useState(100000)
  const [riskFreeRate, setRiskFreeRate] = useState(2.0)

  // Results state
  const [portfolios, setPortfolios] = useState<PortfolioResult[]>([])
  const [efficientFrontier, setEfficientFrontier] = useState<PortfolioResult[]>([])
  const [selectedPortfolio, setSelectedPortfolio] = useState<PortfolioResult | null>(null)

  // Simulation state
  const [equityCurveData, setEquityCurveData] = useState<EquityCurvePoint[]>([])
  const [startingCapital, setStartingCapital] = useState<number>(100000)

  // Correlation matrix
  const [correlationMatrix, setCorrelationMatrix] = useState<{ matrix: number[][]; blocks: string[] } | null>(null)

  // Worker ref
  const workerRef = useRef<Worker | null>(null)

  // Load block returns when blocks change
  useEffect(() => {
    async function loadBlockReturns() {
      if (blocks.length === 0) {
        setState('idle')
        return
      }

      setState('loading-data')
      setError('')
      setWarnings([])

      try {
        const returns: BlockReturns[] = []

        for (const block of blocks) {
          const trades = await getTradesByBlock(block.id)
          const blockReturn = extractBlockReturns(block.id, block.name, trades)

          if (blockReturn) {
            returns.push(blockReturn)
          }
        }

        setBlockReturns(returns)

        // Select all blocks by default
        setSelectedBlockIds(returns.map(br => br.blockId))

        setState('idle')
      } catch (err) {
        console.error('Failed to load block data:', err)
        setError('Failed to load block data')
        setState('error')
      }
    }

    loadBlockReturns()
  }, [blocks])

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
    // Add portfolios in real-time for cool visualization effect
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
    if (!workerRef.current || selectedBlockIds.length < 2) return

    // Filter block returns to only selected blocks
    const selectedReturns = blockReturns.filter(br =>
      selectedBlockIds.includes(br.blockId)
    )

    if (selectedReturns.length < 2) {
      setError('Please select at least 2 blocks')
      return
    }

    // Validate blocks for optimization
    const validation = validateBlocksForOptimization(selectedReturns, dateAlignment)

    if (!validation.valid) {
      setError(validation.error || 'Invalid blocks data')
      return
    }

    if (validation.warnings && validation.warnings.length > 0) {
      setWarnings(validation.warnings)
    }

    // Calculate correlation matrix
    const aligned = alignBlockReturns(selectedReturns, dateAlignment)
    if (aligned.blocks.length > 0) {
      const correlation = calculateBlockCorrelationMatrix(aligned.returns, aligned.blocks)
      setCorrelationMatrix(correlation)
    }

    // Reset state
    setPortfolios([])
    setEfficientFrontier([])
    setSelectedPortfolio(null)
    setProgress(0)
    setState('optimizing')
    setError('')

    // Create optimization config
    const config: BlockOptimizationConfig = {
      dateAlignment,
      riskFreeRate,
      annualizationFactor: 252,
      constraints,
    }

    // Send optimization request to worker
    const request: BlockOptimizationRequest = {
      type: 'start',
      mode: 'block',
      blockReturns: selectedReturns,
      numSimulations,
      config,
    }

    workerRef.current.postMessage(request)
  }, [
    blockReturns,
    selectedBlockIds,
    numSimulations,
    constraints,
    dateAlignment,
    riskFreeRate,
  ])

  // Reset optimization
  const handleReset = useCallback(() => {
    setPortfolios([])
    setEfficientFrontier([])
    setSelectedPortfolio(null)
    setProgress(0)
    setState('idle')
    setError('')
    setWarnings([])
    setEquityCurveData([])
    setCorrelationMatrix(null)
    // Reset to all blocks selected
    setSelectedBlockIds(blockReturns.map(br => br.blockId))
    setConstraints(DEFAULT_CONSTRAINTS)
    setDateAlignment('overlapping')
    setNumSimulations(2000)
    setTotalCapital(100000)
    setRiskFreeRate(2.0)
  }, [blockReturns])

  // Handle portfolio selection from chart
  const handlePortfolioSelect = useCallback(
    (portfolio: PortfolioResult) => {
      setSelectedPortfolio(portfolio)

      // Get selected block returns
      const selectedReturns = blockReturns.filter(br =>
        selectedBlockIds.includes(br.blockId)
      )

      // Simulate equity curve with selected weights
      const equityCurve = simulateBlockPortfolioEquity(
        portfolio.weights,
        selectedReturns,
        { dateAlignment, riskFreeRate, annualizationFactor: 252, constraints },
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
    [blockReturns, selectedBlockIds, dateAlignment, riskFreeRate, constraints, startingCapital]
  )

  // Render empty state if no blocks
  if (blocks.length === 0) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Block Optimizer</h1>
          <p className="text-muted-foreground">
            Optimize portfolio allocation across multiple trade blocks
          </p>
        </div>

        <Alert>
          <IconInfoCircle className="h-4 w-4" />
          <AlertTitle>No Blocks Found</AlertTitle>
          <AlertDescription>
            Please create at least 2 blocks with trade data to use the Block Optimizer.
            Each block represents a trading portfolio or strategy that can be optimized as part of your overall portfolio allocation.
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
          <h1 className="text-3xl font-bold tracking-tight">Block Optimizer</h1>
          <p className="text-muted-foreground">
            Optimize portfolio allocation across multiple trade blocks
          </p>
        </div>

        <Alert variant="destructive">
          <IconAlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>

        <BlockSelectionGrid
          blocks={blocks}
          selectedBlockIds={selectedBlockIds}
          onSelectedBlocksChange={setSelectedBlockIds}
          disabled
        />
      </div>
    )
  }

  const isLoading = state === 'loading-data'
  const isOptimizing = state === 'optimizing'
  const hasResults = portfolios.length > 0
  const canOptimize = selectedBlockIds.length >= 2 && !isOptimizing && !isLoading

  // Get date range info for display
  const dateRangeInfo = blockReturns.length > 0
    ? getBlocksDateRangeInfo(blockReturns.filter(br => selectedBlockIds.includes(br.blockId)))
    : null

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <IconChartDots3 size={32} className="text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">
            Block Optimizer
          </h1>
        </div>
        <p className="text-muted-foreground">
          Optimize portfolio allocation across multiple trade blocks using Modern Portfolio Theory.
          Find the optimal balance between your different trading strategies and portfolios.
        </p>
      </div>

      {/* Info Banner */}
      <Alert>
        <IconInfoCircle className="h-4 w-4" />
        <AlertTitle>How It Works</AlertTitle>
        <AlertDescription>
          Select 2 or more blocks to optimize. The optimizer will generate {numSimulations.toLocaleString()} random
          portfolio allocations across your selected blocks and identify the efficient frontier -
          the set of portfolios offering the highest return for each level of risk.
        </AlertDescription>
      </Alert>

      {/* Date Range Info */}
      {dateRangeInfo && dateRangeInfo.overlapping.days > 0 && (
        <Alert>
          <IconLayoutGrid className="h-4 w-4" />
          <AlertTitle>Data Coverage</AlertTitle>
          <AlertDescription>
            Overall date range: {dateRangeInfo.overall.start} to {dateRangeInfo.overall.end} ({dateRangeInfo.overall.days} days).
            {' '}Overlapping dates: {dateRangeInfo.overlapping.start} to {dateRangeInfo.overlapping.end} ({dateRangeInfo.overlapping.days} days).
          </AlertDescription>
        </Alert>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <Alert>
          <IconAlertCircle className="h-4 w-4" />
          <AlertTitle>Warnings</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Block Selection */}
      <BlockSelectionGrid
        blocks={blocks}
        selectedBlockIds={selectedBlockIds}
        onSelectedBlocksChange={setSelectedBlockIds}
        disabled={isLoading || isOptimizing}
      />

      {/* Optimization Controls */}
      <BlockOptimizationControls
        constraints={constraints}
        onConstraintsChange={setConstraints}
        dateAlignment={dateAlignment}
        onDateAlignmentChange={setDateAlignment}
        numSimulations={numSimulations}
        onNumSimulationsChange={setNumSimulations}
        totalCapital={totalCapital}
        onTotalCapitalChange={setTotalCapital}
        riskFreeRate={riskFreeRate}
        onRiskFreeRateChange={setRiskFreeRate}
        onRunOptimization={handleRunOptimization}
        onReset={handleReset}
        isOptimizing={isOptimizing}
        disabled={isLoading}
        canOptimize={canOptimize}
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

      {/* Correlation Matrix */}
      {correlationMatrix && hasResults && (
        <Card>
          <CardHeader>
            <CardTitle>Block Correlation Matrix</CardTitle>
            <CardDescription>
              Correlation between selected blocks (1.0 = perfect correlation, 0.0 = no correlation, -1.0 = inverse correlation)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border p-2 text-left bg-muted"></th>
                    {correlationMatrix.blocks.map((block, idx) => (
                      <th key={idx} className="border p-2 text-center bg-muted text-xs">
                        {block}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {correlationMatrix.matrix.map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      <td className="border p-2 font-medium bg-muted text-xs">
                        {correlationMatrix.blocks[rowIdx]}
                      </td>
                      {row.map((value, colIdx) => {
                        const color = value > 0.7
                          ? 'bg-red-100 dark:bg-red-900/30'
                          : value > 0.3
                          ? 'bg-yellow-100 dark:bg-yellow-900/30'
                          : value < -0.3
                          ? 'bg-blue-100 dark:bg-blue-900/30'
                          : 'bg-green-100 dark:bg-green-900/30'

                        return (
                          <td key={colIdx} className={`border p-2 text-center font-mono text-sm ${color}`}>
                            {value.toFixed(3)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

          {selectedPortfolio && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Block Allocation</CardTitle>
                  <CardDescription>
                    Optimal weights for selected portfolio (Total Capital: ${totalCapital.toLocaleString()})
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(selectedPortfolio.weights).map(([blockName, weight]) => {
                      const dollarAmount = weight * totalCapital
                      return (
                        <div key={blockName} className="flex items-center justify-between border-b pb-2">
                          <span className="font-medium">{blockName}</span>
                          <div className="text-right">
                            <div className="font-mono text-lg">
                              {(weight * 100).toFixed(1)}%
                            </div>
                            <div className="text-sm text-muted-foreground">
                              ${dollarAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Simulation Results */}
              {equityCurveData.length > 0 && (
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
                    description="Historical portfolio value with selected block weights"
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
        </>
      )}

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="flex items-center justify-center h-32">
            <p className="text-muted-foreground">Loading block data...</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
