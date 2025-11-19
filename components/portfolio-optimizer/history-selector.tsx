/**
 * History Selector - Load previous optimization runs
 */

"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IconHistory, IconTrash, IconClock } from "@tabler/icons-react"
import { useOptimizationHistory } from "@/lib/hooks/use-optimization-history"
import type { OptimizationHistoryEntry } from "@/lib/types/portfolio-optimizer-types"

interface HistorySelectorProps {
  onLoadHistory: (entry: OptimizationHistoryEntry) => void
  disabled?: boolean
}

export function HistorySelector({ onLoadHistory, disabled = false }: HistorySelectorProps) {
  const { history, deleteHistoryEntry, isLoading } = useOptimizationHistory()
  const [selectedHistoryId, setSelectedHistoryId] = React.useState<string>("")

  const handleLoadHistory = (historyId: string) => {
    const entry = history.find(h => h.id === historyId)
    if (entry) {
      setSelectedHistoryId(historyId)
      onLoadHistory(entry)
    }
  }

  const handleDeleteHistory = (historyId: string) => {
    deleteHistoryEntry(historyId)
    if (selectedHistoryId === historyId) {
      setSelectedHistoryId("")
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) {
      return `${diffMins}m ago`
    } else if (diffHours < 24) {
      return `${diffHours}h ago`
    } else if (diffDays < 7) {
      return `${diffDays}d ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <Select
          value={selectedHistoryId}
          onValueChange={handleLoadHistory}
          disabled={disabled || isLoading || history.length === 0}
        >
          <SelectTrigger className="w-full">
            <div className="flex items-center gap-2">
              <IconHistory size={16} />
              <SelectValue placeholder="Load previous optimization..." />
            </div>
          </SelectTrigger>
          <SelectContent>
            {history.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                <div className="flex items-center justify-between gap-4 w-full">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {entry.presetName || entry.selectedBlockNames.join(', ')}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        ({entry.mode})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <IconClock size={12} />
                      {formatTimestamp(entry.timestamp)}
                      <span>•</span>
                      <span>Sharpe: {entry.result.portfolioMetrics.sharpeRatio.toFixed(2)}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteHistory(entry.id)
                    }}
                  >
                    <IconTrash size={14} />
                  </Button>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
