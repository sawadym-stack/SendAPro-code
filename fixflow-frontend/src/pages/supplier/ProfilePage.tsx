import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps'
import { Star, ShieldAlert, BadgeCheck, Check, Loader2, MapPin, Phone, Mail, Navigation } from 'lucide-react'
import { toast } from 'react-hot-toast'
import supplierService from '../../services/supplier.service'
import type { Supplier } from '../../types'
import ErrorBoundary from '../../components/shared/ErrorBoundary'


// Custom Circle component for @vis.gl/react-google-maps
interface CircleProps {
  center: google.maps.LatLngLiteral
  radius: number
  fillColor?: string
  fillOpacity?: number
  strokeColor?: string
  strokeWeight?: number
}

const Circle = ({ center, radius, fillColor, fillOpacity, strokeColor, strokeWeight }: CircleProps) => {
  const map = useMap()
  const circleRef = useRef<google.maps.Circle | null>(null)

  useEffect(() => {
    if (!map) return

    const circle = new google.maps.Circle({
      map,
      center,
      radius,
      fillColor: fillColor ?? '#3b82f6',
      fillOpacity: fillOpacity ?? 0.15,
      strokeColor: strokeColor ?? '#2563eb',
      strokeWeight: strokeWeight ?? 1.5,
    })

    circleRef.current = circle

    return () => {
      circle.setMap(null)
    }
  }, [map, center.lat, center.lng, radius, fillColor, fillOpacity, strokeColor, strokeWeight])

  return null
}

