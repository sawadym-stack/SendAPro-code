import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

type RetryRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
}

/** Structured API error with code field for switch-based error handling */
export interface StructuredApiError {
  message: string
  code: string
  details?: Array<{ field: string; message: string }>
  statusCode: number
}

const rawBaseUrl = (import.meta.env.VITE_API_URL ?? '').trim()
const isAbsoluteHttp = /^https?:\/\//.test(rawBaseUrl)
const isRelativeProxyPath = rawBaseUrl.startsWith('/')
const resolvedBaseUrl = isAbsoluteHttp || isRelativeProxyPath ? rawBaseUrl : '/api/v1'

const rawAuthBaseUrl = (import.meta.env.VITE_AUTH_API_URL ?? '').trim()
const resolvedAuthBaseUrl = rawAuthBaseUrl || '/v1'

const api = axios.create({
  baseURL: resolvedBaseUrl,
})

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (err: any) => void
}> = []

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (token) {
      prom.resolve(token)
    } else {
      prom.reject(error)
    }
  })
  failedQueue = []
}

api.interceptors.request.use((config) => {
  const requestUrl = config.url ?? ''
  const isAuthEndpoint = requestUrl.includes('/auth/')
  const token = useAuthStore.getState().token
  if (token && !isAuthEndpoint) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryRequestConfig | undefined
    const requestUrl = originalRequest?.url ?? ''
    const isAuthEndpoint = requestUrl.includes('/auth/')

    // Network error (no internet / server unreachable)
    if (!error.response) {
      toast.error('No internet connection. Please check your network.', { id: 'network-error' })
      return Promise.reject(error)
    }

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers = originalRequest.headers || {}
              originalRequest.headers.Authorization = `Bearer ${token}`
              resolve(api(originalRequest))
            },
            reject: (err: any) => {
              reject(err)
            },
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const state = useAuthStore.getState()
        if (!state.refreshToken) {
          state.logout()
          window.location.href = '/login'
          return Promise.reject(error)
        }

        const refreshResponse = await axios.post<{ access_token?: string; accessToken?: string }>(
          `${resolvedAuthBaseUrl.replace(/\/$/, '')}/auth/refresh`,
          { refreshToken: state.refreshToken },
        )
        const newToken = refreshResponse.data?.access_token ?? refreshResponse.data?.accessToken

        if (!newToken || !state.user || !state.role) {
          state.logout()
          window.location.href = '/login'
          return Promise.reject(error)
        }

        state.setAuth(state.user, newToken, state.role, state.refreshToken, state.rememberMe)
        
        processQueue(null, newToken)
        isRefreshing = false

        originalRequest.headers = originalRequest.headers || {}
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        isRefreshing = false

        useAuthStore.getState().logout()
        // Show session expired toast before redirecting
        toast.error('Session expired, please login again', { id: 'session-expired' })
        setTimeout(() => {
          window.location.href = '/login'
        }, 1500)
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  },
)

/** Extracts a StructuredApiError from an axios error */
export function extractApiError(error: unknown): StructuredApiError {
  const axiosError = error as AxiosError<{
    error?: { code?: string; message?: string } | string
    message?: string
    code?: string
    details?: Array<{ field: string; message: string }>
  }>

  const responseData = axiosError.response?.data
  const statusCode = axiosError.response?.status ?? 500

  // Handle envelope format: { success: false, error: { code, message } }
  let code = 'INTERNAL_ERROR'
  let message = 'Something went wrong. Please try again.'

  if (responseData?.error && typeof responseData.error === 'object') {
    code = responseData.error.code ?? code
    message = responseData.error.message ?? message
  } else if (typeof responseData?.error === 'string') {
    message = responseData.error
  } else if (responseData?.message) {
    message = responseData.message
  } else if (responseData?.code) {
    code = responseData.code
  }

  return {
    message,
    code,
    details: responseData?.details,
    statusCode,
  }
}

export default api

