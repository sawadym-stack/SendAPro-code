import api from './api'
import type { AxiosError } from 'axios'
import type { Job, JobStatus } from '../types'

export interface ApiError extends Error {
  statusCode: number
  details?: unknown
}

export interface CreateJobDto {
  customerId: string
  serviceType: string
  description: string
  urgency: 'Normal' | 'High'
  lat?: number
  lng?: number
  isEmergency?: boolean
}

export interface EmergencyDto {
  customerId: string
  serviceType: string
  description?: string
  lat?: number
  lng?: number
}

export interface JobListFilters {
  status?: JobStatus
  page?: number
  limit?: number
  customerId?: string
}

interface JobsResponse {
  jobs: Job[]
  total: number
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

const jobService = {
  async createJob(data: CreateJobDto): Promise<Job> {
    try {
      const response = await api.post<Job>('/jobs', data)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async createEmergency(data: EmergencyDto): Promise<Job> {
    try {
      const response = await api.post<Job>('/jobs', {
        customerId: data.customerId,
        serviceType: data.serviceType,
        description: data.description ?? 'Emergency request',
        lat: data.lat,
        lng: data.lng,
        urgency: 'High',
        isEmergency: true,
      })
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getJob(id: string): Promise<Job> {
    try {
      const response = await api.get<Job>(`/jobs/${id}`)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async listJobs(filters: JobListFilters): Promise<JobsResponse> {
    try {
      const response = await api.get<{ success: boolean; data: Job[]; meta: { total: number } }>('/jobs', { params: filters })
      return {
        jobs: response.data.data || [],
        total: response.data.meta?.total || 0,
      }
    } catch (error) {
      throw toApiError(error)
    }
  },

  async cancelJob(id: string): Promise<Job> {
    try {
      const response = await api.patch<Job>(`/jobs/${id}/status`, { status: 'Cancelled' })
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async scheduleJob(data: { serviceType: string; description: string; scheduledAt: string; lat: number; lng: number }): Promise<Job> {
    try {
      const response = await api.post<Job>('/jobs/schedule', data)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async listScheduledJobs(): Promise<Job[]> {
    try {
      const response = await api.get<Job[]>('/jobs/scheduled')
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async cancelScheduledJob(id: string): Promise<void> {
    try {
      await api.delete(`/jobs/scheduled/${id}`)
    } catch (error) {
      throw toApiError(error)
    }
  },

  async rescheduleJob(id: string, scheduledAt: string): Promise<void> {
    try {
      await api.patch(`/jobs/scheduled/${id}`, { scheduledAt })
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getCustomerStats(): Promise<{
    totalJobs: number
    completedJobs: number
    cancelledJobs: number
    activeJobs: number
    totalSpent: number
    pendingPayments: number
  }> {
    try {
      const response = await api.get('/customers/me/stats')
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getTechnicianStats(): Promise<{
    totalJobs: number
    completedJobs: number
    activeJobs: number
    todayEarnings: number
    totalEarnings: number
    avgRating: number
  }> {
    try {
      const response = await api.get('/technicians/me/stats')
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },
}

export default jobService
