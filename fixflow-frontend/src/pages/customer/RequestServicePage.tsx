import { useState, useEffect, useRef } from 'react'
import { Bolt, Droplets, Wind, MapPin, Check, AlertCircle, Loader2, ChevronRight, ChevronLeft, ClipboardList, Search } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createJobSchema, serviceTypes } from '../../validations/job.schema'
import jobService from '../../services/job.service'
import { useGeolocation } from '../../hooks/useGeolocation'
import { useAuthStore } from '../../store/authStore'
import LeafletMap from '../../components/map/LeafletMap'

const serviceConfig = {
  Electrician: { icon: Bolt, color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20', glow: 'shadow-[0_0_20px_rgba(250,204,21,0.1)]', desc: 'Wiring, panels, outlets, repairs' },
  Plumber: { icon: Droplets, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20', glow: 'shadow-[0_0_20px_rgba(96,165,250,0.1)]', desc: 'Leaks, pipes, drainage, fixtures' },
  'AC Repair': { icon: Wind, color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/20', glow: 'shadow-[0_0_20px_rgba(34,211,238,0.1)]', desc: 'Cooling, servicing, gas refill' },
} as const

const urgencyConfig = {
  Normal: { label: 'Standard', desc: 'Regular service, scheduled arrival', color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  High: { label: 'High Priority', desc: 'Fast-tracked, urgent response', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
} as const

const StepDot = ({ n, current }: { n: number; current: number }) => (
  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-black transition-all duration-300 ${
    n < current ? 'border-sky-500 bg-sky-500 text-white' :
    n === current ? 'border-sky-400 bg-sky-400/10 text-sky-400' :
    'border-slate-800 text-slate-600'
  }`}>
    {n < current ? <Check size={12} /> : n}
  </div>
)

const RequestServicePage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryService = searchParams.get('service') as any
  const [step, setStep] = useState(serviceTypes.includes(queryService) ? 2 : 1)
  const [serviceType, setServiceType] = useState<(typeof serviceTypes)[number]>(
    serviceTypes.includes(queryService) ? queryService : 'Electrician'
  )
  const [description, setDescription] = useState('')
  const [urgency, setUrgency] = useState<'Normal' | 'High'>('Normal')
  const [toast, setToast] = useState<string | null>(null)
  const { lat: geoLat, lng: geoLng, address: geoAddress, detect, loading, error } = useGeolocation(false)
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [address, setAddress] = useState('')
  const user = useAuthStore((s) => s.user)

  // Geocoding and Map states
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [locationMode, setLocationMode] = useState<'search' | 'map'>('search')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const lastSearchedQuery = useRef('')

  // Sync automatic location detection when coordinates are retrieved
  useEffect(() => {
    if (geoLat !== null && geoLng !== null) {
      setLat(geoLat)
      setLng(geoLng)
      setAddress(geoAddress)
    }
  }, [geoLat, geoLng, geoAddress])

  const triggerSearch = async (query: string) => {
    if (!query.trim() || query === lastSearchedQuery.current) return
    lastSearchedQuery.current = query
    setSearching(true)
    setSearchError(null)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
        {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'fixflow-app-customer-portal',
          },
        }
      )
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      setSearchResults(data)
      setShowDropdown(data.length > 0)
      if (data.length === 0) {
        setSearchError('No locations found. Try a different search term.')
      }
    } catch (err) {
      console.error('Search error:', err)
      setSearchError('Failed to search location. Please try again.')
      setShowDropdown(false)
    } finally {
      setSearching(false)
    }
  }

  // Click outside to close search dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced geocoding search logic (Nominatim API)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setShowDropdown(false)
      lastSearchedQuery.current = ''
      return
    }

    const timer = setTimeout(() => {
      triggerSearch(searchQuery)
    }, 500)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Geocoding search logic (Nominatim API) - manual submit
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    triggerSearch(searchQuery)
  }

  // Handle clicked location on map (Nominatim reverse geocoding API)
  const handleMapClick = async (clickedLat: number, clickedLng: number) => {
    setLat(clickedLat)
    setLng(clickedLng)
    setAddress(`${clickedLat.toFixed(6)}, ${clickedLng.toFixed(6)}`)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${clickedLat}&lon=${clickedLng}`,
        {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'fixflow-app-customer-portal',
          },
        }
      )
      if (res.ok) {
        const data = await res.json()
        if (data.display_name) {
          setAddress(data.display_name)
        }
      }
    } catch (err) {
      console.error('Reverse geocoding error:', err)
    }
  }

  const selectResult = (item: any) => {
    const selectedLat = parseFloat(item.lat)
    const selectedLng = parseFloat(item.lon)
    setLat(selectedLat)
    setLng(selectedLng)
    setAddress(item.display_name)
    setSearchResults([])
    setSearchQuery('')
    setShowDropdown(false)
  }

  const createMutation = useMutation({
    mutationFn: jobService.createJob,
    onSuccess: (job) => navigate(`/customer/track/${job.id}`),
    onError: (err: Error) => setToast(err.message),
  })

  const advance = () => {
    setToast(null)
    if (step === 2 && description.trim().length < 20) {
      setToast('Description must be at least 20 characters')
      return
    }
    if (step < 4) { setStep((s) => s + 1); return }
    // Submit
    if (!user?.id) { setToast('You must be logged in.'); return }
    const parsed = createJobSchema.safeParse({ serviceType, description, urgency, lat: lat ?? undefined, lng: lng ?? undefined, address })
    if (!parsed.success) { setToast(parsed.error.issues[0]?.message ?? 'Fix form errors'); return }
    createMutation.mutate({ customerId: user.id, serviceType, description, urgency, lat: lat ?? 11.02, lng: lng ?? 76.12, isEmergency: false })
  }

  const stepLabels = ['Service', 'Details', 'Location', 'Confirm']

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative">
      {/* Ambient background */}
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Service Dispatch</p>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ClipboardList size={20} className="text-sky-400" />
            Request a Technician
          </h1>
        </div>

        {/* Simple Step indicator */}
        <div className="mb-6 bg-slate-900/30 border border-slate-900 rounded-2xl p-4.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono text-sky-400 uppercase tracking-widest">Assistant Progress</p>
            <h2 className="text-sm font-black text-white mt-0.5">Step {step} of 4: {stepLabels[step - 1]}</h2>
          </div>
          <div className="w-24 h-1.5 rounded-full bg-slate-950 overflow-hidden border border-slate-850 shrink-0">
            <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${(step / 4) * 100}%` }} />
          </div>
        </div>

        {/* Error */}
        {toast && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 flex items-center gap-3 text-sm text-red-400">
            <AlertCircle size={16} className="shrink-0" />
            {toast}
          </div>
        )}

        {/* STEP 1: Service Type */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white mb-4">What service do you need?</h2>
            <div className="grid gap-4">
              {serviceTypes.map((type) => {
                const cfg = serviceConfig[type]
                const Icon = cfg.icon
                const isSelected = serviceType === type
                return (
                  <button
                    key={type}
                    onClick={() => { setServiceType(type); setToast(null); setStep(2) }}
                    className={`group w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all duration-300 hover:scale-[1.01] ${
                      isSelected
                        ? `${cfg.bg} ${cfg.border} ${cfg.glow}`
                        : 'border-slate-900 bg-slate-900/40 hover:border-slate-800 hover:bg-slate-900/70'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${isSelected ? cfg.bg : 'bg-slate-800/60'}`}>
                      <Icon size={22} className={isSelected ? cfg.color : 'text-slate-500 group-hover:text-slate-400'} />
                    </div>
                    <div className="flex-1">
                      <h3 className={`font-bold text-base transition-colors ${isSelected ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>{type}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{cfg.desc}</p>
                    </div>
                    <ChevronRight size={18} className={`shrink-0 transition-all ${isSelected ? cfg.color : 'text-slate-700 group-hover:text-slate-500'}`} />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* STEP 2: Details */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-white">Describe the issue</h2>

            <div className="rounded-2xl border border-slate-900 bg-slate-900/60 p-5 space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Issue Description</label>
                <span className={`text-[10px] font-mono ${description.length < 20 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {description.length}/500
                </span>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                rows={5}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 placeholder-slate-650 focus:outline-none focus:border-sky-500 resize-none transition-colors"
                placeholder="Describe the problem clearly (e.g., 'Water leak under kitchen sink, dripping for 2 days...')"
              />
              {description.length < 20 && description.length > 0 && (
                <p className="text-[10px] text-red-400 font-mono">Minimum 20 characters required</p>
              )}
              <p className="text-[11px] text-slate-500 leading-normal pt-1.5 border-t border-slate-900/50">
                💡 **Tips**: Explain what is broken, where it is located, and if any electricity or water has been shut off to help our responder prepare.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-900 bg-slate-900/60 p-5 space-y-3">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Urgency Level</label>
              <div className="grid grid-cols-2 gap-3">
                {(Object.entries(urgencyConfig) as [keyof typeof urgencyConfig, typeof urgencyConfig[keyof typeof urgencyConfig]][]).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setUrgency(key)}
                    className={`p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                      urgency === key
                        ? `${cfg.bg} ${cfg.border}`
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                    }`}
                  >
                    <p className={`text-sm font-bold ${urgency === key ? cfg.color : 'text-slate-300'}`}>{cfg.label}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{cfg.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Location */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">Where is the issue?</h2>

            {/* Location Mode Toggle */}
            <div className="flex rounded-xl bg-slate-900/80 p-1 border border-slate-850/60 mb-2">
              <button
                type="button"
                onClick={() => setLocationMode('search')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border-none ${
                  locationMode === 'search'
                    ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/10'
                    : 'text-slate-400 hover:text-slate-200 bg-transparent'
                }`}
              >
                <Search size={14} /> Search Address
              </button>
              <button
                type="button"
                onClick={() => setLocationMode('map')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border-none ${
                  locationMode === 'map'
                    ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/10'
                    : 'text-slate-400 hover:text-slate-200 bg-transparent'
                }`}
              >
                <MapPin size={14} /> Point on Map
              </button>
            </div>

            {locationMode === 'search' && (
              <div className="space-y-4">
                {/* GPS Auto-Locator Button */}
                <button
                  onClick={detect}
                  disabled={loading}
                  className="w-full flex items-center gap-3.5 p-5 rounded-2xl border border-sky-500/30 bg-gradient-to-r from-sky-500/10 to-blue-500/5 hover:from-sky-500/15 hover:to-blue-500/10 transition-all duration-300 group disabled:opacity-60 cursor-pointer shadow-[0_4px_15px_rgba(14,165,233,0.05)]"
                >
                  {loading ? (
                    <Loader2 size={20} className="text-sky-400 animate-spin shrink-0" />
                  ) : (
                    <MapPin size={20} className="text-sky-400 shrink-0 group-hover:scale-110 transition-transform" />
                  )}
                  <div className="text-left">
                    <p className="text-sm font-bold text-sky-400">{loading ? 'Detecting GPS coordinates...' : 'Find My Address Automatically'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Use browser location positioning</p>
                  </div>
                </button>

                {error && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{error}</div>
                )}

                {/* Address Search Bar */}
                <div ref={searchContainerRef} className="relative rounded-2xl border border-slate-900 bg-slate-900/60 p-5 space-y-3">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Search Address</label>
                  <div className="relative">
                    <form onSubmit={handleSearch} className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value)
                            setShowDropdown(true)
                          }}
                          onFocus={() => {
                            if (searchResults.length > 0) setShowDropdown(true)
                          }}
                          placeholder="🔍 Search (e.g. 'Marine Drive, Kozhikode' or 'Home address')"
                          className="w-full bg-slate-950/60 border border-slate-800 rounded-xl pl-4 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-650 focus:outline-none focus:border-sky-500 transition-colors"
                        />
                        {searching && (
                          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                            <Loader2 size={16} className="text-sky-400 animate-spin" />
                          </div>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={searching}
                        className="px-4 py-2.5 bg-sky-500 text-slate-955 text-xs font-black uppercase rounded-xl hover:bg-sky-400 transition-colors shrink-0 disabled:opacity-50 cursor-pointer border-none"
                      >
                        Search
                      </button>
                    </form>

                    {/* Floating Dropdown */}
                    {showDropdown && searchResults.length > 0 && (
                      <div className="absolute left-0 right-0 z-50 mt-2 rounded-xl border border-slate-800 bg-slate-950 p-1.5 divide-y divide-slate-900 max-h-60 overflow-y-auto shadow-2xl backdrop-blur-md">
                        {searchResults.map((item) => (
                          <button
                            key={item.place_id}
                            type="button"
                            onClick={() => selectResult(item)}
                            className="w-full text-left text-xs text-slate-300 hover:text-white hover:bg-slate-900/80 p-3 rounded-lg transition-all cursor-pointer border-none bg-transparent flex items-start gap-2.5"
                          >
                            <span className="text-sky-400 mt-0.5 text-sm shrink-0">📍</span>
                            <span>{item.display_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {searchError && (
                    <div className="text-xs text-amber-400 font-medium px-1 mt-2">{searchError}</div>
                  )}
                </div>

                {/* Map Preview for selected location */}
                {lat && lng && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Location Preview</p>
                    <div className="h-48 rounded-2xl border border-slate-900 overflow-hidden relative shadow-inner">
                      <LeafletMap
                        centerLat={lat}
                        centerLng={lng}
                        zoom={15}
                        markers={[
                          {
                            id: 'selected_pin',
                            lat,
                            lng,
                            title: 'Selected Location',
                            color: 'green',
                          },
                        ]}
                        onMapClick={handleMapClick}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {locationMode === 'map' && (
              <div className="space-y-4">
                <div className="bg-sky-500/10 border border-sky-500/20 rounded-2xl p-4 flex gap-3 text-xs text-sky-400">
                  <MapPin size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-white mb-0.5">Point on Map Mode Active</p>
                    <p className="text-slate-400 leading-relaxed">Tap or click anywhere on the map grid below to place the pin at your exact service location.</p>
                  </div>
                </div>

                {/* Leaflet Map Picker - Larger for easy pointing */}
                <div className="space-y-2">
                  <div className="h-72 rounded-2xl border border-slate-900 overflow-hidden relative shadow-inner">
                    <LeafletMap
                      centerLat={lat ?? 11.2588}
                      centerLng={lng ?? 75.7804}
                      zoom={lat && lng ? 16 : 12}
                      markers={
                        lat && lng
                          ? [
                              {
                                id: 'selected_pin',
                                lat,
                                lng,
                                title: 'Service Location',
                                color: 'green',
                              },
                            ]
                          : []
                      }
                      onMapClick={handleMapClick}
                    />
                  </div>
                </div>
              </div>
            )}

            {lat && lng && (
              <div className="flex items-center gap-3.5 text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 shadow-sm">
                <div className="w-8.5 h-8.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
                  <Check size={16} />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">Target Location Selected</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 font-mono">Coordinates: {lat.toFixed(6)}, {lng.toFixed(6)}</p>
                </div>
              </div>
            )}

            {/* Address Details Output */}
            <div className="rounded-2xl border border-slate-900 bg-slate-900/60 p-5 space-y-2.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Job Address Details (Review/Edit)</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-650 focus:outline-none focus:border-sky-500 transition-colors resize-none"
                placeholder="Selected address details will show here. Feel free to refine."
              />
            </div>
          </div>
        )}

        {/* STEP 4: Review */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">Review & Confirm</h2>

            <div className="rounded-2xl border border-slate-900 bg-slate-900/60 divide-y divide-slate-900/80">
              {[
                { label: 'Service Type', value: serviceType, edit: 1 },
                { label: 'Urgency', value: urgency === 'High' ? '⚡ High Priority' : '✓ Standard', edit: 2 },
                { label: 'Description', value: description.length > 80 ? description.slice(0, 80) + '...' : description, edit: 2 },
                { label: 'Location coordinates', value: lat ? `${lat.toFixed(6)}, ${lng?.toFixed(6)}` : (address || 'Kozhikode area (fallback)'), edit: 3 },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-0.5">{row.label}</p>
                    <p className="text-sm font-semibold text-white">{row.value}</p>
                  </div>
                  <button
                    onClick={() => { setToast(null); setStep(row.edit) }}
                    className="text-[10px] text-sky-400 font-bold uppercase tracking-wider hover:text-sky-300 transition-colors cursor-pointer bg-transparent border-none"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-400">
              📡 Your request will be broadcast to nearby technicians matching your service type. Average response time: 8–15 minutes.
            </div>
          </div>
        )}

        {/* Nav buttons */}
        {step > 1 && (
          <div className="flex gap-3 mt-8">
            <button
              onClick={() => { setToast(null); setStep((s) => s - 1) }}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-800 text-slate-400 text-sm font-semibold hover:border-slate-700 hover:text-slate-200 transition-all duration-200"
            >
              <ChevronLeft size={16} /> Back
            </button>
            <button
              onClick={advance}
              disabled={createMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 text-sm font-bold hover:bg-sky-500/20 hover:border-sky-500/50 transition-all duration-200 disabled:opacity-60"
            >
              {createMutation.isPending ? (
                <><Loader2 size={16} className="animate-spin" /> Dispatching...</>
              ) : step < 4 ? (
                <>Next <ChevronRight size={16} /></>
              ) : (
                <>Submit Request <ChevronRight size={16} /></>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default RequestServicePage
