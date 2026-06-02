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
      const response = await api.post<GenerateInvoiceResponse>('/payments/invoice', data)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async createOrder(data: { jobId: string; idempotencyKey: string }): Promise<CreateOrderResponse> {
    try {
      const response = await api.post<CreateOrderResponse>('/payments/order', data)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async verifyPayment(data: VerifyPaymentDto): Promise<VerifyPaymentResponse> {
    try {
      const response = await api.post<VerifyPaymentResponse>('/payments/verify', data)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getHistory(params?: { page?: number; limit?: number }): Promise<PaymentsHistoryResponse> {
    try {
      const response = await api.get<PaymentsHistoryResponse>('/payments/history', { params })
      return response.data
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
}

export default paymentService
