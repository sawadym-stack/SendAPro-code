import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Role, User } from '../types'

interface AuthState {
  user: User | null
  token: string | null
  refreshToken: string | null
  role: Role | null
  isAuthenticated: boolean
  rememberMe: boolean
  setAuth: (user: User, token: string, role: Role, refreshToken: string | null, rememberMe?: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      role: null,
      isAuthenticated: false,
      rememberMe: true,
      setAuth: (user, token, role, refreshToken, rememberMe = true) => {
        set({ user, token, role, refreshToken, rememberMe, isAuthenticated: true })
      },
      logout: () => {
        set({ user: null, token: null, refreshToken: null, role: null, rememberMe: true, isAuthenticated: false })
      },
    }),
    {
      name: 'fixflow-auth',
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          const localVal = localStorage.getItem(name)
          if (localVal) return localVal
          return sessionStorage.getItem(name)
        },
        setItem: (name, value) => {
          try {
            const parsed = JSON.parse(value)
            const rememberMe = parsed?.state?.rememberMe
            if (rememberMe) {
              localStorage.setItem(name, value)
              sessionStorage.removeItem(name)
            } else {
              sessionStorage.setItem(name, value)
              localStorage.removeItem(name)
            }
          } catch (e) {
            localStorage.setItem(name, value)
          }
        },
        removeItem: (name) => {
          localStorage.removeItem(name)
          sessionStorage.removeItem(name)
        },
      })),
    },
  ),
)

