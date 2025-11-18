"use client"

import React, { useState, useEffect } from "react"
import { ProcessedBlock } from "@/lib/models/block"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { IconLayoutGrid } from "@tabler/icons-react"
import { getStrategiesByBlock } from "@/lib/db/trades-store"

interface BlockSelectionGridProps {
  blocks: ProcessedBlock[]
  selectedBlockIds: string[]
  onSelectedBlocksChange: (blockIds: string[]) => void
  disabled?: boolean
}

export function BlockSelectionGrid({
  blocks,
  selectedBlockIds,
  onSelectedBlocksChange,
  disabled = false,
}: BlockSelectionGridProps) {
  // Track strategy counts for each block
  const [strategyCounts, setStrategyCounts] = useState<Record<string, number>>({})
  const [loadingStrategies, setLoadingStrategies] = useState(true)

  // Load strategy counts for all blocks
  useEffect(() => {
    const loadStrategyCounts = async () => {
      setLoadingStrategies(true)
      const counts: Record<string, number> = {}

      await Promise.all(
        blocks.map(async (block) => {
          try {
            const strategies = await getStrategiesByBlock(block.id)
            counts[block.id] = strategies.length
          } catch (error) {
            console.error(`Failed to load strategies for block ${block.id}:`, error)
            counts[block.id] = 0
          }
        })
      )

      setStrategyCounts(counts)
      setLoadingStrategies(false)
    }

    if (blocks.length > 0) {
      loadStrategyCounts()
    }
  }, [blocks])

  const handleBlockToggle = (blockId: string, checked: boolean) => {
    if (checked) {
      onSelectedBlocksChange([...selectedBlockIds, blockId])
    } else {
      onSelectedBlocksChange(selectedBlockIds.filter(id => id !== blockId))
    }
  }

  const handleSelectAll = () => {
    onSelectedBlocksChange(blocks.map(b => b.id))
  }

  const handleDeselectAll = () => {
    onSelectedBlocksChange([])
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`
  }

  const getDateRange = (block: ProcessedBlock) => {
    // For now, use created date as placeholder
    // In a full implementation, this would come from trade data
    const created = new Date(block.created).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
    return created
  }

  const renderStrategyBadge = (blockId: string) => {
    const count = strategyCounts[blockId]

    if (loadingStrategies || count === undefined) {
      return <span className="text-xs text-muted-foreground">Loading...</span>
    }

    if (count === 0) {
      return (
        <Badge variant="outline" className="text-red-600 border-red-600">
          ⚠ No strategies
        </Badge>
      )
    }

    if (count === 1) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                ⚠ 1 strategy (locked)
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                Single-strategy blocks will be automatically locked at 100% weight.
                They skip Level 1 optimization but are included in Level 2 block allocation.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    return (
      <Badge variant="outline" className="text-green-600 border-green-600">
        ✓ {count} {count === 2 ? 'strategies' : 'strategies'}
      </Badge>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconLayoutGrid size={20} />
          Select Blocks for Optimization
        </CardTitle>
        <CardDescription>
          Choose 2 or more blocks to analyze optimal portfolio allocation across your strategies
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold">{selectedBlockIds.length}</span> of{' '}
            <span className="font-semibold">{blocks.length}</span> blocks selected
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              disabled={disabled}
            >
              Select All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeselectAll}
              disabled={disabled}
            >
              Clear
            </Button>
          </div>
        </div>

        {blocks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No blocks found. Please upload trading data to get started.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Block Name</TableHead>
                  <TableHead className="text-right">Total P&L</TableHead>
                  <TableHead className="text-right">Sharpe Ratio</TableHead>
                  <TableHead className="text-right">Win Rate</TableHead>
                  <TableHead className="text-right">Total Trades</TableHead>
                  <TableHead>Strategies</TableHead>
                  <TableHead>Date Range</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blocks.map(block => {
                  const isSelected = selectedBlockIds.includes(block.id)
                  const stats = block.portfolioStats

                  return (
                    <TableRow
                      key={block.id}
                      className={isSelected ? 'bg-muted/50' : ''}
                    >
                      <TableCell>
                        <Checkbox
                          id={`block-${block.id}`}
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            handleBlockToggle(block.id, checked as boolean)
                          }
                          disabled={disabled}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <label
                            htmlFor={`block-${block.id}`}
                            className="font-medium cursor-pointer hover:underline"
                          >
                            {block.name}
                          </label>
                          {block.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {block.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {stats?.totalPl !== undefined ? (
                          <span
                            className={
                              stats.totalPl >= 0
                                ? 'text-green-600 dark:text-green-500'
                                : 'text-red-600 dark:text-red-500'
                            }
                          >
                            {formatCurrency(stats.totalPl)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {stats?.sharpeRatio !== undefined ? (
                          stats.sharpeRatio.toFixed(2)
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {stats?.winRate !== undefined ? (
                          formatPercent(stats.winRate * 100)
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {stats?.totalTrades !== undefined ? (
                          stats.totalTrades.toLocaleString()
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {renderStrategyBadge(block.id)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {getDateRange(block)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {selectedBlockIds.length > 0 && selectedBlockIds.length < 2 && (
          <p className="text-sm text-amber-600 dark:text-amber-500">
            ⚠️ Select at least 2 blocks to run optimization
          </p>
        )}
      </CardContent>
    </Card>
  )
}
