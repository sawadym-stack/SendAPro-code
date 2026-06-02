import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { Toaster, useToasterStore, toast } from 'react-hot-toast'
import AppRouter from './router'
import { WSProvider } from './context/WSContext'
import { useRealtimeUpdates } from './hooks/useRealtimeUpdates'

const TOAST_LIMIT = 3

// ToastLimiter ensures that only a maximum of 3 toasts are visible concurrently.
const ToastLimiter = () => {
  const { toasts } = useToasterStore()

  useEffect(() => {
    toasts
      .filter((t) => t.visible)
      .filter((_, i) => i >= TOAST_LIMIT)
      .forEach((t) => toast.dismiss(t.id))
  }, [toasts])

  return null
}

// RealtimeManager mounts the central WS event → cache invalidation hook.
// Must be inside WSProvider and QueryClientProvider.
const RealtimeManager = () => {
  useRealtimeUpdates()
  return null
}

function App() {
  return (
    <BrowserRouter>
      <WSProvider>
        <RealtimeManager />
        <AppRouter />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'rgba(15, 23, 42, 0.95)', // Slate 900
              color: '#f8fafc', // Slate 50
              border: '1px solid #1e293b', // Slate 800
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: '600',
              padding: '12px 16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(8px)',
            },
            success: {
              iconTheme: {
                primary: '#10b981', // Emerald 500
                secondary: '#0f172a',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444', // Red 500
                secondary: '#0f172a',
              },
            },
          }}
        />
        <ToastLimiter />
      </WSProvider>
    </BrowserRouter>
  )
}

export default App

