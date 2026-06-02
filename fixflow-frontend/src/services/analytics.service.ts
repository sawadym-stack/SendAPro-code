import api from './api'
import type { AxiosError } from 'axios'

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

export interface OverviewStats {
  activeJobs: number
  onlineTechnicians: number
  completedToday: number
  revenueToday: number
  revenueThisMonth: number
  avgResponseTimeMin: number
  disputesOpen: number
  newUsersToday: number
  emergencyJobsToday: number
  totalJobsAllTime: number
}

export interface DailyJobStat {
  date: string
  created: number
  completed: number
  cancelled: number
}

export interface DailyRevenueStat {
  date: string
  amount: number
}

export interface TechnicianStat {
  id: string
  name: string
  avatarUrl: string
  completedJobs: number
  rating: number
  revenue: number
  avgResponseMin: number
}

export interface MaterialStat {
  materialId: string
  name: string
  category: string
  timesOrdered: number
  revenue: number
}

export interface SupplierAnalytics {
  totalQuotations: number
  acceptedQuotations: number
  rejectedQuotations: number
  expiredQuotations: number
  conversionRate: number
  revenueThisMonth: number
  topMaterials: MaterialStat[]
}

export interface ExportReportParams {
  type: 'jobs' | 'revenue' | 'users'
  from: string
  to: string
  format: 'csv' | 'pdf'
}

const analyticsService = {
  async getOverview(): Promise<OverviewStats> {
    try {
      const response = await api.get<OverviewStats>('/admin/analytics/overview')
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getJobStats(from: string, to: string): Promise<DailyJobStat[]> {
    try {
      const response = await api.get<DailyJobStat[]>('/admin/analytics/jobs', {
        params: { from, to },
      })
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getRevenueStats(from: string, to: string): Promise<DailyRevenueStat[]> {
    try {
      const response = await api.get<DailyRevenueStat[]>('/admin/analytics/revenue', {
        params: { from, to },
      })
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getTopTechnicians(limit = 10): Promise<TechnicianStat[]> {
    try {
      const response = await api.get<TechnicianStat[]>('/admin/analytics/technicians', {
        params: { limit },
      })
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getSupplierAnalytics(): Promise<SupplierAnalytics> {
    try {
      const response = await api.get<SupplierAnalytics>('/suppliers/me/analytics')
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async exportReport(params: ExportReportParams): Promise<Blob> {
    try {
      const response = await api.get<Blob>('/admin/reports/export', {
        params,
        responseType: 'blob',
      })
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },
}

export default analyticsService
