/**
 * Trade Data API Route
 *
 * Provides trade data access for AI tool calls.
 * This route is called by the chat API when the AI requests detailed trade information.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTradesByBlock, getTradesByStrategy } from '@/lib/db/trades-store'
import type { Trade } from '@/lib/models/trade'
import type {
  GetTradesByBlockInput,
  GetTradesByStrategyInput,
  SearchTradesInput,
  GetStrategyBreakdownInput,
} from '@/lib/ai/trade-tools'

const MAX_TRADES_LIMIT = 100

/**
 * Format trade for AI consumption (simplified version with key fields)
 */
function formatTradeForAI(trade: Trade) {
  return {
    dateOpened: trade.dateOpened,
    dateClosed: trade.dateClosed,
    strategy: trade.strategy,
    pl: trade.pl,
    premium: trade.premium,
    reasonForClose: trade.reasonForClose,
    numContracts: trade.numContracts,
    fundsAtClose: trade.fundsAtClose,
    marginReq: trade.marginReq,
    openingCommissionsFees: trade.openingCommissionsFees,
    closingCommissionsFees: trade.closingCommissionsFees,
    openingVix: trade.openingVix,
    closingVix: trade.closingVix,
    maxProfit: trade.maxProfit,
    maxLoss: trade.maxLoss,
  }
}

/**
 * Handle get_trades_by_block tool call
 */
async function handleGetTradesByBlock(input: GetTradesByBlockInput) {
  const { block_id, limit = 100, offset = 0 } = input

  const allTrades = await getTradesByBlock(block_id)

  // Apply pagination
  const limitedTrades = allTrades.slice(offset, offset + Math.min(limit, MAX_TRADES_LIMIT))

  return {
    block_id,
    total_trades: allTrades.length,
    returned_trades: limitedTrades.length,
    offset,
    trades: limitedTrades.map(formatTradeForAI),
  }
}

/**
 * Handle get_trades_by_strategy tool call
 */
async function handleGetTradesByStrategy(input: GetTradesByStrategyInput) {
  const { block_id, strategy_name, limit = 100 } = input

  const trades = await getTradesByStrategy(block_id, strategy_name)

  // Apply limit
  const limitedTrades = trades.slice(0, Math.min(limit, MAX_TRADES_LIMIT))

  return {
    block_id,
    strategy_name,
    total_trades: trades.length,
    returned_trades: limitedTrades.length,
    trades: limitedTrades.map(formatTradeForAI),
  }
}

/**
 * Handle search_trades tool call
 */
async function handleSearchTrades(input: SearchTradesInput) {
  const { block_id, date_from, date_to, min_pl, max_pl, outcome, limit = 100 } = input

  let trades = await getTradesByBlock(block_id)

  // Apply filters
  if (date_from) {
    const fromDate = new Date(date_from)
    trades = trades.filter(t => new Date(t.dateOpened) >= fromDate)
  }

  if (date_to) {
    const toDate = new Date(date_to)
    trades = trades.filter(t => new Date(t.dateOpened) <= toDate)
  }

  if (min_pl !== undefined) {
    trades = trades.filter(t => t.pl >= min_pl)
  }

  if (max_pl !== undefined) {
    trades = trades.filter(t => t.pl <= max_pl)
  }

  if (outcome === 'profit') {
    trades = trades.filter(t => t.pl > 0)
  } else if (outcome === 'loss') {
    trades = trades.filter(t => t.pl < 0)
  }

  // Apply limit
  const limitedTrades = trades.slice(0, Math.min(limit, MAX_TRADES_LIMIT))

  return {
    block_id,
    filters: { date_from, date_to, min_pl, max_pl, outcome },
    total_matches: trades.length,
    returned_trades: limitedTrades.length,
    trades: limitedTrades.map(formatTradeForAI),
  }
}

/**
 * Handle get_strategy_breakdown tool call
 */
async function handleGetStrategyBreakdown(input: GetStrategyBreakdownInput) {
  const { block_id, samples_per_strategy = 5 } = input

  const allTrades = await getTradesByBlock(block_id)

  // Group trades by strategy
  const strategiesMap = new Map<string, Trade[]>()
  for (const trade of allTrades) {
    const strategy = trade.strategy || 'Unknown'
    if (!strategiesMap.has(strategy)) {
      strategiesMap.set(strategy, [])
    }
    strategiesMap.get(strategy)!.push(trade)
  }

  // Build breakdown for each strategy
  const breakdown = Array.from(strategiesMap.entries()).map(([strategyName, trades]) => {
    const totalPl = trades.reduce((sum, t) => sum + t.pl, 0)
    const wins = trades.filter(t => t.pl > 0)
    const losses = trades.filter(t => t.pl < 0)

    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pl, 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? losses.reduce((sum, t) => sum + t.pl, 0) / losses.length : 0
    const maxWin = wins.length > 0 ? Math.max(...wins.map(t => t.pl)) : 0
    const maxLoss = losses.length > 0 ? Math.min(...losses.map(t => t.pl)) : 0

    // Get sample trades (mix of wins and losses)
    const sampleTrades = [
      ...wins.slice(0, Math.ceil(samples_per_strategy / 2)),
      ...losses.slice(0, Math.floor(samples_per_strategy / 2)),
    ].slice(0, Math.min(samples_per_strategy, 10))

    return {
      strategy_name: strategyName,
      stats: {
        total_trades: trades.length,
        total_pl: totalPl,
        win_rate: (wins.length / trades.length) * 100,
        avg_win: avgWin,
        avg_loss: avgLoss,
        max_win: maxWin,
        max_loss: maxLoss,
        profit_factor: avgLoss !== 0 ? Math.abs(avgWin * wins.length / (avgLoss * losses.length)) : 0,
      },
      sample_trades: sampleTrades.map(formatTradeForAI),
    }
  })

  return {
    block_id,
    total_strategies: breakdown.length,
    strategies: breakdown,
  }
}

/**
 * POST /api/chat/trades
 * Execute tool calls for trade data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tool_name, tool_input } = body

    if (!tool_name || !tool_input) {
      return NextResponse.json(
        { error: 'Missing tool_name or tool_input' },
        { status: 400 }
      )
    }

    let result

    switch (tool_name) {
      case 'get_trades_by_block':
        result = await handleGetTradesByBlock(tool_input as GetTradesByBlockInput)
        break

      case 'get_trades_by_strategy':
        result = await handleGetTradesByStrategy(tool_input as GetTradesByStrategyInput)
        break

      case 'search_trades':
        result = await handleSearchTrades(tool_input as SearchTradesInput)
        break

      case 'get_strategy_breakdown':
        result = await handleGetStrategyBreakdown(tool_input as GetStrategyBreakdownInput)
        break

      default:
        return NextResponse.json(
          { error: `Unknown tool: ${tool_name}` },
          { status: 400 }
        )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Trade data API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trade data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
