import api from './api'
import type { AxiosError } from 'axios'
import type { Review } from '../types'

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

export interface SubmitReviewDto {
  jobId: string
  revieweeId: string
  rating: number
  comment?: string
  imageUrls?: string[]
}

export interface ReviewsResponse {
  reviews: Review[]
  total: number
  averageRating: number
  totalRatings?: number
}

const reviewService = {
  async submitReview(data: SubmitReviewDto): Promise<Review> {
    try {
      const response = await api.post<Review>('/reviews', data)
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },

  async getReviews(techId: string, page: number, limit = 10): Promise<ReviewsResponse> {
    try {
      const response = await api.get<ReviewsResponse>(`/reviews/${techId}`, {
        params: { page, limit },
      })
      return response.data
    } catch (error) {
      throw toApiError(error)
    }
  },
}

export default reviewService
