"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { BlockAnalyst } from "@/components/block-analyst"
import { hasApiKey, getProvider } from "@/lib/utils/llm-service"
import { Bot, GripVertical, X } from "lucide-react"

const MIN_WIDTH = 400
const MAX_WIDTH_PERCENTAGE = 80
const DEFAULT_WIDTH = 650
const STORAGE_KEY = "floating-assistant-width"

export function FloatingAssistant() {
  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Load saved width from localStorage on mount
  useEffect(() => {
    const savedWidth = localStorage.getItem(STORAGE_KEY)
    if (savedWidth) {
      const parsedWidth = parseInt(savedWidth, 10)
      if (!isNaN(parsedWidth)) {
        setWidth(parsedWidth)
      }
    }
  }, [])

  // Check if API key is configured
  useEffect(() => {
    const provider = getProvider()
    setApiKeyConfigured(hasApiKey(provider))
  }, [])

  // Handle resize
  const handleMouseDown = useCallback(() => {
    setIsResizing(true)
  }, [])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return

      const maxWidth = window.innerWidth * (MAX_WIDTH_PERCENTAGE / 100)
      const newWidth = window.innerWidth - e.clientX
      const clampedWidth = Math.max(MIN_WIDTH, Math.min(newWidth, maxWidth))

      setWidth(clampedWidth)
    },
    [isResizing]
  )

  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false)
      // Save to localStorage
      localStorage.setItem(STORAGE_KEY, width.toString())
    }
  }, [isResizing, width])

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = "ew-resize"
      document.body.style.userSelect = "none"

      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  return (
    <>
      {/* Floating Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setOpen(true)}
          size="lg"
          className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 relative"
          aria-label="Open AI Strategy Consultant"
        >
          <Bot className="w-6 h-6" />
          {!apiKeyConfigured && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-orange-500 border-2 border-background animate-pulse" />
          )}
        </Button>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-200"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Resizable Slide-out Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 bottom-0 z-50 bg-background border-l shadow-2xl transition-transform duration-300 ease-out flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: `${width}px` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-title"
      >
        {/* Resize Handle */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 hover:w-2 cursor-ew-resize group transition-all ${
            isResizing ? "w-2 bg-primary" : "bg-border hover:bg-primary"
          }`}
          onMouseDown={handleMouseDown}
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="w-4 h-4 text-primary" />
          </div>
        </div>

        {/* Close Button */}
        <div className="absolute top-4 right-4 z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="Close assistant"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col p-0">
          <h2 id="assistant-title" className="sr-only">
            AI Strategy Consultant
          </h2>
          <p className="sr-only">
            Get AI-powered insights and recommendations for your trading strategies
          </p>
          <BlockAnalyst />
        </div>
      </div>
    </>
  )
}
