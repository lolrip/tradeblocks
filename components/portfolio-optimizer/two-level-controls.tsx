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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IconChevronDown, IconSettings, IconRefresh } from "@tabler/icons-react"
import type { PortfolioConstraints } from "@/lib/calculations/efficient-frontier"
import type { OptimizationObjective, HierarchicalConfig, Level1Config, Level2Config } from "@/lib/calculations/hierarchical-optimizer"
import type { DateAlignmentMode } from "@/lib/calculations/block-efficient-frontier"

interface TwoLevelControlsProps {
  config: HierarchicalConfig
  onConfigChange: (config: HierarchicalConfig) => void
  totalCapital: number
  onTotalCapitalChange: (capital: number) => void
  onRunOptimization: () => void
  onReset: () => void
  isOptimizing: boolean
  disabled?: boolean
  canOptimize: boolean
}

export function TwoLevelControls({
  config,
  onConfigChange,
  totalCapital,
  onTotalCapitalChange,
  onRunOptimization,
  onReset,
  isOptimizing,
  disabled = false,
  canOptimize,
}: TwoLevelControlsProps) {
  const [isLevel1Open, setIsLevel1Open] = useState(true)
  const [isLevel2Open, setIsLevel2Open] = useState(true)

  const handleLevel1Change = (updates: Partial<Level1Config>) => {
    onConfigChange({
      ...config,
      level1: {
        ...config.level1,
        ...updates,
      },
    })
  }

  const handleLevel2Change = (updates: Partial<Level2Config>) => {
    onConfigChange({
      ...config,
      level2: {
        ...config.level2,
        ...updates,
      },
    })
  }

  const handleLevel1ConstraintsChange = (updates: Partial<PortfolioConstraints>) => {
    handleLevel1Change({
      constraints: {
        ...config.level1.constraints,
        ...updates,
      },
    })
  }

  const handleLevel2ConstraintsChange = (updates: Partial<PortfolioConstraints>) => {
    handleLevel2Change({
      blockConfig: {
        ...config.level2.blockConfig,
        constraints: {
          ...config.level2.blockConfig.constraints,
          ...updates,
        },
      },
    })
  }

  const handleLevel2DateAlignmentChange = (dateAlignment: DateAlignmentMode) => {
    handleLevel2Change({
      blockConfig: {
        ...config.level2.blockConfig,
        dateAlignment,
      },
    })
  }

  const handleLevel2RiskFreeRateChange = (riskFreeRate: number) => {
    handleLevel2Change({
      blockConfig: {
        ...config.level2.blockConfig,
        riskFreeRate,
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconSettings size={20} />
          Hierarchical Optimization Settings
        </CardTitle>
        <CardDescription>
          Configure two-level optimization: first within blocks (strategies), then across blocks (portfolio)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Total Capital */}
        <div className="space-y-2">
          <Label htmlFor="total-capital">Total Portfolio Capital</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              id="total-capital"
              type="number"
              min={1000}
              step={1000}
              value={totalCapital}
              onChange={(e) => onTotalCapitalChange(parseFloat(e.target.value) || 100000)}
              disabled={disabled || isOptimizing}
              className="pl-6"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Used to display dollar allocations alongside percentage weights
          </p>
        </div>

        {/* Level 1: Strategy Optimization Within Blocks */}
        <Collapsible open={isLevel1Open} onOpenChange={setIsLevel1Open}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between">
              <span className="font-semibold">📊 Level 1: Strategy Optimization (Within Blocks)</span>
              <IconChevronDown
                size={16}
                className={`transition-transform ${isLevel1Open ? 'rotate-180' : ''}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            {/* Optimization Objective */}
            <div className="space-y-2">
              <Label htmlFor="level1-objective">Optimization Objective</Label>
              <Select
                value={config.level1.objective}
                onValueChange={(value) => handleLevel1Change({ objective: value as OptimizationObjective })}
                disabled={disabled || isOptimizing}
              >
                <SelectTrigger id="level1-objective">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="max-sharpe">Maximize Sharpe Ratio (Recommended)</SelectItem>
                  <SelectItem value="min-volatility">Minimize Volatility (Conservative)</SelectItem>
                  <SelectItem value="max-return">Maximize Return (Aggressive)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Goal for optimizing strategies within each block
              </p>
            </div>

            {/* Number of Simulations */}
            <div className="space-y-2">
              <Label htmlFor="level1-simulations">
                Simulations per Block: <span className="font-mono">{config.level1.numSimulations.toLocaleString()}</span>
              </Label>
              <Input
                id="level1-simulations"
                type="number"
                min={100}
                max={5000}
                step={100}
                value={config.level1.numSimulations}
                onChange={(e) => handleLevel1Change({ numSimulations: parseInt(e.target.value) || 1000 })}
                disabled={disabled || isOptimizing}
              />
              <p className="text-xs text-muted-foreground">
                More simulations = better strategy allocation (100-5,000)
              </p>
            </div>

            {/* Min/Max Weights */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>
                  Min Weight per Strategy:{' '}
                  <span className="font-mono">{(config.level1.constraints.minWeight * 100).toFixed(0)}%</span>
                </Label>
                <Slider
                  value={[config.level1.constraints.minWeight * 100]}
                  onValueChange={([value]) => handleLevel1ConstraintsChange({ minWeight: value / 100 })}
                  min={0}
                  max={50}
                  step={5}
                  disabled={disabled || isOptimizing}
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Max Weight per Strategy:{' '}
                  <span className="font-mono">{(config.level1.constraints.maxWeight * 100).toFixed(0)}%</span>
                </Label>
                <Slider
                  value={[config.level1.constraints.maxWeight * 100]}
                  onValueChange={([value]) => handleLevel1ConstraintsChange({ maxWeight: value / 100 })}
                  min={10}
                  max={100}
                  step={5}
                  disabled={disabled || isOptimizing}
                />
              </div>
            </div>

            {/* Fully Invested */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="level1-fully-invested"
                checked={config.level1.constraints.fullyInvested}
                onCheckedChange={(checked) => handleLevel1ConstraintsChange({ fullyInvested: checked as boolean })}
                disabled={disabled || isOptimizing}
              />
              <label
                htmlFor="level1-fully-invested"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Fully Invested (strategy weights sum to 100% within each block)
              </label>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Level 2: Block Allocation Optimization */}
        <Collapsible open={isLevel2Open} onOpenChange={setIsLevel2Open}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between">
              <span className="font-semibold">🎯 Level 2: Block Allocation (Across Portfolio)</span>
              <IconChevronDown
                size={16}
                className={`transition-transform ${isLevel2Open ? 'rotate-180' : ''}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            {/* Date Alignment */}
            <div className="space-y-2">
              <Label htmlFor="level2-date-alignment">Date Alignment Strategy</Label>
              <Select
                value={config.level2.blockConfig.dateAlignment}
                onValueChange={(value) => handleLevel2DateAlignmentChange(value as DateAlignmentMode)}
                disabled={disabled || isOptimizing}
              >
                <SelectTrigger id="level2-date-alignment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="overlapping">Overlapping Dates Only (Recommended)</SelectItem>
                  <SelectItem value="zero-padding">All Dates (Zero-Padding)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {config.level2.blockConfig.dateAlignment === 'overlapping'
                  ? 'Uses only dates where all blocks have trades'
                  : 'Uses all dates, fills missing with 0% return'}
              </p>
            </div>

            {/* Number of Simulations */}
            <div className="space-y-2">
              <Label htmlFor="level2-simulations">
                Block Simulations: <span className="font-mono">{config.level2.numSimulations.toLocaleString()}</span>
              </Label>
              <Input
                id="level2-simulations"
                type="number"
                min={100}
                max={10000}
                step={100}
                value={config.level2.numSimulations}
                onChange={(e) => handleLevel2Change({ numSimulations: parseInt(e.target.value) || 2000 })}
                disabled={disabled || isOptimizing}
              />
              <p className="text-xs text-muted-foreground">
                More simulations = better block allocation (100-10,000)
              </p>
            </div>

            {/* Risk-Free Rate */}
            <div className="space-y-2">
              <Label htmlFor="level2-risk-free">
                Risk-Free Rate:{' '}
                <span className="font-mono">{config.level2.blockConfig.riskFreeRate.toFixed(2)}%</span>
              </Label>
              <Input
                id="level2-risk-free"
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={config.level2.blockConfig.riskFreeRate}
                onChange={(e) => handleLevel2RiskFreeRateChange(parseFloat(e.target.value) || 2.0)}
                disabled={disabled || isOptimizing}
              />
              <p className="text-xs text-muted-foreground">
                Annual risk-free rate for Sharpe ratio calculation
              </p>
            </div>

            {/* Min/Max Weights */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>
                  Min Weight per Block:{' '}
                  <span className="font-mono">{(config.level2.blockConfig.constraints.minWeight * 100).toFixed(0)}%</span>
                </Label>
                <Slider
                  value={[config.level2.blockConfig.constraints.minWeight * 100]}
                  onValueChange={([value]) => handleLevel2ConstraintsChange({ minWeight: value / 100 })}
                  min={0}
                  max={50}
                  step={5}
                  disabled={disabled || isOptimizing}
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Max Weight per Block:{' '}
                  <span className="font-mono">{(config.level2.blockConfig.constraints.maxWeight * 100).toFixed(0)}%</span>
                </Label>
                <Slider
                  value={[config.level2.blockConfig.constraints.maxWeight * 100]}
                  onValueChange={([value]) => handleLevel2ConstraintsChange({ maxWeight: value / 100 })}
                  min={10}
                  max={100}
                  step={5}
                  disabled={disabled || isOptimizing}
                />
              </div>
            </div>

            {/* Fully Invested */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="level2-fully-invested"
                checked={config.level2.blockConfig.constraints.fullyInvested}
                onCheckedChange={(checked) => handleLevel2ConstraintsChange({ fullyInvested: checked as boolean })}
                disabled={disabled || isOptimizing}
              />
              <label
                htmlFor="level2-fully-invested"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Fully Invested (block weights sum to 100%)
              </label>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            onClick={onRunOptimization}
            disabled={!canOptimize || disabled}
            className="flex-1"
            size="lg"
          >
            {isOptimizing ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Optimizing...
              </>
            ) : (
              'Run Hierarchical Optimization'
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
