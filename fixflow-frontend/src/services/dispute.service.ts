import api from './api'
import type { AxiosError } from 'axios'
import type { Dispute } from '../types'

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

export interface RaiseDisputeDto {
  jobId: string
  reason: string
  description: string
}

export interface ResolveDto {
  action: 'refund' | 'warn' | 'dismiss'
  adminNote: string
}

export interface DisputesResponse {
  disputes: Dispute[]
  total: number
}

const disputeService = {
  async raiseDispute(data: RaiseDisputeDto): Promise<Dispute> {
    try {
      const response = await api.post<Dispute>('/disputes', data)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async uploadEvidence(disputeId: string, file: File): Promise<void> {
    try {
      // First upload file using general users me upload endpoint to get image/presigned URL
      const formData = new FormData()
      formData.append('file', file)
      const uploadResponse = await api.post<{ imageUrl: string }>('/users/me/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      const fileUrl = uploadResponse.data.imageUrl

      // Then save fileUrl to dispute evidence record
      await api.post(`/disputes/${disputeId}/evidence`, { fileUrl })
    } catch (error) {
      throw toApiError(error)
    }
  },

  async resolveDispute(id: string, data: ResolveDto): Promise<Dispute> {
    try {
      const response = await api.post<Dispute>(`/disputes/${id}/resolve`, data)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async listDisputes(filters?: { status?: string; page?: number; limit?: number }): Promise<DisputesResponse> {
    try {
      const response = await api.get<DisputesResponse>('/disputes', { params: filters })
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getDispute(id: string): Promise<Dispute> {
    try {
      const response = await api.get<Dispute>(`/disputes/${id}`)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },
}

export default disputeService
