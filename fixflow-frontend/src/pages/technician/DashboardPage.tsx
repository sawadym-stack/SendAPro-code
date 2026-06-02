import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Zap, Briefcase, Star, Droplet, Wind, Sparkles, Check, Sliders, MapPin, Radio, Navigation, ArrowRight } from 'lucide-react'
import technicianService from '../../services/technician.service'
import jobService from '../../services/job.service'
import { useAuthStore } from '../../store/authStore'
import { useWebSocket } from '../../hooks/useWebSocket'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { JobStatus, type Job } from '../../types'
import { Button } from '../../components/ui'
import { useGeolocation } from '../../hooks/useGeolocation'
import { extractApiError } from '../../services/api'

const statuses = ['Online', 'Busy', 'Offline'] as const

const RadarScanner = ({ active }: { active: boolean }) => {
  return (
    <div className="relative w-48 h-48 mx-auto flex items-center justify-center bg-slate-950/80 rounded-full border border-slate-800/80 overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
      {/* Radar rings */}
      <div className="absolute w-40 h-40 border border-slate-800/40 rounded-full" />
      <div className="absolute w-28 h-28 border border-slate-800/30 rounded-full" />
      <div className="absolute w-16 h-16 border border-slate-800/20 rounded-full" />
      
      {/* Radar axes */}
      <div className="absolute w-full h-px bg-slate-800/20" />
      <div className="absolute h-full w-px bg-slate-800/20" />
      
      {/* Pulsing sonar wave */}
      {active && (
        <>
          <div className="absolute w-32 h-32 rounded-full border border-emerald-500/20 bg-emerald-500/5 animate-sonar-1" />
          <div className="absolute w-32 h-32 rounded-full border border-emerald-500/20 bg-emerald-500/5 animate-sonar-2" />
          <div className="absolute w-32 h-32 rounded-full border border-emerald-500/20 bg-emerald-500/5 animate-sonar-3" />
          
          {/* Rotating sweep line */}
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-emerald-500/20 rounded-full animate-spin [animation-duration:4s]" />
        </>
      )}

      {/* Center blip */}
      <div className="relative z-10 w-4 h-4 rounded-full bg-slate-950 flex items-center justify-center border border-slate-800">
        <div className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`} />
      </div>
    </div>
  )
}

interface RequestCardProps {
  job: Job
  onAccept: (id: string) => void
  onReject: (id: string) => void
  isAccepting: boolean
  isRejecting: boolean
}

const RequestCard = ({ job, onAccept, onReject, isAccepting, isRejecting }: RequestCardProps) => {
  const getSecondsRemaining = () => {
    const created = new Date(job.createdAt).getTime()
    const now = new Date().getTime()
    const elapsedSeconds = Math.floor((now - created) / 1000)
    const limit = 48 * 60 * 60 // 48 hours in seconds
    const remaining = limit - elapsedSeconds
    return remaining > 0 ? remaining : 0
  }

  const [seconds, setSeconds] = useState(getSecondsRemaining)
  const [expired, setExpired] = useState(() => getSecondsRemaining() <= 0)

  useEffect(() => {
    const initial = getSecondsRemaining()
    setSeconds(initial)
    setExpired(initial <= 0)

    const timer = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          window.clearInterval(timer)
          setExpired(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [job.createdAt])

  const formatSeconds = (sec: number) => {
    if (sec <= 0) return '0s'
    if (sec >= 3600) {
      const hours = Math.floor(sec / 3600)
      const mins = Math.floor((sec % 3600) / 60)
      return `${hours}h ${mins}m`
    }
    if (sec >= 60) {
      const mins = Math.floor(sec / 60)
      return `${mins}m`
    }
    return `${sec}s`
  }

  const totalDuration = 48 * 3600 // 48 hours
  const percent = (seconds / totalDuration) * 100

  const getServiceStyle = (type: string) => {
    switch (type.toLowerCase()) {
      case 'electrician':
      case 'electrical':
        return {
          glow: 'shadow-[0_0_15px_rgba(245,158,11,0.15)] border-amber-500/30 bg-amber-950/10 text-amber-300',
          text: 'text-amber-400',
          iconColor: 'text-amber-400',
          progress: 'bg-amber-500'
        }
      case 'plumber':
      case 'plumbing':
        return {
          glow: 'shadow-[0_0_15px_rgba(59,130,246,0.15)] border-blue-500/30 bg-blue-950/10 text-blue-300',
          text: 'text-blue-400',
          iconColor: 'text-blue-400',
          progress: 'bg-blue-500'
        }
      case 'ac repair':
      case 'ac_repair':
      case 'ac':
        return {
          glow: 'shadow-[0_0_15px_rgba(6,182,212,0.15)] border-cyan-500/30 bg-cyan-950/10 text-cyan-300',
          text: 'text-cyan-400',
          iconColor: 'text-cyan-400',
          progress: 'bg-cyan-500'
        }
      default:
        return {
          glow: 'shadow-[0_0_15px_rgba(139,92,246,0.15)] border-purple-500/30 bg-purple-950/10 text-purple-300',
          text: 'text-purple-400',
          iconColor: 'text-purple-400',
          progress: 'bg-purple-500'
        }
    }
  }

  const styles = getServiceStyle(job.serviceType || '')

  if (expired) {
    return (
      <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-slate-500 flex items-center justify-between opacity-50 transition-all duration-300">
        <div>
          <span className="text-[10px] uppercase font-mono tracking-wider">Request Expired</span>
          <h4 className="text-sm font-semibold">{job.serviceType}</h4>
        </div>
        <button 
          onClick={() => onReject(job.id)} 
          className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    )
  }

  return (
    <div className={`p-5 rounded-2xl bg-slate-900/40 border backdrop-blur-md transition-all duration-300 flex flex-col gap-4 relative overflow-hidden group ${styles.glow}`}>
      {/* Background Glow */}
      <div className="absolute top-0 right-0 -mt-10 -mr-10 w-24 h-24 bg-current opacity-5 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500" />
      
      {/* Progress line indicator */}
      <div className="absolute bottom-0 left-0 h-[3px] bg-slate-800 w-full">
        <div className={`h-full transition-all duration-1000 ease-linear ${styles.progress}`} style={{ width: `${percent}%` }} />
      </div>

      <div className="flex justify-between items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
              {job.urgency || 'Normal'}
            </span>
            {job.isEmergency && (
              <span className="text-[10px] font-bold text-red-400 bg-red-950/50 border border-red-500/20 px-2 py-0.5 rounded animate-pulse">
                🚨 EMERGENCY SOS
              </span>
            )}
          </div>
          <h3 className="text-lg font-black text-white">{job.serviceType}</h3>
          <p className="text-sm text-slate-300 mt-1 line-clamp-2">{job.description}</p>
        </div>
        
        {/* Countdown timer */}
        <div className="flex flex-col items-end shrink-0">
          <span className={`text-xl font-black font-mono tracking-tighter ${seconds <= 600 ? 'text-red-500 animate-pulse' : seconds <= 3600 ? 'text-amber-500' : 'text-slate-200'}`}>
            {formatSeconds(seconds)}
          </span>
          <span className="text-[9px] uppercase tracking-wider text-slate-500">Expiring</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-1 font-mono text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <MapPin size={13} className="text-slate-500 shrink-0" />
          <span className="truncate">{job.address || 'Address not specified'}</span>
        </div>
        <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1 border-t border-slate-800/40">
          <span>Incident coordinates</span>
          <span className="text-slate-400">{(job.latitude ?? 11.02).toFixed(4)}, {(job.longitude ?? 76.12).toFixed(4)}</span>
        </div>
      </div>

      <div className="flex gap-2.5 mt-2 z-10">
        <button
          onClick={() => onAccept(job.id)}
          disabled={isAccepting || isRejecting}
          className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-xs font-black py-2.5 rounded-xl transition duration-200 active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-500/10"
        >
          {isAccepting ? 'ACCEPTING...' : 'ACCEPT DISPATCH'}
        </button>
        <button
          onClick={() => onReject(job.id)}
          disabled={isAccepting || isRejecting}
          className="px-4 bg-slate-950/60 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-800 hover:border-red-500/30 text-xs py-2.5 rounded-xl transition duration-200 active:scale-95 flex items-center justify-center disabled:opacity-50 cursor-pointer"
        >
          {isRejecting ? '...' : 'REJECT'}
        </button>
      </div>
    </div>
  )
}

const TechnicianDashboardPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<(typeof statuses)[number]>('Offline')

  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const { connect, disconnect, on, off } = useWebSocket()

  const { data: me } = useQuery({ queryKey: ['technician-me'], queryFn: technicianService.getMe })
  const { data: statsData } = useQuery({ queryKey: ['technician-stats'], queryFn: jobService.getTechnicianStats })
  const { data: jobsData } = useQuery({ queryKey: ['technician-jobs'], queryFn: () => jobService.listJobs({ limit: 20, page: 1 }) })

  // Query incoming matching requests
  const { data: initialRequests } = useQuery({
    queryKey: ['technician-incoming'],
    queryFn: technicianService.getIncoming,
    refetchInterval: 8000,
    enabled: !!user?.id,
  })

  const [requests, setRequests] = useState<Job[]>([])

  useEffect(() => {
    if (initialRequests) {
      setRequests(initialRequests)
    }
  }, [initialRequests])

  useEffect(() => {
    if (!token || !user?.id) return
    connect(`user:${user.id}`, token)

    const bookingHandler = (event: Extract<import('../../types').WSEvent, { type: 'booking_request' }>) => {
      setRequests((prev) => {
        if (prev.some((r) => r.id === event.job.id)) return prev
        // Web audio beep for incoming requests
        try {
          const context = new (window.AudioContext || (window as any).webkitAudioContext)()
          const osc = context.createOscillator()
          const gain = context.createGain()
          osc.connect(gain)
          gain.connect(context.destination)
          osc.frequency.setValueAtTime(880, context.currentTime) // A5
          gain.gain.setValueAtTime(0.08, context.currentTime)
          osc.start()
          osc.stop(context.currentTime + 0.15)
        } catch (_) {}
        return [event.job, ...prev]
      })
    }

    const acceptedHandler = (event: Extract<import('../../types').WSEvent, { type: 'booking_accepted' }>) => {
      setRequests((prev) => prev.filter((r) => r.id !== event.jobId))
    }

    on('booking_request', bookingHandler)
    on('booking_accepted', acceptedHandler)

    return () => {
      off('booking_request', bookingHandler)
      off('booking_accepted', acceptedHandler)
      disconnect()
    }
  }, [token, user?.id, connect, disconnect, on, off])

  const effectiveStatus = me?.status ?? status

  // Get geolocation when online (falls back to Kozhikode coordinates)
  const { lat, lng, loading: geoLoading } = useGeolocation(effectiveStatus === 'Online')

  // Auto-send geolocation updates to backend — fires immediately when going Online
  useEffect(() => {
    if (effectiveStatus !== 'Online') return

    // Send location immediately (don't wait for GPS to settle)
    const currentLat = lat ?? 11.02
    const currentLng = lng ?? 76.12
    technicianService.updateLocation(currentLat, currentLng).catch((err) => {
      console.error('Failed to update online location:', err)
    })

    // Periodic refresh every 12s
    const timer = setInterval(() => {
      const liveLat = lat ?? 11.02
      const liveLng = lng ?? 76.12
      technicianService.updateLocation(liveLat, liveLng).catch((err) => {
        console.error('Periodic location update failed:', err)
      })
    }, 12000)

    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStatus])

  // Update location when GPS coordinates change
  useEffect(() => {
    if (effectiveStatus !== 'Online' || (!lat && !lng)) return
    technicianService.updateLocation(lat ?? 11.02, lng ?? 76.12).catch(() => {})
  }, [lat, lng, effectiveStatus])

  const updateStatus = useMutation({
    mutationFn: (next: (typeof statuses)[number]) => technicianService.updateAvailability(next),
    onSuccess: (_, next) => {
      setStatus(next)
      queryClient.invalidateQueries({ queryKey: ['technician-me'] })
      // Immediately push location to Redis so NearbyTechnicians query finds us right away
      if (next === 'Online') {
        technicianService.updateLocation(lat ?? 11.02, lng ?? 76.12).catch(() => {})
        // Also refresh incoming requests immediately
        queryClient.invalidateQueries({ queryKey: ['technician-incoming'] })
      }
    },
  })

  const currentSkills = me?.skills ?? []

  const updateSkillsMutation = useMutation({
    mutationFn: (newSkills: string[]) => technicianService.updateSkills(newSkills),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['technician-me'] })
    },
  })

  const handleToggleSkill = (skill: string) => {
    let nextSkills = [...currentSkills]
    if (currentSkills.includes(skill)) {
      nextSkills = nextSkills.filter((s) => s !== skill)
    } else {
      nextSkills.push(skill)
    }
    updateSkillsMutation.mutate(nextSkills)
  }

  const handleToggleAll = () => {
    const allSkills = ['electrical', 'plumbing', 'ac_repair']
    const hasAll = allSkills.every((s) => currentSkills.includes(s))
    if (hasAll) {
      updateSkillsMutation.mutate([])
    } else {
      updateSkillsMutation.mutate(allSkills)
    }
  }

  const acceptJobMutation = useMutation({
    mutationFn: (jobId: string) => technicianService.acceptJob(jobId),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ['technician-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['technician-incoming'] })
      navigate(`/technician/job/${job.id}`)
    },
    onError: (err: any) => {
      const apiErr = extractApiError(err)
      alert(apiErr.message)
    }
  })

  const patchStatusMutation = useMutation({
    mutationFn: ({ jobId, status }: { jobId: string; status: JobStatus }) =>
      technicianService.patchJobStatus(jobId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['technician-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['technician-incoming'] })
    },
    onError: (err: any) => {
      const apiErr = extractApiError(err)
      alert(apiErr.message)
    }
  })

  const rejectJobMutation = useMutation({
    mutationFn: (jobId: string) => technicianService.rejectJob(jobId),
    onSuccess: (_, jobId) => {
      setRequests((prev) => prev.filter((r) => r.id !== jobId))
      queryClient.invalidateQueries({ queryKey: ['technician-incoming'] })
    }
  })

  const calculateJobAmount = (job: Job) => {
    let base = 85
    if (job.serviceType === 'Electrician' || job.serviceType === 'electrical') base = 95
    if (job.serviceType === 'AC Repair' || job.serviceType === 'ac_repair') base = 110
    
    let urgencyFee = 0
    if (job.urgency === 'High') urgencyFee = 30
    if (job.urgency === 'Emergency' || job.isEmergency) urgencyFee = 75
    
    const tax = Math.round((base + urgencyFee) * 0.08)
    return base + urgencyFee + tax
  }

  const jobs = jobsData?.jobs ?? []
  const activeJob = jobs.find((job) => [JobStatus.Accepted, JobStatus.OnTheWay, JobStatus.Arrived, JobStatus.Working].includes(job.status))
  const completed = jobs.filter((job) => job.status === JobStatus.Completed)
  const todayEarnings = completed.reduce((sum, job) => sum + calculateJobAmount(job), 0)

  // Filter pending requests — handle both 'Requested' (domain) and 'created' (db raw) status values
  const pendingRequests = requests.filter(
    (r) => r.status === JobStatus.Requested || (r.status as string) === 'created' || (r.status as string) === 'Requested'
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans relative overflow-hidden pb-12">
      {/* Visual background layers */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,58,138,0.2),transparent_70%)] pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent pointer-events-none" />
      
      {/* Cockpit Control Header */}
      <div className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container-base flex flex-col md:flex-row items-center justify-between py-5 gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  effectiveStatus === 'Online' ? 'bg-emerald-400' : effectiveStatus === 'Busy' ? 'bg-amber-400' : 'bg-slate-500'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${
                  effectiveStatus === 'Online' ? 'bg-emerald-500' : effectiveStatus === 'Busy' ? 'bg-amber-500' : 'bg-slate-500'
                }`}></span>
              </span>
              TECHNICIAN TERMINAL
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              ID: {user?.id?.substring(0, 8) || '00000000'} // Kozhikode Operations Center
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono hidden sm:inline">GPS COORDINATES:</span>
            <div className="bg-slate-900 border border-slate-800 rounded-lg px-3.5 py-1.5 text-xs font-mono text-slate-300">
              {geoLoading ? (
                <span className="text-amber-400 animate-pulse">LOCKING SATELLITE...</span>
              ) : lat && lng ? (
                <span className="text-emerald-400">{lat.toFixed(6)}, {lng.toFixed(6)}</span>
              ) : (
                <span className="text-slate-500">11.020000, 76.120000 (SIM)</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container-base mt-8 space-y-8">
        
        {/* Active Job Alert / On-Duty Deployed Block */}
        {activeJob && (
          <div className="relative group overflow-hidden rounded-2xl border border-red-500/40 bg-gradient-to-r from-red-950/20 to-rose-950/20 p-6 backdrop-blur shadow-[0_0_30px_rgba(239,68,68,0.1)]">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-24 h-24 bg-red-600/10 rounded-full blur-xl animate-pulse" />
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1 rounded bg-red-500/10 px-2 py-0.5 text-xs font-mono font-bold text-red-400 border border-red-500/20 animate-pulse">
                    🔴 ACTIVE SOS ON-DUTY DEPLOYED
                  </span>
                  <span className="text-xs font-mono text-slate-400">Job: #{activeJob.id.substring(0, 8)}</span>
                </div>
                <h3 className="text-2xl font-black text-white">{activeJob.serviceType}</h3>
                <p className="text-sm text-slate-300 mt-1 max-w-xl">{activeJob.description}</p>
                <div className="flex items-center gap-1.5 mt-3 text-xs font-mono text-slate-400">
                  <MapPin size={13} className="text-red-400" />
                  <span>{activeJob.address || 'Location Specified'}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 w-full md:w-auto">
                {activeJob.status === JobStatus.Accepted && (
                  <Button
                    onClick={() => patchStatusMutation.mutate({ jobId: activeJob.id, status: JobStatus.OnTheWay })}
                    disabled={patchStatusMutation.isPending}
                    className="bg-blue-650 hover:bg-blue-750 text-white font-black px-5 py-3 rounded-xl flex-1 md:flex-none justify-center"
                  >
                    🚗 START DRIVING
                  </Button>
                )}
                {activeJob.status === JobStatus.OnTheWay && (
                  <Button
                    onClick={() => patchStatusMutation.mutate({ jobId: activeJob.id, status: JobStatus.Arrived })}
                    disabled={patchStatusMutation.isPending}
                    className="bg-violet-650 hover:bg-violet-750 text-white font-black px-5 py-3 rounded-xl flex-1 md:flex-none justify-center"
                  >
                    📍 MARK ARRIVED
                  </Button>
                )}
                {activeJob.status === JobStatus.Arrived && (
                  <Button
                    onClick={() => patchStatusMutation.mutate({ jobId: activeJob.id, status: JobStatus.Working })}
                    disabled={patchStatusMutation.isPending}
                    className="bg-orange-650 hover:bg-orange-750 text-white font-black px-5 py-3 rounded-xl flex-1 md:flex-none justify-center"
                  >
                    🔧 START WORKING
                  </Button>
                )}
                {activeJob.status === JobStatus.Working && (
                  <Button
                    onClick={() => patchStatusMutation.mutate({ jobId: activeJob.id, status: JobStatus.Completed })}
                    disabled={patchStatusMutation.isPending}
                    className="bg-emerald-650 hover:bg-emerald-750 text-white font-black px-5 py-3 rounded-xl flex-1 md:flex-none justify-center"
                  >
                    ✓ COMPLETE JOB
                  </Button>
                )}
                <Button
                  onClick={() => navigate(`/technician/navigation/${activeJob.id}`)}
                  variant="primary"
                  className="bg-red-650 hover:bg-red-750 text-white font-black px-5 py-3 rounded-xl flex-1 md:flex-none justify-center gap-2"
                >
                  <Navigation size={18} />
                  ACTIVATE HUD NAV
                </Button>
                <Button
                  onClick={() => navigate(`/technician/job/${activeJob.id}`)}
                  variant="outline"
                  className="border-slate-800 text-slate-350 hover:bg-slate-900 px-5 py-3 rounded-xl flex-1 md:flex-none justify-center"
                >
                  VIEW STATUS
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main Dashboard Layout Grid */}
        <div className="grid gap-8 lg:grid-cols-3">
          
          {/* Column 1 & 2: Live Dispatch Radar & Incoming requests feed */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Radar Panel */}
            <div className="rounded-3xl bg-slate-900/20 border border-slate-900 p-6 backdrop-blur-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 -mt-10 -mr-10 w-36 h-36 bg-blue-600/5 rounded-full blur-2xl" />
              
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <Radio size={18} className={`text-emerald-400 ${effectiveStatus === 'Online' ? 'animate-pulse' : ''}`} />
                    LIVE DISPATCH RADAR
                  </h2>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">Searching for matching tasks in Kozhikode (15km radius)</p>
                </div>
                {effectiveStatus === 'Online' && (
                  <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                    Radar Active
                  </span>
                )}
              </div>

              <div className="py-6 border-b border-slate-900">
                <RadarScanner active={effectiveStatus === 'Online'} />
              </div>

              <div className="mt-5 flex justify-between items-center text-xs font-mono text-slate-400">
                <span>SYSTEM STATUS</span>
                <span>
                  {effectiveStatus === 'Online' ? (
                    <span className="text-emerald-400 font-bold">ONLINE & BEACONING</span>
                  ) : effectiveStatus === 'Busy' ? (
                    <span className="text-amber-400 font-bold">BUSY (RADAR PAUSED)</span>
                  ) : (
                    <span className="text-slate-500 font-bold">RADAR STANDBY</span>
                  )}
                </span>
              </div>
            </div>

            {/* Request Feed */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-black tracking-widest text-slate-400 font-mono uppercase">
                  ACTIVE ALERTS ({pendingRequests.length})
                </h3>
                <span className="text-xs text-slate-500 font-mono">Real-time matching active</span>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-900 bg-slate-950/40 py-12 px-6 text-center text-slate-500">
                  <div className="w-12 h-12 rounded-full border border-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-600 text-lg">
                    📡
                  </div>
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wide">No incoming dispatches detected</h4>
                  <p className="text-xs text-slate-600 max-w-sm mx-auto mt-1 font-mono">
                    Ensure your status is set to "Online" above to begin receiving location-aware distress dispatches.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
                  {pendingRequests.map((job) => (
                    <RequestCard
                      key={job.id}
                      job={job}
                      onAccept={(id) => acceptJobMutation.mutate(id)}
                      onReject={(id) => rejectJobMutation.mutate(id)}
                      isAccepting={acceptJobMutation.isPending && acceptJobMutation.variables === job.id}
                      isRejecting={rejectJobMutation.isPending && rejectJobMutation.variables === job.id}
                    />
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Column 3: Availability toggles & specialties coverages */}
          <div className="space-y-8">
            
            {/* Status Control Card */}
            <div className="rounded-3xl bg-slate-900/20 border border-slate-900 p-6 backdrop-blur-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 -mt-10 -mr-10 w-24 h-24 bg-indigo-600/5 rounded-full blur-2xl" />
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
                  <Sliders size={18} />
                </div>
                <div>
                  <h2 className="text-md font-black text-white uppercase tracking-wider">Availability Status</h2>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Configure your terminal broadcast state</p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 mt-5">
                {statuses.map((item) => (
                  <button
                    key={item}
                    onClick={() => updateStatus.mutate(item)}
                    disabled={updateStatus.isPending}
                    className={`flex items-center justify-between px-4 py-3.5 rounded-xl font-mono text-xs font-bold transition-all duration-300 active:scale-98 cursor-pointer border ${
                      effectiveStatus === item
                        ? item === 'Online'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                          : item === 'Busy'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                          : 'bg-slate-800/40 text-slate-400 border-slate-700/60'
                        : 'bg-slate-950/40 text-slate-500 border-slate-900 hover:bg-slate-900/40 hover:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        effectiveStatus === item ? 'animate-pulse' : ''
                      } ${
                        item === 'Online' ? 'bg-emerald-500' : 
                        item === 'Busy' ? 'bg-amber-500' : 'bg-slate-600'
                      }`} />
                      {item.toUpperCase()}
                    </div>
                    {effectiveStatus === item && <Check size={14} className="text-current" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Specialty Panel */}
            <div className="rounded-3xl bg-slate-900/20 border border-slate-900 p-6 backdrop-blur-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 -mt-10 -mr-10 w-24 h-24 bg-purple-600/5 rounded-full blur-2xl" />
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-400">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h2 className="text-md font-black text-white uppercase tracking-wider">Service Coverage</h2>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Toggle active specialty skill queues</p>
                </div>
              </div>

              <div className="grid gap-2.5 mt-5">
                <button
                  onClick={() => handleToggleSkill('electrical')}
                  disabled={updateSkillsMutation.isPending}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-mono font-bold transition-all duration-300 active:scale-98 border cursor-pointer ${
                    currentSkills.includes('electrical')
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.08)]'
                      : 'bg-slate-950/40 text-slate-500 border-slate-900 hover:bg-slate-900/40 hover:text-slate-300'
                  }`}
                >
                  <Zap size={14} className={currentSkills.includes('electrical') ? 'text-amber-400 animate-pulse' : 'text-slate-600'} />
                  <span>ELECTRICIAN</span>
                  {currentSkills.includes('electrical') && <Check size={12} className="ml-auto text-amber-400" />}
                </button>

                <button
                  onClick={() => handleToggleSkill('plumbing')}
                  disabled={updateSkillsMutation.isPending}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-mono font-bold transition-all duration-300 active:scale-98 border cursor-pointer ${
                    currentSkills.includes('plumbing')
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.08)]'
                      : 'bg-slate-950/40 text-slate-500 border-slate-900 hover:bg-slate-900/40 hover:text-slate-300'
                  }`}
                >
                  <Droplet size={14} className={currentSkills.includes('plumbing') ? 'text-blue-400' : 'text-slate-600'} />
                  <span>PLUMBER</span>
                  {currentSkills.includes('plumbing') && <Check size={12} className="ml-auto text-blue-400" />}
                </button>

                <button
                  onClick={() => handleToggleSkill('ac_repair')}
                  disabled={updateSkillsMutation.isPending}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-mono font-bold transition-all duration-300 active:scale-98 border cursor-pointer ${
                    currentSkills.includes('ac_repair')
                      ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.08)]'
                      : 'bg-slate-950/40 text-slate-500 border-slate-900 hover:bg-slate-900/40 hover:text-slate-300'
                  }`}
                >
                  <Wind size={14} className={currentSkills.includes('ac_repair') ? 'text-cyan-400' : 'text-slate-600'} />
                  <span>AC REPAIR</span>
                  {currentSkills.includes('ac_repair') && <Check size={12} className="ml-auto text-cyan-400" />}
                </button>

                <button
                  onClick={handleToggleAll}
                  disabled={updateSkillsMutation.isPending}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-mono font-bold transition-all duration-300 active:scale-98 border cursor-pointer ${
                    ['electrical', 'plumbing', 'ac_repair'].every(s => currentSkills.includes(s))
                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/30 shadow-[0_0_12px_rgba(139,92,246,0.08)]'
                      : 'bg-slate-950/40 text-slate-500 border-slate-900 hover:bg-slate-900/40 hover:text-slate-300'
                  }`}
                >
                  <Sparkles size={14} className={['electrical', 'plumbing', 'ac_repair'].every(s => currentSkills.includes(s)) ? 'text-purple-400' : 'text-slate-600'} />
                  <span>ALL SKILL QUEUES</span>
                  {['electrical', 'plumbing', 'ac_repair'].every(s => currentSkills.includes(s)) && <Check size={12} className="ml-auto text-purple-400" />}
                </button>
              </div>
            </div>

          </div>

        </div>

        {/* Stats Row */}
        <div className="space-y-4">
          <h3 className="text-base font-black tracking-widest text-slate-400 font-mono uppercase">Duty Operations KPI Metrics</h3>
          <StatsPanel
            todayEarnings={statsData?.todayEarnings ?? 0}
            completedCount={statsData?.completedJobs ?? 0}
            rating={statsData?.avgRating ?? me?.rating ?? 5.0}
            totalCompleted={statsData?.totalJobs ?? 0}
          />
        </div>

        {/* Recent Job History List */}
        <div className="rounded-3xl bg-slate-900/20 border border-slate-900 p-6 backdrop-blur-xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Briefcase size={18} className="text-slate-400" />
              RECENT SHIFT DISPATCH HISTORY
            </h2>
            {completed.length > 0 && (
              <button
                onClick={() => navigate('/technician/history')}
                className="text-xs font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1 hover:underline cursor-pointer"
              >
                SHIFT HISTORY LOGS <ArrowRight size={12} />
              </button>
            )}
          </div>

          {completed.length === 0 ? (
            <div className="py-12 border border-dashed border-slate-800 rounded-2xl text-center text-slate-500 font-mono text-xs">
              📂 No dispatches completed during this login shift.
            </div>
          ) : (
            <div className="space-y-3">
              {completed.slice(0, 5).map((job) => (
                <div key={job.id} className="p-4 rounded-xl bg-slate-950/40 border border-slate-900 hover:border-slate-800 transition-all flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">{job.serviceType}</span>
                      <span className="text-[10px] text-slate-500 font-mono">#{job.id.substring(0, 8)}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{job.customerName ?? 'Customer Service'}</p>
                    <p className="text-[10px] text-slate-600 font-mono mt-1">{formatDate(job.updatedAt || job.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-black text-sm text-emerald-400">
                      {formatCurrency(job.amount ?? calculateJobAmount(job))}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono block">Direct deposit</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

const StatsPanel = ({ todayEarnings, completedCount, rating, totalCompleted }: { todayEarnings: number, completedCount: number, rating: number, totalCompleted: number }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Earnings */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/40 border border-slate-900 p-5 group transition-all duration-300 hover:border-emerald-500/30">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500" />
        <span className="text-xs font-mono text-slate-500 uppercase tracking-wider block">Today's Earnings</span>
        <span className="text-2xl font-black text-white mt-1 block font-mono">{formatCurrency(todayEarnings)}</span>
        <span className="text-[10px] text-emerald-400 font-mono mt-1 block">↑ 100% direct payouts</span>
      </div>

      {/* Today's Jobs */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/40 border border-slate-900 p-5 group transition-all duration-300 hover:border-blue-500/30">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-16 h-16 bg-blue-500/10 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500" />
        <span className="text-xs font-mono text-slate-500 uppercase tracking-wider block">Jobs Completed</span>
        <span className="text-2xl font-black text-white mt-1 block font-mono">{completedCount}</span>
        <span className="text-[10px] text-blue-400 font-mono mt-1 block">✓ All targets met</span>
      </div>

      {/* Avg Rating */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/40 border border-slate-900 p-5 group transition-all duration-300 hover:border-amber-500/30">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-16 h-16 bg-amber-500/10 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500" />
        <span className="text-xs font-mono text-slate-500 uppercase tracking-wider block">Average Rating</span>
        <span className="text-2xl font-black text-amber-400 mt-1 block font-mono flex items-center gap-1">
          {rating ? rating.toFixed(2) : '5.00'} <Star size={18} className="fill-amber-400 stroke-amber-400 inline" />
        </span>
        <span className="text-[10px] text-amber-500/80 font-mono mt-1 block">Top rated partner</span>
      </div>

      {/* Total Career Jobs */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/40 border border-slate-900 p-5 group transition-all duration-300 hover:border-purple-500/30">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-16 h-16 bg-purple-500/10 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500" />
        <span className="text-xs font-mono text-slate-500 uppercase tracking-wider block">Total Completed</span>
        <span className="text-2xl font-black text-white mt-1 block font-mono">{totalCompleted}</span>
        <span className="text-[10px] text-purple-400 font-mono mt-1 block">📊 Career milestones</span>
      </div>
    </div>
  )
}

export default TechnicianDashboardPage
