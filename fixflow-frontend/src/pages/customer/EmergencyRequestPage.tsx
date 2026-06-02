import { useState } from 'react'
import { Bolt, Droplets, Wind, ShieldAlert, MapPin, Loader2 } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useGeolocation } from '../../hooks/useGeolocation'
import jobService from '../../services/job.service'
import { useAuthStore } from '../../store/authStore'
import { serviceTypes } from '../../validations/job.schema'
import { Button, Card, Alert, PageHeader } from '../../components/ui'

const iconMap = { Electrician: Bolt, Plumber: Droplets, 'AC Repair': Wind } as const

const EmergencyRequestPage = () => {
  const navigate = useNavigate()
  const [serviceType, setServiceType] = useState<(typeof serviceTypes)[number]>('Electrician')
  const [description, setDescription] = useState('')
  const [errorToast, setErrorToast] = useState<string | null>(null)
  
  // High-accuracy geolocation
  const { lat, lng, address, loading } = useGeolocation(true)
  const user = useAuthStore((s) => s.user)

  const mutation = useMutation({
    mutationFn: jobService.createEmergency,
    onSuccess: (job) => {
      navigate(`/customer/track/${job.id}?emergency=true`)
    },
    onError: (err: any) => {
      setErrorToast(err.message || 'Failed to submit emergency dispatch request.')
    }
  })

  const handleSubmit = () => {
    if (!user?.id) {
      setErrorToast('You must be logged in to dispatch an emergency response.')
      return
    }

    setErrorToast(null)
    mutation.mutate({
      customerId: user.id,
      serviceType,
      description: description.trim() || `Emergency ${serviceType} Request`,
      lat: lat ?? 11.02,
      lng: lng ?? 76.12,
    })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(220,38,38,0.15),transparent_50%)] pointer-events-none" />
      
      <PageHeader 
        title="Emergency Dispatch" 
        subtitle="Request immediate roadside or home service dispatch" 
        className="border-b border-red-500/10 bg-slate-900/60 backdrop-blur"
      />

      <div className="container-base section-padding max-w-2xl mx-auto py-8 space-y-6 relative z-10">
        
        {/* Urgent Alert Banner */}
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-950/20 p-4 backdrop-blur-sm animate-[pulse_3s_infinite_ease-in-out]">
          <ShieldAlert className="h-8 w-8 text-red-500 shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">Priority SOS Response Active</h3>
            <p className="text-xs text-slate-300">
              Emergency requests dispatch nearby technicians with high priority. Idle fees may apply.
            </p>
          </div>
        </div>

        {errorToast && (
          <Alert variant="danger" title="Dispatch Error" className="bg-red-950/40 border-red-900/50 text-red-200">
            {errorToast}
          </Alert>
        )}

        {/* Location Status Card */}
        <Card className="bg-slate-900/80 border-slate-800 p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-md font-bold text-slate-300 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-red-500" />
              Dispatch Coordinates
            </h3>
            {loading ? (
              <span className="flex items-center gap-1.5 text-xs text-amber-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Detecting Location
              </span>
            ) : lat && lng ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                GPS Locked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400 border border-amber-500/20">
                Simulated Address
              </span>
            )}
          </div>
          
          <div className="rounded-lg bg-slate-950/60 border border-slate-800/80 p-3 text-sm font-mono text-slate-400 space-y-1.5">
            <div className="flex justify-between">
              <span>Latitude:</span>
              <span className="text-white">{lat ? lat.toFixed(6) : '11.020000 (Seeded Fallback)'}</span>
            </div>
            <div className="flex justify-between">
              <span>Longitude:</span>
              <span className="text-white">{lng ? lng.toFixed(6) : '76.120000 (Seeded Fallback)'}</span>
            </div>
            {address && (
              <div className="pt-1.5 border-t border-slate-800 mt-1.5 text-xs text-slate-300">
                {address}
              </div>
            )}
          </div>
        </Card>

        {/* Service Type Selection */}
        <Card className="bg-slate-900/80 border-slate-800 p-6 space-y-4 shadow-xl">
          <h3 className="text-md font-bold text-slate-300">Select Emergency Service</h3>
          
          <div className="grid grid-cols-3 gap-3">
            {serviceTypes.map((type) => {
              const Icon = iconMap[type]
              const isSelected = serviceType === type
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setServiceType(type)}
                  className={`p-4 rounded-xl border-2 transition-all duration-300 flex flex-col items-center gap-2 group ${
                    isSelected
                      ? 'border-red-500 bg-red-950/30 text-white shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <Icon 
                    size={28} 
                    className={`transition-transform duration-300 group-hover:scale-110 ${
                      isSelected ? 'text-red-500' : 'text-slate-500'
                    }`} 
                  />
                  <span className="text-xs font-bold uppercase tracking-wider">{type}</span>
                </button>
              )
            })}
          </div>
        </Card>

        {/* Detailed Issue description */}
        <Card className="bg-slate-900/80 border-slate-800 p-6 space-y-4 shadow-xl">
          <div className="flex justify-between items-center">
            <h3 className="text-md font-bold text-slate-300">Incident Details</h3>
            <span className="text-xs text-slate-500">{description.length}/300 chars</span>
          </div>
          
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 300))}
            className="w-full h-24 p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-red-500 transition-colors resize-none text-sm"
            placeholder="Briefly describe the emergency so the responder can prepare... (e.g. water leak flooding kitchen, short circuit in panel)"
          />
        </Card>

        {/* Pulsing SOS Button */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-rose-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse" />
          <Button
            onClick={handleSubmit}
            isLoading={mutation.isPending}
            fullWidth
            variant="danger"
            size="lg"
            className="relative bg-red-600 hover:bg-red-700 text-white font-black tracking-widest text-lg py-4 rounded-lg shadow-2xl transition duration-300"
          >
            🚨 DISPATCH EMERGENCY RESPONSE
          </Button>
        </div>
      </div>
    </div>
  )
}

export default EmergencyRequestPage


