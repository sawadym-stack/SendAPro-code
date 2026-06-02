import { useEffect, useState, useRef } from 'react'
import { Bell, Trash2, Sparkles } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useWS } from '../../context/WSContext'

interface NotificationItem {
  id: string
  title: string
  message: string
  timestamp: Date
  read: boolean
}

const NotificationBell = () => {
  const ws = useWS()
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    try {
      const stored = localStorage.getItem('fixflow_notifications')
      if (stored) {
        const parsed = JSON.parse(stored)
        return parsed.map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp),
        }))
      }
    } catch (e) {
      console.error('Failed to load notifications from localStorage', e)
    }
    return []
  })
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('fixflow_notifications', JSON.stringify(notifications))
  }, [notifications])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const handleNotification = (payload: any) => {
      const title = payload.title || 'New Notification'
      const message = payload.message || (typeof payload === 'string' ? payload : 'You have a new update')
      
      const newNotification: NotificationItem = {
        id: payload.id || Math.random().toString(36).substring(2, 9),
        title,
        message,
        timestamp: new Date(),
        read: false,
      }

      setNotifications((prev) => [newNotification, ...prev].slice(0, 50)) // Cap at 50
      
      // Push toast notification
      toast.custom((t) => (
        <div
          className={`${
            t.visible ? 'animate-enter' : 'animate-leave'
          } max-w-md w-full bg-slate-900/95 text-slate-100 border border-slate-800 shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-black ring-opacity-5 backdrop-blur-md p-4`}
        >
          <div className="flex-1 w-0">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <Sparkles className="h-5 w-5 animate-pulse" />
                </div>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-bold text-slate-200">
                  {title}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {message}
                </p>
              </div>
            </div>
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              onClick={() => toast.dismiss(t.id)}
              className="bg-transparent rounded-md text-xs font-semibold text-slate-500 hover:text-slate-350 focus:outline-none"
            >
              Close
            </button>
          </div>
        </div>
      ), { id: newNotification.id })
    }

    ws.on('notification', handleNotification)
    return () => {
      ws.off('notification', handleNotification)
    }
  }, [ws])

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const clearAll = () => {
    setNotifications([])
    setIsOpen(false)
  }

  const handleToggle = () => {
    setIsOpen(!isOpen)
    if (!isOpen) {
      markAllAsRead()
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors focus:outline-none"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-1 shadow-2xl ring-1 ring-black/5 animate-scale-up z-50">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-xs font-extrabold text-slate-800 tracking-wider uppercase">Notifications</h3>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-red-650 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center text-slate-400">
                <Bell className="h-8 w-8 text-slate-300 stroke-1 mb-2 animate-bounce" />
                <p className="text-xs font-semibold text-slate-500">All caught up!</p>
                <p className="text-[10px] text-slate-400 mt-0.5">No notifications yet.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex flex-col px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-b-0 transition-colors ${
                    !n.read ? 'bg-blue-50/20' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-xs font-extrabold text-slate-850 leading-tight">
                      {n.title}
                    </p>
                    <span className="text-[9px] text-slate-400 font-medium shrink-0">
                      {n.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    {n.message}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
