"use client"

import React, { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { IconChevronDown, IconChevronRight, IconAlertTriangle } from "@tabler/icons-react"
import type { HierarchicalResult } from "@/lib/calculations/hierarchical-optimizer"

interface HierarchicalResultsProps {
  result: HierarchicalResult
  totalCapital: number
}

export function HierarchicalResults({
  result,
  totalCapital,
}: HierarchicalResultsProps) {
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set())
  const [showFiltered, setShowFiltered] = useState(true)

  const toggleBlock = (blockName: string) => {
    setExpandedBlocks(prev => {
      const next = new Set(prev)
      if (next.has(blockName)) {
        next.delete(blockName)
      } else {
        next.add(blockName)
      }
      return next
    })
  }

  const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`
  const formatCurrency = (value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`

  // Determine which metrics and allocation to display
  const hasFilteredResults = result.filteredResult !== undefined
  const displayMetrics = showFiltered && hasFilteredResults
    ? result.filteredResult!.portfolioMetrics
    : result.portfolioMetrics
  const displayAllocation = showFiltered && hasFilteredResults
    ? result.filteredResult!.combinedAllocation
    : result.combinedAllocation

  // Calculate block weights from displayAllocation
  const displayBlockWeights: Record<string, number> = {}
  for (const [blockName, strategies] of Object.entries(displayAllocation)) {
    displayBlockWeights[blockName] = Object.values(strategies).reduce((sum, w) => sum + w, 0)
  }

  // Calculate strategy weights within blocks from displayAllocation
  const displayStrategyWeights: Record<string, Record<string, number>> = {}
  for (const [blockName, strategies] of Object.entries(displayAllocation)) {
    displayStrategyWeights[blockName] = {}
    const blockWeight = displayBlockWeights[blockName]
    if (blockWeight > 0) {
      for (const [strategyName, weight] of Object.entries(strategies)) {
        displayStrategyWeights[blockName][strategyName] = weight / blockWeight
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Filter Toggle - Only show if filtering is available */}
      {hasFilteredResults && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="filter-toggle" className="text-base font-semibold">
                    Show tradeable allocations only
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <IconAlertTriangle size={16} className="text-amber-600" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Filters out strategies where allocated capital is below the minimum margin requirement.
                          Filtered weight is redistributed proportionally to remaining strategies.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-sm text-muted-foreground">
                  {showFiltered
                    ? `Showing ${result.filteredResult!.filteredStrategies.length} untradeable strategies filtered out`
                    : 'Showing all strategies (including those below minimum position size)'}
                </p>
              </div>
              <Switch
                id="filter-toggle"
                checked={showFiltered}
                onCheckedChange={setShowFiltered}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparison Metrics - Show when filtering is active */}
      {hasFilteredResults && showFiltered && (
        <Card>
          <CardHeader>
            <CardTitle>Theoretical vs Practical Returns</CardTitle>
            <CardDescription>
              Comparison of optimization with all strategies vs tradeable strategies only
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Theoretical */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">Theoretical (All Strategies)</h3>
                  <Badge variant="outline">Includes Untradeable</Badge>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Annualized Return</span>
                    <span className="font-mono font-semibold text-green-600 dark:text-green-500">
                      {result.portfolioMetrics.annualizedReturn.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Annualized Volatility</span>
                    <span className="font-mono font-semibold">
                      {result.portfolioMetrics.annualizedVolatility.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Sharpe Ratio</span>
                    <span className="font-mono font-semibold text-blue-600 dark:text-blue-500">
                      {result.portfolioMetrics.sharpeRatio.toFixed(3)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Strategies</span>
                    <span className="font-mono font-semibold">
                      {Object.values(result.combinedAllocation).reduce((sum, strategies) =>
                        sum + Object.keys(strategies).length, 0
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Practical */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">Practical (Tradeable Only)</h3>
                  <Badge>Realistic</Badge>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Annualized Return</span>
                    <span className="font-mono font-semibold text-green-600 dark:text-green-500">
                      {result.filteredResult!.portfolioMetrics.annualizedReturn.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Annualized Volatility</span>
                    <span className="font-mono font-semibold">
                      {result.filteredResult!.portfolioMetrics.annualizedVolatility.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Sharpe Ratio</span>
                    <span className="font-mono font-semibold text-blue-600 dark:text-blue-500">
                      {result.filteredResult!.portfolioMetrics.sharpeRatio.toFixed(3)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Tradeable Strategies</span>
                    <span className="font-mono font-semibold">
                      {Object.values(result.filteredResult!.combinedAllocation).reduce((sum, strategies) =>
                        sum + Object.keys(strategies).length, 0
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Filtered Out</span>
                    <span className="font-mono font-semibold text-amber-600">
                      {result.filteredResult!.filteredStrategies.length} ({(result.filteredResult!.totalFilteredWeight * 100).toFixed(1)}% weight)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtered Strategies Warning */}
      {hasFilteredResults && showFiltered && result.filteredResult!.filteredStrategies.length > 0 && (
        <Alert>
          <IconAlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-semibold mb-2">
              {result.filteredResult!.filteredStrategies.length} strategies filtered out due to minimum margin requirements
            </p>
            <div className="space-y-2 text-sm">
              {result.filteredResult!.filteredStrategies.map((filtered, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <span>
                    <strong>{filtered.blockName}</strong> / {filtered.strategyName}
                  </span>
                  <span className="text-muted-foreground">
                    Allocated: {formatCurrency(filtered.allocatedCapital)} •
                    Required: {formatCurrency(filtered.requiredMargin)}
                  </span>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Portfolio Metrics Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Portfolio Performance (Optimized)</CardTitle>
              <CardDescription>
                Performance metrics of the hierarchically optimized portfolio
              </CardDescription>
            </div>
            {hasFilteredResults && (
              <Badge variant={showFiltered ? "default" : "outline"}>
                {showFiltered ? "Tradeable Only" : "All Strategies"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Annualized Return</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-500">
                {displayMetrics.annualizedReturn.toFixed(2)}%
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Annualized Volatility</p>
              <p className="text-3xl font-bold">
                {displayMetrics.annualizedVolatility.toFixed(2)}%
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Sharpe Ratio</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-500">
                {displayMetrics.sharpeRatio.toFixed(3)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hierarchical Allocation Table */}
      <Card>
        <CardHeader>
          <CardTitle>Hierarchical Allocation</CardTitle>
          <CardDescription>
            Block allocation with expandable strategy weights. Click a block to see its internal strategy allocation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Block / Strategy</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted">Capital Allocation</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">
                            This represents <strong>portfolio weight in dollars</strong>, not deployable capital or margin requirements.
                            For example, $92 means this strategy contributes 0.092% to your portfolio&apos;s returns, not that you need $92 to trade it.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="text-right">Sharpe Ratio</TableHead>
                  <TableHead className="text-right">Return</TableHead>
                  <TableHead className="text-right">Volatility</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.optimizedBlocks.map((block) => {
                  const blockWeight = displayBlockWeights[block.blockName] || 0
                  const blockCapital = blockWeight * totalCapital
                  const isExpanded = expandedBlocks.has(block.blockName)
                  const strategyWeights = displayStrategyWeights[block.blockName] || {}

                  // Skip blocks with no weight (completely filtered out)
                  if (blockWeight === 0) {
                    return null
                  }

                  return (
                    <React.Fragment key={block.blockId}>
                      {/* Block Row */}
                      <TableRow className="bg-muted/50 hover:bg-muted/70 font-semibold">
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleBlock(block.blockName)}
                            className="h-6 w-6 p-0"
                          >
                            {isExpanded ? (
                              <IconChevronDown size={16} />
                            ) : (
                              <IconChevronRight size={16} />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="font-bold">
                          <div className="flex items-center gap-2">
                            {block.blockName}
                            {block.isLocked && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="text-amber-600 border-amber-600">
                                      🔒 Locked
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">
                                      Single-strategy block automatically locked at 100% weight.
                                      Skipped Level 1 optimization.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatPercent(blockWeight)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(blockCapital)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {block.metrics.sharpeRatio.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-600 dark:text-green-500">
                          {block.metrics.annualizedReturn.toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {block.metrics.annualizedVolatility.toFixed(2)}%
                        </TableCell>
                      </TableRow>

                      {/* Strategy Rows (shown when expanded) */}
                      {isExpanded &&
                        Object.entries(strategyWeights).map(([strategyName, strategyWeight]) => {
                          const combinedWeight = blockWeight * strategyWeight
                          const strategyCapital = combinedWeight * totalCapital

                          return (
                            <TableRow key={`${block.blockId}-${strategyName}`} className="border-l-4 border-l-primary/30">
                              <TableCell></TableCell>
                              <TableCell className="pl-8 text-muted-foreground">
                                ↳ {strategyName}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="space-y-1">
                                  <div className="font-mono text-xs text-muted-foreground">
                                    {formatPercent(strategyWeight)} of block
                                  </div>
                                  <div className="font-mono font-semibold">
                                    {formatPercent(combinedWeight)} total
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatCurrency(strategyCapital)}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">-</TableCell>
                              <TableCell className="text-right text-muted-foreground">-</TableCell>
                              <TableCell className="text-right text-muted-foreground">-</TableCell>
                            </TableRow>
                          )
                        })}
                    </React.Fragment>
                  )
                })}

                {/* Total Row */}
                <TableRow className="bg-primary/10 font-bold border-t-2">
                  <TableCell></TableCell>
                  <TableCell>Total Portfolio</TableCell>
                  <TableCell className="text-right font-mono">100.00%</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(totalCapital)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {result.portfolioMetrics.sharpeRatio.toFixed(3)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-green-600 dark:text-green-500">
                    {result.portfolioMetrics.annualizedReturn.toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {result.portfolioMetrics.annualizedVolatility.toFixed(2)}%
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 text-sm text-muted-foreground">
            <p className="font-semibold">How to read this table:</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>
                <strong>Block rows</strong> (bold) show the optimized allocation to each trading portfolio
              </li>
              <li>
                <strong>Strategy rows</strong> (indented with ↳) show the optimized strategy weights within each block
              </li>
              <li>
                <strong>Weight column</strong> for strategies shows both within-block % and total portfolio %
              </li>
              <li>
                Click the chevron (▶) to expand/collapse strategy details for each block
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Flat Allocation View */}
      <Card>
        <CardHeader>
          <CardTitle>Flat Allocation Summary</CardTitle>
          <CardDescription>
            All strategies with their final weights in the overall portfolio
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead className="text-right">Total Weight</TableHead>
                  <TableHead className="text-right">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted">Capital Allocation</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">
                            This represents <strong>portfolio weight in dollars</strong>, not deployable capital or margin requirements.
                            For example, $92 means this strategy contributes 0.092% to your portfolio&apos;s returns, not that you need $92 to trade it.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(displayAllocation).flatMap(([blockName, strategies]) =>
                  Object.entries(strategies).map(([strategyName, weight]) => {
                    const capital = weight * totalCapital

                    return (
                      <TableRow key={`${blockName}-${strategyName}`}>
                        <TableCell className="font-medium">{strategyName}</TableCell>
                        <TableCell className="text-muted-foreground">{blockName}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatPercent(weight)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(capital)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
