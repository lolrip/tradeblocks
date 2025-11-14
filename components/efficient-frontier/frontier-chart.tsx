"use client"

import React, { useMemo } from "react"
import { ChartWrapper } from "../performance-charts/chart-wrapper"
import type { Layout, PlotData } from "plotly.js"
import type { PortfolioResult } from "@/lib/calculations/efficient-frontier"

interface FrontierChartProps {
  portfolios: PortfolioResult[]
  efficientFrontier: PortfolioResult[]
  selectedPortfolio?: PortfolioResult
  className?: string
}

interface TooltipData {
  return: string
  volatility: string
  sharpe: string
  weights: string
  isEfficient: boolean
}

/**
 * Scatter chart showing the efficient frontier
 * X-axis: Annualized Volatility
 * Y-axis: Annualized Return
 * Color: Sharpe Ratio (gradient)
 */
export function FrontierChart({
  portfolios,
  efficientFrontier,
  selectedPortfolio,
  className,
}: FrontierChartProps) {
  const { plotData, layout } = useMemo(() => {
    if (portfolios.length === 0) {
      return { plotData: [], layout: {} }
    }

    // Separate efficient and non-efficient portfolios
    const efficientSet = new Set(efficientFrontier.map(p => JSON.stringify(p.weights)))
    const regularPortfolios = portfolios.filter(
      p => !efficientSet.has(JSON.stringify(p.weights))
    )

    // Calculate Sharpe ratio range for color scaling
    const sharpeValues = portfolios.map(p => p.sharpeRatio)
    const minSharpe = Math.min(...sharpeValues)
    const maxSharpe = Math.max(...sharpeValues)

    // Helper to format weights for tooltip
    const formatWeights = (weights: Record<string, number>): string => {
      return Object.entries(weights)
        .sort((a, b) => b[1] - a[1]) // Sort by weight descending
        .map(([strategy, weight]) => `${strategy}: ${(weight * 100).toFixed(1)}%`)
        .join('<br>')
    }

    // Helper to create custom data for tooltips
    const toCustomData = (portfolio: PortfolioResult): TooltipData => ({
      return: portfolio.annualizedReturn.toFixed(2) + '%',
      volatility: portfolio.annualizedVolatility.toFixed(2) + '%',
      sharpe: portfolio.sharpeRatio.toFixed(3),
      weights: formatWeights(portfolio.weights),
      isEfficient: efficientSet.has(JSON.stringify(portfolio.weights)),
    })

    const traces: Partial<PlotData>[] = []

    // Regular portfolios (smaller, colored by Sharpe)
    if (regularPortfolios.length > 0) {
      traces.push({
        x: regularPortfolios.map(p => p.annualizedVolatility),
        y: regularPortfolios.map(p => p.annualizedReturn),
        type: "scatter",
        mode: "markers",
        name: "Simulated Portfolios",
        marker: {
          size: 6,
          color: regularPortfolios.map(p => p.sharpeRatio),
          colorscale: [
            [0, '#ef4444'], // Red (low Sharpe)
            [0.5, '#eab308'], // Yellow (medium Sharpe)
            [1, '#22c55e'], // Green (high Sharpe)
          ],
          cmin: minSharpe,
          cmax: maxSharpe,
          colorbar: {
            title: {
              text: 'Sharpe<br>Ratio',
            },
            thickness: 15,
            len: 0.7,
          },
          opacity: 0.6,
          line: {
            width: 0,
          },
        },
        customdata: regularPortfolios.map(toCustomData) as unknown as PlotData["customdata"],
        hovertemplate:
          "<b>Simulated Portfolio</b><br>" +
          "Return: %{customdata.return}<br>" +
          "Volatility: %{customdata.volatility}<br>" +
          "Sharpe Ratio: %{customdata.sharpe}<br>" +
          "<br><b>Portfolio Weights:</b><br>" +
          "%{customdata.weights}" +
          "<extra></extra>",
      })
    }

    // Efficient frontier points (larger, highlighted)
    if (efficientFrontier.length > 0) {
      traces.push({
        x: efficientFrontier.map(p => p.annualizedVolatility),
        y: efficientFrontier.map(p => p.annualizedReturn),
        type: "scatter",
        mode: "markers",
        name: "Efficient Frontier",
        marker: {
          size: 10,
          color: efficientFrontier.map(p => p.sharpeRatio),
          colorscale: [
            [0, '#ef4444'],
            [0.5, '#eab308'],
            [1, '#22c55e'],
          ],
          cmin: minSharpe,
          cmax: maxSharpe,
          showscale: false, // Don't show second colorbar
          opacity: 0.9,
          line: {
            color: '#ffffff',
            width: 2,
          },
          symbol: 'diamond',
        },
        customdata: efficientFrontier.map(toCustomData) as unknown as PlotData["customdata"],
        hovertemplate:
          "<b>⭐ Efficient Frontier</b><br>" +
          "Return: %{customdata.return}<br>" +
          "Volatility: %{customdata.volatility}<br>" +
          "Sharpe Ratio: %{customdata.sharpe}<br>" +
          "<br><b>Portfolio Weights:</b><br>" +
          "%{customdata.weights}" +
          "<extra></extra>",
      })
    }

    // Add selected portfolio marker if exists
    if (selectedPortfolio) {
      traces.push({
        x: [selectedPortfolio.annualizedVolatility],
        y: [selectedPortfolio.annualizedReturn],
        type: "scatter",
        mode: "markers",
        name: "Selected",
        marker: {
          size: 14,
          color: '#8b5cf6', // Purple
          opacity: 1,
          line: {
            color: '#ffffff',
            width: 3,
          },
          symbol: 'star',
        },
        showlegend: true,
        hoverinfo: 'skip',
      })
    }

    // Base layout
    const baseLayout: Partial<Layout> = {
      xaxis: {
        title: { text: 'Annualized Volatility (%)' },
        showgrid: true,
        zeroline: false,
      },
      yaxis: {
        title: { text: 'Annualized Return (%)' },
        showgrid: true,
        zeroline: true,
        zerolinecolor: '#6b7280',
        zerolinewidth: 1,
      },
      showlegend: true,
      legend: {
        orientation: 'h',
        yanchor: 'bottom',
        y: 1.02,
        xanchor: 'right',
        x: 1,
      },
      hovermode: 'closest',
    }

    return { plotData: traces, layout: baseLayout }
  }, [portfolios, efficientFrontier, selectedPortfolio])

  const tooltip = {
    flavor: "Explore the risk-return tradeoff across your strategies.",
    detailed:
      "Each point represents a random portfolio allocation across your strategies. " +
      "The Efficient Frontier (diamonds) shows portfolios with the best risk-adjusted returns. " +
      "Points are colored by Sharpe Ratio: red (low), yellow (medium), green (high). " +
      "Click any point to see the specific strategy weights.",
  }

  return (
    <ChartWrapper
      title="📊 Efficient Frontier"
      description="Monte Carlo simulation showing optimal strategy allocations"
      className={className}
      data={plotData}
      layout={layout}
      style={{ height: "600px" }}
      tooltip={tooltip}
    />
  )
}
