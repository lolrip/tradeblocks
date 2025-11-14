"use client"

import React, { useState, useMemo } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { IconDownload, IconCalculator } from "@tabler/icons-react"
import type { PortfolioResult } from "@/lib/calculations/efficient-frontier"

interface AllocationDisplayProps {
  portfolio: PortfolioResult | null
  className?: string
}

export function AllocationDisplay({ portfolio, className }: AllocationDisplayProps) {
  const [capital, setCapital] = useState<number>(100000)
  const [showLotCalculator, setShowLotCalculator] = useState(false)

  // Sort weights by value (descending)
  const sortedWeights = useMemo(() => {
    if (!portfolio) return []
    return Object.entries(portfolio.weights)
      .sort((a, b) => b[1] - a[1])
      .map(([strategy, weight]) => ({ strategy, weight }))
  }, [portfolio])

  // Calculate cumulative weights for stacked bar
  const cumulativeWeights = useMemo(() => {
    if (sortedWeights.length === 0) return []
    let cumulative = 0
    return sortedWeights.map(({ strategy, weight }) => {
      const start = cumulative
      cumulative += weight
      return { strategy, weight, start }
    })
  }, [sortedWeights])

  // Export allocation to CSV
  const handleExport = () => {
    if (!portfolio) return

    const csvLines = [
      'Strategy,Weight (%),Weight (Decimal)',
      ...sortedWeights.map(({ strategy, weight }) =>
        `"${strategy}",${(weight * 100).toFixed(2)},${weight.toFixed(6)}`
      ),
      '',
      'Portfolio Metrics',
      `Annualized Return,${portfolio.annualizedReturn.toFixed(2)}%`,
      `Annualized Volatility,${portfolio.annualizedVolatility.toFixed(2)}%`,
      `Sharpe Ratio,${portfolio.sharpeRatio.toFixed(3)}`,
    ]

    const csv = csvLines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'portfolio-allocation.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!portfolio) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Portfolio Allocation</CardTitle>
          <CardDescription>
            Click a point on the chart to view its strategy allocation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            No portfolio selected
          </div>
        </CardContent>
      </Card>
    )
  }

  // Color palette for strategies
  const colors = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
  ]

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Portfolio Allocation
              {portfolio.isEfficient && (
                <span className="text-sm font-normal text-amber-500">⭐ Efficient</span>
              )}
            </CardTitle>
            <CardDescription>
              Strategy weights and performance metrics for selected portfolio
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLotCalculator(!showLotCalculator)}
            >
              <IconCalculator size={16} className="mr-2" />
              {showLotCalculator ? 'Hide' : 'Show'} Calculator
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <IconDownload size={16} className="mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Portfolio Metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Annualized Return</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-500">
              {portfolio.annualizedReturn.toFixed(2)}%
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Annualized Volatility</p>
            <p className="text-2xl font-bold">
              {portfolio.annualizedVolatility.toFixed(2)}%
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Sharpe Ratio</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-500">
              {portfolio.sharpeRatio.toFixed(3)}
            </p>
          </div>
        </div>

        {/* Stacked Bar Chart */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Weight Distribution</Label>
          <div className="relative h-12 w-full bg-muted rounded-md overflow-hidden">
            {cumulativeWeights.map(({ strategy, weight, start }, index) => (
              <div
                key={strategy}
                className="absolute h-full transition-all hover:opacity-80 cursor-pointer"
                style={{
                  left: `${start * 100}%`,
                  width: `${weight * 100}%`,
                  backgroundColor: colors[index % colors.length],
                }}
                title={`${strategy}: ${(weight * 100).toFixed(1)}%`}
              />
            ))}
          </div>
        </div>

        {/* Weights Table */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Strategy Weights</Label>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead className="text-right">Weight (%)</TableHead>
                  {showLotCalculator && (
                    <TableHead className="text-right">Capital Allocation</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedWeights.map(({ strategy, weight }, index) => (
                  <TableRow key={strategy}>
                    <TableCell>
                      <div
                        className="w-4 h-4 rounded-sm"
                        style={{ backgroundColor: colors[index % colors.length] }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{strategy}</TableCell>
                    <TableCell className="text-right font-mono">
                      {(weight * 100).toFixed(2)}%
                    </TableCell>
                    {showLotCalculator && (
                      <TableCell className="text-right font-mono">
                        ${(capital * weight).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Lot Calculator */}
        {showLotCalculator && (
          <div className="space-y-3 p-4 rounded-lg bg-muted/50 border">
            <Label className="text-sm font-semibold">Capital Allocation Calculator</Label>
            <div className="flex items-center gap-4">
              <Label htmlFor="capital" className="text-sm whitespace-nowrap">
                Total Capital:
              </Label>
              <Input
                id="capital"
                type="number"
                min={0}
                step={1000}
                value={capital}
                onChange={(e) => setCapital(parseFloat(e.target.value) || 0)}
                className="w-full"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter your total capital to see how much to allocate to each strategy.
              Use this as a starting point - actual position sizing should consider your strategy-specific
              margin requirements and risk tolerance.
            </p>
          </div>
        )}

        {/* Info Note */}
        <div className="text-xs text-muted-foreground p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
          <p className="font-semibold mb-1">💡 Implementation Note</p>
          <p>
            These weights represent the optimal allocation percentages across strategies.
            In practice, adjust position sizes within each strategy to match these target percentages
            while respecting margin requirements and risk limits.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
