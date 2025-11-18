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
import type { DateAlignmentMode } from "@/lib/calculations/block-efficient-frontier"

interface BlockOptimizationControlsProps {
  constraints: PortfolioConstraints
  onConstraintsChange: (constraints: PortfolioConstraints) => void
  dateAlignment: DateAlignmentMode
  onDateAlignmentChange: (mode: DateAlignmentMode) => void
  numSimulations: number
  onNumSimulationsChange: (num: number) => void
  totalCapital: number
  onTotalCapitalChange: (capital: number) => void
  riskFreeRate: number
  onRiskFreeRateChange: (rate: number) => void
  onRunOptimization: () => void
  onReset: () => void
  isOptimizing: boolean
  disabled?: boolean
  canOptimize: boolean
}

export function BlockOptimizationControls({
  constraints,
  onConstraintsChange,
  dateAlignment,
  onDateAlignmentChange,
  numSimulations,
  onNumSimulationsChange,
  totalCapital,
  onTotalCapitalChange,
  riskFreeRate,
  onRiskFreeRateChange,
  onRunOptimization,
  onReset,
  isOptimizing,
  disabled = false,
  canOptimize,
}: BlockOptimizationControlsProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconSettings size={20} />
          Optimization Settings
        </CardTitle>
        <CardDescription>
          Configure constraints and parameters for block-level portfolio optimization
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Date Alignment Strategy */}
        <div className="space-y-2">
          <Label htmlFor="date-alignment">Date Alignment Strategy</Label>
          <Select
            value={dateAlignment}
            onValueChange={(value) => onDateAlignmentChange(value as DateAlignmentMode)}
            disabled={disabled || isOptimizing}
          >
            <SelectTrigger id="date-alignment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overlapping">
                Overlapping Dates Only (Recommended)
              </SelectItem>
              <SelectItem value="zero-padding">
                All Dates (Zero-Padding)
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {dateAlignment === 'overlapping' ? (
              <>
                Uses only dates where all blocks have trades. More accurate correlations
                but requires overlapping trading periods.
              </>
            ) : (
              <>
                Uses all dates from all blocks, filling missing days with 0% return.
                Includes all data but may affect correlation accuracy.
              </>
            )}
          </p>
        </div>

        {/* Total Capital */}
        <div className="space-y-2">
          <Label htmlFor="total-capital">
            Total Portfolio Capital
          </Label>
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

        {/* Number of Simulations */}
        <div className="space-y-2">
          <Label htmlFor="num-simulations">
            Number of Simulations: <span className="font-mono">{numSimulations.toLocaleString()}</span>
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
            {/* Risk-Free Rate */}
            <div className="space-y-2">
              <Label htmlFor="risk-free-rate">
                Risk-Free Rate:{' '}
                <span className="font-mono">{riskFreeRate.toFixed(2)}%</span>
              </Label>
              <Input
                id="risk-free-rate"
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={riskFreeRate}
                onChange={(e) => onRiskFreeRateChange(parseFloat(e.target.value) || 2.0)}
                disabled={disabled || isOptimizing}
              />
              <p className="text-xs text-muted-foreground">
                Annual risk-free rate for Sharpe ratio calculation (typically 2-5%)
              </p>
            </div>

            {/* Min Weight */}
            <div className="space-y-2">
              <Label>
                Minimum Weight per Block:{' '}
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
                Minimum allocation per block (0% = allow zero allocation)
              </p>
            </div>

            {/* Max Weight */}
            <div className="space-y-2">
              <Label>
                Maximum Weight per Block:{' '}
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
                Maximum allocation per block (prevents over-concentration)
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
