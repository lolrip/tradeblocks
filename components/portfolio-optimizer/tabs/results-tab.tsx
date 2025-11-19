/**
 * Results Tab - Shows optimization results with export functionality
 */

"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { IconCopy, IconFileTypeCsv } from "@tabler/icons-react"
import { HierarchicalResults } from "@/components/portfolio-optimizer/hierarchical-results"
import type { HierarchicalResult } from "@/lib/calculations/hierarchical-optimizer"
import {
  exportOptimizationAsCSV,
  copyOptimizationToClipboard,
} from "@/lib/utils/optimization-export"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface ResultsTabProps {
  result: HierarchicalResult | null
  totalCapital: number
  duration: number
}

export function ResultsTab({ result, totalCapital, duration }: ResultsTabProps) {
  const [copySuccess, setCopySuccess] = React.useState<boolean | null>(null)

  if (!result) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">No results yet</p>
          <p className="text-sm">Run an optimization to see results here</p>
        </div>
      </div>
    )
  }

  const handleExportCSV = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const filename = `portfolio-optimization-${timestamp}.csv`
    exportOptimizationAsCSV(result, totalCapital, filename)
  }

  const handleCopyToClipboard = async () => {
    const success = await copyOptimizationToClipboard(result, totalCapital)
    setCopySuccess(success)
    setTimeout(() => setCopySuccess(null), 3000)
  }

  return (
    <div className="space-y-4">
      {/* Copy Success Alert */}
      {copySuccess !== null && (
        <Alert variant={copySuccess ? "default" : "destructive"}>
          <AlertDescription>
            {copySuccess
              ? "✓ Copied to clipboard! You can paste into Google Sheets or Excel."
              : "Failed to copy to clipboard. Please try exporting as CSV instead."}
          </AlertDescription>
        </Alert>
      )}

      {/* Export Actions */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Optimization completed in {(duration / 1000).toFixed(2)}s
          {' • '}
          {result.optimizedBlocks.length} blocks
          {' • '}
          {result.optimizedBlocks.reduce((sum, b) => sum + Object.keys(b.strategyWeights).length, 0)} strategies
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyToClipboard}
          >
            <IconCopy size={16} className="mr-2" />
            Copy to Clipboard
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
          >
            <IconFileTypeCsv size={16} className="mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Results Display */}
      <HierarchicalResults
        result={result}
        totalCapital={totalCapital}
      />
    </div>
  )
}
