import { useState } from 'react'
import { Star, Upload, X, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import reviewService from '../../services/review.service'
import api from '../../services/api'
import { QUERY_KEYS } from '../../constants/queryKeys'

interface ReviewModalProps {
  jobId: string
  revieweeId: string // Technician user ID
  technicianName: string
  isOpen: boolean
  onClose: () => void
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
}

export default function ReviewModal({
  jobId,
  revieweeId,
  technicianName,
  isOpen,
  onClose,
}: ReviewModalProps) {
  const queryClient = useQueryClient()
  const [rating, setRating] = useState<number>(0)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [comment, setComment] = useState<string>('')
  const [files, setFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  if (!isOpen) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files)
      setFiles((prev) => [...prev, ...selected].slice(0, 3))
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSkip = () => {
    localStorage.setItem(`reviewed_${jobId}`, 'skipped')
    onClose()
  }

  const handleSubmit = async () => {
    if (rating === 0) return
    setIsSubmitting(true)

    try {
      // 1. Upload files first
      const imageUrls: string[] = []
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        const response = await api.post<{ imageUrl: string }>('/users/me/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        })
        if (response.data?.imageUrl) {
          imageUrls.push(response.data.imageUrl)
        }
      }

      // 2. Submit review
      await reviewService.submitReview({
        jobId,
        revieweeId,
        rating,
        comment: comment.trim(),
        imageUrls,
      })

      localStorage.setItem(`reviewed_${jobId}`, 'true')
      toast.success('Review submitted! Thank you.')
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.job(jobId) })
      queryClient.invalidateQueries({ queryKey: ['reviews'] })
      queryClient.invalidateQueries({ queryKey: ['technician'] })
      queryClient.invalidateQueries({ queryKey: ['technician-me'] })
      queryClient.invalidateQueries({ queryKey: ['technician-stats'] })
      queryClient.invalidateQueries({ queryKey: ['tech-stats'] })
      onClose()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to submit review')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-sky-500 via-primary-500 to-indigo-500" />

        <div className="text-center space-y-2 mb-6">
          <h2 className="text-xl font-black text-white tracking-tight">Rate Your Experience</h2>
          <p className="text-sm text-slate-400">
            How was your service with <span className="text-sky-400 font-semibold">{technicianName}</span>?
          </p>
        </div>

        {/* Stars */}
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                className="p-1 transition-all duration-150 hover:scale-110 active:scale-95"
              >
                <Star
                  size={36}
                  className={`transition-colors ${
                    star <= (hoverRating || rating)
                      ? 'fill-yellow-400 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.2)]'
                      : 'text-slate-600'
                  }`}
                />
              </button>
            ))}
          </div>
          <span className="text-xs font-mono font-bold tracking-wider uppercase h-4 text-sky-400">
            {RATING_LABELS[hoverRating || rating] || ''}
          </span>
        </div>

        {/* Comment textarea */}
        <div className="space-y-1.5 mb-6">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us about your experience (optional)"
            maxLength={500}
            rows={4}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all resize-none"
          />
          <div className="flex justify-end text-[10px] font-mono text-slate-500">
            {comment.length} / 500
          </div>
        </div>

        {/* Photo Upload */}
        <div className="space-y-3 mb-8">
          <label className="flex items-center justify-center gap-2 py-4 border border-dashed border-slate-800 rounded-xl hover:border-sky-500/30 hover:bg-sky-500/5 cursor-pointer transition-colors">
            <Upload size={16} className="text-slate-500" />
            <span className="text-xs text-slate-400 font-semibold">Upload photos (optional, max 3)</span>
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={files.length >= 3}
            />
          </label>

          {files.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {files.map((file, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-800 bg-slate-950 group">
                  <img
                    src={URL.createObjectURL(file)}
                    alt="upload preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="absolute top-1 right-1 p-1 bg-slate-950/80 rounded-full text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={rating === 0 || isSubmitting}
            className="w-full py-3 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-800 text-white disabled:text-slate-500 font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
            {isSubmitting ? 'Submitting...' : 'Submit Review'}
          </button>

          <button
            type="button"
            onClick={handleSkip}
            className="w-full py-2.5 text-slate-400 hover:text-white text-sm font-semibold rounded-xl hover:bg-slate-800/40 transition-all cursor-pointer"
          >
            Skip for Now
          </button>
        </div>
      </div>
    </div>
  )
}
