/**
 * AI Tool Definitions for Trade Data Access
 *
 * Defines tool schemas using Anthropic's tool use format.
 * These tools allow the AI to request detailed trade data when analyzing portfolios.
 */

import type { Tool } from '@anthropic-ai/sdk/resources/messages.mjs'

/**
 * Tool: Get all trades for a specific block
 */
export const getTradesByBlockTool: Tool = {
  name: 'get_trades_by_block',
  description: 'Fetch all trades for a specific block. Use this when you need to analyze individual trade details, patterns, or sequences. Returns up to 100 trades at a time.',
  input_schema: {
    type: 'object',
    properties: {
      block_id: {
        type: 'string',
        description: 'The unique identifier of the block to fetch trades from',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of trades to return (default: 100, max: 100)',
      },
      offset: {
        type: 'number',
        description: 'Number of trades to skip for pagination (default: 0)',
      },
    },
    required: ['block_id'],
  },
}

/**
 * Tool: Get trades filtered by strategy
 */
export const getTradesByStrategyTool: Tool = {
  name: 'get_trades_by_strategy',
  description: 'Fetch trades for a specific strategy within a block. Use this to analyze how a particular strategy performed.',
  input_schema: {
    type: 'object',
    properties: {
      block_id: {
        type: 'string',
        description: 'The unique identifier of the block',
      },
      strategy_name: {
        type: 'string',
        description: 'The name of the strategy to filter by (e.g., "Iron Condor", "Credit Spread")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of trades to return (default: 100, max: 100)',
      },
    },
    required: ['block_id', 'strategy_name'],
  },
}

/**
 * Tool: Search trades by criteria
 */
export const searchTradesTool: Tool = {
  name: 'search_trades',
  description: 'Search trades using various criteria like date range, P&L range, or trade outcomes. Use this to find specific patterns or analyze subsets of trades.',
  input_schema: {
    type: 'object',
    properties: {
      block_id: {
        type: 'string',
        description: 'The unique identifier of the block to search within',
      },
      date_from: {
        type: 'string',
        description: 'Start date in YYYY-MM-DD format (inclusive)',
      },
      date_to: {
        type: 'string',
        description: 'End date in YYYY-MM-DD format (inclusive)',
      },
      min_pl: {
        type: 'number',
        description: 'Minimum P&L to filter by (inclusive)',
      },
      max_pl: {
        type: 'number',
        description: 'Maximum P&L to filter by (inclusive)',
      },
      outcome: {
        type: 'string',
        description: 'Filter by trade outcome: "profit" for winning trades, "loss" for losing trades',
        enum: ['profit', 'loss'],
      },
      limit: {
        type: 'number',
        description: 'Maximum number of trades to return (default: 100, max: 100)',
      },
    },
    required: ['block_id'],
  },
}

/**
 * Tool: Get strategy breakdown with sample trades
 */
export const getStrategyBreakdownTool: Tool = {
  name: 'get_strategy_breakdown',
  description: 'Get per-strategy statistics with sample trades. Use this to get a comprehensive view of how each strategy performed with representative trade examples.',
  input_schema: {
    type: 'object',
    properties: {
      block_id: {
        type: 'string',
        description: 'The unique identifier of the block',
      },
      samples_per_strategy: {
        type: 'number',
        description: 'Number of sample trades to include per strategy (default: 5, max: 10)',
      },
    },
    required: ['block_id'],
  },
}

/**
 * All available tools for the AI
 */
export const ALL_TRADE_TOOLS: Tool[] = [
  getTradesByBlockTool,
  getTradesByStrategyTool,
  searchTradesTool,
  getStrategyBreakdownTool,
]

/**
 * Tool input types for type safety
 */
export interface GetTradesByBlockInput {
  block_id: string
  limit?: number
  offset?: number
}

export interface GetTradesByStrategyInput {
  block_id: string
  strategy_name: string
  limit?: number
}

export interface SearchTradesInput {
  block_id: string
  date_from?: string
  date_to?: string
  min_pl?: number
  max_pl?: number
  outcome?: 'profit' | 'loss'
  limit?: number
}

export interface GetStrategyBreakdownInput {
  block_id: string
  samples_per_strategy?: number
}

/**
 * Union type for all tool inputs
 */
export type ToolInput =
  | GetTradesByBlockInput
  | GetTradesByStrategyInput
  | SearchTradesInput
  | GetStrategyBreakdownInput
