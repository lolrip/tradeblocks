import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import type { PortfolioStats } from '@/lib/models/portfolio-stats'

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
  apiKey: string
  model: string
  provider: 'openai' | 'anthropic'
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatRequest
    const { messages, blockContexts, apiKey, model, provider } = body

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
    const systemPrompt = buildSystemPrompt(blockContexts)

    // Create provider client based on selection
    let result
    if (provider === 'openai') {
      const openai = createOpenAI({ apiKey })
      result = streamText({
        model: openai(model),
        system: systemPrompt,
        messages,
      })
    } else {
      const anthropic = createAnthropic({ apiKey })
      result = streamText({
        model: anthropic(model),
        system: systemPrompt,
        messages,
      })
    }

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

function buildSystemPrompt(blockContexts: BlockContext[]): string {
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

Your responses should be scannable, professional, and easy to read at a glance.`
}
