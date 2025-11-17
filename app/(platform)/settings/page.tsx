"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  saveApiKey,
  getApiKey,
  saveModel,
  getModel,
  isValidApiKey,
  saveProvider,
  getProvider,
  getAvailableModels,
  type AIProvider,
  type AIModel,
} from "@/lib/utils/llm-service"
import { Eye, EyeOff, Check, AlertCircle, Key, Bot } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function SettingsPage() {
  const [provider, setProvider] = useState<AIProvider>("openai")
  const [apiKey, setApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [selectedModel, setSelectedModel] = useState<AIModel>("gpt-5-nano")
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")
  const [validationError, setValidationError] = useState<string>("")

  // Load saved settings on mount
  useEffect(() => {
    const savedProvider = getProvider()
    const savedKey = getApiKey(savedProvider)
    const savedModel = getModel()

    setProvider(savedProvider)
    if (savedKey) {
      setApiKey(savedKey)
    }
    setSelectedModel(savedModel)
  }, [])

  // Update model when provider changes
  useEffect(() => {
    const savedKey = getApiKey(provider)
    const savedModel = getModel()

    if (savedKey) {
      setApiKey(savedKey)
    } else {
      setApiKey("")
    }
    setSelectedModel(savedModel)
    setSaveStatus("idle")
    setValidationError("")
  }, [provider])

  const handleSaveSettings = () => {
    // Validate API key
    if (apiKey && !isValidApiKey(apiKey, provider)) {
      const expectedPrefix = provider === 'openai' ? 'sk-' : 'sk-ant-'
      setValidationError(`Invalid API key format. ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} keys should start with '${expectedPrefix}'`)
      setSaveStatus("error")
      return
    }

    try {
      // Save to localStorage (provider is already saved on tab change)
      saveApiKey(apiKey, provider)
      saveModel(selectedModel)

      setValidationError("")
      setSaveStatus("success")

      // Reset success message after 3 seconds
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setValidationError("Failed to save settings")
      setSaveStatus("error")
    }
  }

  const handleClearApiKey = () => {
    setApiKey("")
    saveApiKey("", provider)
    setSaveStatus("idle")
    setValidationError("")
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* AI Strategy Consultant Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            <CardTitle>AI Strategy Consultant</CardTitle>
          </div>
          <CardDescription>
            Configure your AI assistant for analyzing trading strategies. Your API key is stored
            locally in your browser and never sent to our servers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Provider Selection */}
          <div className="space-y-2">
            <Label>AI Provider</Label>
            <Tabs value={provider} onValueChange={(value) => {
              const newProvider = value as AIProvider
              setProvider(newProvider)
              saveProvider(newProvider)
            }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="openai">OpenAI</TabsTrigger>
                <TabsTrigger value="anthropic">Anthropic</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* API Key Input */}
          <div className="space-y-2">
            <Label htmlFor="api-key" className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              {provider === 'openai' ? 'OpenAI' : 'Anthropic'} API Key
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="api-key"
                  type={showApiKey ? "text" : "password"}
                  placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    setSaveStatus("idle")
                    setValidationError("")
                  }}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showApiKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {apiKey && (
                <Button
                  variant="outline"
                  onClick={handleClearApiKey}
                  className="shrink-0"
                >
                  Clear
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Get your API key from{" "}
              <a
                href={provider === 'openai' ? 'https://platform.openai.com/api-keys' : 'https://console.anthropic.com/settings/keys'}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground transition-colors"
              >
                {provider === 'openai' ? 'platform.openai.com/api-keys' : 'console.anthropic.com/settings/keys'}
              </a>
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Select
              key={provider}
              value={selectedModel}
              onValueChange={(value) => {
                setSelectedModel(value as AIModel)
                setSaveStatus("idle")
              }}
            >
              <SelectTrigger id="model">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {getAvailableModels(provider).map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{model.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {model.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {provider === 'openai'
                ? 'Choose the model that best fits your needs. GPT-5 Nano is recommended for most users.'
                : 'Choose the model that best fits your needs. Claude Haiku 4.5 is recommended for most users.'}
            </p>
          </div>

          {/* Validation Error */}
          {validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}

          {/* Success Message */}
          {saveStatus === "success" && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20 text-green-900 dark:text-green-100">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-900 dark:text-green-100">
                Settings saved successfully!
              </AlertDescription>
            </Alert>
          )}

          {/* Save Button */}
          <div className="flex gap-3 pt-2">
            <Button onClick={handleSaveSettings} className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              Save Settings
            </Button>
          </div>

          {/* Information Box */}
          <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
            <p className="font-medium">Privacy & Security</p>
            <ul className="text-muted-foreground text-xs space-y-1 list-disc list-inside">
              <li>Your API key is stored only in your browser (localStorage)</li>
              <li>We never send your API key to our servers</li>
              <li>API requests go directly from your browser to {provider === 'openai' ? 'OpenAI' : 'Anthropic'}</li>
              <li>You can switch providers and clear your API keys at any time</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
