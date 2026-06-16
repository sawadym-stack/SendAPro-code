import { useState, useEffect } from 'react'
import { Star, MessageSquare, ChevronDown, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import reviewService from '../../services/review.service'
import { formatDate } from '../../utils/formatters'
import type { Review } from '../../types'

interface ReviewsSectionProps {
  technicianId: string
  compact?: boolean
}

export default function ReviewsSection({ technicianId, compact = false }: ReviewsSectionProps) {
  const [page, setPage] = useState(1)
  const [allReviews, setAllReviews] = useState<Review[]>([])
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  // Reset page and clear reviews when technicianId changes
  useEffect(() => {
    setAllReviews([])
    setPage(1)
  }, [technicianId])

  const { data, isLoading, error } = useQuery({
    queryKey: ['reviews', technicianId, page],
    queryFn: () => reviewService.getReviews(technicianId, page, 10),
    enabled: !!technicianId,
  })

  console.error('ReviewsSection Debug:', { technicianId, page, data, isLoading, error })

  // Synchronize loaded reviews
  useEffect(() => {
    if (!technicianId) {
      setAllReviews([])
      return
    }

    if (data?.reviews) {
      if (page === 1) {
        setAllReviews(data.reviews)
      } else {
        setAllReviews((prev) => {
          const existingIds = new Set(prev.map((r) => r.id))
          const uniqueNew = data.reviews.filter((r) => !existingIds.has(r.id))
          return [...prev, ...uniqueNew]
        })
      }
    }
  }, [data, technicianId, page])

  const avgRating = data?.averageRating ?? 0
  const totalCount = data?.total ?? 0

  // Calculate rating breakdown dynamically from loaded reviews (fall back to proportional distribution if empty)
  const counts = [0, 0, 0, 0, 0] // index 0=1★, ..., 4=5★
  allReviews.forEach((r) => {
    const starIdx = Math.max(1, Math.min(5, Math.round(r.rating))) - 1
    counts[starIdx]++
  })

  const totalLoaded = allReviews.length || 1
  const breakdown = counts.map((count) => Math.round((count / totalLoaded) * 100))

  // Render a stars row for visual rating
  const renderStars = (rating: number, size = 16) => {
    const fullStars = Math.floor(rating)
    const hasHalf = rating % 1 >= 0.5
    return (
      <div className="flex gap-0.5 text-yellow-400">
        {Array.from({ length: 5 }).map((_, i) => {
          if (i < fullStars) {
            return <Star key={i} size={size} className="fill-current text-yellow-400" />
          }
          if (i === fullStars && hasHalf) {
            return (
              <div key={i} className="relative inline-block" style={{ width: size, height: size }}>
                <Star size={size} className="text-slate-700" />
                <div className="absolute top-0 left-0 overflow-hidden" style={{ width: '50%' }}>
                  <Star size={size} className="fill-current text-yellow-400" />
                </div>
              </div>
            )
          }
          return <Star key={i} size={size} className="text-slate-700" />
        })}
      </div>
    )
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800/80 px-2.5 py-1.5 rounded-lg w-fit">
        <Star size={14} className="fill-current text-yellow-400 shrink-0" />
        <span className="text-xs font-bold text-slate-200">
          {avgRating > 0 ? avgRating.toFixed(1) : 'N/A'}
        </span>
        <span className="text-xs text-slate-500 font-medium">({totalCount} reviews)</span>
      </div>
    )
  }

  const hasMore = allReviews.length < totalCount

  return (
    <div className="space-y-6">
      {/* Summary Header Cards */}
      <div className="grid gap-6 md:grid-cols-3 bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden">
        {/* Left Column: Big Average */}
        <div className="flex flex-col items-center justify-center text-center p-4 border-b border-slate-800 md:border-b-0 md:border-r border-dashed border-slate-800">
          <p className="text-5xl font-black text-white tracking-tight">
            {avgRating > 0 ? avgRating.toFixed(1) : '0.0'}
          </p>
          <div className="mt-3">{renderStars(avgRating, 20)}</div>
          <p className="text-xs text-slate-500 mt-2 font-semibold uppercase tracking-wider">
            {totalCount} Customer Reviews
          </p>
        </div>

        {/* Right Columns: Breakdown Bars */}
        <div className="md:col-span-2 flex flex-col justify-center space-y-2 p-2">
          {[5, 4, 3, 2, 1].map((stars) => {
            const pct = breakdown[stars - 1]
            return (
              <div key={stars} className="flex items-center gap-3 text-xs font-medium">
                <span className="text-slate-400 w-6 text-right font-bold">{stars}★</span>
                <div className="h-2 flex-1 bg-slate-950 rounded-full overflow-hidden border border-slate-800/60">
                  <div
                    className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-slate-500 w-10 text-right font-mono">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {allReviews.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
            <MessageSquare size={36} className="text-slate-600 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-slate-400">No Reviews Yet</h4>
            <p className="text-xs text-slate-600 mt-1">This technician hasn't received any feedback.</p>
          </div>
        ) : (
          allReviews.map((review) => {
            // Get initials from reviewerName or default
            const name = review.reviewerName || 'Customer'
            const initials = name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)

            return (
              <div
                key={review.id}
                className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 hover:border-slate-800 transition-all flex flex-col sm:flex-row gap-4"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-black text-sky-400 shrink-0">
                  {initials}
                </div>

                {/* Content */}
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-200">{name}</h4>
                      <div className="mt-1">{renderStars(review.rating, 14)}</div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      {formatDate(review.createdAt)}
                    </span>
                  </div>

                  {review.comment && (
                    <p className="text-sm text-slate-300 leading-relaxed">{review.comment}</p>
                  )}

                  {/* Thumbnail gallery */}
                  {review.imageUrls && review.imageUrls.length > 0 && (
                    <div className="flex gap-2 mt-3">
                      {review.imageUrls.map((url, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setSelectedImage(url)}
                          className="w-16 h-16 rounded-lg overflow-hidden border border-slate-800 hover:border-sky-500/50 bg-slate-950 transition-colors shrink-0"
                        >
                          <img
                            src={url}
                            alt={`Review evidence ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination Load More */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={isLoading}
            className="px-5 py-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-50 text-slate-300 text-xs font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer"
          >
            {isLoading ? 'Loading...' : 'Load More Reviews'}
            <ChevronDown size={14} />
          </button>
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 p-4 animate-fade-in">
          <button
            type="button"
            onClick={() => setSelectedImage(null)}
            className="absolute top-6 right-6 p-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-full transition-colors"
          >
            <X size={20} />
          </button>
          <img
            src={selectedImage}
            alt="Fullscreen review attachment"
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl border border-slate-800"
          />
        </div>
      )}
    </div>
  )
}
