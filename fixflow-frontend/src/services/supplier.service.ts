import api from './api'
import type { AxiosError } from 'axios'
import type { Supplier, Material, Quotation, SupplierStats, ImportResult } from '../types'

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

const supplierService = {
  async registerSupplier(data: {
    businessName: string
    contactPhone: string
    contactEmail: string
    lat: number
    lng: number
    serviceRadiusKm: number
  }): Promise<Supplier> {
    try {
      const response = await api.post<Supplier>('/suppliers/register', data)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getMyProfile(): Promise<Supplier> {
    try {
      const response = await api.get<Supplier>('/suppliers/me')
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async updateProfile(data: {
    businessName: string
    contactPhone: string
    contactEmail: string
    lat: number
    lng: number
    serviceRadiusKm: number
  }): Promise<Supplier> {
    try {
      const response = await api.patch<Supplier>('/suppliers/me', data)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getNearby(lat: number, lng: number, category?: string, radius?: number): Promise<Supplier[]> {
    try {
      const params: Record<string, any> = { lat, lng }
      if (category) params.category = category
      if (radius) params.radius = radius
      const response = await api.get<Supplier[]>('/suppliers/nearby', { params })
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getMaterials(filters?: {
    supplierId?: string
    category?: string
    page?: number
    limit?: number
  }): Promise<{ materials: Material[]; totalCount: number }> {
    try {
      const response = await api.get<any>('/suppliers/materials', {
        params: filters,
      })
      if (response.data && response.data.success && Array.isArray(response.data.data)) {
        return {
          materials: response.data.data,
          totalCount: response.data.meta?.total ?? response.data.data.length,
        }
      }
      return {
        materials: response.data?.materials || response.data?.data || (Array.isArray(response.data) ? response.data : []),
        totalCount: response.data?.totalCount || response.data?.meta?.total || 0,
      }
    } catch (error) {
      throw toApiError(error)
    }
  },

  async addMaterial(data: {
    name: string
    category: string
    price: number
    stock: number
    isAvailable: boolean
    description?: string
    imageUrl?: string
  }): Promise<Material> {
    try {
      const response = await api.post<Material>('/suppliers/materials', data)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async updateMaterial(
    id: string,
    data: Partial<{
      name: string
      category: string
      price: number
      stock: number
      isAvailable: boolean
      description: string
      imageUrl: string
    }>,
  ): Promise<Material> {
    try {
      const response = await api.patch<Material>(`/suppliers/materials/${id}`, data)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async deleteMaterial(id: string): Promise<void> {
    try {
      await api.delete(`/suppliers/materials/${id}`)
    } catch (error) {
      throw toApiError(error)
    }
  },

  async updateStock(id: string, delta: number): Promise<{ stock: number }> {
    try {
      const response = await api.patch<{ newStock: number }>(`/suppliers/materials/${id}/stock`, { delta })
      return { stock: response.data.newStock }
    } catch (error) {
      throw toApiError(error)
    }
  },

  async bulkImport(materials: Array<{
    name: string
    category: string
    price: number
    stock: number
    description?: string
    imageUrl?: string
  }>): Promise<ImportResult> {
    try {
      const response = await api.post<ImportResult>('/suppliers/materials/import', { materials })
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getStats(): Promise<SupplierStats> {
    try {
      const response = await api.get<any>('/suppliers/me/stats')
      // Map properties to match frontend SupplierStats interface if needed
      return {
        totalMaterials: response.data.totalMaterials ?? 0,
        lowStockMaterials: response.data.lowStockMaterials?.length ?? 0,
        totalQuotations: response.data.pendingQuotations ?? 0, // Fallback fields
        pendingQuotations: response.data.pendingQuotations ?? 0,
        acceptedQuotations: response.data.acceptedThisMonth ?? 0,
        revenue: response.data.revenueThisMonth ?? 0,
      }
    } catch (error) {
      throw toApiError(error)
    }
  },

  async requestQuotation(data: {
    materialId: string
    jobId?: string
    requestedQty: number
    notes?: string
  }): Promise<Quotation> {
    try {
      const response = await api.post<Quotation>('/quotations', data)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async respondToQuotation(
    id: string,
    data: {
      price: number
      qty: number
      deliveryDate?: string
    },
  ): Promise<Quotation> {
    try {
      const response = await api.patch<Quotation>(`/quotations/${id}/respond`, data)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async counterOffer(id: string, counterPrice: number): Promise<Quotation> {
    try {
      const response = await api.patch<Quotation>(`/quotations/${id}/counter`, { counterPrice })
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async acceptQuotation(id: string): Promise<Quotation> {
    try {
      const response = await api.patch<Quotation>(`/quotations/${id}/accept`)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async rejectQuotation(id: string): Promise<Quotation> {
    try {
      const response = await api.patch<Quotation>(`/quotations/${id}/reject`)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async updateOrderStatus(id: string, status: string): Promise<Quotation> {
    try {
      const response = await api.patch<Quotation>(`/quotations/${id}/order-status`, { status })
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async uploadDeliveryPhoto(id: string, file: File): Promise<{ deliveryPhotoUrl: string }> {
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.patch<{ deliveryPhotoUrl: string }>(`/quotations/${id}/delivery-photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async listQuotations(filters?: {
    status?: string
    limit?: number
    offset?: number
  }): Promise<{ quotations: Quotation[]; total: number }> {
    try {
      const response = await api.get<any>('/quotations', {
        params: filters,
      })
      if (response.data && response.data.success && Array.isArray(response.data.data)) {
        return {
          quotations: response.data.data,
          total: response.data.meta?.total ?? response.data.data.length,
        }
      }
      return {
        quotations: response.data?.quotations || response.data?.data || (Array.isArray(response.data) ? response.data : []),
        total: response.data?.totalCount || response.data?.meta?.total || 0,
      }
    } catch (error) {
      throw toApiError(error)
    }
  },

  async uploadGeneralFile(file: File): Promise<{ imageUrl: string }> {
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post<{ imageUrl: string }>('/users/me/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },
}

export default supplierService
