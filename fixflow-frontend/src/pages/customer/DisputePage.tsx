import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ThumbsDown, UserX, CreditCard, AlertTriangle, MessageSquare, Upload, X, Loader2, CheckCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import disputeService from '../../services/dispute.service'
import jobService from '../../services/job.service'
import { QUERY_KEYS } from '../../constants/queryKeys'
import { formatDate, formatCurrency } from '../../utils/formatters'

const REASONS = [
  { value: 'Poor Quality', label: 'Poor Quality', icon: ThumbsDown, desc: 'Service quality was unsatisfactory' },
  { value: 'No Show', label: 'No Show', icon: UserX, desc: 'Technician failed to arrive at the location' },
  { value: 'Overcharged', label: 'Overcharged', icon: CreditCard, desc: 'Charged more than estimated or invoiced' },
  { value: 'Unprofessional Behavior', label: 'Unprofessional Behavior', icon: AlertTriangle, desc: 'Rude or inappropriate conduct' },
  { value: 'Other', label: 'Other', icon: MessageSquare, desc: 'Any other issues or complaints' },
]

export default function DisputePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const jobId = searchParams.get('jobId') ?? ''

  const [reason, setReason] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [formError, setFormError] = useState<string | null>(null)

  const { data: job, isLoading: isLoadingJob } = useQuery({
    queryKey: QUERY_KEYS.job(jobId),
    queryFn: () => jobService.getJob(jobId),
    enabled: Boolean(jobId),
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files)
      setEvidenceFiles((prev) => [...prev, ...selected].slice(0, 5))
    }
  }

  const removeFile = (index: number) => {
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!jobId) {
      setFormError('Job context is missing.')
      return
    }
    if (!reason) {
      setFormError('Please select a reason for the dispute.')
      return
    }
    if (description.trim().length < 50) {
      setFormError('Description must be at least 50 characters.')
      return
    }

    setIsSubmitting(true)

    try {
      // 1. Create dispute
      const disp = await disputeService.raiseDispute({
        jobId,
        reason,
        description: description.trim(),
      })

      // 2. Upload evidence files
      if (evidenceFiles.length > 0) {
        for (const file of evidenceFiles) {
          await disputeService.uploadEvidence(disp.id, file)
        }
      }

      toast.success('Dispute submitted. Our team will review within 24 hours.')
      navigate(`/customer/disputes/${disp.id}`)
    } catch (err: any) {
      setFormError(err?.message ?? 'Failed to file dispute.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoadingJob) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center gap-3 text-slate-400">
        <Loader2 size={20} className="animate-spin text-sky-500" />
        <span className="text-sm font-mono">Loading job context...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative pb-12">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Customer Support</p>
          <h1 className="text-2xl font-black text-white tracking-tight">File a Dispute</h1>
        </div>

        {/* Job context card */}
        {job && (
          <div className="rounded-2xl border border-slate-900 bg-slate-900/60 p-5 mb-8 flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-950 flex items-center justify-center shrink-0 border border-slate-800">
              <AlertTriangle className="text-red-400" size={24} />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Disputing Job</p>
              <h3 className="text-base font-bold text-white">{job.serviceType}</h3>
              <p className="text-xs text-slate-400">
                Technician: <span className="text-sky-400 font-semibold">{job.technicianName ?? 'Unassigned'}</span> · Paid: <span className="text-emerald-400 font-bold">{formatCurrency(job.amount ?? 0)}</span>
              </p>
              <p className="text-[10px] text-slate-500">Completed on: {formatDate(job.createdAt)}</p>
            </div>
          </div>
        )}

        {formError && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 flex items-center gap-3 text-sm text-red-400">
            <AlertTriangle size={16} className="shrink-0" />
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Reason Selector */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Reason for Dispute <span className="text-red-500">*</span>
            </label>
            <div className="grid gap-3">
              {REASONS.map((item) => {
                const Icon = item.icon
                const isSelected = reason === item.value
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setReason(item.value)}
                    className={`group w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'bg-sky-500/10 border-sky-500 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.1)]'
                        : 'border-slate-900 bg-slate-900/40 hover:border-slate-800'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-sky-500/20' : 'bg-slate-850'}`}>
                      <Icon size={18} className={isSelected ? 'text-sky-400' : 'text-slate-500 group-hover:text-slate-400'} />
                    </div>
                    <div>
                      <h4 className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>{item.label}</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">{item.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Description */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/60 p-5 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Describe What Happened <span className="text-red-500">*</span>
              </label>
              <span className={`text-[10px] font-mono ${description.length < 50 ? 'text-red-500' : 'text-emerald-500'}`}>
                {description.length} / 50 min
              </span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Provide a detailed explanation of the issue (minimum 50 characters)..."
              className="w-full bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 resize-none transition-colors"
            />
            {description.length < 50 && description.length > 0 && (
              <p className="text-[10px] text-red-400 font-mono">Minimum 50 characters required</p>
            )}
          </div>

          {/* Evidence Upload */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/60 p-5 space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Attach Evidence (optional)
              </label>
              <span className="text-[10px] text-slate-500 font-mono">Max 5 files</span>
            </div>

            <label className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-slate-800 rounded-xl hover:border-sky-500/30 cursor-pointer transition-colors">
              <Upload size={24} className="text-slate-600" />
              <span className="text-xs text-slate-500">Click to upload images or videos</span>
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileChange}
                disabled={evidenceFiles.length >= 5}
              />
            </label>

            {evidenceFiles.length > 0 && (
              <div className="space-y-1.5">
                {evidenceFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 bg-slate-950 rounded-lg border border-slate-900 text-xs">
                    <span className="text-slate-300 truncate max-w-[80%]">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!reason || description.length < 50 || isSubmitting}
            className="w-full py-4 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-900 text-white disabled:text-slate-500 font-bold rounded-2xl flex items-center justify-center gap-3 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <><Loader2 size={18} className="animate-spin" /> Submitting Dispute...</>
            ) : (
              <><CheckCircle size={18} /> Submit Dispute</>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
