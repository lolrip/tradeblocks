/**
 * Chat Store - IndexedDB operations for AI conversation persistence
 */

import { STORES, INDEXES, promisifyRequest, withReadTransaction, withWriteTransaction } from './index'

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface Conversation {
  id: string
  title: string
  messages: ConversationMessage[]
  selectedBlockIds: string[]
  createdAt: Date
  updatedAt: Date
}

/**
 * Generate a title from the first user message
 */
function generateTitle(messages: ConversationMessage[]): string {
  const firstUserMessage = messages.find((m) => m.role === 'user')
  if (!firstUserMessage) {
    return `Chat from ${new Date().toLocaleString()}`
  }

  const content = firstUserMessage.content.trim()
  if (content.length <= 50) {
    return content
  }

  return content.substring(0, 50) + '...'
}

/**
 * Save a conversation (create or update)
 */
export async function saveConversation(conversation: Omit<Conversation, 'updatedAt'>): Promise<void> {
  return withWriteTransaction(STORES.CONVERSATIONS, async (transaction) => {
    const store = transaction.objectStore(STORES.CONVERSATIONS)

    const savedConversation: Conversation = {
      ...conversation,
      updatedAt: new Date(),
    }

    await promisifyRequest(store.put(savedConversation))
  })
}

/**
 * Get all conversations sorted by most recently updated
 */
export async function getAllConversations(): Promise<Conversation[]> {
  return withReadTransaction(STORES.CONVERSATIONS, async (transaction) => {
    const store = transaction.objectStore(STORES.CONVERSATIONS)
    const index = store.index(INDEXES.CONVERSATIONS_BY_UPDATED)

    const request = index.openCursor(null, 'prev') // Descending order
    const conversations: Conversation[] = []

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          conversations.push(cursor.value as Conversation)
          cursor.continue()
        } else {
          resolve(conversations)
        }
      }
      request.onerror = () => reject(request.error)
    })
  })
}

/**
 * Get a specific conversation by ID
 */
export async function getConversation(id: string): Promise<Conversation | null> {
  return withReadTransaction(STORES.CONVERSATIONS, async (transaction) => {
    const store = transaction.objectStore(STORES.CONVERSATIONS)
    const result = await promisifyRequest(store.get(id))
    return result || null
  })
}

/**
 * Get the most recently updated conversation
 */
export async function getLastConversation(): Promise<Conversation | null> {
  return withReadTransaction(STORES.CONVERSATIONS, async (transaction) => {
    const store = transaction.objectStore(STORES.CONVERSATIONS)
    const index = store.index(INDEXES.CONVERSATIONS_BY_UPDATED)

    const request = index.openCursor(null, 'prev')

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          resolve(cursor.value as Conversation)
        } else {
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  })
}

/**
 * Delete a conversation
 */
export async function deleteConversation(id: string): Promise<void> {
  return withWriteTransaction(STORES.CONVERSATIONS, async (transaction) => {
    const store = transaction.objectStore(STORES.CONVERSATIONS)
    await promisifyRequest(store.delete(id))
  })
}

/**
 * Delete old conversations, keeping only the most recent N
 */
export async function pruneOldConversations(keepCount: number = 100): Promise<void> {
  const conversations = await getAllConversations()

  if (conversations.length <= keepCount) {
    return
  }

  const toDelete = conversations.slice(keepCount)

  return withWriteTransaction(STORES.CONVERSATIONS, async (transaction) => {
    const store = transaction.objectStore(STORES.CONVERSATIONS)

    for (const conv of toDelete) {
      await promisifyRequest(store.delete(conv.id))
    }
  })
}

/**
 * Create a new conversation with auto-generated title
 */
export function createNewConversation(
  messages: ConversationMessage[],
  selectedBlockIds: string[]
): Omit<Conversation, 'updatedAt'> {
  return {
    id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    title: generateTitle(messages),
    messages,
    selectedBlockIds,
    createdAt: new Date(),
  }
}
