import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import Anthropic from '@anthropic-ai/sdk'
import type { PortfolioStats } from '@/lib/models/portfolio-stats'
import { ALL_TRADE_TOOLS } from '@/lib/ai/trade-tools'
import type { Trade } from '@/lib/models/trade'

interface BlockContext {
  blockName: string
  blockDescription?: string
  stats: PortfolioStats
  tradeCount: number
  hasDailyLog: boolean
  dateRange: {
    firstTrade: string
    lastTrade: string
  }
}

interface ChatRequest {
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
  blockContexts: BlockContext[]
  blockIds: string[] // Array of block IDs for tool use
  tradesData?: Record<string, Trade[]> // Pre-fetched trades data keyed by block ID
  apiKey: string
  model: string
  provider: 'openai' | 'anthropic'
}

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
 * Execute a tool call using pre-fetched trades data
 */
function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  tradesData: Record<string, Trade[]>
): string {
  try {
    const MAX_TRADES_LIMIT = 100

    switch (toolName) {
      case 'get_trades_by_block': {
        const { block_id, limit = 100, offset = 0 } = toolInput as { block_id: string; limit?: number; offset?: number }
        const allTrades = tradesData[block_id] || []
        const limitedTrades = allTrades.slice(Number(offset), Number(offset) + Math.min(Number(limit), MAX_TRADES_LIMIT))

        return JSON.stringify({
          block_id,
          total_trades: allTrades.length,
          returned_trades: limitedTrades.length,
          offset,
          trades: limitedTrades.map(formatTradeForAI),
        }, null, 2)
      }

      case 'get_trades_by_strategy': {
        const { block_id, strategy_name, limit = 100 } = toolInput as { block_id: string; strategy_name: string; limit?: number }
        const allTrades = tradesData[block_id] || []
        const trades = allTrades.filter(t => t.strategy === strategy_name)
        const limitedTrades = trades.slice(0, Math.min(Number(limit), MAX_TRADES_LIMIT))

        return JSON.stringify({
          block_id,
          strategy_name,
          total_trades: trades.length,
          returned_trades: limitedTrades.length,
          trades: limitedTrades.map(formatTradeForAI),
        }, null, 2)
      }

      case 'search_trades': {
        const { block_id, date_from, date_to, min_pl, max_pl, outcome, limit = 100 } = toolInput as {
          block_id: string
          date_from?: string
          date_to?: string
          min_pl?: number
          max_pl?: number
          outcome?: 'profit' | 'loss'
          limit?: number
        }

        let trades = tradesData[block_id] || []

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

        const limitedTrades = trades.slice(0, Math.min(Number(limit), MAX_TRADES_LIMIT))

        return JSON.stringify({
          block_id,
          filters: { date_from, date_to, min_pl, max_pl, outcome },
          total_matches: trades.length,
          returned_trades: limitedTrades.length,
          trades: limitedTrades.map(formatTradeForAI),
        }, null, 2)
      }

      case 'get_strategy_breakdown': {
        const { block_id, samples_per_strategy = 5 } = toolInput as { block_id: string; samples_per_strategy?: number }
        const allTrades = tradesData[block_id] || []

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
            ...wins.slice(0, Math.ceil(Number(samples_per_strategy) / 2)),
            ...losses.slice(0, Math.floor(Number(samples_per_strategy) / 2)),
          ].slice(0, Math.min(Number(samples_per_strategy), 10))

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

        return JSON.stringify({
          block_id,
          total_strategies: breakdown.length,
          strategies: breakdown,
        }, null, 2)
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` })
    }
  } catch (error) {
    console.error(`Tool execution error (${toolName}):`, error)
    return JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatRequest
    const { messages, blockContexts, blockIds = [], tradesData = {}, apiKey, model, provider } = body

    // Debug logging - FIRST THING
    console.log('========================================')
    console.log('[ROUTE] POST /api/chat received')
    console.log('[ROUTE] Provider:', provider)
    console.log('[ROUTE] Model:', model)
    console.log('[ROUTE] Has API key:', !!apiKey)
    console.log('[ROUTE] Block IDs:', blockIds)
    console.log('[ROUTE] Trades data available:', Object.keys(tradesData).length > 0)
    console.log('========================================')

    // Validate inputs
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!provider || (provider !== 'openai' && provider !== 'anthropic')) {
      return new Response(
        JSON.stringify({ error: 'Valid provider (openai or anthropic) is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!blockContexts || blockContexts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one block context must be provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Build system prompt with block contexts
    const systemPrompt = buildSystemPrompt(blockContexts, blockIds)

    // For Anthropic with tool use, use native SDK for better control
    if (provider === 'anthropic') {
      console.log('[ROUTE] Taking Anthropic path with tools')
      return handleAnthropicWithTools(apiKey, model, systemPrompt, messages, tradesData)
    }

    // For OpenAI, use standard streaming (no tool support yet for OpenAI in this implementation)
    console.log('[ROUTE] Taking OpenAI path (no tools)')
    const openai = createOpenAI({ apiKey })
    const result = streamText({
      model: openai(model),
      system: systemPrompt,
      messages,
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Handle Anthropic requests with tool use support
 */
async function handleAnthropicWithTools(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  tradesData: Record<string, Trade[]>
) {
  const anthropic = new Anthropic({ apiKey })

  // Convert messages to Anthropic format
  const anthropicMessages = messages.map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }))

  try {
    // Check if the user's message suggests they need trade-level data
    const lastUserMessage = anthropicMessages[anthropicMessages.length - 1]?.content.toLowerCase() || ''
    const needsTradeData =
      lastUserMessage.includes('biggest') ||
      lastUserMessage.includes('largest') ||
      lastUserMessage.includes('top ') ||
      lastUserMessage.includes('best ') ||
      lastUserMessage.includes('worst ') ||
      lastUserMessage.includes('specific') ||
      lastUserMessage.includes('which trades') ||
      lastUserMessage.includes('show me') ||
      lastUserMessage.includes('what happened') ||
      lastUserMessage.includes('find trades') ||
      lastUserMessage.includes('win days') ||
      lastUserMessage.includes('loss days')

    console.log('[API] User message:', lastUserMessage.substring(0, 100))
    console.log('[API] Needs trade data:', needsTradeData)
    console.log('[API] Available tools:', ALL_TRADE_TOOLS.length)
    console.log('[API] Trades data keys:', Object.keys(tradesData))

    // Create message with tools
    const requestParams = {
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: ALL_TRADE_TOOLS,
      // Force tool use for queries that clearly need trade-level data
      ...(needsTradeData && { tool_choice: { type: 'any' } }),
    }

    console.log('[API] Request tool_choice:', requestParams.tool_choice)

    const response = await anthropic.messages.create(requestParams)

    // Handle tool use in a loop
    let currentResponse = response
    const conversationMessages: Anthropic.Messages.MessageParam[] = [...anthropicMessages]
    const allTextBlocks: string[] = [] // Collect all text from all responses

    // Log initial response stop reason
    console.log('[API] Initial stop_reason:', currentResponse.stop_reason)
    console.log('[API] Initial content blocks:', currentResponse.content.map(b => b.type))

    while (currentResponse.stop_reason === 'tool_use') {
      // Extract tool uses from response
      const toolUses = currentResponse.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
      )

      if (toolUses.length === 0) break

      // Log tool usage for debugging
      console.log(`[Tool Use] ${toolUses.length} tool(s) called:`, toolUses.map(t => t.name))

      // Collect any text blocks from this response
      const textBlocks = currentResponse.content.filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
      )
      if (textBlocks.length > 0) {
        console.log('[Tool Use] Text before tool call:', textBlocks.map(b => b.text.substring(0, 100)))
        allTextBlocks.push(...textBlocks.map(block => block.text))
      }

      // Add assistant's response to conversation
      conversationMessages.push({
        role: 'assistant',
        content: currentResponse.content,
      })

      // Execute all tool calls
      const toolResults = await Promise.all(
        toolUses.map(async (toolUse) => {
          const result = executeTool(toolUse.name, toolUse.input as Record<string, unknown>, tradesData)
          return {
            type: 'tool_result' as const,
            tool_use_id: toolUse.id,
            content: result,
          }
        })
      )

      // Add tool results to conversation
      conversationMessages.push({
        role: 'user',
        content: toolResults,
      })

      // Continue conversation with tool results
      currentResponse = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: conversationMessages,
        tools: ALL_TRADE_TOOLS,
      })
    }

    // Extract final text response
    const finalTextBlocks = currentResponse.content.filter(
      (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
    )
    allTextBlocks.push(...finalTextBlocks.map(block => block.text))

    // Combine all text blocks from all responses
    const finalText = allTextBlocks.join('\n\n')

    // Return as plain text response (not streaming for now)
    return new Response(finalText, {
      headers: { 'Content-Type': 'text/plain' },
    })
  } catch (error) {
    console.error('Anthropic tool use error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Tool use error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

function buildSystemPrompt(blockContexts: BlockContext[], blockIds: string[] = []): string {
  const blocksInfo = blockContexts
    .map((ctx, index) => {
      const { blockName, blockDescription, stats, tradeCount, hasDailyLog, dateRange } = ctx

      return `
## Block ${index + 1}: ${blockName}

**Description:** ${blockDescription || 'No description provided'}

**Trading Period:** ${dateRange.firstTrade} to ${dateRange.lastTrade}

**Data Sources:**
- Trade Log: ${tradeCount} trades
- Daily Log: ${hasDailyLog ? 'Yes' : 'No'}

**Performance Overview:**
- Total P&L: $${stats.totalPl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Net P&L: $${stats.netPl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Initial Capital: $${stats.initialCapital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Return on Margin: ${((stats.totalPl / stats.initialCapital) * 100).toFixed(2)}%

**Trade Statistics:**
- Total Trades: ${stats.totalTrades}
- Winning Trades: ${stats.winningTrades}
- Losing Trades: ${stats.losingTrades}
- Break-Even Trades: ${stats.breakEvenTrades}
- Win Rate: ${(stats.winRate * 100).toFixed(2)}%
- Profit Factor: ${stats.profitFactor.toFixed(2)}

**Win/Loss Analysis:**
- Average Win: $${stats.avgWin.toFixed(2)}
- Average Loss: $${stats.avgLoss.toFixed(2)}
- Max Win: $${stats.maxWin.toFixed(2)}
- Max Loss: $${stats.maxLoss.toFixed(2)}

**Risk Metrics:**
- Sharpe Ratio: ${stats.sharpeRatio?.toFixed(3) ?? 'N/A'}
- Sortino Ratio: ${stats.sortinoRatio?.toFixed(3) ?? 'N/A'}
- Calmar Ratio: ${stats.calmarRatio?.toFixed(3) ?? 'N/A'}
- Max Drawdown: ${(stats.maxDrawdown * 100).toFixed(2)}%
- Time in Drawdown: ${stats.timeInDrawdown ? (stats.timeInDrawdown * 100).toFixed(2) : 'N/A'}%

**Growth Metrics:**
- CAGR: ${stats.cagr ? (stats.cagr * 100).toFixed(2) : 'N/A'}%
- Kelly Percentage: ${stats.kellyPercentage ? (stats.kellyPercentage * 100).toFixed(2) : 'N/A'}%
- Average Daily P&L: $${stats.avgDailyPl.toFixed(2)}

**Execution Costs:**
- Total Commissions: $${stats.totalCommissions.toFixed(2)}
- Commission % of Gross P&L: ${((stats.totalCommissions / stats.totalPl) * 100).toFixed(2)}%

**Consistency Metrics:**
- Max Win Streak: ${stats.maxWinStreak ?? 'N/A'}
- Max Loss Streak: ${stats.maxLossStreak ?? 'N/A'}
- Current Streak: ${stats.currentStreak ?? 'N/A'}
- Monthly Win Rate: ${stats.monthlyWinRate ? (stats.monthlyWinRate * 100).toFixed(2) : 'N/A'}%
- Weekly Win Rate: ${stats.weeklyWinRate ? (stats.weeklyWinRate * 100).toFixed(2) : 'N/A'}%
`
    })
    .join('\n---\n')

  return `You are a professional trading strategy consultant specializing in options trading analysis. Your role is to provide data-driven insights, identify patterns, and suggest improvements based on quantitative trading metrics.

# SELECTED TRADING PORTFOLIOS

The user has selected ${blockContexts.length} trading portfolio${blockContexts.length > 1 ? 's' : ''} for analysis:

${blocksInfo}

---

# YOUR RESPONSIBILITIES

1. **Data-Driven Analysis:** Always reference specific numbers from the statistics above
2. **Pattern Recognition:** Identify trends in win rates, risk metrics, and consistency
3. **Risk Assessment:** Evaluate drawdowns, Sharpe/Sortino ratios, and position sizing
4. **Actionable Insights:** Provide specific, implementable recommendations
5. **Comparative Analysis:** When multiple blocks are selected, compare and contrast their performance
6. **Professional Tone:** Be clear, concise, and focused on trading fundamentals

# ANALYSIS FRAMEWORK

When analyzing strategies, consider:

- **Profitability:** Total P&L, CAGR, ROI (Return on Margin)
- **Consistency:** Win rate, profit factor, streaks, monthly/weekly win rates
- **Risk Management:** Max drawdown, time in drawdown, Sharpe/Sortino/Calmar ratios
- **Efficiency:** Commissions as % of P&L, average win vs. average loss
- **Growth Potential:** Kelly percentage, CAGR sustainability

# IMPORTANT NOTES

- Win Rate is shown as a decimal (0.0 to 1.0), convert to percentage when discussing
- All dollar amounts are already formatted with 2 decimal places
- Sharpe Ratio uses sample std dev (N-1), Sortino uses population std dev (N)
- Max Drawdown is the peak-to-trough decline as a percentage
- If CAGR, Kelly%, or other metrics are "N/A", it means insufficient data to calculate

Provide thoughtful, actionable insights that help traders improve their performance.

# FORMATTING GUIDELINES

**Always use markdown formatting in your responses:**

- Use **bold** for emphasis on key metrics and important insights
- Use bullet points (like this list) for enumerating items or options
- Use numbered lists for sequential steps or ranked recommendations
- Use headings (##, ###) to organize complex analyses into sections
- Use tables when comparing multiple strategies or metrics side-by-side
- Use \`inline code\` for specific values or technical terms
- Use code blocks (\`\`\`) when showing calculations, formulas, or examples
- Break long responses into well-organized sections with clear headings
- Keep paragraphs concise (2-3 sentences maximum)
- Use horizontal rules (---) to separate major sections when appropriate

**Example of well-formatted response structure:**

## Analysis Summary
Brief overview paragraph with **key findings**.

## Key Strengths
- Point 1 with specific data
- Point 2 with specific data

## Areas for Improvement
1. First recommendation
2. Second recommendation

## Specific Metrics
| Metric | Value | Assessment |
|--------|-------|------------|
| Win Rate | 64.5% | Strong |

Your responses should be scannable, professional, and easy to read at a glance.

# DETAILED TRADE DATA ACCESS

You have access to detailed trade-level data through specialized tools. **The statistics above are aggregated summaries.** When you need to:

- Analyze specific trade patterns or sequences
- Examine individual trade performance
- Find trades meeting specific criteria (date range, P&L range, outcomes)
- Get sample trades for each strategy with detailed stats

**CRITICAL INSTRUCTION - READ CAREFULLY:**

When a user asks about specific trades, dates, or patterns (like "biggest win days", "top trades", "what happened on X date"), you MUST:

1. **Immediately use the tools** - Do NOT write a response first
2. **Never use placeholder values** like [X,XXX.XX] or [YYYY-MM-DD]
3. **Always fetch real data** before responding

If you write placeholders or templates, you have FAILED the task.

Example of WRONG behavior:
❌ "Here are the five biggest win days: [YYYY-MM-DD] with P&L of [X,XXX.XX]"
❌ "I'll fetch the trade data to analyze..."

Example of CORRECT behavior:
✅ [Calls get_trades_by_block tool → receives data → formats real results]
✅ "Here are the five biggest win days: 2024-03-15 with P&L of $12,450.32..."

## Available Tools

${blockIds.length > 0 ? `
**Block IDs for tool use:**
${blockIds.map((id, i) => `- Block ${i + 1} ID: \`${id}\``).join('\n')}

1. **get_trades_by_block**: Fetch all trades for a specific block (up to 100 at a time, supports pagination)
2. **get_trades_by_strategy**: Get trades filtered by strategy within a block
3. **search_trades**: Search trades by criteria (date range, P&L range, profit/loss outcome)
4. **get_strategy_breakdown**: Get per-strategy statistics with sample trades

**When to use tools:**
- User asks about specific trades, patterns, or sequences
- Analysis requires examining individual trade details
- Questions about trade timing, entry/exit patterns, or sequences
- Comparisons between winning and losing trades
- Identifying outliers or anomalies

**When to use aggregate stats (above):**
- Overall portfolio performance questions
- Risk metrics and ratios
- General profitability and consistency questions
- High-level comparisons between blocks

**Tool Usage Examples:**
- "Show me the 5 biggest winning trades" → Use search_trades with min_pl
- "How did Iron Condor trades perform?" → Use get_trades_by_strategy
- "What happened in March 2024?" → Use search_trades with date_from/date_to
- "Give me examples of each strategy" → Use get_strategy_breakdown
` : '**Note:** Detailed trade-level tools are available but no block IDs were provided for this session.'}
`
}
