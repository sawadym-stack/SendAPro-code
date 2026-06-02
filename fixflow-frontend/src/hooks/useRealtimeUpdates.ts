import { useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { useWS } from '../context/WSContext'
import { useAuthStore } from '../store/authStore'
import { useJobStore } from '../store/jobStore'
import { getStatusToastMessage } from '../utils/jobStatus'
import { formatCurrency } from '../utils/formatters'

/**
 * useRealtimeUpdates — central WebSocket event handler hook.
 *
 * Subscribes to ALL WS event types emitted by the backend and:
 * - Invalidates the correct TanStack Query caches
 * - Shows toast notifications
 * - Updates Zustand stores (job location, etc.)
 *
 * Mount once via <RealtimeManager/> inside WSProvider in App.tsx.
 */
export function useRealtimeUpdates() {
  const { on, off } = useWS()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const { updateTechnicianPosition } = useJobStore()

  // ── job_status — technician accepted/arrived/working/completed ──────────
  const handleJobStatus = useCallback(
    (payload: { jobId: string; status: string; message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['job', payload.jobId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['tech-stats'] })
      queryClient.invalidateQueries({ queryKey: ['technician-stats'] })
      queryClient.invalidateQueries({ queryKey: ['customer-stats'] })

      const msg = getStatusToastMessage(payload.status)
      if (msg) toast(msg, { duration: 5000 })
    },
    [queryClient],
  )

  // ── job_update — alias from older backend versions ──────────────────────
  const handleJobUpdate = useCallback(
    (payload: { jobId: string; status: string; message?: string }) => {
      handleJobStatus(payload)
    },
    [handleJobStatus],
  )

  // ── location_update — technician GPS push ───────────────────────────────
  const handleLocationUpdate = useCallback(
    (payload: { jobId?: string; lat: number; lng: number; eta?: number }) => {
      updateTechnicianPosition(payload.lat, payload.lng, payload.eta ?? 0)
    },
    [updateTechnicianPosition],
  )

  // ── booking_request — new job available for technician ──────────────────
  const handleBookingRequest = useCallback(
    (payload: { jobId: string; serviceType?: string; customerName?: string; isEmergency?: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['tech-stats'] })
      queryClient.invalidateQueries({ queryKey: ['technician-stats'] })
      const label = payload.isEmergency
        ? `🚨 EMERGENCY: ${payload.serviceType ?? 'Service'} request`
        : `📱 New booking: ${payload.serviceType ?? 'Service Request'}`
      toast(label, { duration: 8000, icon: '🔔' })
    },
    [queryClient],
  )

  // ── new_booking — alias ─────────────────────────────────────────────────
  const handleNewBooking = handleBookingRequest

  // ── payment_status — payment captured/failed ────────────────────────────
  const handlePaymentStatus = useCallback(
    (payload: { status: string; jobId: string; amount?: number }) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['job', payload.jobId] })
      queryClient.invalidateQueries({ queryKey: ['customer-stats'] })
      if (payload.status === 'Captured') {
        toast.success(
          `💰 Payment of ${formatCurrency(payload.amount ?? 0)} confirmed!`,
        )
      } else if (payload.status === 'Failed') {
        toast.error('Payment failed. Please try again.')
      }
    },
    [queryClient],
  )

  // ── quotation_update — supplier quoted/accepted/rejected ────────────────
  const handleQuotationUpdate = useCallback(
    (payload: { quotationId: string; status: string; materialName?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      const messages: Record<string, string> = {
        Quoted: `📦 Quotation received for ${payload.materialName ?? 'material'}`,
        Accepted: `✅ Your quotation for ${payload.materialName ?? 'material'} was accepted`,
        Rejected: `❌ Quotation for ${payload.materialName ?? 'material'} was rejected`,
        CounterOffered: `💬 Counter-offer received for ${payload.materialName ?? 'material'}`,
      }
      const msg = messages[payload.status]
      if (msg) toast(msg, { duration: 5000 })
    },
    [queryClient],
  )

  // ── quotation_request — new quotation request (for suppliers) ───────────
  const handleQuotationRequest = useCallback(
    (payload: { quotationId: string; materialName?: string; qty?: number }) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      toast(`📩 New quotation request: ${payload.qty ?? '?'}x ${payload.materialName ?? 'item'}`, {
        duration: 6000,
        icon: '🏪',
      })
    },
    [queryClient],
  )

  // ── new_dispute — dispute filed (for admin) ─────────────────────────────
  const handleNewDispute = useCallback(
    (payload: { disputeId: string; reason: string; jobId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] })
      toast(`⚠️ New dispute filed: ${payload.reason}`, { duration: 6000 })
    },
    [queryClient],
  )

  // ── review_received — someone reviewed you ──────────────────────────────
  const handleReviewReceived = useCallback(
    (payload: { reviewerName: string; rating: number; comment?: string; jobId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] })
      queryClient.invalidateQueries({ queryKey: ['tech-stats'] })
      queryClient.invalidateQueries({ queryKey: ['technician-stats'] })
      toast(`⭐ ${payload.reviewerName} gave you ${payload.rating} stars`, { duration: 5000 })
    },
    [queryClient],
  )

  // ── booking_rejected_admin — technician rejected booking (for admin) ────
  const handleBookingRejectedAdmin = useCallback(
    (payload: { technicianName: string; message: string; jobId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
      toast.error(payload.message, { duration: 6000, icon: '❌' })
    },
    [queryClient],
  )

  // ── notification — generic server push ─────────────────────────────────
  const handleNotification = useCallback(
    (payload: { title: string; body?: string; type?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast(payload.title, { duration: 5000 })
    },
    [queryClient],
  )

  // ── metrics_update — admin dashboard live update ────────────────────────
  const handleMetricsUpdate = useCallback(
    (payload: unknown) => {
      queryClient.setQueryData(['admin-overview'], payload)
    },
    [queryClient],
  )

  useEffect(() => {
    if (!user) return

    // Core job events
    on('job_status', handleJobStatus)
    on('job_update', handleJobUpdate)           // backward compat alias

    // Location / tracking
    on('location_update', handleLocationUpdate)

    // Booking
    on('booking_request', handleBookingRequest)
    on('new_booking', handleNewBooking)          // backward compat alias

    // Payments
    on('payment_status', handlePaymentStatus)

    // Quotations
    on('quotation_update', handleQuotationUpdate)
    on('quotation_request', handleQuotationRequest)

    // Disputes / Reviews
    on('new_dispute', handleNewDispute)
    on('review_received', handleReviewReceived)
    on('booking_rejected_admin', handleBookingRejectedAdmin)

    // Generic
    on('notification', handleNotification)
    on('metrics_update', handleMetricsUpdate)

    return () => {
      off('job_status', handleJobStatus)
      off('job_update', handleJobUpdate)
      off('location_update', handleLocationUpdate)
      off('booking_request', handleBookingRequest)
      off('new_booking', handleNewBooking)
      off('payment_status', handlePaymentStatus)
      off('quotation_update', handleQuotationUpdate)
      off('quotation_request', handleQuotationRequest)
      off('new_dispute', handleNewDispute)
      off('review_received', handleReviewReceived)
      off('booking_rejected_admin', handleBookingRejectedAdmin)
      off('notification', handleNotification)
      off('metrics_update', handleMetricsUpdate)
    }
  }, [
    user,
    on,
    off,
    handleJobStatus,
    handleJobUpdate,
    handleLocationUpdate,
    handleBookingRequest,
    handleNewBooking,
    handlePaymentStatus,
    handleQuotationUpdate,
    handleQuotationRequest,
    handleNewDispute,
    handleReviewReceived,
    handleBookingRejectedAdmin,
    handleNotification,
    handleMetricsUpdate,
  ])
}
