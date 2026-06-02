import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { 
  MapPin, Phone, MessageSquare, Navigation, Play, Square, CheckCircle, 
  Compass, ShieldAlert, ArrowLeft, Loader2, User, Wrench
} from 'lucide-react'
import jobService from '../../services/job.service'
import technicianService from '../../services/technician.service'
import { JobStatus } from '../../types'
import LiveTrackingMap from '../../components/map/LiveTrackingMap'
import { Button, Card, Badge } from '../../components/ui'

const NavigationPage = () => {
  const { jobId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Fetch job details
  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobService.getJob(jobId),
    enabled: Boolean(jobId),
  })

  // Start with default starting coordinates (Kozhikode fallback)
  const [currentLat, setCurrentLat] = useState(11.02)
  const [currentLng, setCurrentLng] = useState(76.12)
  const [isSimulating, setIsSimulating] = useState(false)
  const [speed, setSpeed] = useState(0)
  const simulationIntervalRef = useRef<number | null>(null)

  const patchStatusMutation = useMutation({
    mutationFn: (status: JobStatus) => technicianService.patchJobStatus(jobId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] })
    },
  })

  // Set initial status to OnTheWay if it was Accepted
  useEffect(() => {
    if (job && job.status === JobStatus.Accepted) {
      patchStatusMutation.mutate(JobStatus.OnTheWay)
    }
  }, [job])

  // Setup initial route points when job loads
  const routeStart = useMemo(() => {
    const defaultStartLat = 11.02
    const defaultStartLng = 76.12
    if (!job?.latitude || !job?.longitude) return { lat: defaultStartLat, lng: defaultStartLng }
    
    // If the customer coordinates are exactly the starting fallback coordinates,
    // shift the starting coordinates slightly to show a visual route.
    const dist = Math.sqrt(
      Math.pow(job.latitude - defaultStartLat, 2) + 
      Math.pow(job.longitude - defaultStartLng, 2)
    )
    if (dist < 0.001) {
      return { lat: defaultStartLat - 0.015, lng: defaultStartLng - 0.015 }
    }
    return { lat: defaultStartLat, lng: defaultStartLng }
  }, [job])

  // Set coordinates to start position when component mounts or route starts change
  useEffect(() => {
    setCurrentLat(routeStart.lat)
    setCurrentLng(routeStart.lng)
  }, [routeStart])

  // Cleanup simulation interval on unmount
  useEffect(() => {
    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current)
      }
    }
  }, [])

  // Coordinate ref to always read latest position in the 10s GPS stream loop
  const coordsRef = useRef({ lat: currentLat, lng: currentLng })
  useEffect(() => {
    coordsRef.current = { lat: currentLat, lng: currentLng }
  }, [currentLat, currentLng])

  // GPS loop pushing coordinates every 10 seconds when status is OnTheWay
  useEffect(() => {
    if (job?.status !== JobStatus.OnTheWay) return

    const intervalId = window.setInterval(() => {
      const { lat, lng } = coordsRef.current
      console.log('[GPS Stream Loop] Pushing GPS coordinates:', lat, lng)
      technicianService.updateLocation(lat, lng).catch((err) => {
        console.error('[GPS Stream Loop] Failed to upload telemetry:', err)
      })
    }, 10000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [job?.status])

  // Start navigation simulation
  const startSimulation = (mode: 'normal' | 'fast' | 'instant' = 'normal') => {
    if (!job?.latitude || !job?.longitude || isSimulating) return

    const destLat = job.latitude
    const destLng = job.longitude

    if (mode === 'instant') {
      setCurrentLat(destLat)
      setCurrentLng(destLng)
      setSpeed(0)
      technicianService.updateLocation(destLat, destLng).catch(() => {})
      patchStatusMutation.mutate(JobStatus.Arrived)
      return
    }

    setIsSimulating(true)
    setSpeed(48) // Starting speed in km/h

    const totalSteps = 20
    const intervalMs = mode === 'fast' ? 150 : 500
    let step = 0

    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current)
    }

    // Set initial coordinates
    setCurrentLat(routeStart.lat)
    setCurrentLng(routeStart.lng)

    simulationIntervalRef.current = window.setInterval(() => {
      step++
      const progress = step / totalSteps
      
      // Interpolate coordinates
      const nextLat = routeStart.lat + (destLat - routeStart.lat) * progress
      const nextLng = routeStart.lng + (destLng - routeStart.lng) * progress

      setCurrentLat(nextLat)
      setCurrentLng(nextLng)

      // Random speed fluctuations for realism
      setSpeed(Math.floor(40 + Math.random() * 20))

      // Push coordinates to backend location endpoint
      technicianService.updateLocation(nextLat, nextLng).catch((err) => {
        console.error('Failed to upload coordinates during simulation:', err)
      })

      if (step >= totalSteps) {
        if (simulationIntervalRef.current) {
          clearInterval(simulationIntervalRef.current)
        }
        setIsSimulating(false)
        setSpeed(0)
        
        // Auto update status to Arrived
        patchStatusMutation.mutate(JobStatus.Arrived)
      }
    }, intervalMs)
  }

  // Stop simulation manually
  const stopSimulation = () => {
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current)
    }
    setIsSimulating(false)
    setSpeed(0)
  }

  // Distance calculation (Haversine)
  const remainingDistanceKm = useMemo(() => {
    if (!job?.latitude || !job?.longitude) return 0
    const R = 6371
    const dLat = ((job.latitude - currentLat) * Math.PI) / 180
    const dLng = ((job.longitude - currentLng) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((currentLat * Math.PI) / 180) *
        Math.cos((job.latitude * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return Math.round(R * c * 10) / 10
  }, [job, currentLat, currentLng])

  // ETA Calculation based on remaining distance at current speed
  const etaMinutes = useMemo(() => {
    if (remainingDistanceKm === 0) return 0
    const currentSpeed = speed > 0 ? speed : 45
    const hours = remainingDistanceKm / currentSpeed
    const minutes = Math.round(hours * 60)
    return minutes < 1 ? 1 : minutes
  }, [remainingDistanceKm, speed])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary-500" />
          <p className="text-slate-400 font-medium">Initializing navigation telemetry...</p>
        </div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white p-6">
        <Card className="bg-slate-900 border-slate-800 p-8 max-w-md text-center space-y-4 shadow-2xl">
          <ShieldAlert className="h-12 w-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold">Job Not Found</h2>
          <p className="text-sm text-slate-400">The requested dispatch details could not be retrieved. It may have been canceled or reassigned.</p>
          <Button onClick={() => navigate('/technician/dashboard')} variant="outline" className="w-full">
            Back to Dashboard
          </Button>
        </Card>
      </div>
    )
  }

  const isArrived = job.status === JobStatus.Arrived

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col">
      {/* Premium Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(`/technician/job/${job.id}`)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors border border-slate-800 text-slate-400 hover:text-white"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-md font-extrabold uppercase tracking-wider text-slate-300">Live Navigation Simulation</h1>
            <p className="text-xs text-slate-400">Order ID: #{job.id.slice(0, 8)}</p>
          </div>
        </div>
        
        <Badge variant={isArrived ? 'success' : 'primary'} className="animate-pulse">
          {job.status === JobStatus.OnTheWay ? '🚗 En Route' : isArrived ? '📍 Arrived' : `• ${job.status}`}
        </Badge>
      </header>

      {/* Main Grid Layout */}
      <div className="flex-1 grid lg:grid-cols-3 gap-6 p-6 overflow-hidden">
        {/* Left Side: Map Visuals */}
        <div className="lg:col-span-2 flex flex-col space-y-6">
          <Card className="bg-slate-900/80 border-slate-800 shadow-2xl relative overflow-hidden flex-1 flex flex-col">
            <div className="absolute top-4 left-4 z-10 bg-slate-950/80 border border-slate-800 rounded-lg p-3 backdrop-blur-md flex items-center gap-3">
              <div className="p-2 bg-primary-950 text-primary-400 rounded-lg border border-primary-900/30">
                <Compass className={`h-5 w-5 ${isSimulating ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Telemetry Compass</p>
                <h4 className="text-xs font-black text-white">Route to Target Locked</h4>
              </div>
            </div>

            {/* Simulated Speedometer overlay */}
            {isSimulating && (
              <div className="absolute top-4 right-4 z-10 bg-slate-950/80 border border-slate-800 rounded-lg p-3 backdrop-blur-md text-right">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Speed</p>
                <h4 className="text-lg font-black text-emerald-400">{speed} <span className="text-xs font-medium text-slate-400">km/h</span></h4>
              </div>
            )}

            {/* The Live Map Container */}
            <div className="flex-1 h-[400px] lg:h-auto min-h-[380px]">
              <LiveTrackingMap 
                customerLat={job.latitude ?? 11.02} 
                customerLng={job.longitude ?? 76.12} 
                technicianLat={currentLat} 
                technicianLng={currentLng} 
              />
            </div>
          </Card>
        </div>

        {/* Right Side: Driving Controller & Details */}
        <div className="space-y-6 flex flex-col justify-between">
          <div className="space-y-6">
            {/* Customer Contact Card */}
            <Card className="bg-slate-900/80 border-slate-800 p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Customer Contact</h3>
                <span className="text-xs text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20 font-bold uppercase">
                  {job.urgency || 'Normal'}
                </span>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 border border-slate-700">
                  <User size={18} />
                </div>
                <div>
                  <h4 className="font-extrabold text-white">{job.customerName || 'Customer'}</h4>
                  <p className="text-xs text-slate-400">{job.customerPhone || 'No contact phone'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <a 
                  href={`tel:${job.customerPhone || ''}`} 
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-800 bg-slate-950 text-slate-300 hover:text-white hover:border-slate-700 transition duration-300 font-semibold text-xs text-center"
                >
                  <Phone size={14} /> Call Client
                </a>
                <button
                  onClick={() => navigate(`/technician/chat/${job.id}`)}
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-800 bg-slate-950 text-slate-350 hover:text-white hover:border-slate-700 transition duration-300 font-semibold text-xs text-center cursor-pointer"
                >
                  <MessageSquare size={14} className="text-sky-405" /> Send Message
                </button>
              </div>
            </Card>

            {/* Destination Info */}
            <Card className="bg-slate-900/80 border-slate-800 p-5 space-y-3 shadow-xl">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="text-red-500" size={16} /> Destination
              </h3>
              <p className="text-xs font-semibold text-slate-300 leading-relaxed">
                {job.address || 'Seeded location dispatch coordinates'}
              </p>
              <div className="text-xs text-slate-500 bg-slate-950 border border-slate-850 p-2.5 rounded-lg font-mono">
                <span className="block">Target Lat: {job.latitude?.toFixed(6) ?? '11.020000'}</span>
                <span className="block">Target Lng: {job.longitude?.toFixed(6) ?? '76.120000'}</span>
              </div>
            </Card>

            {/* Navigation Simulator Controls */}
            <Card className="bg-slate-900/80 border-slate-800 p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Simulator Dashboard</h3>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              </div>

              {/* Progress metrics */}
              <div className="grid grid-cols-2 gap-3 bg-slate-950/80 border border-slate-800 p-4 rounded-xl font-mono">
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Distance</p>
                  <p className="text-lg font-black text-white">{remainingDistanceKm} km</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Status / ETA</p>
                  <p className="text-lg font-black text-emerald-450">
                    {job.status === JobStatus.Completed ? 'Completed' :
                     job.status === JobStatus.Working ? 'Working...' :
                     isArrived ? 'Arrived' : `${etaMinutes} mins`}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {/* On the Way: Telemetry Buttons */}
                {job.status === JobStatus.OnTheWay && !isSimulating && (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => startSimulation('normal')}
                      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow"
                    >
                      <Play size={12} fill="white" /> Normal simulation (10s)
                    </button>
                    <button
                      onClick={() => startSimulation('fast')}
                      className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow"
                    >
                      <Play size={12} fill="white" /> Fast Simulation (3s)
                    </button>
                    <button
                      onClick={() => startSimulation('instant')}
                      className="w-full py-3 rounded-xl bg-sky-650 hover:bg-sky-750 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow"
                    >
                      🚀 Instant Arrival
                    </button>
                  </div>
                )}

                {isSimulating && (
                  <button
                    onClick={stopSimulation}
                    className="w-full py-3.5 rounded-xl font-extrabold flex items-center justify-center gap-2 border bg-amber-600 border-amber-500 text-white hover:bg-amber-700 cursor-pointer"
                  >
                    <Square size={16} fill="white" /> Pause Telemetry Simulator
                  </button>
                )}

                {/* Arrived: Start Working Option */}
                {job.status === JobStatus.Arrived && (
                  <div className="space-y-3">
                    <div className="bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 p-3.5 rounded-xl flex items-center gap-3 animate-pulse">
                      <CheckCircle className="h-6 w-6 text-emerald-400 shrink-0" />
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider">Arrived at Destination</p>
                        <p className="text-[10px] text-slate-300 mt-0.5">Please check in with the customer and start repair work.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => patchStatusMutation.mutate(JobStatus.Working)}
                      disabled={patchStatusMutation.isPending}
                      className="w-full py-3.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all border border-orange-555"
                    >
                      🔧 START WORKING
                    </button>
                  </div>
                )}

                {/* Working: Complete Job Option */}
                {job.status === JobStatus.Working && (
                  <div className="space-y-3">
                    <div className="bg-orange-950/20 border border-orange-500/20 text-orange-400 p-3.5 rounded-xl flex items-center gap-3 animate-pulse">
                      <Wrench className="h-6 w-6 text-orange-450 shrink-0" />
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider">Repair in Progress</p>
                        <p className="text-[10px] text-slate-350 mt-0.5">You are now working on the problem.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => patchStatusMutation.mutate(JobStatus.Completed)}
                      disabled={patchStatusMutation.isPending}
                      className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all border border-emerald-555"
                    >
                      ✓ MARK COMPLETED
                    </button>
                  </div>
                )}

                {/* Completed State */}
                {job.status === JobStatus.Completed && (
                  <div className="bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl flex items-center gap-3">
                    <CheckCircle className="h-6 w-6 text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider">Service Successfully Completed</p>
                      <p className="text-[10px] text-slate-300 mt-0.5">The customer receives details and can submit a review.</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Action Footer: Final Completion */}
          <div className="pt-4">
            {job.status === JobStatus.Completed ? (
              <Button
                onClick={() => navigate('/technician/dashboard')}
                fullWidth
                variant="primary"
                size="lg"
                className="py-4 font-black tracking-widest text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-xl shadow-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                ✓ RETURN TO DASHBOARD
              </Button>
            ) : (
              <Button
                onClick={() => navigate(`/technician/job/${job.id}`)}
                disabled={isSimulating}
                fullWidth
                variant="primary"
                size="lg"
                className="py-4 font-black tracking-widest text-sm bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 rounded-xl shadow-xl shadow-primary-500/10 flex items-center justify-center gap-2"
              >
                <Navigation size={18} />
                {isArrived ? 'CONFIRM ARRIVAL & RETURN' : 'RETURN TO ACTIVE JOB'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default NavigationPage
