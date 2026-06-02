import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ShieldAlert, ArrowLeft, Loader2, Calendar, FileText, CheckCircle2, AlertTriangle, Upload, Eye, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import disputeService from '../../services/dispute.service'
import jobService from '../../services/job.service'
import paymentService from '../../services/payment.service'
import { QUERY_KEYS } from '../../constants/queryKeys'
import { formatDate, formatCurrency } from '../../utils/formatters'

export default function DisputeStatusPage() {
  const { disputeId = '' } = useParams()
  const navigate = useNavigate()
  const [activePhoto, setActivePhoto] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const { data: dispute, refetch, isLoading } = useQuery({
    queryKey: QUERY_KEYS.dispute(disputeId),
    queryFn: () => disputeService.getDispute(disputeId),
    enabled: Boolean(disputeId),
  })

  const { data: job } = useQuery({
    queryKey: ['job', dispute?.jobId],
    queryFn: () => jobService.getJob(dispute!.jobId),
    enabled: !!dispute?.jobId,
  })

  const { data: payment } = useQuery({
    queryKey: ['payment', dispute?.jobId],
    queryFn: () => paymentService.getInvoice(dispute!.jobId),
    enabled: !!dispute?.jobId && dispute?.action === 'refund',
  })

  const addEvidenceMutation = useMutation({
    mutationFn: (file: File) => disputeService.uploadEvidence(disputeId, file),
    onSuccess: () => {
      toast.success('Evidence uploaded successfully')
      refetch()
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Failed to upload evidence')
    },
    onSettled: () => {
      setUploading(false)
    },
  })

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploading(true)
      addEvidenceMutation.mutate(e.target.files[0])
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center gap-3 text-slate-400">
        <Loader2 size={20} className="animate-spin text-sky-500" />
        <span className="text-sm font-mono">Loading dispute status...</span>
      </div>
    )
  }

  if (!dispute) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-slate-400">
        <AlertTriangle size={36} className="text-red-500" />
        <span>Dispute record not found</span>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-slate-900 border border-slate-800 text-sky-400 rounded-lg text-xs"
        >
          Go Back
        </button>
      </div>
    )
  }

  // Steps indicator: Filed -> UnderReview -> Resolved
  const steps = [
    { label: 'Filed', isComplete: true, color: 'text-sky-400' },
    {
      label: 'Under Review',
      isComplete: dispute.status === 'UnderReview' || dispute.status === 'Resolved',
      color: 'text-yellow-400',
    },
    {
      label: 'Resolved',
      isComplete: dispute.status === 'Resolved',
      color: 'text-emerald-400',
    },
  ]

  const currentStep = dispute.status === 'Resolved' ? 2 : dispute.status === 'UnderReview' ? 1 : 0

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative pb-12">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Back Button */}
        <button
          onClick={() => navigate('/customer/history')} // fall back to job history
          className="mb-6 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft size={14} /> Back to Job History
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-sky-400">
            <ShieldAlert size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Dispute Status</h1>
            <p className="text-xs text-slate-500 font-mono">Dispute #{dispute.id.slice(0, 8)}</p>
          </div>
        </div>

        {/* Steps tracker */}
        <div className="rounded-2xl border border-slate-900 bg-slate-900/60 p-6 mb-6">
          <div className="flex items-start justify-between relative">
            {/* Track line */}
            <div className="absolute top-5 left-10 right-10 h-px bg-slate-800 z-0" />
            <div
              className="absolute top-5 left-10 h-px bg-sky-500 z-0 transition-all duration-700"
              style={{ width: `${(currentStep / 2) * 100}%`, maxWidth: 'calc(100% - 5rem)' }}
            />

            {steps.map((step, idx) => (
              <div key={step.label} className="flex flex-col items-center flex-1 relative z-10">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-2 transition-all duration-300 ${
                    idx <= currentStep
                      ? 'bg-sky-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.3)]'
                      : 'bg-slate-900 border-2 border-slate-800 text-slate-600'
                  }`}
                >
                  {idx <= currentStep ? '✓' : idx + 1}
                </div>
                <span
                  className={`text-[10px] font-bold text-center transition-colors ${
                    idx <= currentStep ? step.color : 'text-slate-700'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Resolution details if resolved */}
        {dispute.status === 'Resolved' && (
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-6 mb-6 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-sky-400" size={18} />
              <h3 className="text-sm font-black text-white">Dispute Resolution</h3>
            </div>
            
            <div className="text-sm text-slate-300 leading-relaxed border-l-2 border-sky-500 pl-4">
              Resolution Note: <span className="text-white italic">{dispute.adminNote || 'Case resolved by customer support.'}</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 uppercase">
                Action: {dispute.action || 'dismissed'}
              </span>

              {dispute.action === 'refund' && (
                <p className="text-xs text-emerald-400 font-bold">
                  Refund of {payment ? formatCurrency(payment.total) : 'charges'} will appear in 5-7 business days.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Dispute Info Card */}
        <div className="rounded-2xl border border-slate-900 bg-slate-900/60 p-6 space-y-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest block">Reason</span>
              <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 mt-1 inline-block">
                {dispute.reason}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest block">Filed Date</span>
              <span className="text-sm font-semibold text-slate-200 mt-1 flex items-center gap-1.5">
                <Calendar size={14} className="text-slate-500" />
                {formatDate(dispute.createdAt)}
              </span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest block mb-1">Details</span>
            <p className="text-sm text-slate-300 bg-slate-950/50 border border-slate-900 p-4 rounded-xl leading-relaxed whitespace-pre-wrap">
              {dispute.description}
            </p>
          </div>

          {/* Evidence Gallery */}
          {dispute.evidenceUrls && dispute.evidenceUrls.length > 0 && (
            <div>
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest block mb-2">Evidence Attached</span>
              <div className="grid grid-cols-4 gap-2">
                {dispute.evidenceUrls.map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setActivePhoto(url)}
                    className="relative aspect-square rounded-lg overflow-hidden border border-slate-800 bg-slate-950 group cursor-pointer"
                  >
                    <img src={url} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt="evidence thumbnail" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Eye size={16} className="text-white" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Open Dispute Options */}
          {['Open', 'UnderReview'].includes(dispute.status) && (
            <div className="pt-4 border-t border-slate-900/60 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-950/40 p-4 rounded-xl border border-slate-900">
                <span className="text-xs text-slate-400">Add additional evidence photos/documents</span>
                <label className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold rounded-xl text-xs cursor-pointer transition-colors shrink-0">
                  {uploading ? (
                    <><Loader2 size={12} className="animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload size={12} /> Add Evidence</>
                  )}
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                </label>
              </div>
              <p className="text-[10px] text-slate-500 italic text-center">Expected response within 24-48 hours</p>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal */}
      {activePhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setActivePhoto(null)}
            className="absolute top-4 right-4 p-2 bg-slate-900/80 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
          <img src={activePhoto} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl border border-slate-900" alt="evidence fullscreen" />
        </div>
      )}
    </div>
  )
}
