import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { APIProvider, Map, Marker, InfoWindow } from '@vis.gl/react-google-maps'
import { toast } from 'react-hot-toast'
import {
  MapPin,
  SlidersHorizontal,
  Map as MapIcon,
  List as ListIcon,
  Star,
  CheckCircle,
  Package,
  Wrench,
  Loader2,
  X,
  Plus,
  Send,
} from 'lucide-react'
import { QUERY_KEYS } from '../../constants/queryKeys'
import supplierService from '../../services/supplier.service'
import jobService from '../../services/job.service'
import { useGeolocation } from '../../hooks/useGeolocation'
import { useAuthStore } from '../../store/authStore'
import { formatCurrency } from '../../utils/formatters'
import type { Supplier, Material } from '../../types'
import ErrorBoundary from '../../components/shared/ErrorBoundary'

const CATEGORIES = ['All', 'Wires', 'Pipes', 'Sanitary', 'Switches', 'Paint', 'Tools', 'Other'] as const

// Distance calculator (Haversine formula)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371 // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

const getCategoryColor = (category: string) => {
  const cat = category.toLowerCase()
  switch (cat) {
    case 'wires':
      return 'text-amber-500 bg-amber-50 border-amber-200'
    case 'pipes':
      return 'text-blue-500 bg-blue-50 border-blue-200'
    case 'sanitary':
      return 'text-teal-500 bg-teal-50 border-teal-200'
    case 'switches':
      return 'text-orange-500 bg-orange-50 border-orange-200'
    case 'paint':
      return 'text-purple-500 bg-purple-50 border-purple-200'
    default:
      return 'text-slate-500 bg-slate-50 border-slate-200'
  }
}

// Marker Pin colors for map
const getMarkerIconUrl = (category: string) => {
  const cat = category.toLowerCase()
  let color = '708090' // slate
  if (cat === 'wires') color = 'Eab308' // yellow
  else if (cat === 'pipes') color = '3b82f6' // blue
  else if (cat === 'sanitary') color = '14b8a6' // teal
  else if (cat === 'switches') color = 'F97316' // orange
  else if (cat === 'paint') color = 'A855f7' // purple

  return `https://maps.google.com/mapfiles/ms/icons/${
    color === '3b82f6' ? 'blue' : color === 'Eab308' ? 'yellow' : 'red'
  }-dot.png`
}

const SupplierDiscoveryPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)

  // Detect role: customer or technician
  const isTechnician = location.pathname.startsWith('/technician')
  const baseRoute = isTechnician ? '/technician' : '/customer'

  // Pre-fill JobId from query params (used by technicians navigating from ActiveJobPage)
  const queryParams = new URLSearchParams(location.search)
  const initialJobId = queryParams.get('jobId') ?? ''

  // Geolocation
  const { lat, lng, error: geoError, loading: geoLoading } = useGeolocation(true)

  // Filters
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>('All')
  const [radius, setRadius] = useState(10) // default 10 km
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map')
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [activeInfoWindow, setActiveInfoWindow] = useState<Supplier | null>(null)
  const [requestMaterial, setRequestMaterial] = useState<Material | null>(null)

  // Fetch Nearby Suppliers
  const { data: suppliers, isLoading: suppliersLoading } = useQuery({
    queryKey: [QUERY_KEYS.nearbySuppliers, { lat, lng, category: activeCategory, radius }],
    queryFn: () =>
      supplierService.getNearby(
        lat!,
        lng!,
        activeCategory === 'All' ? undefined : activeCategory.toLowerCase(),
        radius,
      ),
    enabled: !!lat && !!lng,
  })

  // Distance sorted list
  const sortedSuppliers = useMemo(() => {
    if (!suppliers || !lat || !lng) return []
    return [...suppliers]
      .map((s) => ({
        ...s,
        distance: calculateDistance(lat, lng, s.lat, s.lng),
      }))
      .sort((a, b) => a.distance - b.distance)
  }, [suppliers, lat, lng])

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Supplier & Materials Hub</h1>
        <p className="text-sm text-slate-500">Discover nearby distributors and request quotation pricing</p>
      </div>

      {/* Geolocation Alerts */}
      {geoLoading && (
        <div className="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>Locating your current GPS coordinates...</span>
        </div>
      )}
      {geoError && (
        <div className="flex items-center gap-3 rounded-xl bg-rose-50 border border-rose-100 p-4 text-sm text-rose-700">
          <MapPin className="h-5 w-5 shrink-0" />
          <span>{geoError} Please enable browser GPS permissions.</span>
        </div>
      )}

      {/* Controls Row */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs">
        {/* Horizontal Category Chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Radius Slider + View Toggle */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex-1 flex items-center gap-3">
            <SlidersHorizontal className="h-4.5 w-4.5 text-slate-400 shrink-0" />
            <div className="flex-1 flex items-center gap-4">
              <input
                type="range"
                min={2}
                max={20}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-xs font-bold text-slate-700 shrink-0 whitespace-nowrap bg-slate-100 border px-2.5 py-1 rounded-lg">
                Within {radius} km
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0">
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              <button
                onClick={() => setViewMode('map')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  viewMode === 'map' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <MapIcon className="h-4 w-4" /> Map View
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  viewMode === 'list' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <ListIcon className="h-4 w-4" /> List View
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Discovery Content Area */}
      {!lat || !lng ? (
        <div className="flex h-96 flex-col items-center justify-center rounded-2xl border bg-white p-8 text-center text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
          <p className="font-semibold text-slate-700">Waiting for location access...</p>
        </div>
      ) : suppliersLoading ? (
        <div className="flex h-96 items-center justify-center rounded-2xl border bg-white">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : viewMode === 'map' ? (
        // Map View
        <ErrorBoundary
          fallback={
            <div className="flex h-96 flex-col items-center justify-center rounded-2xl border border-rose-100 bg-rose-50/20 p-8 text-center text-slate-500 shadow-sm">
              <MapIcon className="h-10 w-10 text-rose-550 mb-3" />
              <p className="font-bold text-slate-800 text-sm">Map View Unavailable</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
                The Google Maps service failed to load (it might be blocked by your ad-blocker, or the API key is invalid).
              </p>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition cursor-pointer"
              >
                Switch to List View
              </button>
            </div>
          }
        >
          <div className="h-[500px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm relative">
            <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_KEY || ''}>
              <Map
                defaultZoom={13}
                defaultCenter={{ lat, lng }}
                mapId="supplier_discovery_map"
                className="w-full h-full"
              >
                {/* User location pin */}
                <Marker
                  position={{ lat, lng }}
                  title="Your Location"
                  icon="https://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                />

                {/* Supplier pins */}
                {sortedSuppliers.map((sup) => (
                  <Marker
                    key={sup.id}
                    position={{ lat: sup.lat, lng: sup.lng }}
                    onClick={() => setActiveInfoWindow(sup)}
                    icon={getMarkerIconUrl(activeCategory)}
                  />
                ))}

                {activeInfoWindow && (
                  <InfoWindow
                    position={{ lat: activeInfoWindow.lat, lng: activeInfoWindow.lng }}
                    onCloseClick={() => setActiveInfoWindow(null)}
                  >
                    <div className="p-2 space-y-2 max-w-[200px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800 text-sm">{activeInfoWindow.businessName}</span>
                        {activeInfoWindow.isVerified && <CheckCircle className="h-3.5 w-3.5 text-emerald-500 fill-emerald-50" />}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                        <span>{activeInfoWindow.rating.toFixed(1)}</span>
                        <span>•</span>
                        <span>{activeInfoWindow.distance ? activeInfoWindow.distance.toFixed(1) : '?'} km away</span>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedSupplier(activeInfoWindow)
                          setActiveInfoWindow(null)
                        }}
                        className="w-full text-center rounded bg-blue-600 py-1 text-[10px] font-bold text-white shadow-xs hover:bg-blue-700"
                      >
                        View Catalog
                      </button>
                    </div>
                  </InfoWindow>
                )}
              </Map>
            </APIProvider>
          </div>
        </ErrorBoundary>
      ) : (
        // List View
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedSuppliers.map((sup) => (
            <div
              key={sup.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition duration-150"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800 text-base">{sup.businessName}</h3>
                    {sup.isVerified && <CheckCircle className="h-4 w-4 text-emerald-500 fill-emerald-50 shrink-0" />}
                  </div>
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 border px-1.5 py-0.5 text-[10px] font-bold text-slate-600 whitespace-nowrap">
                    {sup.distance ? sup.distance.toFixed(1) : '?'} km away
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-slate-800">{sup.rating.toFixed(1)}</span>
                  <span>({sup.reviewCount} reviews)</span>
                </div>

                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>Coverage: Up to {sup.serviceRadiusKm} km radius</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedSupplier(sup)}
                className="mt-5 w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-600 bg-white py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 transition"
              >
                View Materials & Request
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Supplier drawer sliding from right */}
      {selectedSupplier && (
        <SupplierDrawer
          supplier={selectedSupplier}
          onClose={() => setSelectedSupplier(null)}
          onRequestQuotation={(m) => setRequestMaterial(m)}
          distance={selectedSupplier.distance}
        />
      )}

      {/* Request Quotation Modal */}
      {requestMaterial && (
        <RequestQuotationModal
          material={requestMaterial}
          onClose={() => setRequestMaterial(null)}
          baseRoute={baseRoute}
          initialJobId={initialJobId}
        />
      )}
    </div>
  )
}

// SupplierDrawer component
const SupplierDrawer = ({
  supplier,
  onClose,
  onRequestQuotation,
  distance,
}: {
  supplier: Supplier & { distance?: number }
  onClose: () => void
  onRequestQuotation: (m: Material) => void
  distance?: number
}) => {
  const { data, isLoading } = useQuery({
    queryKey: [QUERY_KEYS.materials, supplier.id],
    queryFn: () => supplierService.getMaterials({ supplierId: supplier.id }),
  })

  const materials = data?.materials ?? []

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-xs">
      {/* Click outside backdrop to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer content panel */}
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between border-l border-slate-200 animate-slide-in">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-800">{supplier.businessName}</h3>
              {supplier.isVerified && <CheckCircle className="h-4.5 w-4.5 text-emerald-500 fill-emerald-50" />}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 font-semibold">
              <span className="inline-flex items-center gap-0.5">
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" /> {supplier.rating.toFixed(1)}
              </span>
              <span>•</span>
              {distance && <span>{distance.toFixed(1)} km away</span>}
              <span>•</span>
              <span className="text-slate-600">Email: {supplier.contactEmail}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Material listings */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Product Catalog</h4>

          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : materials.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              This supplier has not added any materials yet.
            </div>
          ) : (
            <div className="space-y-3">
              {materials.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-slate-200 bg-white p-4.5 hover:border-slate-350 transition flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h5 className="font-bold text-slate-800 text-sm">{m.name}</h5>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${getCategoryColor(
                            m.category,
                          )}`}
                        >
                          {m.category}
                        </span>
                        {m.stock <= 5 && m.stock > 0 && (
                          <span className="text-[10px] text-amber-600 font-bold">Only {m.stock} left</span>
                        )}
                        {m.stock === 0 && <span className="text-[10px] text-rose-600 font-bold">Out of stock</span>}
                      </div>
                    </div>
                    <span className="text-base font-extrabold text-slate-900 whitespace-nowrap">
                      Rs. {m.price.toFixed(2)}
                    </span>
                  </div>

                  {m.description && <p className="text-xs text-slate-500 line-clamp-2">{m.description}</p>}

                  <button
                    disabled={m.stock === 0}
                    onClick={() => onRequestQuotation(m)}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Request Quotation
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// RequestQuotationModal component
const RequestQuotationModal = ({
  material,
  onClose,
  baseRoute,
  initialJobId,
}: {
  material: Material
  onClose: () => void
  baseRoute: string
  initialJobId: string
}) => {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [qty, setQty] = useState('1')
  const [notes, setNotes] = useState('')
  const [jobId, setJobId] = useState(initialJobId)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch customer's active/pending jobs to optionally link
  const { data: jobsResponse } = useQuery({
    queryKey: QUERY_KEYS.jobs,
    queryFn: () => jobService.listJobs({ customerId: user?.id }),
    enabled: !!user?.id && baseRoute === '/customer',
  })
  const customerJobs = jobsResponse?.jobs ?? []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const requestedQty = parseInt(qty, 10)

    if (isNaN(requestedQty) || requestedQty <= 0) {
      toast.error('Requested quantity must be at least 1')
      return
    }

    setIsSubmitting(true)
    try {
      await supplierService.requestQuotation({
        materialId: material.id,
        jobId: jobId || undefined,
        requestedQty,
        notes: notes || undefined,
      })
      toast.success('Quotation request sent!')
      onClose()
      navigate(`${baseRoute}/quotations`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit quotation request')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Wrench className="h-5 w-5 text-blue-600" />
          Request Pricing Quote
        </h3>

        <div className="rounded-xl border bg-slate-50 p-4.5 mb-4 flex justify-between items-start gap-4">
          <div>
            <h4 className="font-bold text-slate-800 text-sm">{material.name}</h4>
            <span className="text-xs text-slate-500 font-semibold uppercase">{material.category}</span>
          </div>
          <span className="text-base font-extrabold text-slate-900">Rs. {material.price.toFixed(2)}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Linked Job selector */}
          {baseRoute === '/customer' && (
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                Link to Job Context (Optional)
              </label>
              <select
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
              >
                <option value="">None (Independent Delivery)</option>
                {customerJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    [{j.status}] {j.serviceType} - {j.description.substring(0, 30)}...
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Requested Quantity</label>
            <input
              type="number"
              min={1}
              required
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Notes / Instructions</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Please specify if you provide installation services or standard delivery times..."
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit Request
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default SupplierDiscoveryPage
