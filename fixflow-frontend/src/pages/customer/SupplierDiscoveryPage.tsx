import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import LeafletMap from '../../components/map/LeafletMap'
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
      return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    case 'pipes':
      return 'text-sky-400 bg-sky-500/10 border-sky-500/20'
    case 'sanitary':
      return 'text-teal-400 bg-teal-500/10 border-teal-500/20'
    case 'switches':
      return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
    case 'paint':
      return 'text-purple-400 bg-purple-500/10 border-purple-500/20'
    default:
      return 'text-slate-400 bg-slate-500/10 border-slate-550/20'
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

  return `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${
    color === '3b82f6' ? 'blue' : color === 'Eab308' ? 'gold' : 'red'
  }.png`
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
    <div className="min-h-screen bg-slate-950 text-slate-100 relative py-8 px-4 sm:px-6 lg:px-8 pb-20">
      {/* Top glow ambient layers */}
      <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none" />
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-sky-500/5 blur-[100px] pointer-events-none animate-pulse" />

      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-1">Marketplace</p>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Supplier & Materials Hub
          </h1>
          <p className="text-sm text-slate-400 mt-1">Discover nearby distributors and request quotation pricing</p>
        </div>

      {/* Geolocation Alerts */}
      {geoLoading && (
        <div className="relative z-10 flex items-center gap-3 rounded-xl bg-sky-500/10 border border-sky-500/20 p-4 text-sm text-sky-400">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>Locating your current GPS coordinates...</span>
        </div>
      )}
      {geoError && (
        <div className="relative z-10 flex items-center gap-3 rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
          <MapPin className="h-5 w-5 shrink-0 animate-pulse" />
          <span>{geoError} Please enable browser GPS permissions.</span>
        </div>
      )}

      {/* Controls Row */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-900 bg-slate-900/40 p-4.5 shadow-xl backdrop-blur-xl relative z-10">
        {/* Horizontal Category Chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition cursor-pointer ${
                activeCategory === cat
                  ? 'bg-sky-500/10 border-sky-500/30 text-sky-400 shadow-sm'
                  : 'bg-slate-950/60 border-slate-850 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Radius Slider + View Toggle */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex-1 flex items-center gap-3">
            <SlidersHorizontal className="h-4.5 w-4.5 text-slate-500 shrink-0" />
            <div className="flex-1 flex items-center gap-4">
              <input
                type="range"
                min={2}
                max={20}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
              <span className="text-xs font-bold text-slate-300 shrink-0 whitespace-nowrap bg-slate-950 border border-slate-850 px-2.5 py-1 rounded-lg font-mono">
                Within {radius} km
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end border-t sm:border-t-0 border-slate-900 pt-3 sm:pt-0">
            <div className="inline-flex rounded-xl bg-slate-950 border border-slate-850 p-1">
              <button
                onClick={() => setViewMode('map')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                  viewMode === 'map' ? 'bg-slate-800 text-sky-400 border border-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-350'
                }`}
              >
                <MapIcon className="h-4 w-4" /> Map View
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                  viewMode === 'list' ? 'bg-slate-800 text-sky-400 border border-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-355'
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
        <div className="flex h-96 flex-col items-center justify-center rounded-2xl border border-slate-900 bg-slate-900/40 p-8 text-center text-slate-500 relative z-10">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500 mb-4" />
          <p className="font-semibold text-slate-300 font-mono text-sm">Waiting for location access...</p>
        </div>
      ) : suppliersLoading ? (
        <div className="flex h-96 items-center justify-center rounded-2xl border border-slate-900 bg-slate-900/40 relative z-10">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        </div>
      ) : viewMode === 'map' ? (
        // Map View
        <ErrorBoundary
          fallback={
            <div className="flex h-96 flex-col items-center justify-center rounded-2xl border border-red-500/10 bg-red-500/5 p-8 text-center text-slate-500 shadow-sm relative z-10">
              <MapIcon className="h-10 w-10 text-red-400 mb-3" />
              <p className="font-bold text-red-400 text-sm">Map View Unavailable</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed font-mono">
                The mapping service failed to initialize properly. Please try reloading or check settings.
              </p>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="mt-4 rounded-xl bg-sky-500 hover:bg-sky-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-sm transition cursor-pointer"
              >
                Switch to List View
              </button>
            </div>
          }
        >
          <div className="h-[500px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-xl relative w-full">
            <LeafletMap
              centerLat={lat}
              centerLng={lng}
              zoom={13}
              markers={[
                {
                  id: 'user_location',
                  lat,
                  lng,
                  title: 'Your Location',
                  color: 'blue',
                },
                ...sortedSuppliers.map((sup) => ({
                  id: sup.id,
                  lat: sup.lat,
                  lng: sup.lng,
                  title: `${sup.businessName} (${sup.rating.toFixed(1)} ★) - Click to view catalog`,
                  color: 'red' as const,
                  onClick: () => setSelectedSupplier(sup),
                })),
              ]}
            />
          </div>
        </ErrorBoundary>
      ) : (
        // List View
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 relative z-10">
          {sortedSuppliers.map((sup) => (
            <div
              key={sup.id}
              className="rounded-2xl border border-slate-900 bg-slate-900/40 p-5 shadow-xl flex flex-col justify-between hover:bg-slate-900/70 hover:border-slate-800 transition duration-150 group"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-base truncate max-w-[150px]">{sup.businessName}</h3>
                    {sup.isVerified && <CheckCircle className="h-4 w-4 text-emerald-400 fill-emerald-500/10 shrink-0" />}
                  </div>
                  <span className="inline-flex items-center gap-1 rounded bg-slate-950 border border-slate-850 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 font-mono whitespace-nowrap">
                    {sup.distance ? sup.distance.toFixed(1) : '?'} km away
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-slate-200">{sup.rating.toFixed(1)}</span>
                  <span>({sup.reviewCount} reviews)</span>
                </div>

                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-slate-500" />
                  <span>Coverage: Up to {sup.serviceRadiusKm} km radius</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedSupplier(sup)}
                className="mt-5 w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/5 py-2 text-xs font-bold text-sky-400 hover:bg-sky-500/15 transition cursor-pointer"
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
          initialJobId={initialJobId}
          baseRoute={baseRoute}
        />
      )}

      {/* Request pricing modal */}
      {requestMaterial && (
        <RequestQuotationModal
          material={requestMaterial}
          onClose={() => setRequestMaterial(null)}
          initialJobId={initialJobId}
          baseRoute={baseRoute}
        />
      )}
      </div>
    </div>
  )
}

// SupplierDrawer component
function SupplierDrawer({
  supplier,
  onClose,
  onRequestQuotation,
  distance,
  initialJobId,
  baseRoute,
}: {
  supplier: Supplier & { distance?: number }
  onClose: () => void
  onRequestQuotation: (m: Material) => void
  distance?: number
  initialJobId: string
  baseRoute: string
}) {
  const navigate = useNavigate()
  const [drawerTab, setDrawerTab] = useState<'catalog' | 'bulk'>('catalog')
  const [bulkItems, setBulkItems] = useState<Array<{ material: Material; qty: number }>>([])
  const [bulkNotes, setBulkNotes] = useState('')
  const [submittingBulk, setSubmittingBulk] = useState(false)
  const [bulkDeliveryMode, setBulkDeliveryMode] = useState<'delivery' | 'pickup'>('delivery')

  const { data, isLoading } = useQuery({
    queryKey: [QUERY_KEYS.materials, supplier.id],
    queryFn: () => supplierService.getMaterials({ supplierId: supplier.id }),
  })

  const materials = data?.materials ?? []

  const handleAddBulk = (m: Material) => {
    if (bulkItems.some((item) => item.material.id === m.id)) {
      toast.error('Item is already in your project list')
      return
    }
    setBulkItems((prev) => [...prev, { material: m, qty: 1 }])
    toast.success(`Added ${m.name} to project list`)
  }

  const handleQtyChange = (id: string, qty: number) => {
    setBulkItems((prev) =>
      prev.map((item) => (item.material.id === id ? { ...item, qty: Math.max(1, qty) } : item))
    )
  }

  const handleRemoveBulk = (id: string) => {
    setBulkItems((prev) => prev.filter((item) => item.material.id !== id))
  }

  const bulkTotal = useMemo(() => {
    return bulkItems.reduce((sum, item) => sum + item.material.price * item.qty, 0)
  }, [bulkItems])

  useEffect(() => {
    if (bulkTotal <= 5000) {
      setBulkDeliveryMode('pickup')
    }
  }, [bulkTotal])

  const handleSubmitBulk = async () => {
    if (bulkItems.length === 0) {
      toast.error('Your project list is empty')
      return
    }
    setSubmittingBulk(true)
    try {
      const serializedItems = bulkItems.map((item) => ({
        id: item.material.id,
        name: item.material.name,
        qty: item.qty,
        price: item.material.price,
      }))
      const prefix = bulkDeliveryMode === 'pickup' ? '[Mode: Self-Pickup] ' : ''
      const notesPayload = `${prefix}[Bulk BOM Request] ${JSON.stringify(serializedItems)} | Project Notes: ${bulkNotes}`

      // Create a quotation using the first item as the database anchor key
      await supplierService.requestQuotation({
        materialId: bulkItems[0].material.id,
        requestedQty: 1, // Placeholder
        notes: notesPayload,
        jobId: initialJobId || undefined,
      })
      toast.success('Bulk project quotation request sent!')
      onClose()
      navigate(`${baseRoute}/quotations`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit bulk quotation request')
    } finally {
      setSubmittingBulk(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-xs">
      {/* Click outside backdrop to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer content panel */}
      <div className="w-full max-w-md bg-slate-900 h-full shadow-2xl flex flex-col justify-between border-l border-slate-800 animate-slide-in text-slate-100">
        {/* Header */}
        <div className="p-6 border-b border-slate-850 flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">{supplier.businessName}</h3>
              {supplier.isVerified && <CheckCircle className="h-4.5 w-4.5 text-emerald-400 fill-emerald-500/10" />}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 font-semibold">
              <span className="inline-flex items-center gap-0.5">
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" /> {supplier.rating.toFixed(1)}
              </span>
              <span>•</span>
              {distance && <span>{distance.toFixed(1)} km away</span>}
              <span>•</span>
              <span className="text-slate-500">Email: {supplier.contactEmail}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-slate-800 text-slate-450 hover:text-slate-200 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-6 py-2 bg-slate-950/60 border-b border-slate-850 flex gap-2">
          <button
            onClick={() => setDrawerTab('catalog')}
            className={`flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
              drawerTab === 'catalog'
                ? 'bg-slate-800 text-sky-400 border border-slate-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-350'
            }`}
          >
            📖 Browse Catalog
          </button>
          <button
            onClick={() => setDrawerTab('bulk')}
            className={`flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
              drawerTab === 'bulk'
                ? 'bg-slate-800 text-sky-400 border border-slate-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-350'
            }`}
          >
            📋 Bulk Project List
            {bulkItems.length > 0 && (
              <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {bulkItems.length}
              </span>
            )}
          </button>
        </div>

        {/* Catalog Tab Content */}
        {drawerTab === 'catalog' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider font-mono">Product Catalog</h4>

            {isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
              </div>
            ) : materials.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                <Package className="h-8 w-8 mx-auto mb-2 text-slate-700" />
                This supplier has not added any materials yet.
              </div>
            ) : (
              <div className="space-y-3">
                {materials.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-4.5 hover:border-slate-700 transition flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h5 className="font-bold text-white text-sm">{m.name}</h5>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${getCategoryColor(
                              m.category,
                            )}`}
                          >
                            {m.category}
                          </span>
                          {m.stock <= 5 && m.stock > 0 && (
                            <span className="text-[10px] text-amber-400 font-bold">Only {m.stock} left</span>
                          )}
                          {m.stock === 0 && <span className="text-[10px] text-red-400 font-bold">Out of stock</span>}
                        </div>
                      </div>
                      <span className="text-base font-extrabold text-indigo-400 whitespace-nowrap">
                        Rs. {m.price.toFixed(2)}
                      </span>
                    </div>

                    {m.description && <p className="text-xs text-slate-400 line-clamp-2">{m.description}</p>}

                    <div className="flex gap-2">
                      <button
                        disabled={m.stock === 0}
                        onClick={() => onRequestQuotation(m)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-slate-950 py-1.5 text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Request Quote
                      </button>
                      <button
                        disabled={m.stock === 0}
                        onClick={() => handleAddBulk(m)}
                        className="inline-flex items-center justify-center rounded-lg border border-emerald-500/30 text-emerald-400 px-3 hover:bg-emerald-550/10 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        title="Add to Bulk Bidding List"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bulk BOM Bidding Tab Content */}
        {drawerTab === 'bulk' && (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col justify-between bg-slate-900">
            <div className="space-y-4 flex-1">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider font-mono">Bulk Project Materials</h4>
                {bulkItems.length > 0 && (
                  <button
                    onClick={() => setBulkItems([])}
                    className="text-[10px] text-red-405 hover:text-red-350 font-bold uppercase transition cursor-pointer"
                  >
                    Clear List
                  </button>
                )}
              </div>

              {bulkItems.length === 0 ? (
                <div className="text-center py-20 text-slate-500 text-sm">
                  <Package className="h-10 w-10 mx-auto mb-2 text-slate-700" />
                  Your project materials list is empty.
                  <p className="text-xs text-slate-500 mt-1.5 max-w-[220px] mx-auto">
                    Browse the **Catalog** tab and click the **+** button next to items to add them.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {bulkItems.map((item) => (
                    <div
                      key={item.material.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <h5 className="font-bold text-white text-xs truncate">{item.material.name}</h5>
                        <p className="text-[10px] text-slate-400 font-medium font-mono">Rs. {item.material.price.toFixed(2)} each</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Qty adjustments */}
                        <div className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5">
                          <button
                            type="button"
                            onClick={() => handleQtyChange(item.material.id, item.qty - 1)}
                            className="flex h-5 w-5 items-center justify-center rounded bg-slate-900 text-slate-350 text-xs font-bold hover:bg-slate-850 cursor-pointer"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-xs font-bold text-slate-300 font-mono">{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => handleQtyChange(item.material.id, item.qty + 1)}
                            className="flex h-5 w-5 items-center justify-center rounded bg-slate-900 text-slate-350 text-xs font-bold hover:bg-slate-850 cursor-pointer"
                          >
                            +
                          </button>
                        </div>

                        <button
                          onClick={() => handleRemoveBulk(item.material.id)}
                          className="p-1 hover:bg-slate-800 rounded text-red-400 hover:text-red-300 transition cursor-pointer"
                          title="Remove Item"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {bulkItems.length > 0 && (
              <div className="pt-4 border-t border-slate-800 space-y-4 shrink-0 bg-slate-900">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-slate-400">Estimated Project Total:</span>
                  <span className="text-lg font-black text-white font-mono">Rs. {bulkTotal.toFixed(2)}</span>
                </div>

                {/* Fulfillment Mode selector for Bulk requests */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 block">Fulfillment Mode</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-950 border border-slate-850 p-1 rounded-xl">
                    <button
                      type="button"
                      disabled={bulkTotal <= 5000}
                      onClick={() => setBulkDeliveryMode('delivery')}
                      className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                        bulkDeliveryMode === 'delivery'
                          ? 'bg-slate-800 text-sky-400 border border-slate-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-350'
                      } ${bulkTotal <= 5000 ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      🚚 Delivery
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkDeliveryMode('pickup')}
                      className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                        bulkDeliveryMode === 'pickup'
                          ? 'bg-slate-800 text-sky-400 border border-slate-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-350'
                      }`}
                    >
                      🛍️ Self-Pickup
                    </button>
                  </div>
                  {bulkTotal <= 5000 && (
                    <p className="text-[10px] text-amber-450 font-medium">
                      ⚠️ Delivery is only available for projects above Rs. 5,000.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Project notes / custom specifications
                  </label>
                  <textarea
                    value={bulkNotes}
                    onChange={(e) => setBulkNotes(e.target.value)}
                    placeholder="e.g. Need the electrical piping in blue PVC. Deliver all items together by next Tuesday..."
                    rows={2}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  disabled={submittingBulk}
                  onClick={handleSubmitBulk}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-slate-950 py-2.5 font-bold shadow-lg shadow-sky-500/10 transition disabled:opacity-50 cursor-pointer"
                >
                  {submittingBulk ? (
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Submit Bulk Bidding Quote
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// RequestQuotationModal component
function RequestQuotationModal({
  material,
  onClose,
  baseRoute,
  initialJobId,
}: {
  material: Material
  onClose: () => void
  baseRoute: string
  initialJobId: string
}) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [qty, setQty] = useState('1')
  const [deliveryMode, setDeliveryMode] = useState<'delivery' | 'pickup'>('delivery')
  const [notes, setNotes] = useState('')
  const [jobId, setJobId] = useState(initialJobId)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const totalPrice = useMemo(() => {
    const q = parseInt(qty, 10)
    return isNaN(q) ? 0 : q * material.price
  }, [qty, material.price])

  useEffect(() => {
    if (totalPrice <= 5000) {
      setDeliveryMode('pickup')
    }
  }, [totalPrice])

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
      const notesPayload = deliveryMode === 'pickup' ? `[Mode: Self-Pickup] ${notes}` : notes
      await supplierService.requestQuotation({
        materialId: material.id,
        jobId: jobId || undefined,
        requestedQty,
        notes: notesPayload || undefined,
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
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 p-6 shadow-2xl border border-slate-800 animate-fade-in text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-550 hover:text-white cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Wrench className="h-5 w-5 text-sky-400" />
          Request Pricing Quote
        </h3>

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4.5 mb-4 flex justify-between items-start gap-4">
          <div>
            <h4 className="font-bold text-white text-sm">{material.name}</h4>
            <span className="text-xs text-slate-500 font-semibold uppercase font-mono">{material.category}</span>
          </div>
          <span className="text-base font-extrabold text-indigo-400 font-mono">Rs. {material.price.toFixed(2)}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Link to Job */}
          {baseRoute === '/customer' && (
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Link to Job Context (Optional)
              </label>
              <select
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-950">None (Independent Delivery)</option>
                {customerJobs.map((j) => (
                  <option key={j.id} value={j.id} className="bg-slate-950">
                    [{j.status}] {j.serviceType} - {j.description.substring(0, 30)}...
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Fulfillment Mode selector */}
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">Fulfillment Mode</label>
            <div className="grid grid-cols-2 gap-2 bg-slate-950 border border-slate-850 p-1 rounded-xl">
              <button
                type="button"
                disabled={totalPrice <= 5000}
                onClick={() => setDeliveryMode('delivery')}
                className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                  deliveryMode === 'delivery'
                    ? 'bg-slate-800 text-sky-400 border border-slate-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-350'
                } ${totalPrice <= 5000 ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                🚚 Delivery
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMode('pickup')}
                className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                  deliveryMode === 'pickup'
                    ? 'bg-slate-800 text-sky-400 border border-slate-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-350'
                }`}
              >
                🛍️ Self-Pickup
              </button>
            </div>
            {totalPrice <= 5000 && (
              <p className="text-[10px] text-amber-400 font-semibold mt-1">
                ⚠️ Delivery is only available for orders above Rs. 5,000.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">Requested Quantity</label>
            <input
              type="number"
              min={1}
              required
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">Notes / Instructions</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Please specify if you provide installation services or standard delivery times..."
              rows={3}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-800 px-4 py-2 text-sm font-semibold text-slate-400 hover:bg-slate-800 focus:outline-none cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-slate-950 px-5 py-2 text-sm font-bold shadow-lg shadow-sky-500/10 disabled:opacity-50 cursor-pointer"
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
