import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import authService from '../services/auth.service'

export interface WSEvent {
  type: string
  roomId?: string
  payload: any
}

interface UseWebSocketApi {
  connect: (room: string, token: string) => void
  disconnect: () => void
  on: (eventType: string, handler: Function) => void
  off: (eventType: string, handler: Function) => void
  isConnected: boolean
}

export const useWebSocket = (): UseWebSocketApi => {
  const wsRef = useRef<WebSocket | null>(null)
  const roomRef = useRef<string>('')
  const reconnectTimeoutRef = useRef<any>(null)
  const handlersRef = useRef<Map<string, Set<Function>>>(new Map())
  const reconnectDelayRef = useRef<number>(1000)
  const [isConnected, setIsConnected] = useState(false)

  const clearReconnectTimeout = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }

  const connect = useCallback((room: string, token: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (roomRef.current === room) {
        return // Already connected to this exact room
      }
      // If switching rooms, close the existing socket first
      wsRef.current.close(1000, 'switching room')
    }

    clearReconnectTimeout()
    roomRef.current = room

    const wsUrlBase = (import.meta.env.VITE_WS_URL || '').trim() || 'ws://localhost:8080'
    const url = `${wsUrlBase}/ws?token=${encodeURIComponent(token)}&room=${encodeURIComponent(room)}`
    
    console.log('[WS Hook] Connecting to:', url)
    const socket = new WebSocket(url)
    wsRef.current = socket

    socket.onopen = () => {
      reconnectDelayRef.current = 1000 // Reset backoff delay on successful connection
      setIsConnected(true)
      console.log('[WS Hook] Connected to room:', room)
    }

    socket.onmessage = (event) => {
      try {
        const wsEvent = JSON.parse(event.data)
        const handlers = handlersRef.current.get(wsEvent.type) ?? new Set()
        handlers.forEach((handler) => {
          try {
            handler(wsEvent.payload)
          } catch (handlerErr) {
            console.error('[WS Hook] Error in event handler callback:', handlerErr)
          }
        })
      } catch (err) {
        console.error('[WS Hook] Failed to parse WebSocket message data:', err)
      }
    }

    socket.onclose = (event) => {
      if (wsRef.current !== socket) {
        console.log('[WS Hook] Old socket closed, ignoring onclose logic.')
        return
      }

      setIsConnected(false)
      wsRef.current = null

      if (event.code === 4001) {
        console.warn('[WS Hook] Unauthorized close code (4001). Attempting silent token refresh...')
        const state = useAuthStore.getState()
        if (state.refreshToken) {
          authService.refreshToken(state.refreshToken)
            .then((res) => {
              const newToken = res.access_token
              if (newToken && state.user && state.role) {
                console.log('[WS Hook] Silent token refresh succeeded. Reconnecting WebSocket...')
                state.setAuth(state.user, newToken, state.role, state.refreshToken)
                if (roomRef.current) {
                  connect(roomRef.current, newToken)
                }
              } else {
                console.error('[WS Hook] Invalid refresh response. Logging out...')
                state.logout()
              }
            })
            .catch((err) => {
              console.error('[WS Hook] Silent token refresh failed. Logging out...', err)
              state.logout()
            })
        } else {
          console.warn('[WS Hook] No refresh token found. Logging out...')
          state.logout()
        }
        return
      }

      if (event.code === 4002) {
        console.error('[WS Hook] Invalid room close code (4002). Reconnection aborted.')
        return
      }

      // Do not auto-reconnect if it was a normal user-initiated disconnect
      if (event.reason === 'user disconnect' || event.code === 1000) {
        console.log('[WS Hook] Connection closed normally by user request.')
        return
      }

      console.log(`[WS Hook] Socket closed unexpectedly (code: ${event.code}). Reconnecting in ${reconnectDelayRef.current}ms...`)
      
      reconnectTimeoutRef.current = setTimeout(() => {
        const currentToken = useAuthStore.getState().token
        if (currentToken && roomRef.current) {
          connect(roomRef.current, currentToken)
        }
      }, reconnectDelayRef.current)

      reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000)
    }

    socket.onerror = (err) => {
      console.error('[WS Hook] Socket error:', err)
      socket.close()
    }
  }, [])

  const disconnect = useCallback(() => {
    clearReconnectTimeout()
    if (wsRef.current) {
      wsRef.current.close(1000, 'user disconnect')
      wsRef.current = null
    }
    setIsConnected(false)
  }, [])

  const on = useCallback((eventType: string, handler: Function) => {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set())
    }
    handlersRef.current.get(eventType)!.add(handler)
  }, [])

  const off = useCallback((eventType: string, handler: Function) => {
    handlersRef.current.get(eventType)?.delete(handler)
  }, [])

  // Auto-clean up on component unmount
  useEffect(() => {
    return () => {
      // Intentionally empty: lifecycle is managed by the shared WSContext Provider
    }
  }, [])

  return { connect, disconnect, on, off, isConnected }
}
