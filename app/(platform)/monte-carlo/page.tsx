"use client"

import { useEffect, useState } from "react"
import { useBlockStore } from "@/lib/stores/block-store"
import { getTradesByBlock } from "@/lib/db/trades-store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { IconChartArea, IconAlertCircle, IconInfoCircle, IconLoader2 } from "@tabler/icons-react"
import type { Trade } from "@/lib/models/trade"
import type { MonteCarloResult, MonteCarloParams } from "@/lib/calculations/monte-carlo"
import { runMonteCarloSimulation } from "@/lib/calculations/monte-carlo"
import { ChartWrapper } from "@/components/performance-charts/chart-wrapper"

type LoadingState = 'idle' | 'loading' | 'running' | 'complete' | 'error'

export default function MonteCarloPage() {
  // Block state
  const blocks = useBlockStore((state) => state.blocks)
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([])
  const [blockWeights, setBlockWeights] = useState<Record<string, number>>({})
  const [blockTrades, setBlockTrades] = useState<Record<string, Trade[]>>({})

  // Simulation config
  const [timeHorizon, setTimeHorizon] = useState(100)
  const [numSimulations, setNumSimulations] = useState(1000)
  const [initialCapital, setInitialCapital] = useState(100000)
  const [randomSeed, setRandomSeed] = useState<number | undefined>(12345)

  // State
  const [state, setState] = useState<LoadingState>('idle')
  const [error, setError] = useState('')
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null)

  // Initialize: select all blocks by default
  useEffect(() => {
    if (blocks.length > 0 && selectedBlockIds.length === 0) {
      const allIds = blocks.map(b => b.id)
      setSelectedBlockIds(allIds)

      // Equal weights by default
      const equalWeight = 1.0 / blocks.length
      const weights: Record<string, number> = {}
      blocks.forEach(b => {
        weights[b.id] = equalWeight
      })
      setBlockWeights(weights)
    }
  }, [blocks, selectedBlockIds.length])

  // Load trades when selected blocks change
  useEffect(() => {
    async function loadTrades() {
      if (selectedBlockIds.length === 0) return

      setState('loading')
      setError('')

      try {
        const tradesMap: Record<string, Trade[]> = {}

        for (const blockId of selectedBlockIds) {
          const trades = await getTradesByBlock(blockId)
          tradesMap[blockId] = trades
        }

        setBlockTrades(tradesMap)
        setState('idle')
      } catch (err) {
        console.error('Failed to load trades:', err)
        setError('Failed to load trade data')
        setState('error')
      }
    }

    loadTrades()
  }, [selectedBlockIds])

  // Toggle block selection
  const toggleBlock = (blockId: string) => {
    if (selectedBlockIds.includes(blockId)) {
      setSelectedBlockIds(selectedBlockIds.filter(id => id !== blockId))
      const newWeights = { ...blockWeights }
      delete newWeights[blockId]
      setBlockWeights(newWeights)
    } else {
      setSelectedBlockIds([...selectedBlockIds, blockId])
      setBlockWeights({ ...blockWeights, [blockId]: 0 })
    }
  }

  // Update block weight
  const updateBlockWeight = (blockId: string, value: number) => {
    setBlockWeights(prev => ({ ...prev, [blockId]: value / 100 }))
  }

  // Normalize weights to sum to 100%
  const normalizeWeights = () => {
    const sum = Object.values(blockWeights).reduce((a, b) => a + b, 0)
    if (sum > 0) {
      const normalized: Record<string, number> = {}
      Object.entries(blockWeights).forEach(([blockId, weight]) => {
        normalized[blockId] = weight / sum
      })
      setBlockWeights(normalized)
    }
  }

  // Reset to equal weights
  const equalizeWeights = () => {
    if (selectedBlockIds.length === 0) return
    const equalWeight = 1.0 / selectedBlockIds.length
    const weights: Record<string, number> = {}
    selectedBlockIds.forEach(id => {
      weights[id] = equalWeight
    })
    setBlockWeights(weights)
  }

  // Combine trades from multiple blocks with weights
  const combineTrades = (): Trade[] => {
    const allTrades: Trade[] = []

    // Collect all unique dates
    const dateSet = new Set<string>()
    Object.values(blockTrades).forEach(trades => {
      trades.forEach(trade => {
        dateSet.add(trade.dateOpened.toISOString().split('T')[0])
      })
    })
    const sortedDates = Array.from(dateSet).sort()

    // For each date, create a synthetic trade representing the weighted portfolio
    sortedDates.forEach((dateStr, idx) => {
      let totalPl = 0
      let totalMargin = 0

      // Calculate weighted P&L for this date
      selectedBlockIds.forEach(blockId => {
        const weight = blockWeights[blockId] || 0
        const trades = blockTrades[blockId] || []

        // Find trades on this date
        const dateTrades = trades.filter(t =>
          t.dateOpened.toISOString().startsWith(dateStr)
        )

        // Sum P&L for this block on this date
        const dayPl = dateTrades.reduce((sum, t) => sum + t.pl, 0)
        totalPl += dayPl * weight

        // Sum margin
        const dayMargin = dateTrades.reduce((sum, t) => sum + (t.marginReq || 0), 0)
        totalMargin += dayMargin * weight
      })

      // Create synthetic trade
      const date = new Date(dateStr)
      const trade: Trade = {
        dateOpened: date,
        timeOpened: "09:30:00",
        openingPrice: 100,
        legs: `Portfolio Day ${idx + 1}`,
        premium: 0,
        dateClosed: new Date(date.getTime() + 24 * 60 * 60 * 1000),
        timeClosed: "16:00:00",
        closingPrice: 100,
        avgClosingCost: 0,
        reasonForClose: totalPl >= 0 ? "Profit" : "Loss",
        pl: totalPl,
        numContracts: 1,
        fundsAtClose: initialCapital + totalPl, // This will be recalculated properly
        marginReq: totalMargin,
        strategy: "Portfolio",
        openingCommissionsFees: 0,
        closingCommissionsFees: 0,
        openingShortLongRatio: 1.0,
        closingShortLongRatio: 1.0,
        openingVix: 15.0,
        closingVix: 15.0,
        gap: 0,
        movement: 0,
        maxProfit: Math.abs(totalPl),
        maxLoss: -Math.abs(totalPl),
      }

      allTrades.push(trade)
    })

    // Update fundsAtClose properly
    let capital = initialCapital
    allTrades.forEach(trade => {
      capital += trade.pl
      trade.fundsAtClose = capital
    })

    return allTrades
  }

  // Run Monte Carlo simulation
  const runProjection = async () => {
    if (selectedBlockIds.length === 0) {
      setError('Please select at least one block')
      return
    }

    setState('running')
    setError('')

    // Use Promise to yield to browser for UI update
    await new Promise(resolve => setTimeout(resolve, 50))

    // Wrap heavy computation in try-catch
    try {
      const portfolioTrades = combineTrades()

      console.log('Combined trades:', portfolioTrades.length)
      console.log('Sample trades:', portfolioTrades.slice(0, 3))

      if (portfolioTrades.length < 10) {
        setError(`Insufficient trades for Monte Carlo simulation. Found ${portfolioTrades.length} trades, need at least 10.`)
        setState('error')
        return
      }

      const params: MonteCarloParams = {
        numSimulations,
        simulationLength: timeHorizon,
        resampleMethod: "daily",
        initialCapital,
        tradesPerYear: 252,
        randomSeed,
      }

      console.log('Running MC with params:', params)
      const result = runMonteCarloSimulation(portfolioTrades, params)
      console.log('MC Result:', {
        numSimulations: result.simulations.length,
        percentileSteps: result.percentiles.steps.length,
        sampleP50: result.percentiles.p50.slice(0, 10),
        sampleP5: result.percentiles.p5.slice(0, 10),
        sampleP95: result.percentiles.p95.slice(0, 10),
        finalP50: result.percentiles.p50[result.percentiles.p50.length - 1],
        initialCapital,
        statistics: {
          medianFinal: result.statistics.medianFinalValue,
          meanFinal: result.statistics.meanFinalValue,
        }
      })

      console.log('Full P50 values:', result.percentiles.p50)

      setMcResult(result)
      setState('complete')
    } catch (err) {
      console.error('Monte Carlo simulation failed:', err)
      setError(err instanceof Error ? err.message : 'Simulation failed')
      setState('error')
    }
  }

  const weightSum = Object.values(blockWeights).reduce((a, b) => a + b, 0)
  const canRun = selectedBlockIds.length > 0 && state !== 'running' && state !== 'loading'

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <IconChartArea size={32} className="text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">
            Monte Carlo Simulation
          </h1>
        </div>
        <p className="text-muted-foreground">
          Project future portfolio performance using bootstrap resampling
        </p>
      </div>

      {/* Info Alert */}
      <Alert>
        <IconInfoCircle className="h-4 w-4" />
        <AlertTitle>How It Works</AlertTitle>
        <AlertDescription>
          Monte Carlo simulation resamples your historical trades to project potential future outcomes.
          Select one or more blocks, set their allocation weights, and configure the simulation parameters.
        </AlertDescription>
      </Alert>

      {/* Error State */}
      {state === 'error' && error && (
        <Alert variant="destructive">
          <IconAlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Block Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Blocks</CardTitle>
          <CardDescription>
            Choose one or more blocks to include in the simulation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No blocks found. Please import some trade data first.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {blocks.map(block => (
                  <div key={block.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`block-${block.id}`}
                      checked={selectedBlockIds.includes(block.id)}
                      onCheckedChange={() => toggleBlock(block.id)}
                      disabled={state === 'running' || state === 'loading'}
                    />
                    <label
                      htmlFor={`block-${block.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {block.name}
                    </label>
                  </div>
                ))}
              </div>

              {selectedBlockIds.length > 0 && (
                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">
                      Block Allocation (Total: {(weightSum * 100).toFixed(1)}%)
                    </Label>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={equalizeWeights}>
                        Equal Weights
                      </Button>
                      <Button variant="ghost" size="sm" onClick={normalizeWeights}>
                        Normalize
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedBlockIds.map(blockId => {
                      const block = blocks.find(b => b.id === blockId)
                      return (
                        <div key={blockId} className="space-y-2">
                          <Label>
                            {block?.name}: {((blockWeights[blockId] || 0) * 100).toFixed(1)}%
                          </Label>
                          <Slider
                            value={[(blockWeights[blockId] || 0) * 100]}
                            onValueChange={([value]) => updateBlockWeight(blockId, value)}
                            min={0}
                            max={100}
                            step={1}
                            disabled={state === 'running' || state === 'loading'}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Simulation Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Simulation Parameters</CardTitle>
          <CardDescription>
            Configure the Monte Carlo simulation settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="time-horizon">Time Horizon (trades)</Label>
              <Input
                id="time-horizon"
                type="number"
                value={timeHorizon}
                onChange={(e) => setTimeHorizon(parseInt(e.target.value) || 100)}
                min={10}
                max={500}
                disabled={state === 'running' || state === 'loading'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="num-sims">Number of Simulations</Label>
              <Input
                id="num-sims"
                type="number"
                value={numSimulations}
                onChange={(e) => setNumSimulations(parseInt(e.target.value) || 1000)}
                min={100}
                max={10000}
                step={100}
                disabled={state === 'running' || state === 'loading'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="initial-capital">Initial Capital ($)</Label>
              <Input
                id="initial-capital"
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(parseInt(e.target.value) || 100000)}
                min={1000}
                step={1000}
                disabled={state === 'running' || state === 'loading'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mc-seed">Random Seed (optional)</Label>
              <Input
                id="mc-seed"
                type="number"
                value={randomSeed ?? ""}
                onChange={(e) => setRandomSeed(e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="Leave empty for random"
                disabled={state === 'running' || state === 'loading'}
              />
            </div>
          </div>

          <Button
            onClick={runProjection}
            disabled={!canRun}
            className="w-full"
            size="lg"
          >
            {state === 'running' ? (
              <>
                <IconLoader2 size={18} className="mr-2 animate-spin" />
                Running Simulation...
              </>
            ) : state === 'loading' ? (
              <>
                <IconLoader2 size={18} className="mr-2 animate-spin" />
                Loading Trades...
              </>
            ) : (
              <>
                <IconChartArea size={18} className="mr-2" />
                Run Monte Carlo Simulation
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {mcResult && state === 'complete' && (
        <div className="space-y-6">
          {/* Statistics Card */}
          <Card>
            <CardHeader>
              <CardTitle>Simulation Results</CardTitle>
              <CardDescription>
                Based on {mcResult.parameters.numSimulations.toLocaleString()} simulations over {mcResult.parameters.simulationLength} trades
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Median Final Value</div>
                  <div className="text-2xl font-bold">
                    ${mcResult.statistics.medianFinalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Mean Final Value</div>
                  <div className="text-2xl font-bold">
                    ${mcResult.statistics.meanFinalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Probability of Profit</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {mcResult.statistics.probabilityOfProfit.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Mean Max Drawdown</div>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {mcResult.statistics.meanMaxDrawdown.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Median Return</div>
                  <div className="text-2xl font-bold">
                    {mcResult.statistics.medianTotalReturn.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">VaR (5%)</div>
                  <div className="text-2xl font-bold">
                    ${mcResult.statistics.valueAtRisk.p5.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Mean Sharpe</div>
                  <div className="text-2xl font-bold">
                    {mcResult.statistics.meanSharpeRatio.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Std Dev</div>
                  <div className="text-2xl font-bold">
                    ${mcResult.statistics.stdFinalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fan Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Projected Equity Curves</CardTitle>
              <CardDescription>Percentile bands showing range of possible outcomes</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartWrapper
                title="Projected Equity Curves"
                data={[
                  {
                    x: mcResult.percentiles.steps,
                    y: mcResult.percentiles.p95.map(r => initialCapital * (1 + r)),
                    type: 'scatter',
                    mode: 'lines',
                    name: '95th Percentile',
                    line: { color: '#22c55e', width: 2 },
                    fill: 'tonexty',
                    fillcolor: 'rgba(34, 197, 94, 0.1)',
                  },
                  {
                    x: mcResult.percentiles.steps,
                    y: mcResult.percentiles.p75.map(r => initialCapital * (1 + r)),
                    type: 'scatter',
                    mode: 'lines',
                    name: '75th Percentile',
                    line: { color: '#3b82f6', width: 2 },
                    fill: 'tonexty',
                    fillcolor: 'rgba(59, 130, 246, 0.2)',
                  },
                  {
                    x: mcResult.percentiles.steps,
                    y: mcResult.percentiles.p50.map(r => initialCapital * (1 + r)),
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Median (50th)',
                    line: { color: '#6366f1', width: 3 },
                  },
                  {
                    x: mcResult.percentiles.steps,
                    y: mcResult.percentiles.p25.map(r => initialCapital * (1 + r)),
                    type: 'scatter',
                    mode: 'lines',
                    name: '25th Percentile',
                    line: { color: '#f59e0b', width: 2 },
                    fill: 'tonexty',
                    fillcolor: 'rgba(245, 158, 11, 0.2)',
                  },
                  {
                    x: mcResult.percentiles.steps,
                    y: mcResult.percentiles.p5.map(r => initialCapital * (1 + r)),
                    type: 'scatter',
                    mode: 'lines',
                    name: '5th Percentile',
                    line: { color: '#ef4444', width: 2 },
                    fill: 'tonexty',
                    fillcolor: 'rgba(239, 68, 68, 0.1)',
                  },
                  {
                    x: [0, mcResult.percentiles.steps[mcResult.percentiles.steps.length - 1]],
                    y: [initialCapital, initialCapital],
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Initial Capital',
                    line: { color: '#94a3b8', width: 2, dash: 'dash' },
                  },
                ]}
                layout={{
                  xaxis: { title: { text: 'Trade Number' } },
                  yaxis: { title: { text: 'Portfolio Value ($)' } },
                  height: 400,
                  showlegend: true,
                  legend: { orientation: 'h', y: -0.2 },
                }}
                config={{ displayModeBar: true }}
              />
            </CardContent>
          </Card>

          {/* Distribution Histogram */}
          <Card>
            <CardHeader>
              <CardTitle>Final Value Distribution</CardTitle>
              <CardDescription>Distribution of ending portfolio values across all simulations</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartWrapper
                title="Final Value Distribution"
                data={[
                  {
                    x: mcResult.simulations.map(sim => sim.finalValue),
                    type: 'histogram',
                    name: 'Final Values',
                    marker: {
                      color: '#6366f1',
                      line: { color: '#4f46e5', width: 1 },
                    },
                    xbins: { size: (Math.max(...mcResult.simulations.map(s => s.finalValue)) - Math.min(...mcResult.simulations.map(s => s.finalValue))) / 50 },
                  } as Partial<Plotly.PlotData>,
                ]}
                layout={{
                  xaxis: { title: { text: 'Final Portfolio Value ($)' } },
                  yaxis: { title: { text: 'Frequency' } },
                  height: 400,
                  shapes: [
                    {
                      type: 'line',
                      x0: initialCapital,
                      x1: initialCapital,
                      y0: 0,
                      y1: 1,
                      yref: 'paper',
                      line: {
                        color: '#94a3b8',
                        width: 2,
                        dash: 'dash',
                      },
                    },
                    {
                      type: 'line',
                      x0: mcResult.statistics.medianFinalValue,
                      x1: mcResult.statistics.medianFinalValue,
                      y0: 0,
                      y1: 1,
                      yref: 'paper',
                      line: {
                        color: '#6366f1',
                        width: 3,
                      },
                    },
                  ],
                  annotations: [
                    {
                      x: initialCapital,
                      y: 1.05,
                      yref: 'paper',
                      text: 'Initial',
                      showarrow: false,
                      font: { color: '#94a3b8' },
                    },
                    {
                      x: mcResult.statistics.medianFinalValue,
                      y: 1.05,
                      yref: 'paper',
                      text: 'Median',
                      showarrow: false,
                      font: { color: '#6366f1' },
                    },
                  ],
                }}
                config={{ displayModeBar: true }}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
