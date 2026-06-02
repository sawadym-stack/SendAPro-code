import { useEffect, useMemo, useState } from 'react'
import { 
  MessageSquare, Phone, Star, ArrowLeft, Clock, 
  MapPin, AlertCircle, CheckCircle, Compass, DollarSign, 
  Wrench, ShieldCheck, Trash2, Sparkles, X 
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import jobService from '../../services/job.service'
import chatService from '../../services/chat.service'
import { QUERY_KEYS } from '../../constants/queryKeys'
import { JobStatus } from '../../types'
import JobStatusStepper from '../../components/job/JobStatusStepper'
import LiveTrackingMap from '../../components/map/LiveTrackingMap'
import { useWS } from '../../context/WSContext'
import { useAuthStore } from '../../store/authStore'
import { useJobStore } from '../../store/jobStore'
import ReviewModal from '../../components/job/ReviewModal'
import ReviewsSection from '../technician/ReviewsSection'
const TrackJobPage = () => {
  const qc = useQueryClient()
  const { jobId = '' } = useParams()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const ws = useWS()
  const [localStatus, setLocalStatus] = useState<JobStatus | null>(null)
  const updateTechnicianPosition = useJobStore((s) => s.updateTechnicianPosition)
  const technicianPosition = useJobStore((s) => s.technicianPosition)
  const user = useAuthStore((s) => s.user)
  const [unreadCount, setUnreadCount] = useState(0)

  const { data: job } = useQuery({
    queryKey: QUERY_KEYS.jobById(jobId),
    queryFn: () => jobService.getJob(jobId),
    enabled: Boolean(jobId),
  })

  const status = localStatus ?? job?.status ?? JobStatus.Requested

  const { data: chatRoom } = useQuery({
    queryKey: ['chatRoom', jobId],
    queryFn: () => chatService.getRoom(jobId),
    enabled: Boolean(jobId) && status !== JobStatus.Requested && status !== JobStatus.Cancelled,
  })

  useEffect(() => {
    if (chatRoom) {
      setUnreadCount(chatRoom.unreadCount ?? 0)
    }
  }, [chatRoom])

  // Review states
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [isReviewed, setIsReviewed] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)

  // Cancel states
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  // Radar Simulated Logs
  const [searchLogIndex, setSearchLogIndex] = useState(0)
  const searchLogs = useMemo(() => [
    'Connecting to dispatch network...',
    'Filtering technicians by skill...',
    'Broadcasting request to nearby providers...',
    'Pinging top technicians near you...',
    'Awaiting confirmation from technician...'
  ], [])

  useEffect(() => {
    if (!token || !jobId) return
    ws.connect(`job:${jobId}`, token)

    const locationHandler = (payload: any) => {
      updateTechnicianPosition(payload.lat, payload.lng, payload.eta ?? 0)
    }

    const statusHandler = (payload: any) => {
      setLocalStatus(payload.status)
      qc.invalidateQueries({ queryKey: QUERY_KEYS.jobById(jobId) })
      const messages = {
        Accepted: 'Technician accepted your request!',
        OnTheWay: `Technician is on the way — ETA ${payload.eta ?? 0} min`,
        Arrived:  'Your technician has arrived!',
        Working:  'Work has started',
        Completed: 'Job completed! Please leave a review'
      }
      const msg = messages[payload.status as keyof typeof messages]
      if (msg) {
        toast.success(msg)
      }
      if (payload.status === 'Completed') {
        setTimeout(() => setShowReviewModal(true), 2000)
      }
    }

    const newMessageHandler = (payload: any) => {
      if (payload.senderId !== user?.id) {
        setUnreadCount((c) => c + 1)
      }
    }

    ws.on('location_update', locationHandler)
    ws.on('job_status', statusHandler)
    ws.on('new_message', newMessageHandler)

    return () => {
      ws.off('location_update', locationHandler)
      ws.off('job_status', statusHandler)
      ws.off('new_message', newMessageHandler)
      ws.disconnect()
    }
  }, [token, jobId, ws, updateTechnicianPosition, user?.id, qc])

  useEffect(() => {
    if (status !== JobStatus.Requested) return
    const interval = setInterval(() => {
      setSearchLogIndex((prev) => (prev < searchLogs.length - 1 ? prev + 1 : prev))
    }, 4500)
    return () => clearInterval(interval)
  }, [status, searchLogs])

  useEffect(() => {
    if (status === JobStatus.Completed) {
      const alreadyReviewed = localStorage.getItem(`reviewed_${jobId}`)
      if (alreadyReviewed !== 'true') {
        const timer = setTimeout(() => {
          setShowReviewModal(true)
        }, 2000)
        return () => clearTimeout(timer)
      }
    }
  }, [status, jobId])

  const showMap = useMemo(() => {
    return [JobStatus.OnTheWay, JobStatus.Arrived, JobStatus.Working, JobStatus.Completed].includes(status)
  }, [status])

  const pricing = useMemo(() => {
    if (!job) return null
    let base = 85
    if (job.serviceType === 'Electrician') base = 95
    if (job.serviceType === 'AC Repair') base = 110
    
    let urgencyFee = 0
    if (job.urgency === 'High') urgencyFee = 30
    if (job.urgency === 'Emergency' || job.isEmergency) urgencyFee = 75
    
    const tax = Math.round((base + urgencyFee) * 0.08)
    const total = base + urgencyFee + tax
    
    return { base, urgencyFee, tax, total }
  }, [job])

  const handleCancelJob = async () => {
    setIsCancelling(true)
    try {
      await jobService.cancelJob(jobId)
      toast.success('Job request cancelled successfully')
      setLocalStatus(JobStatus.Cancelled)
      setShowCancelModal(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel job')
    } finally {
      setIsCancelling(false)
    }
  }

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (rating === 0) return
    setIsReviewed(true)
    toast.success('Thank you! Your feedback has been recorded.')
  }

  if (!job) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-8 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 rounded bg-slate-900"></div>
          <div className="h-6 w-24 rounded-full bg-slate-900"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-32 rounded-2xl bg-slate-900/55 border border-slate-900"></div>
            <div className="h-64 rounded-2xl bg-slate-900/55 border border-slate-900"></div>
            <div className="h-48 rounded-2xl bg-slate-900/55 border border-slate-900"></div>
          </div>
          <div className="space-y-6">
            <div className="h-48 rounded-2xl bg-slate-900/55 border border-slate-900"></div>
            <div className="h-32 rounded-2xl bg-slate-900/55 border border-slate-900"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative mx-auto max-w-7xl px-4 py-6 space-y-6">
      


      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/customer/dashboard')} 
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 bg-slate-900/55 text-slate-400 hover:bg-slate-900 hover:text-slate-200 transition-colors shadow-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight text-white font-display">Track Service</h2>
              <span className="text-xs text-slate-500 font-mono">#{jobId.slice(0, 8)}</span>
            </div>
            <p className="text-sm text-slate-400">Real-time status of your service appointment</p>
          </div>
        </div>

        {/* Status Badge */}
        <div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
            status === JobStatus.Requested ? 'bg-amber-500/10 text-amber-400 ring-amber-500/20' :
            status === JobStatus.Accepted ? 'bg-blue-500/10 text-blue-400 ring-blue-500/20' :
            status === JobStatus.OnTheWay ? 'bg-sky-500/10 text-sky-400 ring-sky-500/20' :
            status === JobStatus.Arrived ? 'bg-indigo-500/10 text-indigo-400 ring-indigo-500/20' :
            status === JobStatus.Working ? 'bg-violet-500/10 text-violet-400 ring-violet-500/20' :
            status === JobStatus.Completed ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' :
            'bg-red-500/10 text-red-400 ring-red-500/20'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              status === JobStatus.Requested ? 'bg-amber-500 animate-pulse' :
              status === JobStatus.Accepted ? 'bg-blue-500 animate-pulse' :
              status === JobStatus.OnTheWay ? 'bg-sky-500 animate-pulse' :
              status === JobStatus.Arrived ? 'bg-indigo-500 animate-pulse' :
              status === JobStatus.Working ? 'bg-violet-500 animate-pulse' :
              status === JobStatus.Completed ? 'bg-emerald-500' :
              'bg-red-500'
            }`} />
            {status === JobStatus.OnTheWay ? 'On The Way' : status}
          </span>
        </div>
      </div>

      {/* 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Content (Left, 2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Stepper */}
          {status !== JobStatus.Cancelled && (
            <JobStatusStepper currentStatus={status} />
          )}

          {/* Map or Sonar Radar */}
          <div className="overflow-hidden rounded-2xl border border-slate-900 bg-slate-900/40 backdrop-blur-xl shadow-xl shadow-slate-950/20">
            <div className="border-b border-slate-900 px-6 py-4">
              <h3 className="text-sm font-bold text-slate-200">
                {status === JobStatus.Requested ? 'Connecting to Technician Network' : 'Service Tracking Map'}
              </h3>
            </div>

            {showMap && job.latitude != null && job.longitude != null ? (
              <div className="relative">
                <LiveTrackingMap
                  customerLat={job.latitude}
                  customerLng={job.longitude}
                  technicianLat={technicianPosition?.lat}
                  technicianLng={technicianPosition?.lng}
                />
                {technicianPosition?.eta != null && technicianPosition.eta > 0 && (
                  <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-lg bg-slate-900/90 border border-slate-800 px-3 py-2 text-xs font-bold text-slate-200 shadow-xl backdrop-blur-sm">
                    <Clock className="h-4 w-4 text-emerald-450 animate-pulse" />
                    <span>Estimated Arrival: {technicianPosition.eta} mins</span>
                  </div>
                )}
              </div>
            ) : status === JobStatus.Cancelled ? (
              <div className="flex flex-col items-center justify-center p-12 text-center bg-red-950/10">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                  <AlertCircle className="h-8 w-8" />
                </div>
                <h4 className="mt-4 text-lg font-bold text-slate-200">Request Cancelled</h4>
                <p className="mt-2 max-w-sm text-sm text-slate-400">
                  This job request has been cancelled. You can go back to your dashboard to submit a new service request.
                </p>
              </div>
            ) : (
              /* Radar Sonar Search */
              <div className="relative flex flex-col items-center justify-center overflow-hidden bg-slate-950/40 py-16 px-6 text-center">
                {/* Sonar circle elements */}
                <div className="relative flex h-52 w-52 items-center justify-center">
                  <div className="absolute h-full w-full rounded-full border border-sky-500/10 bg-sky-500/5 animate-sonar-1"></div>
                  <div className="absolute h-full w-full rounded-full border border-sky-500/10 bg-sky-500/5 animate-sonar-2"></div>
                  <div className="absolute h-full w-full rounded-full border border-sky-500/10 bg-sky-500/5 animate-sonar-3"></div>
                  
                  {/* Glowing center circle */}
                  <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 text-white shadow-xl shadow-sky-500/30 ring-8 ring-slate-900/60 animate-pulse">
                    <Compass className="h-10 w-10 animate-spin" style={{ animationDuration: '8s' }} />
                  </div>
                </div>

                <div className="relative z-10 mt-8 max-w-md space-y-2">
                  <h4 className="text-lg font-bold text-slate-200">Finding Available Techs</h4>
                  <p className="text-sm text-slate-400">
                    We are broadcasting your request to certified <strong className="text-slate-200">{job.serviceType}</strong> professionals nearby.
                  </p>
                </div>

                {/* Simulated Ticker Logs */}
                <div className="relative z-10 mt-6 inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900/80 px-4 py-1.5 text-xs text-slate-300 shadow-md">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  </span>
                  <span className="font-mono text-slate-400">{searchLogs[searchLogIndex]}</span>
                </div>
              </div>
            )}
          </div>

          {/* Job Details Card */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/40 backdrop-blur-xl p-6 shadow-xl shadow-slate-950/20 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-200 font-display">Job Specifications</h3>
              <p className="text-sm text-slate-400">Detailed overview of the requested assistance</p>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl bg-slate-950/40 p-4 border border-slate-900/55">
                <p className="text-xs text-slate-500 font-semibold">Service Required</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <Wrench className="h-4 w-4 text-sky-400" />
                  <span className="text-sm font-bold text-slate-200">{job.serviceType}</span>
                </div>
              </div>

              <div className="rounded-xl bg-slate-950/40 p-4 border border-slate-900/55">
                <p className="text-xs text-slate-500 font-semibold">Urgency Level</p>
                <div className="mt-1">
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                    job.urgency === 'High' || job.isEmergency 
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                      : 'bg-slate-800 text-slate-350'
                  }`}>
                    {job.urgency === 'High' || job.isEmergency ? 'Urgent / Emergency' : 'Normal'}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-slate-950/40 p-4 border border-slate-900/55">
                <p className="text-xs text-slate-500 font-semibold">Estimate</p>
                <div className="mt-1 flex items-center gap-1">
                  <DollarSign className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-bold text-slate-200">
                    {job.amount ? `$${job.amount}` : `$${pricing?.total}`}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-slate-950/40 p-4 border border-slate-900/55">
                <p className="text-xs text-slate-500 font-semibold">Submitted On</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-bold text-slate-200">
                    {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Service Location</h4>
                <div className="flex items-start gap-2 text-sm text-slate-300">
                  <MapPin className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
                  <span>{job.address || 'Address not registered'}</span>
                </div>
              </div>

              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Description</h4>
                <p className="text-sm leading-relaxed text-slate-300 bg-slate-950/40 p-4 rounded-xl border border-slate-900/55">
                  {job.description}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar (Right, 1 Column) */}
        <div className="space-y-6">
          
          {/* Technician Profile Card */}
          {status !== JobStatus.Requested && status !== JobStatus.Cancelled ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-xl p-6 shadow-xl shadow-slate-950/20 space-y-6 hover:border-sky-500/30 hover:shadow-[0_0_25px_rgba(14,165,233,0.08)] transition-all duration-300">
              <div className="flex items-center justify-between border-b border-slate-900/80 pb-4">
                <h3 className="text-sm font-bold text-slate-200 font-display uppercase tracking-wider">Assigned Specialist</h3>
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="h-3.5 w-3.5" /> Verified Pro
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-400 via-blue-500 to-indigo-650 font-display text-lg font-black text-white shadow-lg shadow-blue-500/15 border border-sky-400/20">
                  {(job.technicianName ?? 'T').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-extrabold text-white text-base tracking-tight">{job.technicianName || 'Professional Tech'}</h4>
                  {job.technicianId ? (
                    <ReviewsSection technicianId={job.technicianId} compact={true} />
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                      <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                      <span className="font-bold text-slate-200">4.9</span>
                      <span>(120+ reviews)</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1 font-mono">
                    <Phone className="h-3.5 w-3.5 text-sky-400" />
                    <span>{job.technicianPhone || 'No contact number'}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button 
                  onClick={() => navigate(`/customer/chat/${jobId}`)}
                  className="relative flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-350 hover:text-white hover:border-slate-700 hover:bg-slate-900 transition duration-300 font-bold text-xs text-center py-3 px-3 shadow-md active:scale-95 cursor-pointer"
                >
                  <MessageSquare className="h-4 w-4 text-sky-400" />
                  Chat Client
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-slate-950 animate-scale-up">
                      {unreadCount}
                    </span>
                  )}
                </button>
                <a 
                  href={`tel:${job.technicianPhone || ''}`}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-350 hover:text-white hover:border-slate-700 hover:bg-slate-900 transition duration-300 font-bold text-xs text-center py-3 px-3 shadow-md active:scale-95"
                >
                  <Phone className="h-4 w-4 text-emerald-400 animate-pulse" />
                  Call: {job.technicianPhone || 'N/A'}
                </a>
              </div>
            </div>
          ) : status === JobStatus.Cancelled ? null : (
            /* Unassigned Spinner Card */
            <div className="rounded-2xl border border-slate-900 bg-slate-900/40 backdrop-blur-xl p-6 shadow-xl shadow-slate-950/20 text-center py-8 space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 border border-slate-900 text-slate-550 animate-pulse">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-200 font-display">Assigning Specialist</h4>
                <p className="text-xs text-slate-450 leading-relaxed">
                  Technicians are reviewing your details. Typically takes less than 2 minutes.
                </p>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-900/60">
                <div className="h-full w-1/2 rounded-full bg-sky-500 animate-ping" style={{ animationDuration: '2.5s' }} />
              </div>
            </div>
          )}

          {/* Pricing Receipt Card */}
          {pricing && (
            <div className="rounded-2xl border border-slate-900 bg-slate-900/40 backdrop-blur-xl p-6 shadow-xl shadow-slate-950/20 space-y-4">
              <h3 className="text-sm font-bold text-slate-200 border-b border-slate-900 pb-3 font-display">Price Breakdown</h3>
              <div className="space-y-2.5 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Base Fare ({job.serviceType})</span>
                  <span className="font-semibold text-slate-200">${pricing.base}</span>
                </div>
                {pricing.urgencyFee > 0 && (
                  <div className="flex justify-between">
                    <span>Urgency Surcharge</span>
                    <span className="font-semibold text-red-400">+${pricing.urgencyFee}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Estimated Taxes (8%)</span>
                  <span className="font-semibold text-slate-200">${pricing.tax}</span>
                </div>
                <div className="border-t border-slate-900 pt-2.5 flex justify-between text-sm font-bold text-slate-200">
                  <span>Total Estimated Cost</span>
                  <span className="text-emerald-400 font-bold">
                    {job.amount ? `$${job.amount}` : `$${pricing.total}`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Cancel Booking Section */}
          {status === JobStatus.Requested && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 shadow-sm space-y-3">
              <p className="text-xs text-slate-400 leading-relaxed">
                Need to cancel? You can cancel your service request free of charge before a technician is assigned.
              </p>
              <button 
                onClick={() => setShowCancelModal(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 py-2.5 px-4 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <Trash2 className="h-4 w-4" /> Cancel Service Request
              </button>
            </div>
          )}
          {/* Payment Status Card (Unpaid Completed Job) */}
          {status === JobStatus.Completed && !job.isPaid && (
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-6 shadow-xl shadow-indigo-950/10 space-y-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 -mt-6 -mr-6 w-20 h-20 bg-indigo-500/10 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500" />
              <div className="flex items-center gap-2.5 text-indigo-400">
                <DollarSign className="h-5 w-5 text-indigo-400 animate-bounce" />
                <h3 className="text-sm font-black uppercase tracking-wider font-display">Invoice Generated</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                The technician has submitted the final invoice. Please review and pay to complete the transaction.
              </p>
              <button
                onClick={() => navigate(`/customer/payment/${jobId}`)}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 border-none py-3 px-4 text-xs font-black text-white hover:text-white transition duration-200 shadow-lg shadow-indigo-500/20 active:scale-98 cursor-pointer"
              >
                Proceed to Payment
              </button>
            </div>
          )}

          {/* Rate Experience Button (Completed State) */}
          {status === JobStatus.Completed && localStorage.getItem(`reviewed_${jobId}`) !== 'true' && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-amber-400">
                <Sparkles className="h-5 w-5 fill-amber-450 text-amber-450 animate-pulse" />
                <h3 className="text-sm font-bold">Rate Your Experience</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Please take a moment to rate the service provided by your technician.
              </p>
              <button
                onClick={() => setShowReviewModal(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 py-2.5 px-4 text-xs font-bold text-amber-400 hover:bg-amber-500/20 transition-colors"
              >
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                {localStorage.getItem(`reviewed_${jobId}`) === 'skipped' ? 'Leave a Review' : 'Leave a Review'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cancellation Modal Overlay */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl animate-scale-up">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400 mb-4 border border-red-500/20">
              <AlertCircle className="h-6 w-6" />
            </div>
            
            <h3 className="text-lg font-bold text-slate-200 font-display">Cancel Request?</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-450">
              Are you sure you want to cancel this service request? This action will remove your request from our dispatch queue.
            </p>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 rounded-xl border border-slate-800 bg-slate-950 py-2.5 text-xs font-bold text-slate-400 hover:bg-slate-900 transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={handleCancelJob}
                disabled={isCancelling}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isCancelling ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {job && job.technicianId && (
        <ReviewModal
          jobId={jobId}
          revieweeId={job.technicianId}
          technicianName={job.technicianName || 'Professional Tech'}
          isOpen={showReviewModal}
          onClose={() => {
            setShowReviewModal(false)
            qc.invalidateQueries({ queryKey: QUERY_KEYS.jobById(jobId) })
          }}
        />
      )}

    </div>
  )
}

export default TrackJobPage

