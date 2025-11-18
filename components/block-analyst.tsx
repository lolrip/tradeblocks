"use client"

import { BlockSelector } from "@/components/block-selector"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { PortfolioStatsCalculator } from "@/lib/calculations/portfolio-stats"
import { getBlock, getDailyLogsByBlock, getTradesByBlock } from "@/lib/db"
import {
  createNewConversation,
  deleteConversation,
  getAllConversations,
  getConversation,
  getLastConversation,
  saveConversation,
  type Conversation,
  type ConversationMessage,
} from "@/lib/db/chat-store"
import type { PortfolioStats } from "@/lib/models/portfolio-stats"
import { getApiKey, getModel, hasApiKey, getProvider, getModelLabel } from "@/lib/utils/llm-service"
import {
  AlertCircle,
  Bot,
  Check,
  Copy,
  History,
  Plus,
  Send,
  Settings,
  Trash2,
  User,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"

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

export function BlockAnalyst() {
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([])
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Check if API key is configured (client-side only to prevent hydration mismatch)
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [isClientMounted, setIsClientMounted] = useState(false)
  const [activeModelLabel, setActiveModelLabel] = useState<string>("")

  // Initialize client-side only state after mount
  useEffect(() => {
    const provider = getProvider()
    const model = getModel()
    const modelLabel = getModelLabel(model)

    setApiKeyConfigured(hasApiKey(provider))
    setActiveModelLabel(modelLabel)
    setIsClientMounted(true)
  }, [])

  // Load conversations on mount
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const allConvs = await getAllConversations()
        setConversations(allConvs)

        const lastConv = await getLastConversation()
        if (lastConv) {
          setMessages(lastConv.messages)
          setSelectedBlockIds(lastConv.selectedBlockIds)
          setCurrentConversationId(lastConv.id)
        }
      } catch (error) {
        console.error("Error loading conversations:", error)
      }
    }

    loadConversations()
  }, [])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      // Find the viewport div inside ScrollArea
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight
      }
    }
  }, [messages, isLoading])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [input])

  const fetchBlockContexts = async (): Promise<BlockContext[]> => {
    const contexts: BlockContext[] = []

    for (const blockId of selectedBlockIds) {
      try {
        // Get block metadata
        const block = await getBlock(blockId)
        if (!block) {
          console.warn(`Block ${blockId} not found, skipping`)
          continue
        }

        // Get trades and daily logs
        const trades = await getTradesByBlock(blockId)
        const dailyLogs = await getDailyLogsByBlock(blockId)

        // Calculate full statistics
        const calculator = new PortfolioStatsCalculator({ riskFreeRate: 2.0 })
        const stats = calculator.calculatePortfolioStats(trades, dailyLogs)

        // Get date range
        const firstTrade = trades[0]?.dateOpened
        const lastTrade = trades[trades.length - 1]?.dateOpened

        contexts.push({
          blockName: block.name,
          blockDescription: block.description,
          stats,
          tradeCount: trades.length,
          hasDailyLog: dailyLogs.length > 0,
          dateRange: {
            firstTrade: firstTrade ? firstTrade.toISOString().split('T')[0] : 'N/A',
            lastTrade: lastTrade ? lastTrade.toISOString().split('T')[0] : 'N/A',
          },
        })
      } catch (error) {
        console.error(`Error fetching context for block ${blockId}:`, error)
      }
    }

    return contexts
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading || selectedBlockIds.length === 0) return

    const userMessage: ConversationMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)
    setError(null)

    try {
      // Fetch block contexts from IndexedDB
      const blockContexts = await fetchBlockContexts()

      if (blockContexts.length === 0) {
        throw new Error("No valid blocks found")
      }

      // Fetch trades data for tool use (for Anthropic models)
      const tradesData: Record<string, Trade[]> = {}
      const provider = getProvider()

      if (provider === 'anthropic') {
        for (const blockId of selectedBlockIds) {
          try {
            const trades = await getTradesByBlock(blockId)
            tradesData[blockId] = trades
          } catch (error) {
            console.error(`Failed to load trades for block ${blockId}:`, error)
          }
        }
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage]
            .filter((msg) => msg.content && msg.content.trim() !== '')
            .map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
          blockContexts,
          blockIds: selectedBlockIds, // Pass block IDs for tool use
          tradesData, // Pass pre-fetched trades data for tool use
          apiKey: getApiKey(provider),
          model: getModel(),
          provider,
        }),
      })

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let assistantMessage = ""

      const assistantMessageId = (Date.now() + 1).toString()
      const assistantTimestamp = new Date()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        assistantMessage += chunk

        // Update the assistant message in real-time
        setMessages((prev) => {
          const withoutLast = prev.filter((m) => m.id !== assistantMessageId)
          return [
            ...withoutLast,
            {
              id: assistantMessageId,
              role: "assistant" as const,
              content: assistantMessage,
              timestamp: assistantTimestamp,
            },
          ]
        })
      }

      // Save conversation after successful exchange
      const updatedMessages = [
        ...messages,
        userMessage,
        {
          id: assistantMessageId,
          role: "assistant" as const,
          content: assistantMessage,
          timestamp: assistantTimestamp,
        },
      ]

      // Create new conversation or update existing
      let conversationId = currentConversationId
      if (!conversationId) {
        const newConv = createNewConversation(updatedMessages, selectedBlockIds)
        conversationId = newConv.id
        setCurrentConversationId(conversationId)
        await saveConversation(newConv)
      } else {
        await saveConversation({
          id: conversationId,
          title: createNewConversation(updatedMessages, selectedBlockIds).title,
          messages: updatedMessages,
          selectedBlockIds,
          createdAt: new Date(), // Will be preserved by existing conversation
        })
      }

      // Refresh conversations list
      const allConvs = await getAllConversations()
      setConversations(allConvs)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const clearChat = () => {
    setMessages([])
    setCurrentConversationId(null)
  }

  const loadConversation = async (conversationId: string) => {
    try {
      const conv = await getConversation(conversationId)
      if (conv) {
        setMessages(conv.messages)
        setSelectedBlockIds(conv.selectedBlockIds)
        setCurrentConversationId(conv.id)
      }
    } catch (error) {
      console.error("Error loading conversation:", error)
    }
  }

  const startNewChat = () => {
    setMessages([])
    setCurrentConversationId(null)
  }

  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await deleteConversation(conversationId)
      setConversations((prev) => prev.filter((c) => c.id !== conversationId))

      // If we deleted the current conversation, clear the chat
      if (conversationId === currentConversationId) {
        startNewChat()
      }
    } catch (error) {
      console.error("Error deleting conversation:", error)
    }
  }

  const copyMessage = (content: string, messageId: string) => {
    navigator.clipboard.writeText(content)
    setCopiedMessageId(messageId)
    setTimeout(() => setCopiedMessageId(null), 2000)
  }

  // Show consistent loading state during SSR and initial client render to prevent hydration mismatch
  if (!isClientMounted) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            <CardTitle>Strategy Consultant</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    )
  }

  // Show API key setup prompt if not configured
  if (!apiKeyConfigured) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            <CardTitle>Strategy Consultant</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 max-w-md">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground" />
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">API Key Required</h3>
              <p className="text-sm text-muted-foreground">
                To use the AI Strategy Consultant, you need to configure your API key in Settings.
                Choose between OpenAI or Anthropic providers.
              </p>
            </div>
            <Button asChild>
              <Link href="/settings" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Go to Settings
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Show block selection prompt if no blocks selected
  if (selectedBlockIds.length === 0) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            <CardTitle>Strategy Consultant</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Select at least one block to start analyzing your trading strategies.
            </AlertDescription>
          </Alert>
          <BlockSelector
            selectedBlockIds={selectedBlockIds}
            onSelectionChange={setSelectedBlockIds}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="border-b shrink-0">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot className="w-5 h-5" />
              <CardTitle>Strategy Consultant</CardTitle>
              {isClientMounted && activeModelLabel && (
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-1 rounded">
                  {activeModelLabel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Conversation History Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <History className="w-4 h-4 mr-2" />
                    History
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[300px]">
                  <DropdownMenuLabel>Conversation History</DropdownMenuLabel>
                  <DropdownMenuItem onClick={startNewChat}>
                    <Plus className="w-4 h-4 mr-2" />
                    New Chat
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {conversations.length === 0 ? (
                    <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                      No conversations yet
                    </div>
                  ) : (
                    <div className="max-h-[400px] overflow-y-auto">
                      {conversations.map((conv) => (
                        <DropdownMenuItem
                          key={conv.id}
                          onClick={() => loadConversation(conv.id)}
                          className="flex items-center justify-between group"
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="font-medium truncate">{conv.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {conv.messages.length} messages • {new Date(conv.updatedAt).toLocaleDateString()}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleDeleteConversation(conv.id, e)}
                            className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Clear Chat Button */}
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearChat}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>
          </div>
          <BlockSelector
            selectedBlockIds={selectedBlockIds}
            onSelectionChange={setSelectedBlockIds}
          />
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 min-h-0 overflow-hidden">
        {/* Messages */}
        <ScrollArea ref={scrollAreaRef} className="flex-1 px-4 overflow-y-auto">
          <div className="space-y-4 py-4">
            {messages.length === 0 && (
              <div className="text-center py-8 space-y-3">
                <Bot className="w-12 h-12 mx-auto text-muted-foreground" />
                <div className="space-y-2">
                  <h3 className="font-semibold">Ready to analyze your trading strategies</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Ask questions about your performance metrics, risk management, consistency, or
                    get recommendations for improvement.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setInput("What are the main strengths and weaknesses of my strategy?")}
                  >
                    Analyze Performance
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setInput("How can I improve my risk management?")}
                  >
                    Risk Advice
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setInput("What patterns do you see in my trading consistency?")}
                  >
                    Find Patterns
                  </Button>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div
                  className={`flex flex-col gap-2 max-w-[85%] ${
                    message.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`rounded-lg px-4 py-3 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>*]:text-[14px] [&>*]:leading-relaxed">
                        <ReactMarkdown
                          components={{
                            code({ className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || "")
                              const isInline = !match

                              return isInline ? (
                                <code className="bg-muted px-1.5 py-0.5 rounded text-[13px] font-mono" {...props}>
                                  {children}
                                </code>
                              ) : (
                                <div className="relative group my-4">
                                  <SyntaxHighlighter
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    style={oneDark as any}
                                    language={match[1]}
                                    PreTag="div"
                                    customStyle={{
                                      margin: 0,
                                      borderRadius: "0.375rem",
                                      fontSize: "13px",
                                      padding: "1rem",
                                    }}
                                  >
                                    {String(children).replace(/\n$/, "")}
                                  </SyntaxHighlighter>
                                </div>
                              )
                            },
                            table({ children }) {
                              return (
                                <div className="my-4 overflow-x-auto">
                                  <table className="min-w-full divide-y divide-border">
                                    {children}
                                  </table>
                                </div>
                              )
                            },
                            thead({ children }) {
                              return (
                                <thead className="bg-muted">
                                  {children}
                                </thead>
                              )
                            },
                            th({ children }) {
                              return (
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">
                                  {children}
                                </th>
                              )
                            },
                            td({ children }) {
                              return (
                                <td className="px-4 py-2 text-sm border-t border-border">
                                  {children}
                                </td>
                              )
                            },
                            ul({ children }) {
                              return (
                                <ul className="list-disc pl-6 my-3 space-y-1">
                                  {children}
                                </ul>
                              )
                            },
                            ol({ children }) {
                              return (
                                <ol className="list-decimal pl-6 my-3 space-y-1">
                                  {children}
                                </ol>
                              )
                            },
                            h1({ children }) {
                              return (
                                <h1 className="text-xl font-bold mt-6 mb-3 pb-2 border-b border-border">
                                  {children}
                                </h1>
                              )
                            },
                            h2({ children }) {
                              return (
                                <h2 className="text-lg font-semibold mt-5 mb-2">
                                  {children}
                                </h2>
                              )
                            },
                            h3({ children }) {
                              return (
                                <h3 className="text-base font-semibold mt-4 mb-2">
                                  {children}
                                </h3>
                              )
                            },
                            p({ children }) {
                              return (
                                <p className="my-2 leading-relaxed">
                                  {children}
                                </p>
                              )
                            },
                            blockquote({ children }) {
                              return (
                                <blockquote className="border-l-4 border-primary pl-4 my-3 italic text-muted-foreground">
                                  {children}
                                </blockquote>
                              )
                            },
                            hr() {
                              return (
                                <hr className="my-4 border-t border-border" />
                              )
                            },
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                  {message.role === "assistant" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyMessage(message.content, message.id)}
                      className="h-7 text-xs text-muted-foreground"
                    >
                      {copiedMessageId === message.id ? (
                        <>
                          <Check className="w-3 h-3 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  )}
                </div>
                {message.role === "user" && (
                  <div className="shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <User className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Error Display */}
        {error && (
          <div className="px-4 pb-2">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Input */}
        <div className="border-t p-4 shrink-0">
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your trading strategy..."
              className="min-h-[60px] max-h-[200px] resize-none"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              size="icon"
              disabled={isLoading || !input.trim()}
              className="shrink-0 h-[60px] w-[60px]"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
