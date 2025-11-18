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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react"
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

  return (
    <div className="space-y-6">
      {/* Portfolio Metrics Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Performance (Optimized)</CardTitle>
          <CardDescription>
            Performance metrics of the hierarchically optimized portfolio
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Annualized Return</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-500">
                {result.portfolioMetrics.annualizedReturn.toFixed(2)}%
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Annualized Volatility</p>
              <p className="text-3xl font-bold">
                {result.portfolioMetrics.annualizedVolatility.toFixed(2)}%
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Sharpe Ratio</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-500">
                {result.portfolioMetrics.sharpeRatio.toFixed(3)}
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
                  <TableHead className="text-right">Capital Allocation</TableHead>
                  <TableHead className="text-right">Sharpe Ratio</TableHead>
                  <TableHead className="text-right">Return</TableHead>
                  <TableHead className="text-right">Volatility</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.optimizedBlocks.map((block) => {
                  const blockWeight = result.blockWeights[block.blockName] || 0
                  const blockCapital = blockWeight * totalCapital
                  const isExpanded = expandedBlocks.has(block.blockName)

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
                        Object.entries(block.strategyWeights).map(([strategyName, strategyWeight]) => {
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
                  <TableHead className="text-right">Capital Allocation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.optimizedBlocks.map((block) => {
                  const blockWeight = result.blockWeights[block.blockName] || 0

                  return Object.entries(block.strategyWeights).map(([strategyName, strategyWeight]) => {
                    const totalWeight = blockWeight * strategyWeight
                    const capital = totalWeight * totalCapital

                    return (
                      <TableRow key={`${block.blockId}-${strategyName}`}>
                        <TableCell className="font-medium">{strategyName}</TableCell>
                        <TableCell className="text-muted-foreground">{block.blockName}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatPercent(totalWeight)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(capital)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
