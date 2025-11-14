"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useBlockStore } from "@/lib/stores/block-store"
import { getTradesByBlock } from "@/lib/db/trades-store"
import {
  extractStrategyReturns,
  validateTradesForOptimization,
  DEFAULT_CONSTRAINTS,
  type PortfolioResult,
  type PortfolioConstraints,
  type StrategyReturns,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    activeBlockId,
  ])

  // Reset optimization
  const handleReset = useCallback(() => {
    setPortfolios([])
    setEfficientFrontier([])
    setSelectedPortfolio(null)
    setProgress(0)
    setState('idle')
    setError('')
    // Reset to all strategies selected
    setSelectedStrategies(availableStrategies)
    setConstraints(DEFAULT_CONSTRAINTS)
    setNumSimulations(2000)
  }, [availableStrategies])


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
          />

          <AllocationDisplay portfolio={selectedPortfolio} />
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
