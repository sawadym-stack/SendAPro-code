import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Search, Star, MessageSquare, ChevronRight, X, Sparkles, Navigation, ShieldCheck } from 'lucide-react'
import api from '../../services/api'
import { useGeolocation } from '../../hooks/useGeolocation'
import ReviewsSection from '../technician/ReviewsSection'
import { toast } from 'react-hot-toast'

interface TechLocation {
  technicianId: string
  latitude: number
  longitude: number
  distanceKm: number
}

const SERVICE_TYPES = [
  { id: 'Electrician', label: 'Electrician', icon: '⚡' },
  { id: 'Plumber', label: 'Plumber', icon: '🔧' },
  { id: 'AC Repair', label: 'AC Repair', icon: '❄️' },
  { id: 'Appliance Repair', label: 'Appliance', icon: '📺' },
  { id: 'Carpenter', label: 'Carpenter', icon: '🪚' },
  { id: 'Painter', label: 'Painter', icon: '🎨' },
  { id: 'Mason', label: 'Mason', icon: '🧱' },
  { id: 'Cleaning', label: 'Cleaning', icon: '🧹' },
]

export default function NearbyTechniciansPage() {
  const { lat: latitude, lng: longitude, error: geoError } = useGeolocation()
  const [serviceType, setServiceType] = useState('Electrician')
  const [radius, setRadius] = useState<number>(15)
  const [selectedTech, setSelectedTech] = useState<TechLocation | null>(null)

  // Use default coords if browser geolocation fails/denied (e.g. Bangalore center)
  const lat = latitude ?? 12.9716
  const lng = longitude ?? 77.5946

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

  // Fetch individual technician review statistics for list tags
  const technicians = data?.technicians ?? []

  return (
    <div className="space-y-8 max-w-5xl mx-auto p-4 md:p-6 text-white relative">
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

        {geoError && (
          <span className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1.5 rounded-lg">
            ⚠️ Geolocation inactive. Using default area center.
          </span>
        )}
      </div>

      {/* Control Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Filters & Location Settings
        </h2>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Category Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400">Service Category</label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
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
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
            >
              <option value={5} className="bg-slate-950">5 kilometers</option>
              <option value={10} className="bg-slate-950">10 kilometers</option>
              <option value={15} className="bg-slate-950">15 kilometers</option>
              <option value={25} className="bg-slate-950">25 kilometers</option>
              <option value={50} className="bg-slate-950">50 kilometers</option>
            </select>
          </div>

          {/* Coords display */}
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
            <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
              <MapPin size={40} className="text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-400">No Providers Located</h3>
              <p className="text-xs text-slate-600 mt-1 max-w-sm mx-auto">
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

                    <h3 className="font-extrabold text-slate-200 mt-4 group-hover:text-white transition-colors">
                      Technician ID: {tech.technicianId.slice(0, 8)}...
                    </h3>
                  </div>

                  <div className="flex justify-between items-center border-t border-slate-800/80 pt-3 mt-3 w-full">
                    {/* Compact reviews widget */}
                    <ReviewsSection technicianId={tech.technicianId} compact />
                    <ChevronRight size={16} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Map Placeholder Side widget */}
        <div className="md:col-span-1 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-400">
            Satellite Tracking
          </h2>
          <div className="border border-slate-800 bg-slate-950/60 rounded-2xl aspect-square p-6 flex flex-col justify-between items-center text-center shadow-xl relative overflow-hidden">
            {/* Glowing sweep radar animation background */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-sky-500/5 rounded-full animate-spin [animation-duration:10s]" />
            <div className="absolute top-1/2 left-1/2 w-48 h-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-800/40" />
            <div className="absolute top-1/2 left-1/2 w-28 h-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-800/20" />

            <div className="relative z-10">
              <span className="text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full text-slate-400 font-mono font-bold uppercase tracking-wider">
                Active Ping Coords
              </span>
            </div>

            <div className="relative z-10 flex flex-col items-center">
              <MapPin size={36} className="text-sky-500 animate-bounce" />
              <p className="text-xs font-mono text-slate-400 mt-3 font-semibold">
                Lat: {lat.toFixed(4)}
              </p>
              <p className="text-xs font-mono text-slate-400">
                Lng: {lng.toFixed(4)}
              </p>
            </div>

            <div className="relative z-10 text-[10px] text-slate-500 leading-normal max-w-[200px]">
              Active sensors checking technician dispatches within {radius}km of coordinates.
            </div>
          </div>
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
                onClick={() => setSelectedTech(null)}
                className="p-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>

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
          </div>
        </div>
      )}
    </div>
  )
}
