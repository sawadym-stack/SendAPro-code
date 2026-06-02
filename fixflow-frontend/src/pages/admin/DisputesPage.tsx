import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Calendar, Check, Clock, Loader2, ShieldAlert, X, Eye, ThumbsDown, UserX, CreditCard, AlertTriangle, MessageSquare, ExternalLink } from 'lucide-react'
import { toast } from 'react-hot-toast'
import disputeService from '../../services/dispute.service'
import jobService from '../../services/job.service'
import paymentService from '../../services/payment.service'
import api from '../../services/api'
import { QUERY_KEYS } from '../../constants/queryKeys'
import { useAuthStore } from '../../store/authStore'
import { useWS } from '../../context/WSContext'
import { formatDate, formatCurrency } from '../../utils/formatters'
import type { Dispute, Job, Invoice } from '../../types'

const REASON_ICONS: Record<string, any> = {
  'Poor Quality': ThumbsDown,
  'No Show': UserX,
  'Overcharged': CreditCard,
  'Unprofessional Behavior': AlertTriangle,
  'Other': MessageSquare,
}

export default function DisputesPage() {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const ws = useWS()

  const [activeTab, setActiveTab] = useState<'All' | 'Open' | 'UnderReview' | 'Resolved'>('All')
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null)
  const [unreadCount, setUnreadCount] = useState<number>(0)

  // Fetch disputes
  const { data, isLoading, refetch } = useQuery({
    queryKey: QUERY_KEYS.adminDisputes,
    queryFn: () => disputeService.listDisputes({ limit: 100 }),
  })

  const disputes: Dispute[] = data?.disputes ?? []

  // Connect WebSockets
  useEffect(() => {
    if (!token) return
    ws.connect('admin:all', token)

    const handleNewDispute = (payload: any) => {
      toast('A new dispute has been filed!', { icon: '🚨' })
      setUnreadCount((prev) => prev + 1)
      refetch()
    }

    ws.on('new_dispute', handleNewDispute)

    return () => {
      ws.off('new_dispute', handleNewDispute)
      ws.disconnect()
    }
  }, [token, ws, refetch])

  // Reset unread count when clicking Open tab
  useEffect(() => {
    if (activeTab === 'Open') {
      setUnreadCount(0)
    }
  }, [activeTab])

  // Filter list
  const filteredDisputes = disputes.filter((d) => {
    if (activeTab === 'All') return true
    if (activeTab === 'Open') return d.status === 'Open'
    if (activeTab === 'UnderReview') return d.status === 'UnderReview'
    if (activeTab === 'Resolved') return d.status === 'Resolved'
    return true
  })

  // Count open disputes
  const openCount = disputes.filter((d) => d.status === 'Open').length

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 relative">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Administrative Actions</p>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ShieldAlert className="text-red-500" size={24} />
            Dispute Resolutions
          </h1>
        </div>

        {/* Filter Tabs */}
        <div className="flex border-b border-slate-900 pb-px gap-6">
          {(['All', 'Open', 'UnderReview', 'Resolved'] as const).map((tab) => {
            const label = tab === 'UnderReview' ? 'Under Review' : tab
            const isActive = activeTab === tab
            const isOpenTab = tab === 'Open'

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative pb-3 text-sm font-semibold transition-colors cursor-pointer ${
                  isActive ? 'text-sky-400' : 'text-slate-500 hover:text-slate-350'
                }`}
              >
                {label}
                {isOpenTab && openCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-sky-500 text-white rounded-full">
                    {openCount}
                  </span>
                )}
                {isOpenTab && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-2 flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                )}
                {isActive && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-sky-400 animate-fade-in" />
                )}
              </button>
            )
          })}
        </div>

        {/* Loading state */}
        {isLoading ? (
          <div className="h-64 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 size={20} className="animate-spin text-sky-500" />
            <span className="text-sm font-mono">Loading disputes logs...</span>
          </div>
        ) : filteredDisputes.length === 0 ? (
          <div className="rounded-2xl border border-slate-900 bg-slate-900/20 p-12 text-center max-w-sm mx-auto space-y-3">
            <Check className="h-8 w-8 text-emerald-500 mx-auto" />
            <h3 className="text-sm font-bold text-white">All clear!</h3>
            <p className="text-xs text-slate-500">No disputes listed in this tab category.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-900 bg-slate-900/60 overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-950/60 text-slate-500 uppercase tracking-wider font-mono">
                  <th className="px-5 py-4">ID</th>
                  <th className="px-5 py-4">Reason</th>
                  <th className="px-5 py-4">Raised By</th>
                  <th className="px-5 py-4">Against</th>
                  <th className="px-5 py-4">Job ID</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Filed Date</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60 text-slate-300">
                {filteredDisputes.map((disp) => (
                  <tr
                    key={disp.id}
                    onClick={() => setSelectedDispute(disp)}
                    className="hover:bg-slate-900/30 transition-colors cursor-pointer group"
                  >
                    <td className="px-5 py-4 font-mono text-slate-400">
                      {disp.id.slice(0, 8)}
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-[10px]">
                        {disp.reason}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-white">
                      {disp.raisedByName ?? disp.raisedById.slice(0, 8)}
                    </td>
                    <td className="px-5 py-4">
                      {disp.againstId.slice(0, 8)}
                    </td>
                    <td className="px-5 py-4 font-mono text-slate-400">
                      {disp.jobId.slice(0, 8)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          disp.status === 'Resolved'
                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                            : disp.status === 'UnderReview'
                            ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400'
                            : 'bg-sky-500/10 border border-sky-500/20 text-sky-400'
                        }`}
                      >
                        {disp.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {formatDate(disp.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        className="p-1 bg-slate-900 hover:bg-slate-800 rounded text-sky-400 group-hover:scale-105 transition-all"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-out detail drawer */}
      {selectedDispute && (
        <DisputeDetailPanel
          dispute={selectedDispute}
          onClose={() => { setSelectedDispute(null); refetch() }}
        />
      )}
    </div>
  )
}

function DisputeDetailPanel({ dispute, onClose }: { dispute: Dispute; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [adminNote, setAdminNote] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [activePhoto, setActivePhoto] = useState<string | null>(null)

  // Fetch job context
  const { data: job, isLoading: loadingJob } = useQuery<Job>({
    queryKey: ['job', dispute.jobId],
    queryFn: () => jobService.getJob(dispute.jobId),
  })

  // Fetch payment context
  const { data: invoice } = useQuery<Invoice>({
    queryKey: ['payment', dispute.jobId],
    queryFn: () => paymentService.getInvoice(dispute.jobId),
    enabled: dispute.status !== 'Resolved',
  })

  const markUnderReviewMutation = useMutation({
    mutationFn: () => api.patch(`/disputes/${dispute.id}`, { status: 'UnderReview' }),
    onSuccess: () => {
      toast.success('Dispute status marked as Under Review')
      onClose()
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Failed to update status')
    },
  })

  const resolveMutation = useMutation({
    mutationFn: (action: 'refund' | 'warn' | 'dismiss') =>
      disputeService.resolveDispute(dispute.id, { action, adminNote }),
    onSuccess: () => {
      toast.success('Dispute resolved successfully')
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminDisputes })
      onClose()
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Failed to resolve dispute')
    },
    onSettled: () => {
      setIsUpdating(false)
    },
  })

  const handleResolve = (action: 'refund' | 'warn' | 'dismiss') => {
    if (!adminNote.trim()) {
      toast.error('Resolution note is required to resolve dispute')
      return
    }
    const label = action === 'refund' ? 'issue refund' : action === 'warn' ? 'warn technician' : 'dismiss dispute'
    if (!window.confirm(`Are you sure you want to ${label}?`)) return

    setIsUpdating(true)
    resolveMutation.mutate(action)
  }

  const ReasonIcon = REASON_ICONS[dispute.reason] || AlertCircle

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm flex justify-end animate-fade-in">
      {/* Click outside to close */}
      <div className="flex-1" onClick={onClose} />

      <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 h-full p-6 overflow-y-auto space-y-6 shadow-2xl relative flex flex-col justify-between">
        <div className="space-y-6">
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-black text-white tracking-tight">Resolve Dispute</h2>
              <p className="text-xs text-slate-500 font-mono">ID: {dispute.id}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1 bg-slate-950 border border-slate-800 rounded-full hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Section 1: Dispute Info */}
          <div className="space-y-2">
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest block">Dispute details</span>
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center gap-2">
                <ReasonIcon size={14} className="text-red-400" />
                <span className="font-bold text-xs text-white">{dispute.reason}</span>
                <span className="ml-auto text-[9px] font-mono text-slate-500">{formatDate(dispute.createdAt)}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{dispute.description}</p>
            </div>
          </div>

          {/* Section 2: Job Context */}
          <div className="space-y-2">
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest block">Job context</span>
            {loadingJob ? (
              <div className="flex justify-center p-4">
                <Loader2 size={16} className="animate-spin text-sky-500" />
              </div>
            ) : job ? (
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Service:</span>
                  <span className="font-bold text-white">{job.serviceType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer ID:</span>
                  <span className="font-mono text-slate-300">{job.customerId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Technician ID:</span>
                  <span className="font-mono text-slate-300">{job.technicianId || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount Paid:</span>
                  <span className="font-black text-emerald-400">{formatCurrency(job.amount ?? 0)}</span>
                </div>
                <a
                  href={`/customer/track/${job.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-sky-400 font-bold hover:underline"
                >
                  View Job <ExternalLink size={12} />
                </a>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Job info unavailable.</p>
            )}
          </div>

          {/* Section 3: Evidence */}
          {dispute.evidenceUrls && dispute.evidenceUrls.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest block">Evidence Files</span>
              <div className="grid grid-cols-4 gap-2">
                {dispute.evidenceUrls.map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setActivePhoto(url)}
                    className="aspect-square rounded-lg overflow-hidden border border-slate-800 bg-slate-950 cursor-pointer"
                  >
                    <img src={url} className="w-full h-full object-cover" alt="evidence thumbnail" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Admin Action or Resolution Note */}
        {dispute.status !== 'Resolved' ? (
          <div className="space-y-4 pt-4 border-t border-slate-800">
            {dispute.status === 'Open' && (
              <button
                type="button"
                onClick={() => markUnderReviewMutation.mutate()}
                disabled={markUnderReviewMutation.isPending}
                className="w-full py-2.5 bg-slate-850 hover:bg-slate-800 text-yellow-400 border border-slate-800 text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                {markUnderReviewMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
                Mark Under Review
              </button>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Resolution Note <span className="text-red-500">*</span>
              </label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Explain the resolution to the user..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors resize-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleResolve('dismiss')}
                disabled={isUpdating}
                className="py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => handleResolve('warn')}
                disabled={isUpdating}
                className="py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Warn Tech
              </button>
              <button
                type="button"
                onClick={() => handleResolve('refund')}
                disabled={isUpdating || !invoice}
                className="py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-bold rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Issue Refund
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 pt-4 border-t border-slate-800 text-xs">
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest block">Resolution Summary</span>
            <div className="p-4 bg-sky-500/5 border border-sky-500/20 rounded-xl space-y-2">
              <p className="font-semibold text-slate-300">Resolution: <span className="text-white italic">{dispute.adminNote}</span></p>
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1 pt-1.5 border-t border-slate-900">
                <span>Action: {dispute.action}</span>
                <span>Resolved: {dispute.resolvedAt ? formatDate(dispute.resolvedAt) : 'N/A'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Lightbox for Drawer */}
        {activePhoto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setActivePhoto(null)}
              className="absolute top-4 right-4 p-2 bg-slate-900/80 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
            <img src={activePhoto} className="max-w-full max-h-[85vh] object-contain rounded-lg border border-slate-900" alt="fullscreen review" />
          </div>
        )}
      </div>
    </div>
  )
}
