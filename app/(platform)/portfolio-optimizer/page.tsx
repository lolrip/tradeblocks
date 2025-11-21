/**
 * Portfolio Optimizer - Redesigned with integrated analytics
 * Central hub for portfolio optimization with preset management,
 * history tracking, and integrated analytics tabs
 */

"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useBlockStore } from "@/lib/stores/block-store"
import { getTradesByBlock } from "@/lib/db/trades-store"
import {
  DEFAULT_HIERARCHICAL_CONFIG,
  type HierarchicalConfig,
  type HierarchicalResult,
  applyMinimumMarginFilter,
} from "@/lib/calculations/hierarchical-optimizer"
import type {
  HierarchicalOptimizationRequest,
  HierarchicalWorkerResponse,
  PhaseProgressUpdate,
  HierarchicalCompletionMessage,
  HierarchicalErrorMessage,
} from "@/lib/workers/hierarchical-optimization.worker"
import type { OptimizationMode, OptimizationHistoryEntry, OptimizationPreset } from "@/lib/types/portfolio-optimizer-types"
import { useOptimizationHistory } from "@/lib/hooks/use-optimization-history"

// Components
import { BlockSelectionGrid } from "@/components/block-optimizer/block-selection-grid"
import { TwoLevelControls } from "@/components/portfolio-optimizer/two-level-controls"
import { PresetSelector } from "@/components/portfolio-optimizer/preset-selector"
import { HistorySelector } from "@/components/portfolio-optimizer/history-selector"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IconAlertCircle, IconInfoCircle, IconTarget } from "@tabler/icons-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { IconChevronDown } from "@tabler/icons-react"

// Tabs
import { ResultsTab } from "@/components/portfolio-optimizer/tabs/results-tab"
import { EfficientFrontierTab } from "@/components/portfolio-optimizer/tabs/efficient-frontier-tab"
import { MonteCarloTab } from "@/components/portfolio-optimizer/tabs/monte-carlo-tab"
import { CorrelationTab } from "@/components/portfolio-optimizer/tabs/correlation-tab"
import { KellyTab } from "@/components/portfolio-optimizer/tabs/kelly-tab"
import { ComparisonTab } from "@/components/portfolio-optimizer/tabs/comparison-tab"

type OptimizationState = 'idle' | 'loading-data' | 'optimizing' | 'complete' | 'error'

