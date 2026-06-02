import axios, { type AxiosError } from 'axios'
import type { Role, User } from '../types'

interface AuthGatewayResponse {
  user_id?: string
  userId?: string
  access_token?: string
  accessToken?: string
  refresh_token?: string
  refreshToken?: string
  access_expires_at_unix?: number
  accessExpiresAtUnix?: number
  refresh_expires_at_unix?: number
  refreshExpiresAtUnix?: number
}

interface ValidateTokenResponse {
  user_id?: string
  userId?: string
  email: string
  role: Role
  expires_at_unix?: number
  expiresAtUnix?: number
  valid: boolean
}

interface AuthResponse {
  user: User
  token: string
  refreshToken: string
  role: Role
}

export class AuthError extends Error {
  userId?: string
  email?: string
  role?: string
  otp?: string
  constructor(message: string, extra?: { userId?: string; email?: string; role?: string; otp?: string }) {
    super(message)
    this.name = 'AuthError'
    if (extra) {
      this.userId = extra.userId
      this.email = extra.email
      this.role = extra.role
      this.otp = extra.otp
    }
  }
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  name: string
  phone: string
  email: string
  password: string
  role: Role
}

const authBaseURL = (import.meta.env.VITE_AUTH_API_URL ?? '/v1').trim() || '/v1'
const authApi = axios.create({ baseURL: authBaseURL })

const buildUserFromValidate = (
  validated: ValidateTokenResponse,
  fallback: { name?: string; phone?: string },
): User => ({
  id: validated.user_id ?? validated.userId ?? '',
  name: fallback.name ?? validated.email.split('@')[0] ?? 'SendAPro User',
  email: validated.email,
  phone: fallback.phone ?? '',
  role: validated.role,
  createdAt: new Date().toISOString(),
})

const exchangeAuth = async (
  authTokens: AuthGatewayResponse,
  fallback: { name?: string; phone?: string },
): Promise<AuthResponse> => {
  const accessToken = authTokens.access_token ?? authTokens.accessToken
  const refreshToken = authTokens.refresh_token ?? authTokens.refreshToken
  if (!accessToken || !refreshToken) {
    throw new Error('Authentication response is missing tokens')
  }

  const validateRes = await authApi.post<ValidateTokenResponse>('/auth/validate', {
    token: accessToken,
  })

  const validated = validateRes.data
  if (!validated.valid) {
    throw new Error('Token validation failed after authentication')
  }

  return {
    user: buildUserFromValidate(validated, fallback),
    token: accessToken,
    refreshToken: refreshToken,
    role: validated.role,
  }
}

const getFriendlyAuthError = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ message?: string; error?: string; details?: unknown }>
    const status = axiosError.response?.status
    const serverMessage = axiosError.response?.data?.message ?? axiosError.response?.data?.error
    if (serverMessage) {
      return serverMessage
    }
    if (status === 401) {
      return fallback
    }
    return axiosError.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}

const authService = {
  async register(payload: RegisterPayload): Promise<AuthResponse> {
    try {
      const response = await authApi.post<AuthGatewayResponse>('/auth/register', payload)
      return exchangeAuth(response.data, { name: payload.name, phone: payload.phone })
    } catch (error) {
      throw new Error(getFriendlyAuthError(error, 'Registration failed. Please try again.'))
    }
  },

  async login(payload: LoginPayload): Promise<AuthResponse> {
    try {
      const response = await authApi.post<AuthGatewayResponse>('/auth/login', payload)
      return exchangeAuth(response.data, {})
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const data = error.response.data as any
        const msg = data?.error ?? data?.message ?? 'Invalid email or password.'
        throw new AuthError(msg, {
          userId: data?.userId ?? data?.userID,
          email: data?.email,
          role: data?.role,
          otp: data?.otp,
        })
      }
      throw new AuthError(error instanceof Error ? error.message : 'Invalid email or password.')
    }
  },

  async logout(): Promise<void> {
    return Promise.resolve()
  },

  async refreshToken(refreshToken: string): Promise<{ access_token: string }> {
    const response = await authApi.post<{ access_token?: string; accessToken?: string }>('/auth/refresh', {
      refreshToken: refreshToken,
    })
    const token = response.data.access_token ?? response.data.accessToken
    if (!token) {
      throw new Error('Refresh token response is missing access token')
    }
    return { access_token: token }
  },

  async sendOTP(phone: string): Promise<{ sent: boolean; ttl_seconds: number }> {
    const response = await authApi.post<{ sent: boolean; ttl_seconds: number }>('/auth/send-otp', { phone })
    return response.data
  },

  async verifyOTP(phone: string, otp: string): Promise<{ verified: boolean }> {
    const response = await authApi.post<{ verified: boolean }>('/auth/verify-otp', { phone, otp })
    return response.data
  },
}

export default authService
