/**
 * Utilities for exporting optimization results
 */

import type { HierarchicalResult, HierarchicalConfig } from '@/lib/calculations/hierarchical-optimizer'
import type { OptimizationExport, OptimizationMode } from '@/lib/types/portfolio-optimizer-types'

/**
 * Convert optimization result to export format
 */
export function prepareOptimizationExport(
  result: HierarchicalResult,
  mode: OptimizationMode,
  totalCapital: number,
  duration: number,
  config: HierarchicalConfig
): OptimizationExport {
  const blockWeights = result.optimizedBlocks.map(block => ({
    blockName: block.blockName,
    weight: result.blockWeights[block.blockName] || 0,
    capitalAllocation: (result.blockWeights[block.blockName] || 0) * totalCapital,
    sharpeRatio: block.metrics.sharpeRatio,
    annualizedReturn: block.metrics.annualizedReturn,
    annualizedVolatility: block.metrics.annualizedVolatility,
  }))

  const strategyWeights = result.optimizedBlocks.flatMap(block => {
    const blockWeight = result.blockWeights[block.blockName] || 0
    return Object.entries(block.strategyWeights).map(([strategyName, strategyWeight]) => ({
      blockName: block.blockName,
      strategyName,
      weightInBlock: strategyWeight,
      weightInPortfolio: blockWeight * strategyWeight,
      capitalAllocation: blockWeight * strategyWeight * totalCapital,
    }))
  })

  return {
    exportedAt: new Date().toISOString(),
    optimizationMode: mode,
    totalCapital,
    duration,
    config,
    portfolioMetrics: result.portfolioMetrics,
    blockWeights,
    strategyWeights,
  }
}

/**
 * Export optimization results as CSV
 */
export function exportOptimizationAsCSV(
  result: HierarchicalResult,
  totalCapital: number,
  filename: string = 'optimization-results.csv'
): void {
  const rows: string[] = []

  // Header
  rows.push('Type,Block,Strategy,Weight in Block (%),Weight in Portfolio (%),Capital Allocation ($)')

  // Add block rows with strategies
  result.optimizedBlocks.forEach(block => {
    const blockWeight = result.blockWeights[block.blockName] || 0

    Object.entries(block.strategyWeights).forEach(([strategyName, strategyWeight]) => {
      const portfolioWeight = blockWeight * strategyWeight
      const capital = portfolioWeight * totalCapital

      rows.push(
        `Strategy,"${block.blockName}","${strategyName}",${(strategyWeight * 100).toFixed(2)},${(portfolioWeight * 100).toFixed(2)},${capital.toFixed(2)}`
      )
    })

    // Add block summary row
    const blockCapital = blockWeight * totalCapital
    rows.push(
      `Block Summary,"${block.blockName}",-,-,${(blockWeight * 100).toFixed(2)},${blockCapital.toFixed(2)}`
    )

    // Empty row for readability
    rows.push('')
  })

  // Add portfolio totals
  rows.push('')
  rows.push('Portfolio Metrics')
  rows.push(`Total Capital,$${totalCapital.toFixed(2)}`)
  rows.push(`Annualized Return,${result.portfolioMetrics.annualizedReturn.toFixed(2)}%`)
  rows.push(`Annualized Volatility,${result.portfolioMetrics.annualizedVolatility.toFixed(2)}%`)
  rows.push(`Sharpe Ratio,${result.portfolioMetrics.sharpeRatio.toFixed(3)}`)

  // Create blob and download
  const csvContent = rows.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Export optimization results as JSON
 */
export function exportOptimizationAsJSON(
  exportData: OptimizationExport,
  filename: string = 'optimization-results.json'
): void {
  const jsonContent = JSON.stringify(exportData, null, 2)
  const blob = new Blob([jsonContent], { type: 'application/json' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Copy optimization results to clipboard (formatted for spreadsheets)
 */
export async function copyOptimizationToClipboard(
  result: HierarchicalResult,
  totalCapital: number
): Promise<boolean> {
  const rows: string[] = []

  // Header
  rows.push('Block\tStrategy\tWeight in Block (%)\tWeight in Portfolio (%)\tCapital Allocation ($)')

  // Add data rows
  result.optimizedBlocks.forEach(block => {
    const blockWeight = result.blockWeights[block.blockName] || 0

    Object.entries(block.strategyWeights).forEach(([strategyName, strategyWeight]) => {
      const portfolioWeight = blockWeight * strategyWeight
      const capital = portfolioWeight * totalCapital

      rows.push(
        `${block.blockName}\t${strategyName}\t${(strategyWeight * 100).toFixed(2)}\t${(portfolioWeight * 100).toFixed(2)}\t${capital.toFixed(2)}`
      )
    })
  })

  try {
    await navigator.clipboard.writeText(rows.join('\n'))
    return true
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    return false
  }
}
