import api from './api'
import type { AxiosError } from 'axios'
import type { Payment, Invoice } from '../types'

export interface ApiError extends Error {
  statusCode: number
  details?: unknown
}

const toApiError = (error: unknown): ApiError => {
  const axiosError = error as AxiosError<{ message?: string; error?: string; details?: unknown }>
  const apiError = new Error(
    axiosError.response?.data?.message ?? axiosError.response?.data?.error ?? axiosError.message ?? 'API request failed',
  ) as ApiError

  apiError.statusCode = axiosError.response?.status ?? 500
  apiError.details = axiosError.response?.data?.details
  return apiError
}

export interface GenerateInvoiceDto {
  jobId: string
  labourCharge: number
  materialItems: {
    description: string
    quantity: number
    unitPrice: number
  }[]
}

export interface GenerateInvoiceResponse {
  invoiceId: string
  pdfUrl: string
  total: number
  lineItems: {
    description: string
    quantity: number
    unitPrice: number
    total: number
  }[]
}

export interface CreateOrderResponse {
  orderId: string
  amount: number // in paise
  currency: string
  keyId: string
}

export interface VerifyPaymentDto {
  orderId: string
  paymentId: string
  signature: string
}

export interface VerifyPaymentResponse {
  success: boolean
  paymentId: string
}

export interface PaymentsHistoryResponse {
  payments: Payment[]
  total: number
}

const paymentService = {
  async generateInvoice(data: GenerateInvoiceDto): Promise<GenerateInvoiceResponse> {
    try {
      const response = await api.post<{ success: boolean; data: GenerateInvoiceResponse }>('/payments/invoice', data)
      return response.data.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async createOrder(data: { jobId: string; idempotencyKey: string }): Promise<CreateOrderResponse> {
    try {
      const response = await api.post<{ success: boolean; data: CreateOrderResponse }>('/payments/order', data)
      return response.data.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async verifyPayment(data: VerifyPaymentDto): Promise<VerifyPaymentResponse> {
    try {
      const response = await api.post<{ success: boolean; data: VerifyPaymentResponse }>('/payments/verify', data)
      return response.data.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getHistory(params?: { page?: number; limit?: number }): Promise<PaymentsHistoryResponse> {
    try {
      const response = await api.get<{ success: boolean; data: Payment[]; meta: { total: number } }>('/payments/history', { params })
      return {
        payments: response.data.data || [],
        total: response.data.meta?.total || 0,
      }
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getInvoice(jobId: string): Promise<Invoice> {
    try {
      const response = await api.get<Invoice>(`/payments/invoice/${jobId}`)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async sendInvoiceReminder(jobId: string): Promise<any> {
    try {
      const response = await api.post(`/payments/invoice/${jobId}/remind`)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getPendingPlatformFees(): Promise<{ pendingAmount: number; fees: any[] }> {
    try {
      const response = await api.get<{ pendingAmount: number; fees: any[] }>('/technicians/platform-fee/pending')
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async payPlatformFee(): Promise<{ orderId: string; amount: number; currency: string; keyId: string }> {
    try {
      const response = await api.post<{ orderId: string; amount: number; currency: string; keyId: string }>('/technicians/platform-fee/pay')
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async verifyPlatformFee(data: VerifyPaymentDto): Promise<VerifyPaymentResponse> {
    try {
      const response = await api.post<VerifyPaymentResponse>('/technicians/platform-fee/verify', data)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getRewardsStatus(): Promise<{ jobsCount: number; target: number; canClaim: boolean; claimed: boolean; rewardAmount: number }> {
    try {
      const response = await api.get<{ jobsCount: number; target: number; canClaim: boolean; claimed: boolean; rewardAmount: number }>('/technicians/rewards/status')
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async claimReward(): Promise<{ rewardAmount: number }> {
    try {
      const response = await api.post<{ rewardAmount: number }>('/technicians/rewards/claim', {})
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },
}

export default paymentService