const ProfilePage = () => {
  const qc = useQueryClient()

  // Fetch supplier profile
  const { data: profile, isLoading, isError } = useQuery<Supplier>({
    queryKey: ['supplier', 'profile'],
    queryFn: () => supplierService.getMyProfile(),
  })

  // State to hold form values
  const [form, setForm] = useState({
    businessName: '',
    contactEmail: '',
    contactPhone: '',
    serviceRadiusKm: 10,
    lat: 12.9716,
    lng: 77.5946,
  })

  // Update form state when profile data resolves
  useEffect(() => {
    if (profile) {
      setForm({
        businessName: profile.businessName ?? '',
        contactEmail: profile.contactEmail ?? '',
        contactPhone: profile.contactPhone ?? '',
        serviceRadiusKm: profile.serviceRadiusKm ?? 10,
        lat: profile.lat ?? 12.9716,
        lng: profile.lng ?? 77.5946,
      })
    }
  }, [profile])

  // Save profile mutation
  const saveMutation = useMutation({
    mutationFn: (body: typeof form) => supplierService.updateProfile(body),
    onSuccess: () => {
      toast.success('Supplier profile updated successfully!')
      qc.invalidateQueries({ queryKey: ['supplier', 'profile'] })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update profile')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.businessName.trim()) {
      toast.error('Business name is required')
      return
    }
    if (!form.contactEmail.trim()) {
      toast.error('Contact email is required')
      return
    }
    if (!form.contactPhone.trim()) {
      toast.error('Contact phone is required')
      return
    }

    saveMutation.mutate(form)
  }

  const handleMapClick = (e: any) => {
    if (e.detail?.latLng) {
      setForm((prev) => ({
        ...prev,
        lat: e.detail.latLng.lat,
        lng: e.detail.latLng.lng,
      }))
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center rounded-2xl border bg-white shadow-xs">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="text-sm font-semibold">Loading supplier profile...</span>
        </div>
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-100 bg-rose-50/50 p-12 text-center shadow-sm">
        <div className="rounded-full bg-rose-100 p-4 text-rose-600">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-slate-800">Unable to load profile</h3>
        <p className="mt-1 text-sm text-slate-500 max-w-sm">
          Please check your connection and ensure you are logged in as a registered supplier.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Business Profile</h1>
          <p className="text-sm text-slate-500">Manage your shop metadata, service coverage radius, and location pin</p>
        </div>
        <div className="flex items-center gap-1.5">
          {profile.isVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1 text-xs font-bold uppercase tracking-wider">
              <BadgeCheck className="h-4 w-4" /> Verified Distributor
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1 text-xs font-bold uppercase tracking-wider">
              Verification Pending
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Form Panel */}
        <form onSubmit={handleSubmit} className="lg:col-span-5 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
          <div className="space-y-4.5">
            <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3">Company Metadata</h3>

            {/* Business Name */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">Business Name</label>
              <input
                type="text"
                required
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                placeholder="e.g. Banglore Hardware & Wiring"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Contact Email */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">Contact Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-4 w-4 text-slate-400" />
                </span>
                <input
                  type="email"
                  required
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  placeholder="name@business.com"
                  className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Contact Phone */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">Contact Phone Number</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                  <Phone className="h-4 w-4 text-slate-400" />
                </span>
                <input
                  type="tel"
                  required
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  placeholder="+91 99999 99999"
                  className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Service Radius Slider */}
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-600">
                <span>Service Radius (Coverage)</span>
                <span className="text-blue-600 font-bold bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                  {form.serviceRadiusKm} km
                </span>
              </div>
              <input
                type="range"
                min={2}
                max={50}
                value={form.serviceRadiusKm}
                onChange={(e) => setForm({ ...form, serviceRadiusKm: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Coordinates Display */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 border rounded-xl p-3 text-slate-500">
              <div>
                <span className="font-semibold block text-[10px] text-slate-400 uppercase">Latitude</span>
                <span className="font-mono text-slate-700">{form.lat.toFixed(6)}</span>
              </div>
              <div>
                <span className="font-semibold block text-[10px] text-slate-400 uppercase">Longitude</span>
                <span className="font-mono text-slate-700">{form.lng.toFixed(6)}</span>
              </div>
            </div>

            {/* Reviews display */}
            <div className="flex items-center gap-1.5 pt-2 text-xs font-semibold text-slate-500">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="text-slate-800">{profile.rating.toFixed(1)} Rating</span>
              <span>•</span>
              <span>{profile.reviewCount} Reviews</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-semibold text-white shadow-md hover:bg-blue-700 hover:shadow-lg transition focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4.5 w-4.5" />
            )}
            Save Changes
          </button>
        </form>

        {/* Right Map Panel */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-800">Dispatch Coverage Location</h3>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-blue-600" />
              Click on the map or drag the marker to adjust your storefront coordinates
            </p>
          </div>

          <div className="h-[380px] overflow-hidden rounded-xl border border-slate-200 relative bg-slate-50">
            <ErrorBoundary
              fallback={
                <div className="flex h-full flex-col items-center justify-center p-6 text-center text-slate-500">
                  <MapPin className="h-8 w-8 text-rose-500 mb-2" />
                  <p className="font-bold text-slate-800 text-sm">Map Loading Failed</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
                    The interactive map could not be loaded. Please check your internet connection or ad-blocker.
                  </p>
                </div>
              }
            >
              <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_KEY || ''}>
                <Map
                  defaultZoom={11}
                  center={{ lat: Number(form.lat), lng: Number(form.lng) }}
                  onClick={handleMapClick}
                  className="w-full h-full"
                  mapId="supplier_profile_map"
                >
                  <Marker
                    position={{ lat: Number(form.lat), lng: Number(form.lng) }}
                    draggable={true}
                    onDragEnd={(e: any) => {
                      if (e.latLng) {
                        setForm((prev) => ({
                          ...prev,
                          lat: e.latLng.lat(),
                          lng: e.latLng.lng(),
                        }))
                      }
                    }}
                  />
                  <Circle
                    center={{ lat: Number(form.lat), lng: Number(form.lng) }}
                    radius={Number(form.serviceRadiusKm) * 1000}
                    fillColor="#3b82f6"
                    fillOpacity={0.12}
                    strokeColor="#2563eb"
                    strokeWeight={1.5}
                  />
                </Map>
              </APIProvider>
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
