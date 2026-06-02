import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Clock, CheckCircle2, XCircle, Zap, Droplet, Wind, Radio } from 'lucide-react'
import { toast } from 'react-hot-toast'
import technicianService from '../../services/technician.service'
import { useAuthStore } from '../../store/authStore'
import { useWS } from '../../context/WSContext'
import { formatTimeAgo } from '../../utils/formatters'
import { extractApiError } from '../../services/api'
import type { Job } from '../../types'

const urgencyRank: Record<string, number> = { Emergency: 3, High: 2, Normal: 1 }

const serviceIcon: Record<string, React.ReactNode> = {
  Electrician: <Zap size={16} className="text-yellow-400" />,
  electrical: <Zap size={16} className="text-yellow-400" />,
  Plumber: <Droplet size={16} className="text-blue-400" />,
  plumbing: <Droplet size={16} className="text-blue-400" />,
  'AC Repair': <Wind size={16} className="text-cyan-400" />,
  ac_repair: <Wind size={16} className="text-cyan-400" />,
}

const IncomingRequestsPage = () => {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const ws = useWS()
  const { data } = useQuery({ queryKey: ['incoming'], queryFn: technicianService.getIncoming })
  const [requests, setRequests] = useState<Job[]>([])

  useEffect(() => setRequests(data ?? []), [data])

  useEffect(() => {
    if (!token || !user?.id) return
    ws.connect(`user:${user.id}`, token)

    const bookingHandler = (payload: any) => {
      setRequests((prev) => {
        const rawJob = payload.job || payload
        if (!rawJob) return prev
        const mappedJob: Job = {
          id: rawJob.id || rawJob.jobId || '',
          customerId: rawJob.customerId || '',
          serviceType: rawJob.serviceType || rawJob.title || '',
          description: rawJob.description || '',
          urgency: rawJob.urgency || 'Normal',
          isEmergency: !!rawJob.isEmergency,
          createdAt: rawJob.createdAt || new Date().toISOString(),
          status: rawJob.status || 'Requested',
        }
        if (!mappedJob.id) return prev
        if (prev.some((r) => r.id === mappedJob.id)) return prev
        return [mappedJob, ...prev]
      })
    }

    const acceptedHandler = (payload: any) => {
      const jobId = payload.jobId || payload
      if (jobId) {
        setRequests((prev) => prev.filter((r) => r.id !== jobId))
      }
    }

    ws.on('booking_request', bookingHandler)
    ws.on('booking_accepted', acceptedHandler)

    return () => {
      ws.off('booking_request', bookingHandler)
      ws.off('booking_accepted', acceptedHandler)
      ws.disconnect()
    }
  }, [token, user?.id, ws])

  const sorted = useMemo(
    () => [...requests].sort((a, b) => (urgencyRank[b.urgency ?? 'Normal'] - urgencyRank[a.urgency ?? 'Normal']) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [requests],
  )

  const accept = async (id: string) => {
    try {
      await technicianService.acceptJob(id)
      navigate(`/technician/job/${id}`)
    } catch (error) {
      const apiErr = extractApiError(error)
      if (apiErr.statusCode === 409) {
        toast.error('Job already taken by another technician')
      } else {
        toast.error(apiErr.message)
      }
    }
  }

  const reject = async (id: string) => {
    await technicianService.rejectJob(id)
    setRequests((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative">
      {/* Ambient */}
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-amber-500/5 to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Radio size={14} className="text-amber-400 animate-pulse" />
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Live Feed</p>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Incoming Requests</h1>
          <p className="text-sm text-slate-500 mt-1">
            {sorted.length > 0
              ? `${sorted.length} job${sorted.length > 1 ? 's' : ''} waiting for a technician`
              : 'No active requests — ensure you are Online to receive dispatches'}
          </p>
        </div>

        {/* Empty state */}
        {sorted.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-900 bg-slate-950/40 py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-full border border-slate-800 flex items-center justify-center mx-auto mb-4 text-2xl">
              📡
            </div>
            <h3 className="text-base font-bold text-slate-400 mb-1">No incoming dispatches</h3>
            <p className="text-sm text-slate-600 mb-6 max-w-xs mx-auto">
              Requests will appear here in real-time when customers submit a service request near you.
            </p>
            <button
              onClick={() => navigate('/technician/dashboard')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold hover:bg-emerald-500/20 transition-all duration-200"
            >
              Go to Dashboard
            </button>
          </div>
        )}

        {/* Request Cards */}
        {sorted.length > 0 && (
          <div className="space-y-4">
            {sorted.map((job) => (
              <RequestCard
                key={job.id}
                job={job}
                onAccept={() => accept(job.id)}
                onReject={() => reject(job.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const RequestCard = ({ job, onAccept, onReject }: { job: Job; onAccept: () => void; onReject: () => void }) => {
  const getSecondsRemaining = () => {
    const created = new Date(job.createdAt).getTime()
    const now = new Date().getTime()
    const elapsedSeconds = Math.floor((now - created) / 1000)
    const limit = 48 * 60 * 60 // 48 hours in seconds
    const remaining = limit - elapsedSeconds
    return remaining > 0 ? remaining : 0
  }

  const [seconds, setSeconds] = useState(getSecondsRemaining)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    setSeconds(getSecondsRemaining())

    const timer = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) { 
          window.clearInterval(timer)
          return 0 
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [job.createdAt])

  const isExpired = seconds === 0
  const isUrgent = job.urgency === 'High' || job.urgency === 'Emergency'
  const Icon = serviceIcon[job.serviceType ?? ''] ?? <Zap size={16} className="text-slate-500" />

  const handleAccept = async () => {
    setAccepting(true)
    try { await onAccept() } finally { setAccepting(false) }
  }

  const urgencyColor = isUrgent
    ? 'border-amber-500/20 bg-amber-500/5'
    : 'border-slate-900 bg-slate-900/60'

  const formatCircleText = (sec: number) => {
    if (sec <= 0) return '0s'
    if (sec >= 3600) {
      const hours = Math.floor(sec / 3600)
      return `${hours}h`
    }
    if (sec >= 60) {
      const mins = Math.floor(sec / 60)
      return `${mins}m`
    }
    return `${sec}s`
  }

  // Circular progress ring math
  const radius = 24
  const stroke = 3.5
  const normalizedRadius = radius - stroke * 2
  const circumference = normalizedRadius * 2 * Math.PI
  const totalDuration = 48 * 3600 // 48 hours
  const strokeDashoffset = circumference - (seconds / totalDuration) * circumference

  return (
    <div className={`rounded-2xl border p-5 transition-all duration-200 ${isExpired ? 'opacity-40' : 'hover:bg-slate-900/80'} ${urgencyColor}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-800 flex items-center justify-center shrink-0">
            {Icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-base font-bold text-white truncate">{job.serviceType ?? 'Service'}</h3>
              {isUrgent && (
                <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-1.5 py-0.5">
                  {job.urgency}
                </span>
              )}
              {job.urgency === 'Emergency' && (
                <span className="text-[9px] font-black uppercase tracking-wider text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-1.5 py-0.5">
                  🚨 SOS
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
              <span className="flex items-center gap-1"><Clock size={9} />{formatTimeAgo(job.createdAt)}</span>
              {job.address && <span className="flex items-center gap-1 truncate"><MapPin size={9} />{job.address}</span>}
            </div>
          </div>
        </div>

        {/* Countdown Ring */}
        <div className="relative flex items-center justify-center shrink-0 h-14 w-14">
          <svg className="h-full w-full transform -rotate-90">
            <circle
              className="text-slate-800"
              strokeWidth={stroke}
              stroke="currentColor"
              fill="transparent"
              r={normalizedRadius}
              cx="28"
              cy="28"
            />
            <circle
              className={`transition-all duration-1000 ease-linear ${
                seconds <= 600 ? 'text-red-500 stroke-red-500 animate-pulse' : seconds <= 3600 ? 'text-amber-550 stroke-amber-550' : 'text-emerald-450 stroke-emerald-400'
              }`}
              strokeWidth={stroke}
              strokeDasharray={circumference + ' ' + circumference}
              style={{ strokeDashoffset }}
              strokeLinecap="round"
              fill="transparent"
              r={normalizedRadius}
              cx="28"
              cy="28"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-[11px] font-black font-mono leading-none ${
              seconds <= 600 ? 'text-red-450 animate-pulse' : seconds <= 3600 ? 'text-amber-450' : 'text-emerald-450'
            }`}>
              {formatCircleText(seconds)}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      {job.description && (
        <p className="text-xs text-slate-400 mb-4 line-clamp-2 border-t border-slate-900/80 pt-3">
          {job.description}
        </p>
      )}

      {/* Actions */}
      {isExpired ? (
        <div className="rounded-xl bg-slate-900/40 border border-slate-800 py-3 text-center text-xs text-slate-600 font-bold uppercase tracking-wider">
          Request Expired
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-bold hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all duration-200 disabled:opacity-50"
          >
            <CheckCircle2 size={16} />
            {accepting ? 'Accepting...' : 'Accept'}
          </button>
          <button
            onClick={onReject}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-slate-800 text-slate-500 text-sm font-semibold hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
          >
            <XCircle size={16} />
            Pass
          </button>
        </div>
      )}
    </div>
  )
}

export default IncomingRequestsPage
