import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { MapPin, MessageCircle, FileCheck, Upload, Navigation, Wrench, CheckCircle2, Loader2, Zap, Droplet, Wind, Package, Phone, User } from 'lucide-react'
import jobService from '../../services/job.service'
import technicianService from '../../services/technician.service'
import chatService from '../../services/chat.service'
import { JobStatus } from '../../types'
import { formatDate } from '../../utils/formatters'
import { useWS } from '../../context/WSContext'
import { useAuthStore } from '../../store/authStore'

const serviceIcon: Record<string, React.ReactNode> = {
  Electrician: <Zap size={18} className="text-yellow-400" />,
  electrical: <Zap size={18} className="text-yellow-400" />,
  Plumber: <Droplet size={18} className="text-blue-400" />,
  plumbing: <Droplet size={18} className="text-blue-400" />,
  'AC Repair': <Wind size={18} className="text-cyan-400" />,
  ac_repair: <Wind size={18} className="text-cyan-400" />,
}

const steps = [
  { status: JobStatus.Accepted, label: 'Accepted', icon: '✓', color: 'text-sky-400' },
  { status: JobStatus.OnTheWay, label: 'En Route', icon: '🚗', color: 'text-blue-400' },
  { status: JobStatus.Arrived, label: 'Arrived', icon: '📍', color: 'text-violet-400' },
  { status: JobStatus.Working, label: 'Working', icon: '🔧', color: 'text-orange-400' },
  { status: JobStatus.Completed, label: 'Complete', icon: '✓', color: 'text-emerald-400' },
]

