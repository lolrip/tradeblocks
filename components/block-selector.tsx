"use client"

import { useState, useEffect } from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { useBlockStore } from "@/lib/stores/block-store"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface BlockSelectorProps {
  selectedBlockIds: string[]
  onSelectionChange: (blockIds: string[]) => void
  className?: string
}

export function BlockSelector({
  selectedBlockIds,
  onSelectionChange,
  className,
}: BlockSelectorProps) {
  const [open, setOpen] = useState(false)
  const blocks = useBlockStore((state) => state.blocks)
  const activeBlockId = useBlockStore((state) => state.activeBlockId)

  // Initialize with active block if nothing is selected
  useEffect(() => {
    if (selectedBlockIds.length === 0 && activeBlockId) {
      onSelectionChange([activeBlockId])
    }
  }, [activeBlockId, selectedBlockIds.length, onSelectionChange])

  const selectedBlocks = blocks.filter((block) =>
    selectedBlockIds.includes(block.id)
  )

  const toggleBlock = (blockId: string) => {
    if (selectedBlockIds.includes(blockId)) {
      // Don't allow deselecting if it's the last one
      if (selectedBlockIds.length === 1) return
      onSelectionChange(selectedBlockIds.filter((id) => id !== blockId))
    } else {
      onSelectionChange([...selectedBlockIds, blockId])
    }
  }

  const removeBlock = (blockId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    // Don't allow removing if it's the last one
    if (selectedBlockIds.length === 1) return
    onSelectionChange(selectedBlockIds.filter((id) => id !== blockId))
  }

  const selectAll = () => {
    onSelectionChange(blocks.map((block) => block.id))
    setOpen(false)
  }

  const clearAll = () => {
    // Keep at least one selected (the active block if available, or first block)
    const keepBlockId = activeBlockId || blocks[0]?.id
    if (keepBlockId) {
      onSelectionChange([keepBlockId])
    }
  }

  if (blocks.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        No blocks available. Create a block first.
      </div>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <span className="truncate">
              {selectedBlocks.length === 0
                ? "Select blocks to analyze..."
                : selectedBlocks.length === 1
                ? selectedBlocks[0].name
                : `${selectedBlocks.length} blocks selected`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search blocks..." />
            <CommandList>
              <CommandEmpty>No blocks found.</CommandEmpty>
              <CommandGroup>
                <div className="flex items-center justify-between px-2 py-1.5 border-b">
                  <span className="text-xs font-medium text-muted-foreground">
                    {selectedBlockIds.length} of {blocks.length} selected
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={selectAll}
                      className="h-7 text-xs"
                    >
                      Select All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAll}
                      className="h-7 text-xs"
                      disabled={selectedBlockIds.length === 1}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                {blocks.map((block) => {
                  const isSelected = selectedBlockIds.includes(block.id)
                  const isActive = block.id === activeBlockId
                  const isLastSelected = selectedBlockIds.length === 1 && isSelected

                  return (
                    <CommandItem
                      key={block.id}
                      value={block.id}
                      onSelect={() => toggleBlock(block.id)}
                      disabled={isLastSelected}
                      className={cn(
                        "flex items-center gap-2",
                        isLastSelected && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "opacity-50"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{block.name}</span>
                          {isActive && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0">
                              ACTIVE
                            </Badge>
                          )}
                        </div>
                        {block.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {block.description}
                          </p>
                        )}
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected Blocks as Badges */}
      {selectedBlocks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedBlocks.map((block) => (
            <Badge
              key={block.id}
              variant="secondary"
              className="text-xs px-2 py-1 flex items-center gap-1 max-w-[200px]"
            >
              <span className="truncate">{block.name}</span>
              {selectedBlockIds.length > 1 && (
                <button
                  onClick={(e) => removeBlock(block.id, e)}
                  className="hover:bg-muted rounded-full p-0.5 transition-colors"
                  aria-label={`Remove ${block.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
