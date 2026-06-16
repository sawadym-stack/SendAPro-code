import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { MapPin, Search, Star, MessageSquare, ChevronRight, X, Sparkles, Navigation, ShieldCheck, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import LeafletMap from '../../components/map/LeafletMap'
import ErrorBoundary from '../../components/shared/ErrorBoundary'
import api from '../../services/api'
import { useGeolocation } from '../../hooks/useGeolocation'
import ReviewsSection from '../technician/ReviewsSection'
import { toast } from 'react-hot-toast'
import technicianService from '../../services/technician.service'
import jobService from '../../services/job.service'
import { useAuthStore } from '../../store/authStore'

interface TechLocation {
  technicianId: string
  latitude: number
  longitude: number
  distanceKm: number
  name?: string
  rating?: number
  reviewCount?: number
  profilePictureUrl?: string
}

const SERVICE_TYPES = [
  { id: 'Electrician', label: 'Electrician', icon: '⚡' },
  { id: 'Plumber', label: 'Plumber', icon: '🔧' },
  { id: 'AC Repair', label: 'AC Repair', icon: '❄️' },
]

export default function NearbyTechniciansPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [mockLocation, setMockLocation] = useState<'kozhikode' | 'gps' | 'custom'>('kozhikode')
  const [customLat, setCustomLat] = useState('11.2588')
  const [customLng, setCustomLng] = useState('75.7804')

  const { lat: gpsLat, lng: gpsLng, error: geoError } = useGeolocation(mockLocation === 'gps')
  const [serviceType, setServiceType] = useState('Electrician')
  const [radius, setRadius] = useState<number>(15)
  const [selectedTech, setSelectedTech] = useState<TechLocation | null>(null)

  const [isBooking, setIsBooking] = useState(false)
  const [bookingDesc, setBookingDesc] = useState('')
  const [bookingUrgency, setBookingUrgency] = useState<'Normal' | 'High'>('Normal')

  const lat = useMemo(() => {
    if (mockLocation === 'kozhikode') return 11.2588
    if (mockLocation === 'custom') return parseFloat(customLat) || 11.2588
    return gpsLat ?? 11.2588
  }, [mockLocation, gpsLat, customLat])

  const lng = useMemo(() => {
    if (mockLocation === 'kozhikode') return 75.7804
    if (mockLocation === 'custom') return parseFloat(customLng) || 75.7804
    return gpsLng ?? 75.7804
  }, [mockLocation, gpsLng, customLng])

  // Fetch individual technician profile details
  const { data: techProfile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['technician-profile', selectedTech?.technicianId],
    queryFn: () => technicianService.getProfile(selectedTech!.technicianId),
    enabled: !!selectedTech?.technicianId,
  })

  // Direct Booking Mutation
  const createJobMutation = useMutation({
    mutationFn: (dto: {
      customerId: string
      serviceType: string
      description: string
      urgency: 'Normal' | 'High'
      lat?: number
      lng?: number
      isEmergency?: boolean
      technicianId?: string
    }) => jobService.createJob(dto),
    onSuccess: (newJob) => {
      toast.success('Service request successfully sent to technician!')
      setSelectedTech(null)
      setIsBooking(false)
      setBookingDesc('')
      navigate(`/customer/track/${newJob.id}`)
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to dispatch request to technician')
    },
  })

  // Fetch nearby technicians query
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['technicians', 'nearby', lat, lng, serviceType, radius],
    queryFn: async () => {
      try {
        const res = await api.get<{ technicians: TechLocation[] }>('/technicians/nearby', {
          params: {
            lat,
            lng,
            radius,
            serviceType,
          },
        })
        return res.data
      } catch (err) {
        toast.error('Failed to locate nearby technicians')
        throw err
      }
    },
  })

  const technicians = data?.technicians ?? []

  return (
    <div className="space-y-8 max-w-5xl mx-auto p-4 md:p-6 text-white relative animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
            Nearby Service Providers
            <Navigation className="text-sky-400 animate-pulse" size={24} />
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time radar tracking verified technicians active in your area.
          </p>
        </div>

        {geoError && mockLocation === 'gps' && (
          <span className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1.5 rounded-lg">
            ⚠️ Geolocation inactive. Please allow GPS permissions.
          </span>
        )}
      </div>

      {/* Control Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Filters & Location Settings
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Category Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400">Service Category</label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all cursor-pointer"
            >
              {SERVICE_TYPES.map((type) => (
                <option key={type.id} value={type.id} className="bg-slate-950">
                  {type.icon} {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Search Radius */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400">Search Radius</label>
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all cursor-pointer"
            >
              <option value={5} className="bg-slate-950">5 kilometers</option>
              <option value={10} className="bg-slate-950">10 kilometers</option>
              <option value={15} className="bg-slate-950">15 kilometers</option>
              <option value={25} className="bg-slate-950">25 kilometers</option>
              <option value={50} className="bg-slate-950">50 kilometers</option>
            </select>
          </div>

          {/* Location Mode Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400">Radar Center Location</label>
            <select
              value={mockLocation}
              onChange={(e) => setMockLocation(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all cursor-pointer"
            >
              <option value="kozhikode" className="bg-slate-950">🌴 Kozhikode, Kerala (Seeded Demo)</option>
              <option value="gps" className="bg-slate-950">📡 Use Browser GPS Location</option>
              <option value="custom" className="bg-slate-950">⚙️ Custom Coordinates</option>
            </select>
          </div>

          {/* Action button */}
          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isLoading || isFetching}
              className="w-full py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-800 text-white font-bold rounded-xl flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-lg shadow-sky-500/10"
            >
              <Search size={16} />
              {isFetching ? 'Scanning Radar...' : 'Scan Area'}
            </button>
          </div>
        </div>

        {mockLocation === 'custom' && (
          <div className="grid gap-4 grid-cols-2 max-w-md pt-2 animate-fade-in">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Custom Latitude</label>
              <input
                type="number"
                step="0.0001"
                value={customLat}
                onChange={(e) => setCustomLat(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Custom Longitude</label>
              <input
                type="number"
                step="0.0001"
                value={customLng}
                onChange={(e) => setCustomLng(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
              />
            </div>
          </div>
        )}
      </div>

      {/* Grid of Results */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Radar List */}
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
            Active Dispatches ({technicians.length})
          </h2>

          {isLoading ? (
            <div className="text-center py-20 border border-slate-800 rounded-2xl bg-slate-900/10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 mx-auto" />
              <p className="text-xs text-slate-500 mt-4 font-mono">Pinging active satellites...</p>
            </div>
          ) : technicians.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20 animate-pulse">
              <MapPin size={40} className="text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-400">No Providers Located</h3>
              <p className="text-xs text-slate-600 mt-1 max-w-sm mx-auto leading-relaxed">
                Try widening your search radius or select another category to scan for active responders.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {technicians.map((tech) => (
                <button
                  key={tech.technicianId}
                  type="button"
                  onClick={() => setSelectedTech(tech)}
                  className={`p-5 rounded-2xl border text-left transition-all flex flex-col justify-between h-44 cursor-pointer group ${
                    selectedTech?.technicianId === tech.technicianId
                      ? 'border-sky-500 bg-sky-500/5 ring-2 ring-sky-500/20 shadow-lg'
                      : 'border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start">
                      <div className="bg-sky-500/10 border border-sky-500/20 px-2 py-1 rounded-lg text-[10px] font-bold text-sky-400 tracking-wide uppercase font-mono">
                        {serviceType}
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        {tech.distanceKm.toFixed(2)} km away
                      </span>
                    </div>

                    <h3 className="font-extrabold text-slate-200 mt-4 group-hover:text-white transition-colors text-base truncate">
                      {tech.name || `Technician ${tech.technicianId.slice(0, 8)}`}
                    </h3>
                  </div>

                  <div className="flex justify-between items-center border-t border-slate-800/80 pt-3 mt-3 w-full">
                    {/* Compact reviews widget */}
                    {tech.rating !== undefined && tech.rating > 0 ? (
                      <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800/80 px-2.5 py-1 rounded-lg">
                        <Star size={12} className="fill-current text-yellow-400 shrink-0" />
                        <span className="text-xs font-bold text-slate-200">{tech.rating.toFixed(1)}</span>
                        <span className="text-[10px] text-slate-500 font-medium ml-1">({tech.reviewCount ?? 0})</span>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-550 italic">No ratings yet</div>
                    )}
                    <ChevronRight size={16} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Map Panel Side widget */}
        <div className="md:col-span-1 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-400">
            Satellite Tracking
          </h2>
          <ErrorBoundary
            fallback={
              <div className="border border-slate-800 bg-slate-950/60 rounded-2xl aspect-square p-6 flex flex-col justify-between items-center text-center shadow-xl relative overflow-hidden">
                {/* Glowing sweep radar animation background */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-sky-500/5 rounded-full animate-spin [animation-duration:10s]" />
                <div className="absolute top-1/2 left-1/2 w-48 h-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-800/40" />
                <div className="absolute top-1/2 left-1/2 w-28 h-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-800/20" />

                <div className="relative z-10">
                  <span className="text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full text-slate-400 font-mono font-bold uppercase tracking-wider">
                    Radar Active
                  </span>
                </div>

                <div className="relative z-10 flex flex-col items-center">
                  <MapPin size={36} className="text-sky-500 animate-bounce" />
                  <p className="text-xs font-mono text-slate-400 mt-3 font-semibold font-mono">
                    Lat: {lat.toFixed(4)}
                  </p>
                  <p className="text-xs font-mono text-slate-400 font-mono">
                    Lng: {lng.toFixed(4)}
                  </p>
                </div>

                <div className="relative z-10 text-[10px] text-slate-500 leading-normal max-w-[200px]">
                  Visual map offline. Tracking technician dispatches within {radius}km of coordinates.
                </div>
              </div>
            }
          >
            <div className="border border-slate-800 bg-slate-950/60 rounded-2xl aspect-square overflow-hidden shadow-xl relative h-full w-full">
              <LeafletMap
                centerLat={lat}
                centerLng={lng}
                zoom={11}
                markers={[
                  {
                    id: 'radar_center',
                    lat,
                    lng,
                    title: 'Your Location',
                    color: 'blue',
                  },
                  ...technicians.map((tech) => ({
                    id: tech.technicianId,
                    lat: tech.latitude,
                    lng: tech.longitude,
                    title: tech.name || `Tech ${tech.technicianId.slice(0, 8)}`,
                    color: 'red' as const,
                    onClick: () => setSelectedTech(tech),
                  })),
                ]}
              />
            </div>
          </ErrorBoundary>
        </div>
      </div>

      {/* Right Drawer Info Panel for Selected Tech */}
      {selectedTech && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-slate-950 border-l border-slate-800 shadow-2xl p-6 overflow-y-auto animate-slide-in flex flex-col justify-between">
          <div className="space-y-6">
            {/* Drawer Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-100">
                    Provider Profile
                  </h3>
                  <ShieldCheck size={18} className="text-sky-400" />
                </div>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  ID: {selectedTech.technicianId}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedTech(null)
                  setIsBooking(false)
                  setBookingDesc('')
                }}
                className="p-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Profile details */}
            {isProfileLoading ? (
              <div className="flex items-center justify-center py-8 gap-2.5 text-slate-450">
                <Loader2 className="animate-spin text-sky-500" size={20} />
                <span className="font-mono text-xs">Loading provider details...</span>
              </div>
            ) : techProfile ? (
              <div className="flex items-center gap-4 border-b border-slate-900 pb-5">
                <div className="relative w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xl font-black text-sky-400 overflow-hidden shadow-lg shadow-sky-500/5 shrink-0">
                  {techProfile.profilePictureUrl ? (
                    <img 
                      src={techProfile.profilePictureUrl} 
                      alt={techProfile.name || techProfile.fullName} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    (techProfile.name || techProfile.fullName || 'Tech').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
                  )}
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-white">{techProfile.name || techProfile.fullName}</h4>
                  <div className="flex items-center gap-1.5 mt-1 bg-slate-900/60 border border-slate-800 px-2.5 py-1 rounded-lg w-fit">
                    <Star size={11} className="fill-current text-yellow-400 shrink-0" />
                    <span className="text-[10px] font-bold text-slate-200">
                      {techProfile.rating > 0 ? techProfile.rating.toFixed(1) : 'N/A'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">({techProfile.reviewCount ?? 0} reviews)</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 font-mono flex items-center gap-1.5">
                    <span className="text-slate-500 font-semibold">Phone:</span> {techProfile.phone || 'Not provided'}
                  </div>
                </div>
              </div>
            ) : null}

            {!isBooking ? (
              <div className="space-y-6">
                {/* Quick stats grid */}
                <div className="grid grid-cols-2 gap-3 bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 text-xs font-semibold">
                  <div>
                    <p className="text-slate-500">Service Category</p>
                    <p className="text-slate-200 mt-1 font-bold">{serviceType}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Dispatched Distance</p>
                    <p className="text-slate-200 mt-1 font-mono font-bold">
                      {selectedTech.distanceKm.toFixed(2)} km away
                    </p>
                  </div>
                </div>

                {/* Detailed Reviews section in drawer */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    Customer Feedbacks
                    <Sparkles size={14} className="text-yellow-400" />
                  </h4>
                  <ReviewsSection technicianId={selectedTech.technicianId} />
                </div>

                {/* Assign Action Button */}
                <div className="pt-4 border-t border-slate-900">
                  <button
                    type="button"
                    onClick={() => {
                      if (!user?.id) {
                        toast.error('You must be logged in to request service')
                        return
                      }
                      setIsBooking(true)
                    }}
                    className="w-full py-3 bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-600 hover:to-blue-600 font-extrabold text-white rounded-xl shadow-lg shadow-sky-500/15 cursor-pointer active:scale-98 transition-all flex items-center justify-center gap-2"
                  >
                    Request Service from {techProfile?.name || 'this Technician'}
                  </button>
                </div>
              </div>
            ) : (
              /* Direct Booking Form Panel */
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-200">
                    Book Service Appointment
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Submit the job details directly to {techProfile?.name || 'this technician'}.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-900 bg-slate-900/60 p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Describe the Problem</label>
                    <span className={`text-[10px] font-mono ${bookingDesc.trim().length < 10 ? 'text-red-550' : 'text-emerald-500'}`}>
                      {bookingDesc.length}/500
                    </span>
                  </div>
                  <textarea
                    value={bookingDesc}
                    onChange={(e) => setBookingDesc(e.target.value.slice(0, 500))}
                    rows={4}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 resize-none transition-colors"
                    placeholder="Provide a clear description of the issue (e.g. Broken pipe in kitchen faucet, water spreading on floor...)"
                  />
                  {bookingDesc.trim().length < 10 && bookingDesc.length > 0 && (
                    <p className="text-[9px] text-red-400 font-mono">Minimum 10 characters required</p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-900 bg-slate-900/60 p-4 space-y-2.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Priority / Urgency</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {['Normal', 'High'].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setBookingUrgency(level as 'Normal' | 'High')}
                        className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                          bookingUrgency === level
                            ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                            : 'border-slate-850 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {level === 'High' ? '⚡ High' : '✓ Standard'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-3 border-t border-slate-900">
                  <button
                    type="button"
                    onClick={() => {
                      setIsBooking(false)
                      setBookingDesc('')
                    }}
                    className="flex-1 py-2.5 rounded-xl border border-slate-800 text-slate-400 text-xs font-bold hover:border-slate-700 hover:text-slate-200 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (bookingDesc.trim().length < 10) {
                        toast.error('Please describe the problem clearly (min 10 characters)')
                        return
                      }
                      createJobMutation.mutate({
                        customerId: user!.id,
                        serviceType: serviceType,
                        description: bookingDesc,
                        lat: lat,
                        lng: lng,
                        urgency: bookingUrgency,
                        isEmergency: false,
                        technicianId: selectedTech.technicianId
                      })
                    }}
                    disabled={createJobMutation.isPending}
                    className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-800 text-white font-extrabold rounded-xl flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-lg shadow-sky-500/10"
                  >
                    {createJobMutation.isPending ? (
                      <><Loader2 size={14} className="animate-spin" /> Requesting...</>
                    ) : (
                      'Send Request'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