const ActiveJobPage = () => {
  const { jobId = '' } = useParams()
  const navigate = useNavigate()
  const { data: job, refetch, isLoading, isError } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobService.getJob(jobId),
    enabled: Boolean(jobId),
  })
  const [beforeFiles, setBeforeFiles] = useState<File[]>([])
  const [afterFiles, setAfterFiles] = useState<File[]>([])
  
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const ws = useWS()
  const [unreadCount, setUnreadCount] = useState(0)

  const { data: chatRoom } = useQuery({
    queryKey: ['chatRoom', jobId],
    queryFn: () => chatService.getRoom(jobId),
    enabled: Boolean(jobId) && !!job && job.status !== JobStatus.Requested && job.status !== JobStatus.Cancelled,
  })

  useEffect(() => {
    if (chatRoom) {
      setUnreadCount(chatRoom.unreadCount ?? 0)
    }
  }, [chatRoom])

  useEffect(() => {
    if (!token || !jobId) return

    ws.connect(`job:${jobId}`, token)

    const handleNewMessage = (payload: any) => {
      if (payload.senderId !== user?.id) {
        setUnreadCount((c) => c + 1)
      }
    }

    ws.on('new_message', handleNewMessage)

    return () => {
      ws.off('new_message', handleNewMessage)
      ws.disconnect()
    }
  }, [token, jobId, ws, user?.id])

  const patchStatus = useMutation({
    mutationFn: (status: JobStatus) => technicianService.patchJobStatus(jobId, status),
    onSuccess: () => refetch(),
  })

  const uploadBefore = useMutation({ mutationFn: () => technicianService.uploadJobImages(jobId, 'before', beforeFiles), onSuccess: () => setBeforeFiles([]) })
  const uploadAfter = useMutation({ mutationFn: () => technicianService.uploadJobImages(jobId, 'after', afterFiles), onSuccess: () => setAfterFiles([]) })

  const currentStepIndex = job ? steps.findIndex((s) => s.status === job.status) : -1
  const Icon = serviceIcon[job?.serviceType ?? ''] ?? <Wrench size={18} className="text-slate-500" />

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center gap-3 text-slate-400">
        <Loader2 size={20} className="animate-spin text-sky-500" />
        <span className="text-sm font-mono">Loading job...</span>
      </div>
    )
  }

  if (isError || !job || !jobId) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-slate-400 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center backdrop-blur-xl shadow-xl">
          <div className="w-12 h-12 rounded-full border border-slate-850 flex items-center justify-center mx-auto mb-4 text-slate-500 text-lg">
            ⚠️
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">Job Not Found</h1>
          <p className="text-xs text-slate-500 font-mono mt-2">
            The requested active dispatch details could not be retrieved. It may have been completed, canceled, or reassigned.
          </p>
          <button
            onClick={() => navigate('/technician/dashboard')}
            className="mt-6 w-full py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-950 text-white font-bold transition-all text-xs cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const nextAction = () => {
    if (job.status === JobStatus.Accepted) return { label: 'Start Driving', status: JobStatus.OnTheWay, color: 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20', icon: <Navigation size={16} /> }
    if (job.status === JobStatus.OnTheWay) return { label: 'Mark Arrived', status: JobStatus.Arrived, color: 'bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20', icon: <MapPin size={16} /> }
    if (job.status === JobStatus.Arrived) return { label: 'Start Working', status: JobStatus.Working, color: 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20', icon: <Wrench size={16} /> }
    if (job.status === JobStatus.Working) return { label: 'Mark Complete', status: JobStatus.Completed, color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20', icon: <CheckCircle2 size={16} /> }
    return null
  }

  const action = nextAction()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">{Icon}</div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">{job.serviceType ?? 'Active Job'}</h1>
            <p className="text-xs text-slate-500 font-mono">{job.id.slice(0, 8)}... · {formatDate(job.createdAt)}</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="rounded-2xl border border-slate-900 bg-slate-900/60 p-6">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-5 font-mono">Job Progress</h3>
          <div className="flex items-start justify-between relative">
            {/* Track line */}
            <div className="absolute top-5 left-8 right-8 h-px bg-slate-800 z-0" />
            <div
              className="absolute top-5 left-8 h-px bg-sky-500 z-0 transition-all duration-700"
              style={{ width: currentStepIndex > 0 ? `${(currentStepIndex / (steps.length - 1)) * 100}%` : '0', maxWidth: 'calc(100% - 4rem)' }}
            />

            {steps.map((step, i) => (
              <div key={step.status} className="flex flex-col items-center flex-1 relative z-10">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-2 transition-all duration-300 ${
                  i <= currentStepIndex
                    ? 'bg-sky-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.3)]'
                    : 'bg-slate-900 border-2 border-slate-800 text-slate-600'
                }`}>
                  {step.icon}
                </div>
                <span className={`text-[10px] font-bold text-center transition-colors ${
                  i <= currentStepIndex ? step.color : 'text-slate-700'
                }`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Customer Profile & Contact Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl shadow-xl shadow-slate-950/20 space-y-5 hover:border-sky-500/20 transition-all duration-300">
          <div className="flex items-center justify-between border-b border-slate-900 pb-3">
            <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">Customer Details</h3>
            <span className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-400 border border-sky-500/20">
              Active Client
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-400 to-blue-650 font-display text-base font-bold text-white shadow-md border border-sky-400/10">
              {(job.customerName ?? 'C').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h4 className="font-extrabold text-white text-base tracking-tight">{job.customerName || 'Valued Client'}</h4>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1 font-mono">
                <Phone className="h-3.5 w-3.5 text-sky-400 animate-pulse" />
                <span>{job.customerPhone || 'Not available'}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => navigate(`/technician/chat/${job.id}`)}
              className="relative flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-350 hover:text-white hover:border-slate-700 hover:bg-slate-900 transition duration-300 font-bold text-xs text-center py-2.5 px-3 shadow-md active:scale-95 cursor-pointer"
            >
              <MessageCircle size={15} className="text-sky-400" />
              Chat Client
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-slate-950 animate-scale-up">
                  {unreadCount}
                </span>
              )}
            </button>
            <a 
              href={`tel:${job.customerPhone || ''}`}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-350 hover:text-white hover:border-slate-700 hover:bg-slate-900 transition duration-300 font-bold text-xs text-center py-2.5 px-3 shadow-md active:scale-95"
            >
              <Phone size={15} className="text-emerald-450 animate-pulse" />
              Call Client
            </a>
          </div>
        </div>

        {/* Job Specifications */}
        <div className="rounded-2xl border border-slate-900 bg-slate-900/60 divide-y divide-slate-900/85">
          {[
            { label: 'Status', value: steps.find((s) => s.status === job.status)?.label ?? job.status },
            { label: 'Description', value: job.description || '—' },
            { label: 'Location / Address', value: job.address || `${job.latitude?.toFixed(4)}, ${job.longitude?.toFixed(4)}` },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between px-5 py-3.5">
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">{row.label}</span>
              <span className="text-sm text-slate-200 font-semibold text-right max-w-[65%] truncate">{row.value}</span>
            </div>
          ))}
        </div>

        {/* Primary Action */}
        {action && (
          <button
            onClick={() => patchStatus.mutate(action.status)}
            disabled={patchStatus.isPending}
            className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl border text-base font-bold transition-all duration-200 disabled:opacity-50 ${action.color}`}
          >
            {patchStatus.isPending ? <Loader2 size={18} className="animate-spin" /> : action.icon}
            {patchStatus.isPending ? 'Updating...' : action.label}
          </button>
        )}

        {/* Secondary actions */}
        <div className="flex flex-wrap gap-3">
          {job.status === JobStatus.Accepted && (
            <button
              onClick={() => navigate(`/technician/navigation/${job.id}`)}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-800 text-slate-400 text-sm font-semibold hover:border-sky-500/30 hover:text-sky-400 transition-all"
            >
              <Navigation size={16} />
              Open Navigation
            </button>
          )}
          <button
            onClick={() => navigate(`/technician/chat/${job.id}`)}
            className="relative flex-1 min-w-[100px] flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-800 text-slate-400 text-sm font-semibold hover:border-violet-500/30 hover:text-violet-400 transition-all cursor-pointer"
          >
            <MessageCircle size={16} />
            Chat
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-slate-950 animate-scale-up">
                {unreadCount}
              </span>
            )}
          </button>
          
          <button
            onClick={() => navigate(`/technician/suppliers?jobId=${job.id}`)}
            className="flex-1 min-w-[160px] flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-800 text-slate-400 text-sm font-semibold hover:border-amber-500/30 hover:text-amber-400 transition-all cursor-pointer"
          >
            <Package size={16} />
            Request Materials
          </button>

          {job.status === JobStatus.Completed && (
            <button
              onClick={() => navigate(`/technician/invoice/${job.id}`)}
              className="flex-1 min-w-[100px] flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-800 text-slate-400 text-sm font-semibold hover:border-emerald-500/30 hover:text-emerald-400 transition-all"
            >
              <FileCheck size={16} />
              Invoice
            </button>
          )}
        </div>

        {/* Photo Upload */}
        <div className="grid md:grid-cols-2 gap-4">
          <PhotoUpload
            title="Before Photos"
            files={beforeFiles}
            setFiles={setBeforeFiles}
            onUpload={() => uploadBefore.mutate()}
            isPending={uploadBefore.isPending}
          />
          {[JobStatus.Working, JobStatus.Completed].includes(job.status) && (
            <PhotoUpload
              title="After Photos"
              files={afterFiles}
              setFiles={setAfterFiles}
              onUpload={() => uploadAfter.mutate()}
              isPending={uploadAfter.isPending}
            />
          )}
        </div>
      </div>
    </div>
  )
}

const PhotoUpload = ({ title, files, setFiles, onUpload, isPending }: {
  title: string
  files: File[]
  setFiles: (f: File[]) => void
  onUpload: () => void
  isPending: boolean
}) => (
  <div className="rounded-2xl border border-slate-900 bg-slate-900/60 p-5">
    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 font-mono">{title}</h3>
    <label className="flex flex-col items-center gap-2 py-6 border-2 border-dashed border-slate-800 rounded-xl hover:border-sky-500/30 cursor-pointer transition-colors">
      <Upload size={22} className="text-slate-600" />
      <span className="text-xs text-slate-500">Click to upload (max 3)</span>
      <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} />
    </label>
    {files.length > 0 && (
      <>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {files.map((file, index) => (
            <img key={index} src={URL.createObjectURL(file)} className="w-full h-16 object-cover rounded-lg border border-slate-800" alt={`photo-${index}`} />
          ))}
        </div>
        <button
          onClick={onUpload}
          disabled={isPending}
          className="mt-3 w-full py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-bold hover:bg-sky-500/20 transition-all disabled:opacity-50"
        >
          {isPending ? 'Uploading...' : `Upload ${title}`}
        </button>
      </>
    )}
  </div>
)

export default ActiveJobPage
