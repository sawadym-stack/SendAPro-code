import React, { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { Paperclip, Send, Loader2, ArrowDown, AlertCircle, RefreshCw, X } from 'lucide-react'
import { useChat } from '../../hooks/useChat'
import type { ChatMessage } from '../../services/chat.service'
import VoiceNote from './VoiceNote'
import VoiceNotePlayer from './VoiceNotePlayer'

interface ChatRoomProps {
  jobId: string
  currentUserId: string
}

export const ChatRoom: React.FC<ChatRoomProps> = ({ jobId, currentUserId }) => {
  const {
    messages,
    isLoading,
    isFetchingMore,
    roomId,
    sendText,
    sendVoice,
    sendImage,
    loadMore,
    retryMessage,
  } = useChat(jobId)

  const [inputText, setInputText] = useState('')
  const [showScrollBadge, setShowScrollBadge] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  const chatContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollHeightRef = useRef<number>(0)
  const scrollTopRef = useRef<number>(0)

  // 1. Manage Textarea Auto-growth (Max 4 lines)
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
    adjustTextareaHeight()
  }

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const newHeight = Math.min(textarea.scrollHeight, 120) // Max height 120px (~4 lines)
    textarea.style.height = `${newHeight}px`
  }

  // 2. Infinite Scroll Intersection Observer for Paginated History
  const topIntersectionRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = chatContainerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading && !isFetchingMore) {
          // Store height & scroll positions prior to loading older messages
          scrollHeightRef.current = container.scrollHeight
          scrollTopRef.current = container.scrollTop
          loadMore()
        }
      },
      { root: container, threshold: 0.1 }
    )

    const topSentinel = topIntersectionRef.current
    if (topSentinel) {
      observer.observe(topSentinel)
    }

    return () => {
      if (topSentinel) {
        observer.unobserve(topSentinel)
      }
    }
  }, [isLoading, isFetchingMore, loadMore])

  // 3. Maintain Scroll Position on History Prepended
  useLayoutEffect(() => {
    const container = chatContainerRef.current
    if (!container) return

    if (isFetchingMore) return

    if (scrollHeightRef.current > 0) {
      // Restore relative scroll position
      const deltaHeight = container.scrollHeight - scrollHeightRef.current
      container.scrollTop = scrollTopRef.current + deltaHeight
      scrollHeightRef.current = 0
    }
  }, [messages, isFetchingMore])

  // 4. Handle auto-scrolling to bottom on new messages
  const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
    const container = chatContainerRef.current
    if (!container) return
    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    })
    setShowScrollBadge(false)
  }

  // Scroll on first fetch and when messages list expands (if already near bottom)
  const lastMessagesLengthRef = useRef(messages?.length || 0)
  useEffect(() => {
    const container = chatContainerRef.current
    if (!container) return

    const messagesCount = messages?.length || 0
    const isInitialLoad = lastMessagesLengthRef.current === 0 && messagesCount > 0
    const wasNewMessageAdded = messagesCount > lastMessagesLengthRef.current

    if (isInitialLoad) {
      scrollToBottom('auto')
    } else if (wasNewMessageAdded && messages) {
      const lastMsg = messages[messagesCount - 1]
      const isOwnMessage = lastMsg?.senderId === currentUserId

      // If user is near bottom (< 150px) or it's their own message, scroll down
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150
      if (isOwnMessage || isNearBottom) {
        scrollToBottom('smooth')
      } else {
        // Show floating "New Message" badge if scrolled up
        setShowScrollBadge(true)
      }
    }

    lastMessagesLengthRef.current = messagesCount
  }, [messages, currentUserId])

  // Handle scroll listener to dismiss/show floating badge
  const handleScroll = () => {
    const container = chatContainerRef.current
    if (!container) return
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
    if (isNearBottom) {
      setShowScrollBadge(false)
    }
  }

  // 5. Send message action
  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const content = inputText.trim()
    if (!content) return
    setInputText('')
    adjustTextareaHeight()
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    await sendText(content)
  }

  // Handle key triggers (Enter to send, Shift+Enter for newlines)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 6. Handle Image attachments
  const handleFileAttachClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Clean picker
    e.target.value = ''

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      alert('Only JPEG, PNG, or WEBP images are supported.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File exceeds the 5MB size limit.')
      return
    }

    await sendImage(file)
  }

  // 7. Lightbox keyboard bindings
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxImage(null)
      }
    }
    if (lightboxImage) {
      window.addEventListener('keydown', handleGlobalKeyDown)
    }
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [lightboxImage])

  // Helper to group messages by sender within a 5 minute interval
  const groupedMessages = React.useMemo(() => {
    const groups: {
      senderId: string
      senderName: string
      timeLabel: string
      messages: ChatMessage[]
    }[] = []

    const safeMessages = messages || []
    safeMessages.forEach((msg) => {
      const msgTime = new Date(msg.createdAt)
      const lastGroup = groups[groups.length - 1]

      const shouldCreateNewGroup =
        !lastGroup ||
        lastGroup.senderId !== msg.senderId ||
        msgTime.getTime() - new Date(lastGroup.messages[lastGroup.messages.length - 1].createdAt).getTime() > 5 * 60 * 1000

      if (shouldCreateNewGroup) {
        groups.push({
          senderId: msg.senderId,
          senderName: msg.senderName,
          timeLabel: msgTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          messages: [msg],
        })
      } else {
        lastGroup.messages.push(msg)
      }
    })

    return groups
  }, [messages])

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-400 gap-3 min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        <span className="text-xs font-mono tracking-wider">Syncing chat log...</span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 relative overflow-hidden">
      {/* Messages Scroll Container */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent"
      >
        {/* Infinite Scroll Top Sentinel */}
        <div ref={topIntersectionRef} className="h-1 flex items-center justify-center">
          {isFetchingMore && (
            <Loader2 className="h-4 w-4 animate-spin text-sky-500/80 my-2" />
          )}
        </div>

        {groupedMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-2">
            <div className="h-12 w-12 rounded-full border border-dashed border-slate-800 flex items-center justify-center text-slate-600">
              💬
            </div>
            <p className="text-xs font-medium">No messages yet. Send a message to start chatting!</p>
          </div>
        )}

        {groupedMessages.map((group, groupIdx) => {
          const isOwn = group.senderId === currentUserId
          const avatarLetter = group.senderName.slice(0, 1).toUpperCase()

          return (
            <div
              key={groupIdx}
              className={`flex items-end gap-3 ${isOwn ? 'justify-end' : 'justify-start'}`}
            >
              {/* Avatar on other user's message groups */}
              {!isOwn && (
                <div className="h-8 w-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xs font-bold text-sky-400 shrink-0">
                  {avatarLetter}
                </div>
              )}

              {/* Grouped Bubbles stack */}
              <div className={`flex flex-col max-w-[70%] space-y-1.5 ${isOwn ? 'items-end' : 'items-start'}`}>
                {/* Sender Name (Only on first bubble in group if not own) */}
                {!isOwn && (
                  <span className="text-[10px] font-bold text-slate-500 ml-1.5 uppercase tracking-wide">
                    {group.senderName}
                  </span>
                )}

                {group.messages.map((msg, msgIdx) => {
                  const isLast = msgIdx === group.messages.length - 1
                  const isSending = msg.status === 'sending'
                  const isFailed = msg.status === 'failed'

                  return (
                    <div
                      key={msg.id}
                      className="group/msg relative flex items-center gap-2"
                    >
                      {/* Retry Button / Status indicators */}
                      {isOwn && isFailed && (
                        <button
                          onClick={() => retryMessage(msg.id)}
                          className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/25 transition-colors cursor-pointer"
                          title="Retry sending"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                      )}

                      {/* Message Bubble wrapper */}
                      <div
                        className={`p-3.5 relative overflow-hidden text-sm leading-relaxed transition-all duration-200 ${
                          isOwn
                            ? `bg-gradient-to-tr from-sky-600/90 to-blue-700/90 text-white rounded-3xl border border-sky-500/10 shadow-[0_4px_12px_rgba(14,165,233,0.15)] ${
                                isLast ? 'rounded-br-sm' : ''
                              }`
                            : `bg-slate-900/70 border border-slate-850 text-slate-100 rounded-3xl ${
                                isLast ? 'rounded-bl-sm' : ''
                              }`
                        }`}
                      >
                        {/* 1. TEXT MESSAGE TYPE */}
                        {msg.type === 'text' && (
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        )}

                        {/* 2. IMAGE MESSAGE TYPE */}
                        {msg.type === 'image' && (
                          <div className="relative overflow-hidden rounded-xl bg-slate-950 border border-slate-800/80">
                            <ImageBubble src={msg.mediaUrl} onClick={() => setLightboxImage(msg.mediaUrl)} />
                          </div>
                        )}

                        {/* 3. VOICE MESSAGE TYPE */}
                        {msg.type === 'voice' && (
                          <div className="min-w-[220px]">
                            <VoiceNotePlayer url={msg.mediaUrl} />
                          </div>
                        )}

                        {/* Sending Loader state overlay */}
                        {isOwn && isSending && (
                          <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                          </div>
                        )}

                        {/* Tooltip Hover Timestamp & Tick indicators */}
                        <div
                          className={`absolute bottom-1 right-2.5 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150 text-[9px] ${
                            isOwn ? 'text-sky-200' : 'text-slate-500'
                          }`}
                        >
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Own message read status ticks */}
                      {isOwn && !isSending && !isFailed && (
                        <div className="shrink-0 flex items-center text-sky-400 select-none">
                          {msg.isRead ? (
                            <span className="text-[10px] font-bold text-sky-400 tracking-[-2px]">✓✓</span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-600">✓</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Group Timestamp Footer */}
                <span className="text-[9px] text-slate-600 font-mono tracking-wider ml-1 mt-0.5">
                  {group.timeLabel}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Floating Scroll Badge */}
      {showScrollBadge && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-full text-xs font-bold shadow-lg shadow-sky-500/30 hover:bg-sky-600 transition-all scale-up z-20 cursor-pointer"
        >
          <ArrowDown className="h-3.5 w-3.5 animate-bounce" />
          <span>New Messages</span>
        </button>
      )}

      {/* Input controls layout */}
      <div className="border-t border-slate-900 bg-slate-950 px-4 py-3.5 flex flex-col gap-3 relative z-30">
        <form onSubmit={handleSend} className="flex items-end gap-2.5">
          {/* File attachment buttons */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={handleFileAttachClick}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:border-sky-500/30 hover:text-sky-400 hover:bg-slate-900/60 active:scale-95 transition-all cursor-pointer"
            title="Attach image"
          >
            <Paperclip className="h-5 w-5" />
          </button>

          {/* Autogrowing Input box */}
          <div className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 focus-within:border-sky-500/40 transition-all flex items-end">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1 bg-transparent border-0 focus:outline-none focus:ring-0 text-sm text-slate-100 placeholder-slate-500 resize-none font-sans scrollbar-none"
              style={{ height: 'auto', maxHeight: '120px' }}
            />
          </div>

          {/* Voice recorder action */}
          {roomId && (
            <VoiceNote roomId={roomId} onSend={sendVoice} />
          )}

          {/* Send text action */}
          {inputText.trim() && (
            <button
              type="submit"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <Send className="h-4 w-4 ml-0.5" />
            </button>
          )}
        </form>
      </div>

      {/* Lightbox Modal overlay */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-6 right-6 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Close Lightbox"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxImage}
            alt="Full-sized preview"
            className="max-w-full max-h-[85vh] object-contain rounded-2xl border border-slate-900/60 shadow-2xl animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

// Subcomponent to handle loading state/skeletons of thumbnails in messages list
const ImageBubble = ({ src, onClick }: { src: string; onClick: () => void }) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  return (
    <div
      onClick={!loading && !error ? onClick : undefined}
      className={`relative max-w-[240px] max-h-[180px] w-48 h-36 flex items-center justify-center cursor-pointer overflow-hidden ${
        loading ? 'animate-pulse bg-slate-800' : ''
      }`}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {error ? (
        <div className="flex flex-col items-center gap-1.5 p-4 text-center text-red-400 bg-red-950/20 w-full h-full justify-center">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span className="text-[10px] font-medium font-mono uppercase tracking-wider">Image unavailable</span>
        </div>
      ) : (
        <img
          src={src}
          alt="Shared thumbnail"
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            loading ? 'opacity-0' : 'opacity-100'
          }`}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false)
            setError(true)
          }}
        />
      )}
    </div>
  )
}

export default ChatRoom
