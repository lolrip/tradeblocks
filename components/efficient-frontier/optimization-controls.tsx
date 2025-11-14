"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { IconChevronDown, IconSettings, IconRefresh } from "@tabler/icons-react"
import type { PortfolioConstraints } from "@/lib/calculations/efficient-frontier"

interface OptimizationControlsProps {
  strategies: string[]
  selectedStrategies: string[]
  onSelectedStrategiesChange: (strategies: string[]) => void
  constraints: PortfolioConstraints
  onConstraintsChange: (constraints: PortfolioConstraints) => void
  numSimulations: number
  onNumSimulationsChange: (num: number) => void
  onRunOptimization: () => void
  onReset: () => void
  isOptimizing: boolean
  disabled?: boolean
}

export function OptimizationControls({
  strategies,
  selectedStrategies,
  onSelectedStrategiesChange,
  constraints,
  onConstraintsChange,
  numSimulations,
  onNumSimulationsChange,
  onRunOptimization,
  onReset,
  isOptimizing,
  disabled = false,
}: OptimizationControlsProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)

  const handleStrategyToggle = (strategy: string, checked: boolean) => {
    if (checked) {
      onSelectedStrategiesChange([...selectedStrategies, strategy])
    } else {
      onSelectedStrategiesChange(selectedStrategies.filter(s => s !== strategy))
    }
  }

  const handleSelectAll = () => {
    onSelectedStrategiesChange(strategies)
  }

  const handleDeselectAll = () => {
    onSelectedStrategiesChange([])
  }

  const canOptimize = selectedStrategies.length >= 2 && !isOptimizing && !disabled

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconSettings size={20} />
          Optimization Settings
        </CardTitle>
        <CardDescription>
          Configure strategies and constraints for portfolio optimization
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Strategy Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">
              Select Strategies ({selectedStrategies.length}/{strategies.length})
            </Label>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                disabled={disabled || isOptimizing}
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeselectAll}
                disabled={disabled || isOptimizing}
              >
                Clear
              </Button>
            </div>
          </div>

          {strategies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No strategies found. Please ensure your trades have strategy labels.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {strategies.map(strategy => (
                <div key={strategy} className="flex items-center space-x-2">
                  <Checkbox
                    id={`strategy-${strategy}`}
                    checked={selectedStrategies.includes(strategy)}
                    onCheckedChange={(checked) =>
                      handleStrategyToggle(strategy, checked as boolean)
                    }
                    disabled={disabled || isOptimizing}
                  />
                  <label
                    htmlFor={`strategy-${strategy}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {strategy}
                  </label>
                </div>
              ))}
            </div>
          )}

          {selectedStrategies.length < 2 && strategies.length >= 2 && (
            <p className="text-sm text-amber-600 dark:text-amber-500">
              ⚠️ Select at least 2 strategies to run optimization
            </p>
          )}
        </div>

        {/* Number of Simulations */}
        <div className="space-y-2">
          <Label htmlFor="num-simulations">
            Number of Simulations: <span className="font-mono">{numSimulations}</span>
          </Label>
          <Input
            id="num-simulations"
            type="number"
            min={100}
            max={10000}
            step={100}
            value={numSimulations}
            onChange={(e) => onNumSimulationsChange(parseInt(e.target.value) || 2000)}
            disabled={disabled || isOptimizing}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            More simulations = better frontier coverage (100-10,000 recommended)
          </p>
        </div>

        {/* Advanced Constraints */}
        <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              <span className="font-semibold">Advanced Constraints</span>
              <IconChevronDown
                size={16}
                className={`transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            {/* Min Weight */}
            <div className="space-y-2">
              <Label>
                Minimum Weight per Strategy:{' '}
                <span className="font-mono">{(constraints.minWeight * 100).toFixed(0)}%</span>
              </Label>
              <Slider
                value={[constraints.minWeight * 100]}
                onValueChange={([value]) =>
                  onConstraintsChange({ ...constraints, minWeight: value / 100 })
                }
                min={0}
                max={50}
                step={5}
                disabled={disabled || isOptimizing}
              />
              <p className="text-xs text-muted-foreground">
                Minimum allocation per strategy (0% = allow zero allocation)
              </p>
            </div>

            {/* Max Weight */}
            <div className="space-y-2">
              <Label>
                Maximum Weight per Strategy:{' '}
                <span className="font-mono">{(constraints.maxWeight * 100).toFixed(0)}%</span>
              </Label>
              <Slider
                value={[constraints.maxWeight * 100]}
                onValueChange={([value]) =>
                  onConstraintsChange({ ...constraints, maxWeight: value / 100 })
                }
                min={10}
                max={100}
                step={5}
                disabled={disabled || isOptimizing}
              />
              <p className="text-xs text-muted-foreground">
                Maximum allocation per strategy (prevents over-concentration)
              </p>
            </div>

            {/* Fully Invested Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="fully-invested"
                checked={constraints.fullyInvested}
                onCheckedChange={(checked) =>
                  onConstraintsChange({ ...constraints, fullyInvested: checked as boolean })
                }
                disabled={disabled || isOptimizing}
              />
              <label
                htmlFor="fully-invested"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Fully Invested (weights sum to 100%)
              </label>
            </div>

            {/* Allow Leverage Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="allow-leverage"
                checked={constraints.allowLeverage}
                onCheckedChange={(checked) =>
                  onConstraintsChange({ ...constraints, allowLeverage: checked as boolean })
                }
                disabled={disabled || isOptimizing || constraints.fullyInvested}
              />
              <label
                htmlFor="allow-leverage"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Allow Leverage (weights can sum &gt; 100%)
              </label>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            onClick={onRunOptimization}
            disabled={!canOptimize}
            className="flex-1"
            size="lg"
          >
            {isOptimizing ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Optimizing...
              </>
            ) : (
              'Run Optimization'
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onReset}
            disabled={disabled || isOptimizing}
            size="lg"
          >
            <IconRefresh size={18} className="mr-2" />
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
