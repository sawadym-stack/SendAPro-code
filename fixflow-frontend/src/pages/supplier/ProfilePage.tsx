import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import LeafletMap from '../../components/map/LeafletMap'
import { Star, ShieldAlert, BadgeCheck, Check, Loader2, MapPin, Phone, Mail, Navigation, Camera } from 'lucide-react'
import { toast } from 'react-hot-toast'
import supplierService from '../../services/supplier.service'
import authService from '../../services/auth.service'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import type { Supplier } from '../../types'
import ErrorBoundary from '../../components/shared/ErrorBoundary'




const ProfilePage = () => {
  const qc = useQueryClient()
  const { user, setAuth, token, role, refreshToken } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [imageError, setImageError] = useState(false)

  // Fetch full user record including profile picture
  const { data: profileUser, refetch: refetchUser } = useQuery({
    queryKey: ['user-profile-me'],
    queryFn: () => authService.getMe(),
  })

  const currentUser = profileUser ?? user

  const initials = (currentUser?.name ?? 'Supplier')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const triggerUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image exceeds 5MB limit')
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    setIsUploading(true)
    try {
      const res = await api.post<{ imageUrl: string }>('/users/me/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      
      const newUrl = res.data.imageUrl
      setImageError(false)
      if (user) {
        const updated = { ...user, profilePictureUrl: newUrl }
        setAuth(updated, token!, role!, refreshToken)
      }
      toast.success('Profile picture updated successfully!')
      refetchUser()
    } catch (err: any) {
      toast.error('Failed to upload profile picture')
    } finally {
      setIsUploading(false)
    }
  }

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



  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-md shadow-xs">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          <span className="text-sm font-semibold text-slate-300">Loading supplier profile...</span>
        </div>
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-900/50 bg-rose-950/20 p-12 text-center shadow-sm">
        <div className="rounded-full bg-rose-950 p-4 text-rose-400 border border-rose-900/30">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-white">Unable to load profile</h3>
        <p className="mt-1 text-sm text-slate-400 max-w-sm">
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
          <h1 className="text-2xl font-bold text-white">Business Profile</h1>
          <p className="text-sm text-slate-400">Manage your shop metadata, service coverage radius, and location pin</p>
        </div>
        <div className="flex items-center gap-1.5">
          {profile.isVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 text-xs font-bold uppercase tracking-wider">
              <BadgeCheck className="h-4 w-4" /> Verified Distributor
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1 text-xs font-bold uppercase tracking-wider">
              Verification Pending
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Form Panel */}
        <form onSubmit={handleSubmit} className="lg:col-span-5 space-y-5 rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-md p-6 shadow-md flex flex-col justify-between">
          <div className="space-y-4.5">
            <h3 className="text-base font-bold text-white border-b border-slate-800/60 pb-3">Company Metadata</h3>

            {/* Profile Avatar Upload */}
            <div className="flex flex-col items-center py-4 border-b border-slate-800/60">
              <div 
                onClick={triggerUpload}
                className="relative w-20 h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl font-black text-emerald-400 cursor-pointer overflow-hidden group transition-all"
                title="Click to change profile photo"
              >
                {isUploading ? (
                  <Loader2 className="animate-spin text-emerald-400 h-6 w-6" />
                ) : currentUser?.profilePictureUrl && !imageError ? (
                  <img 
                    src={currentUser.profilePictureUrl} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  initials
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="text-white h-5 w-5" />
                </div>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
              />
              <p className="text-[10px] text-slate-500 mt-2 font-mono uppercase tracking-wider">Click to upload photo</p>
            </div>

            {/* Business Name */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 block">Business Name</label>
              <input
                type="text"
                required
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                placeholder="e.g. Bangalore Hardware & Wiring"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Contact Email */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 block">Contact Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-4 w-4 text-slate-500" />
                </span>
                <input
                  type="email"
                  required
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  placeholder="name@business.com"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-10 pr-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Contact Phone */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 block">Contact Phone Number</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                  <Phone className="h-4 w-4 text-slate-500" />
                </span>
                <input
                  type="tel"
                  required
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  placeholder="+91 99999 99999"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-10 pr-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Service Radius Slider */}
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
                <span>Service Radius (Coverage)</span>
                <span className="text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-md">
                  {form.serviceRadiusKm} km
                </span>
              </div>
              <input
                type="range"
                min={2}
                max={50}
                value={form.serviceRadiusKm}
                onChange={(e) => setForm({ ...form, serviceRadiusKm: Number(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
            </div>

            {/* Coordinates Display */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 text-slate-400">
              <div>
                <span className="font-semibold block text-[10px] text-slate-500 uppercase">Latitude</span>
                <span className="font-mono text-slate-200">{form.lat.toFixed(6)}</span>
              </div>
              <div>
                <span className="font-semibold block text-[10px] text-slate-500 uppercase">Longitude</span>
                <span className="font-mono text-slate-200">{form.lng.toFixed(6)}</span>
              </div>
            </div>

            {/* Reviews display */}
            <div className="flex items-center gap-1.5 pt-2 text-xs font-semibold text-slate-400">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="text-slate-200">{profile.rating.toFixed(1)} Rating</span>
              <span>•</span>
              <span>{profile.reviewCount} Reviews</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white shadow-md hover:bg-emerald-500 hover:shadow-lg transition focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-md p-6 shadow-md flex flex-col gap-4">
          <div>
            <h3 className="text-base font-bold text-white">Dispatch Coverage Location</h3>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-emerald-500" />
              Click on the map or drag the marker to adjust your storefront coordinates
            </p>
          </div>

          <div className="h-[380px] overflow-hidden rounded-xl border border-slate-800 relative bg-slate-950">
            <ErrorBoundary
              fallback={
                <div className="flex h-full flex-col items-center justify-center p-6 text-center text-slate-400">
                  <MapPin className="h-8 w-8 text-rose-500 mb-2" />
                  <p className="font-bold text-white text-sm">Map Loading Failed</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                    The interactive map could not be loaded. Please check your internet connection or ad-blocker.
                  </p>
                </div>
              }
            >
              <LeafletMap
                centerLat={Number(form.lat)}
                centerLng={Number(form.lng)}
                zoom={11}
                onMapClick={(clickedLat, clickedLng) => {
                  setForm((prev) => ({
                    ...prev,
                    lat: clickedLat,
                    lng: clickedLng,
                  }))
                }}
                markers={[
                  {
                    id: 'supplier_store',
                    lat: Number(form.lat),
                    lng: Number(form.lng),
                    title: form.businessName || 'Store Location',
                    color: 'blue',
                  },
                ]}
                markerDraggableId="supplier_store"
                onMarkerDragEnd={(_, newLat, newLng) => {
                  setForm((prev) => ({
                    ...prev,
                    lat: newLat,
                    lng: newLng,
                  }))
                }}
                accuracyCircleCenter={{ lat: Number(form.lat), lng: Number(form.lng) }}
                accuracyCircleRadius={Number(form.serviceRadiusKm) * 1000}
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
