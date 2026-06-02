import { useCallback, useEffect, useRef, useState } from 'react'
import chatService from '../services/chat.service'
import type { ChatMessage, ChatRoom, SendMessageDto } from '../services/chat.service'
import { useAuthStore } from '../store/authStore'
import { useWS } from '../context/WSContext'
import { toast } from 'react-hot-toast'

export const useChat = (jobIdInput: string) => {
  const jobId = jobIdInput.startsWith('job:') ? jobIdInput.replace('job:', '') : jobIdInput
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [roomId, setRoomId] = useState<string | null>(null)
  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFetchingMore, setIsFetchingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const ws = useWS()

  const pendingSendsRef = useRef<Map<string, { data: SendMessageDto; file?: File }>>(new Map())

  // Load chat room details and initial history
  useEffect(() => {
    let active = true

    const initChat = async () => {
      if (!jobId) return
      setIsLoading(true)
      try {
        const chatRoom = await chatService.getRoom(jobId)
        if (!active) return
        setRoomId(chatRoom.id)
        setRoom(chatRoom)

        const history = await chatService.getHistory(jobId, 20)
        if (!active) return
        const safeHistory = history || []
        setMessages(safeHistory)
        setHasMore(safeHistory.length === 20)

        // Mark read on mount
        await chatService.markRead(chatRoom.id)
      } catch (err: any) {
        console.error('[useChat] Failed to initialize chat:', err)
        toast.error('Failed to load chat history')
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    initChat()

    return () => {
      active = false
    }
  }, [jobId])

  // Subscribe to WS updates
  useEffect(() => {
    if (!token || !jobId || !roomId) return

    // Connect to room websocket (job:{jobId})
    ws.connect(`job:${jobId}`, token)

    const handleNewMessage = (payload: any) => {
      const incoming: ChatMessage = {
        id: payload.id || payload.messageId,
        roomId: payload.roomId,
        senderId: payload.senderId,
        senderName: payload.senderName,
        type: payload.type,
        content: payload.content,
        mediaUrl: payload.mediaUrl,
        createdAt: payload.createdAt,
        isRead: payload.isRead,
      }

      setMessages((prev) => {
        // 1. Deduplicate by ID
        const exists = prev.some((m) => m.id === incoming.id)
        if (exists) return prev

        // 2. If it's from the current user, it might match an optimistic message.
        // We can replace the optimistic message if they have similar properties.
        if (incoming.senderId === user?.id) {
          const optIndex = prev.findIndex(
            (m) =>
              m.status === 'sending' &&
              m.type === incoming.type &&
              (incoming.type === 'text' ? m.content === incoming.content : true)
          )
          if (optIndex > -1) {
            const updated = [...prev]
            updated[optIndex] = incoming
            return updated
          }
        }

        // 3. Mark read immediately if we are active in this chat room
        if (incoming.senderId !== user?.id) {
          chatService.markRead(roomId).catch(err => {
            console.error('[useChat] Failed to mark incoming message as read:', err)
          })
        }

        return [...prev, incoming]
      })
    }

    ws.on('new_message', handleNewMessage)

    return () => {
      ws.off('new_message', handleNewMessage)
    }
  }, [token, jobId, roomId, ws, user?.id])

  // Load older history (pagination)
  const loadMore = useCallback(async () => {
    if (isFetchingMore || !hasMore || !messages || messages.length === 0 || !jobId) return

    setIsFetchingMore(true)
    try {
      const firstMsgId = messages[0].id
      // If the first message is an optimistic one, skip pagination
      if (firstMsgId.startsWith('temp-')) {
        setIsFetchingMore(false)
        return
      }

      const older = await chatService.getHistory(jobId, 20, firstMsgId)
      const safeOlder = older || []
      if (safeOlder.length < 20) {
        setHasMore(false)
      }
      setMessages((prev) => {
        const safePrev = prev || []
        // filter out older messages that are already in the list
        const filteredOlder = safeOlder.filter((o) => !safePrev.some((p) => p.id === o.id))
        return [...filteredOlder, ...safePrev]
      })
    } catch (err) {
      console.error('[useChat] Failed to fetch older messages:', err)
      toast.error('Failed to load older messages')
    } finally {
      setIsFetchingMore(false)
    }
  }, [isFetchingMore, hasMore, messages, jobId])

  // Send helper
  const performSend = async (tempId: string, type: 'text' | 'voice' | 'image', content?: string, mediaUrl?: string, file?: File) => {
    if (!roomId) return

    try {
      let resolvedMediaUrl = mediaUrl

      // If a media file is provided, upload it first
      if (file) {
        const uploadRes = await chatService.uploadFile(roomId, file)
        resolvedMediaUrl = uploadRes.presignedUrl
      }

      const result = await chatService.sendMessage(roomId, {
        type,
        content: content || '',
        mediaUrl: resolvedMediaUrl || '',
      })

      // Replace optimistic message
      setMessages((prev) =>
        prev.map((msg) => (msg.id === tempId ? { ...result, status: 'sent' } : msg))
      )
      pendingSendsRef.current.delete(tempId)
    } catch (err) {
      console.error('[useChat] Failed to send message:', err)
      setMessages((prev) =>
        prev.map((msg) => (msg.id === tempId ? { ...msg, status: 'failed' } : msg))
      )
      // Save details for retry
      pendingSendsRef.current.set(tempId, {
        data: { type, content, mediaUrl },
        file,
      })
    }
  }

  // Send a text message
  const sendText = useCallback(
    async (content: string) => {
      if (!roomId || !user) return
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const optimisticMsg: ChatMessage = {
        id: tempId,
        roomId,
        senderId: user.id,
        senderName: user.name || 'User',
        type: 'text',
        content,
        mediaUrl: '',
        createdAt: new Date().toISOString(),
        isRead: false,
        status: 'sending',
      }

      setMessages((prev) => [...prev, optimisticMsg])
      await performSend(tempId, 'text', content)
    },
    [roomId, user]
  )

  // Send a voice message
  const sendVoice = useCallback(
    async (file: File) => {
      if (!roomId || !user) return
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const optimisticMsg: ChatMessage = {
        id: tempId,
        roomId,
        senderId: user.id,
        senderName: user.name || 'User',
        type: 'voice',
        content: '',
        mediaUrl: URL.createObjectURL(file), // Local preview url
        createdAt: new Date().toISOString(),
        isRead: false,
        status: 'sending',
      }

      setMessages((prev) => [...prev, optimisticMsg])
      await performSend(tempId, 'voice', '', undefined, file)
    },
    [roomId, user]
  )

  // Send an image message
  const sendImage = useCallback(
    async (file: File) => {
      if (!roomId || !user) return
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const optimisticMsg: ChatMessage = {
        id: tempId,
        roomId,
        senderId: user.id,
        senderName: user.name || 'User',
        type: 'image',
        content: '',
        mediaUrl: URL.createObjectURL(file), // Local preview url
        createdAt: new Date().toISOString(),
        isRead: false,
        status: 'sending',
      }

      setMessages((prev) => [...prev, optimisticMsg])
      await performSend(tempId, 'image', '', undefined, file)
    },
    [roomId, user]
  )

  // Retry sending a failed message
  const retryMessage = useCallback(
    async (tempId: string) => {
      const pending = pendingSendsRef.current.get(tempId)
      if (!pending) return

      // Toggle status back to sending
      setMessages((prev) =>
        prev.map((msg) => (msg.id === tempId ? { ...msg, status: 'sending' } : msg))
      )

      const { data, file } = pending
      await performSend(tempId, data.type, data.content, data.mediaUrl, file)
    },
    [roomId]
  )

  return {
    messages,
    isLoading,
    isFetchingMore,
    hasMore,
    roomId,
    room,
    sendText,
    sendVoice,
    sendImage,
    loadMore,
    retryMessage,
  }
}
