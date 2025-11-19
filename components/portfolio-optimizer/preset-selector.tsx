/**
 * Preset Selector - Save and load optimization presets
 */

"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { IconBookmark, IconPlus, IconTrash } from "@tabler/icons-react"
import { useOptimizationPresets } from "@/lib/hooks/use-optimization-presets"
import type { OptimizationPreset, OptimizationMode } from "@/lib/types/portfolio-optimizer-types"
import type { HierarchicalConfig } from "@/lib/calculations/hierarchical-optimizer"

interface PresetSelectorProps {
  selectedBlockIds: string[]
  mode: OptimizationMode
  config: HierarchicalConfig
  totalCapital: number
  allowSingleStrategyBlocks: boolean
  onLoadPreset: (preset: OptimizationPreset) => void
  disabled?: boolean
}

export function PresetSelector({
  selectedBlockIds,
  mode,
  config,
  totalCapital,
  allowSingleStrategyBlocks,
  onLoadPreset,
  disabled = false,
}: PresetSelectorProps) {
  const { presets, createPreset, deletePreset, isLoading } = useOptimizationPresets()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newPresetName, setNewPresetName] = useState("")
  const [newPresetDescription, setNewPresetDescription] = useState("")
  const [selectedPresetId, setSelectedPresetId] = useState<string>("")

  const handleSavePreset = () => {
    if (!newPresetName.trim()) return

    createPreset({
      name: newPresetName.trim(),
      description: newPresetDescription.trim() || undefined,
      mode,
      selectedBlockIds,
      config,
      totalCapital,
      allowSingleStrategyBlocks,
    })

    setNewPresetName("")
    setNewPresetDescription("")
    setIsDialogOpen(false)
  }

  const handleLoadPreset = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId)
    if (preset) {
      setSelectedPresetId(presetId)
      onLoadPreset(preset)
    }
  }

  const handleDeletePreset = (presetId: string) => {
    deletePreset(presetId)
    if (selectedPresetId === presetId) {
      setSelectedPresetId("")
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <Select
          value={selectedPresetId}
          onValueChange={handleLoadPreset}
          disabled={disabled || isLoading || presets.length === 0}
        >
          <SelectTrigger className="w-full">
            <div className="flex items-center gap-2">
              <IconBookmark size={16} />
              <SelectValue placeholder="Load a saved preset..." />
            </div>
          </SelectTrigger>
          <SelectContent>
            {presets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                <div className="flex items-center justify-between gap-2 w-full">
                  <div className="flex-1">
                    <div className="font-medium">{preset.name}</div>
                    {preset.description && (
                      <div className="text-xs text-muted-foreground">{preset.description}</div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeletePreset(preset.id)
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" disabled={disabled || selectedBlockIds.length === 0}>
            <IconPlus size={16} className="mr-2" />
            Save Preset
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Optimization Preset</DialogTitle>
            <DialogDescription>
              Save your current block selection and settings for quick reuse
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="preset-name">Preset Name</Label>
              <Input
                id="preset-name"
                placeholder="e.g., All 2024 Strategies"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preset-description">Description (optional)</Label>
              <Textarea
                id="preset-description"
                placeholder="Notes about this configuration..."
                value={newPresetDescription}
                onChange={(e) => setNewPresetDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>This preset will save:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>{selectedBlockIds.length} selected blocks</li>
                <li>Optimization mode: {mode}</li>
                <li>Configuration settings</li>
                <li>Total capital: ${totalCapital.toLocaleString()}</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePreset} disabled={!newPresetName.trim()}>
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
