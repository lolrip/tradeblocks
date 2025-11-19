"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useBlockStore } from "@/lib/stores/block-store"
import { getTradesByBlock } from "@/lib/db/trades-store"
import {
  DEFAULT_HIERARCHICAL_CONFIG,
  type HierarchicalConfig,
  type HierarchicalResult,
} from "@/lib/calculations/hierarchical-optimizer"
import type {
  HierarchicalOptimizationRequest,
  HierarchicalWorkerResponse,
  PhaseProgressUpdate,
  HierarchicalCompletionMessage,
  HierarchicalErrorMessage,
} from "@/lib/workers/hierarchical-optimization.worker"
import { BlockSelectionGrid } from "@/components/block-optimizer/block-selection-grid"
import { TwoLevelControls } from "@/components/portfolio-optimizer/two-level-controls"
import { HierarchicalResults } from "@/components/portfolio-optimizer/hierarchical-results"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { IconAlertCircle, IconInfoCircle, IconTarget, IconLayoutGrid } from "@tabler/icons-react"

type OptimizationState = 'idle' | 'loading-data' | 'optimizing' | 'complete' | 'error'

export default function PortfolioOptimizerPage() {
  // Block state
  const blocks = useBlockStore((state) => state.blocks)
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([])

  // Optimization state
  const [state, setState] = useState<OptimizationState>('idle')
  const [error, setError] = useState<string>('')
  const [progress, setProgress] = useState(0)
  const [currentPhase, setCurrentPhase] = useState<1 | 2 | null>(null)
  const [phaseMessage, setPhaseMessage] = useState('')

  // Configuration state
  const [config, setConfig] = useState<HierarchicalConfig>(DEFAULT_HIERARCHICAL_CONFIG)
  const [totalCapital, setTotalCapital] = useState(100000)
  const [allowSingleStrategyBlocks, setAllowSingleStrategyBlocks] = useState(true)

  // Results state
  const [result, setResult] = useState<HierarchicalResult | null>(null)
  const [optimizationDuration, setOptimizationDuration] = useState<number>(0)

  // Worker ref
  const workerRef = useRef<Worker | null>(null)

  // Select all blocks by default
  useEffect(() => {
    if (blocks.length > 0 && selectedBlockIds.length === 0) {
      setSelectedBlockIds(blocks.map(b => b.id))
    }
  }, [blocks, selectedBlockIds.length])

  // Initialize Web Worker
  useEffect(() => {
    // Create worker instance
    workerRef.current = new Worker(
      new URL('@/lib/workers/hierarchical-optimization.worker.ts', import.meta.url)
    )

    // Set up message handler
    workerRef.current.onmessage = (event: MessageEvent<HierarchicalWorkerResponse>) => {
      const message = event.data

      if (message.type === 'phase-progress') {
        handleProgressUpdate(message as PhaseProgressUpdate)
      } else if (message.type === 'complete') {
        handleCompletion(message as HierarchicalCompletionMessage)
      } else if (message.type === 'error') {
        handleError(message as HierarchicalErrorMessage)
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
  const handleProgressUpdate = useCallback((update: PhaseProgressUpdate) => {
    setProgress(update.overallProgress)
    setCurrentPhase(update.phase)
    setPhaseMessage(update.message)
  }, [])

  // Handle optimization completion
  const handleCompletion = useCallback((message: HierarchicalCompletionMessage) => {
    setResult(message.result)
    setOptimizationDuration(message.duration)
    setState('complete')
    setProgress(100)
    setCurrentPhase(null)
    setPhaseMessage('')
  }, [])

  // Handle worker errors
  const handleError = useCallback((message: HierarchicalErrorMessage) => {
    setError(message.details || message.error)
    setState('error')
    setProgress(0)
    setCurrentPhase(null)
    setPhaseMessage('')
  }, [])

  // Run optimization
  const handleRunOptimization = useCallback(async () => {
    if (!workerRef.current || selectedBlockIds.length < 2) return

    setState('loading-data')
    setError('')

    try {
      // Load trades for selected blocks
      const blocksWithTrades = await Promise.all(
        selectedBlockIds.map(async (blockId) => {
          const block = blocks.find(b => b.id === blockId)
          if (!block) return null

          const trades = await getTradesByBlock(blockId)
          return {
            blockId: block.id,
            blockName: block.name,
            trades,
          }
        })
      )

      const validBlocks = blocksWithTrades.filter((b) => b !== null)

      if (validBlocks.length < 2) {
        setError('At least 2 blocks with valid trades are required')
        setState('error')
        return
      }

      // Check that each block has at least 2 strategies (unless single-strategy blocks are allowed)
      if (!allowSingleStrategyBlocks) {
        for (const block of validBlocks) {
          const strategies = new Set(block.trades.map(t => t.strategy || 'Unknown'))
          if (strategies.size < 2) {
            setError(`Block "${block.blockName}" must have at least 2 strategies for hierarchical optimization`)
            setState('error')
            return
          }
        }
      }

      // Reset state
      setResult(null)
      setProgress(0)
      setCurrentPhase(null)
      setPhaseMessage('')
      setState('optimizing')

      // Send optimization request to worker
      const request: HierarchicalOptimizationRequest = {
        type: 'start',
        blocks: validBlocks,
        config,
      }

      workerRef.current.postMessage(request)
    } catch (err) {
      console.error('Failed to load trades:', err)
      setError('Failed to load trade data for optimization')
      setState('error')
    }
  }, [blocks, selectedBlockIds, config, allowSingleStrategyBlocks])

  // Reset optimization
  const handleReset = useCallback(() => {
    setResult(null)
    setProgress(0)
    setCurrentPhase(null)
    setPhaseMessage('')
    setState('idle')
    setError('')
    setOptimizationDuration(0)
    // Reset to all blocks selected
    setSelectedBlockIds(blocks.map(b => b.id))
    setConfig(DEFAULT_HIERARCHICAL_CONFIG)
    setTotalCapital(100000)
    setAllowSingleStrategyBlocks(true)
  }, [blocks])

  // Render empty state if no blocks
  if (blocks.length === 0) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Portfolio Optimizer</h1>
          <p className="text-muted-foreground">
            Hierarchical portfolio optimization across multiple trade blocks
          </p>
        </div>

        <Alert>
          <IconInfoCircle className="h-4 w-4" />
          <AlertTitle>No Blocks Found</AlertTitle>
          <AlertDescription>
            Please create at least 2 blocks with trade data to use the Portfolio Optimizer.
            Each block should have at least 2 strategies for optimal results.
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
          <h1 className="text-3xl font-bold tracking-tight">Portfolio Optimizer</h1>
          <p className="text-muted-foreground">
            Hierarchical portfolio optimization
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
  const hasResults = result !== null
  const canOptimize = selectedBlockIds.length >= 2 && !isOptimizing && !isLoading

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <IconTarget size={32} className="text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">
            Portfolio Optimizer
          </h1>
        </div>
        <p className="text-muted-foreground">
          Two-level hierarchical optimization: first optimizes strategies within each block,
          then optimizes block allocation across your portfolio.
        </p>
      </div>

      {/* Info Banner */}
      <Alert>
        <IconInfoCircle className="h-4 w-4" />
        <AlertTitle>How It Works</AlertTitle>
        <AlertDescription>
          <strong>Level 1:</strong> For each selected block, finds the optimal strategy weights based on your objective (e.g., Max Sharpe).
          {' '}<strong>Level 2:</strong> Using the optimized blocks, finds the optimal allocation across your portfolio.
          This provides more granular control than simple block optimization.
        </AlertDescription>
      </Alert>

      {/* Comparison with Block Optimizer */}
      <Alert>
        <IconLayoutGrid className="h-4 w-4" />
        <AlertTitle>Difference from Block Optimizer</AlertTitle>
        <AlertDescription>
          <strong>Block Optimizer:</strong> Treats each block as a single unit (all strategies aggregated).
          {' '}<strong>Portfolio Optimizer:</strong> Optimizes strategy weights within blocks, then block weights.
          Use this when you want control over both levels of allocation.
        </AlertDescription>
      </Alert>

      {/* Block Selection */}
      <BlockSelectionGrid
        blocks={blocks}
        selectedBlockIds={selectedBlockIds}
        onSelectedBlocksChange={setSelectedBlockIds}
        disabled={isLoading || isOptimizing}
      />

      {/* Single-Strategy Block Option */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="allow-single-strategy"
              checked={allowSingleStrategyBlocks}
              onCheckedChange={(checked) => setAllowSingleStrategyBlocks(checked as boolean)}
              disabled={isLoading || isOptimizing}
            />
            <div className="grid gap-2 flex-1">
              <Label
                htmlFor="allow-single-strategy"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Include single-strategy blocks (locked at 100%)
              </Label>
              <p className="text-sm text-muted-foreground">
                When enabled, blocks with only one strategy will be automatically locked at 100% weight.
                They will skip Level 1 optimization but still be included in Level 2 block allocation.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Controls */}
      <TwoLevelControls
        config={config}
        onConfigChange={setConfig}
        totalCapital={totalCapital}
        onTotalCapitalChange={setTotalCapital}
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
            <CardTitle>Hierarchical Optimization in Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">
                  {currentPhase === 1 ? '📊 Phase 1: Optimizing Strategies Within Blocks' : ''}
                  {currentPhase === 2 ? '🎯 Phase 2: Optimizing Block Allocation' : ''}
                </span>
                <span className="text-muted-foreground">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
            {phaseMessage && (
              <p className="text-sm text-muted-foreground">
                {phaseMessage}
              </p>
            )}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Phase 1 optimizes strategy weights within each block independently</p>
              <p>• Phase 2 uses those optimized blocks to find the best portfolio allocation</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Section */}
      {hasResults && result && (
        <>
          <Alert>
            <IconInfoCircle className="h-4 w-4" />
            <AlertTitle>Optimization Complete</AlertTitle>
            <AlertDescription>
              Hierarchical optimization completed in {(optimizationDuration / 1000).toFixed(2)} seconds.
              {' '}Analyzed {result.optimizedBlocks.length} blocks with a total of{' '}
              {result.optimizedBlocks.reduce((sum, block) => sum + Object.keys(block.strategyWeights).length, 0)} strategies.
            </AlertDescription>
          </Alert>

          <HierarchicalResults
            result={result}
            totalCapital={totalCapital}
          />
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