export default function PortfolioOptimizerPage() {
  // Block state
  const blocks = useBlockStore((state) => state.blocks)
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([])

  // Optimization mode (for now, always hierarchical - single-block and multi-block coming later)
  const [mode] = useState<OptimizationMode>('hierarchical')

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

  // History management
  const { addHistoryEntry } = useOptimizationHistory()

  // UI state
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState('results')

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
    workerRef.current = new Worker(
      new URL('@/lib/workers/hierarchical-optimization.worker.ts', import.meta.url)
    )

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
    // Apply margin filtering to the result
    const filteredResult = applyMinimumMarginFilter(
      message.result,
      totalCapital,
      message.result.optimizedBlocks
    )

    // Add filtered result to the main result
    const resultWithFilter: HierarchicalResult = {
      ...message.result,
      filteredResult,
    }

    setResult(resultWithFilter)
    setOptimizationDuration(message.duration)
    setState('complete')
    setProgress(100)
    setCurrentPhase(null)
    setPhaseMessage('')

    // Save to history
    const selectedBlockNames = blocks
      .filter(b => selectedBlockIds.includes(b.id))
      .map(b => b.name)

    addHistoryEntry({
      mode,
      selectedBlockIds,
      selectedBlockNames,
      config,
      totalCapital,
      result: resultWithFilter,
      duration: message.duration,
    })

    // Switch to results tab
    setActiveTab('results')
  }, [blocks, selectedBlockIds, mode, config, totalCapital, addHistoryEntry])

  // Handle worker errors
  const handleError = useCallback((message: HierarchicalErrorMessage) => {
    setError(message.details || message.error)
    setState('error')
    setProgress(0)
    setCurrentPhase(null)
    setPhaseMessage('')
  }, [])

  // Load preset
  const handleLoadPreset = useCallback((preset: OptimizationPreset) => {
    setSelectedBlockIds(preset.selectedBlockIds)
    setConfig(preset.config)
    setTotalCapital(preset.totalCapital)
    setAllowSingleStrategyBlocks(preset.allowSingleStrategyBlocks)
  }, [])

  // Load history
  const handleLoadHistory = useCallback((entry: OptimizationHistoryEntry) => {
    setSelectedBlockIds(entry.selectedBlockIds)
    setConfig(entry.config)
    setTotalCapital(entry.totalCapital)
    setResult(entry.result)
    setOptimizationDuration(entry.duration)
    setState('complete')
    setActiveTab('results')
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

      // Check strategy count if needed
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
    setSelectedBlockIds(blocks.map(b => b.id))
    setConfig(DEFAULT_HIERARCHICAL_CONFIG)
    setTotalCapital(100000)
    setAllowSingleStrategyBlocks(true)
  }, [blocks])

  // Render empty state
  if (blocks.length === 0) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Portfolio Optimizer</h1>
          <p className="text-muted-foreground">
            Comprehensive portfolio optimization with integrated analytics
          </p>
        </div>

        <Alert>
          <IconInfoCircle className="h-4 w-4" />
          <AlertTitle>No Blocks Found</AlertTitle>
          <AlertDescription>
            Please create at least 2 blocks with trade data to use the Portfolio Optimizer.
          </AlertDescription>
        </Alert>
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
          Hierarchical optimization with integrated analytics, preset management, and results history
        </p>
      </div>

      {/* Info Banner */}
      <Alert>
        <IconInfoCircle className="h-4 w-4" />
        <AlertTitle>Two-Level Hierarchical Optimization</AlertTitle>
        <AlertDescription>
          <strong>Level 1:</strong> Optimizes strategy weights within each selected block.
          <br />
          <strong>Level 2:</strong> Optimizes block allocation across your portfolio.
          <br />
          Results are automatically saved to history and can be exported.
        </AlertDescription>
      </Alert>

      {/* Preset and History Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PresetSelector
          selectedBlockIds={selectedBlockIds}
          mode={mode}
          config={config}
          totalCapital={totalCapital}
          allowSingleStrategyBlocks={allowSingleStrategyBlocks}
          onLoadPreset={handleLoadPreset}
          disabled={isLoading || isOptimizing}
        />
        <HistorySelector
          onLoadHistory={handleLoadHistory}
          disabled={isLoading || isOptimizing}
        />
      </div>

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
                Single-strategy blocks skip Level 1 optimization but are included in Level 2 block allocation.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Controls - Collapsible */}
      <Collapsible open={isSettingsExpanded} onOpenChange={setIsSettingsExpanded}>
        <Card>
          <CardHeader>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 hover:bg-transparent">
                <CardTitle>Optimization Settings</CardTitle>
                <IconChevronDown
                  size={20}
                  className={`transition-transform ${isSettingsExpanded ? 'rotate-180' : ''}`}
                />
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
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
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Progress Bar */}
      {isOptimizing && (
        <Card>
          <CardHeader>
            <CardTitle>Optimization in Progress</CardTitle>
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
              <p className="text-sm text-muted-foreground">{phaseMessage}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {state === 'error' && error && (
        <Alert variant="destructive">
          <IconAlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results Section with Tabs */}
      {hasResults && (
        <Card>
          <CardHeader>
            <CardTitle>Optimization Results & Analytics</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="frontier">Frontier</TabsTrigger>
                <TabsTrigger value="montecarlo">Monte Carlo</TabsTrigger>
                <TabsTrigger value="correlation">Correlation</TabsTrigger>
                <TabsTrigger value="kelly">Kelly</TabsTrigger>
                <TabsTrigger value="comparison">Comparison</TabsTrigger>
              </TabsList>
              <div className="mt-6">
                <TabsContent value="results" className="m-0">
                  <ResultsTab
                    result={result}
                    totalCapital={totalCapital}
                    duration={optimizationDuration}
                  />
                </TabsContent>
                <TabsContent value="frontier" className="m-0">
                  <EfficientFrontierTab result={result} totalCapital={totalCapital} />
                </TabsContent>
                <TabsContent value="montecarlo" className="m-0">
                  <MonteCarloTab result={result} totalCapital={totalCapital} />
                </TabsContent>
                <TabsContent value="correlation" className="m-0">
                  <CorrelationTab result={result} />
                </TabsContent>
                <TabsContent value="kelly" className="m-0">
                  <KellyTab result={result} totalCapital={totalCapital} />
                </TabsContent>
                <TabsContent value="comparison" className="m-0">
                  <ComparisonTab result={result} totalCapital={totalCapital} />
                </TabsContent>
              </div>
            </Tabs>
          </CardContent>
        </Card>
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
