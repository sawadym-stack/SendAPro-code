import React, { createContext, useContext, useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import { useWebSocket } from '../hooks/useWebSocket'

interface WSContextType {
  connect: (room: string, token: string) => void
  disconnect: () => void
  on: (eventType: string, handler: Function) => void
  off: (eventType: string, handler: Function) => void
  isConnected: boolean
}

const WSContext = createContext<WSContextType | null>(null)

export const WSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const ws = useWebSocket()
  
  const defaultRoomRef = useRef<string>('')
  
  useEffect(() => {
    if (user?.id) {
      defaultRoomRef.current = `user:${user.id}`
    } else {
      defaultRoomRef.current = ''
    }
  }, [user?.id])

  // 1. Auto-connect when user logs in, and disconnect when user logs out
  useEffect(() => {
    if (isAuthenticated && token && defaultRoomRef.current) {
      console.log('[WS Context] Auto-connecting to default user room:', defaultRoomRef.current)
      ws.connect(defaultRoomRef.current, token)
    } else {
      console.log('[WS Context] User unauthenticated, disconnecting WebSocket...')
      ws.disconnect()
    }

    return () => {
      ws.disconnect()
    }
  }, [isAuthenticated, token, user?.id])

  // 2. Wrap connect/disconnect to implement room switching fallbacks
  const value = React.useMemo(() => {
    return {
      connect: (room: string, token: string) => {
        ws.connect(room, token)
      },
      disconnect: () => {
        // If a page disconnects, check if the session is still active
        // If so, fall back to the default user room so notifications continue
        const activeToken = useAuthStore.getState().token
        if (useAuthStore.getState().isAuthenticated && activeToken && defaultRoomRef.current) {
          console.log('[WS Context] Page disconnected custom room. Reconnecting to default user room:', defaultRoomRef.current)
          ws.connect(defaultRoomRef.current, activeToken)
        } else {
          ws.disconnect()
        }
      },
      on: (eventType: string, handler: Function) => {
        ws.on(eventType, handler)
      },
      off: (eventType: string, handler: Function) => {
        ws.off(eventType, handler)
      },
      isConnected: ws.isConnected,
    }
  }, [ws.isConnected])

  return <WSContext.Provider value={value}>{children}</WSContext.Provider>
}

export const useWS = () => {
  const context = useContext(WSContext)
  if (!context) {
    throw new Error('useWS must be used within a WSProvider')
  }
  return context
}
