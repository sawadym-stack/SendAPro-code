import { useState } from 'react'
import { Bolt, Droplets, Wind, MapPin, Check, AlertCircle, Loader2, ChevronRight, ChevronLeft, ClipboardList } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createJobSchema, serviceTypes } from '../../validations/job.schema'
import jobService from '../../services/job.service'
import { useGeolocation } from '../../hooks/useGeolocation'
import { useAuthStore } from '../../store/authStore'

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
  const [step, setStep] = useState(1)
  const [serviceType, setServiceType] = useState<(typeof serviceTypes)[number]>('Electrician')
  const [description, setDescription] = useState('')
  const [urgency, setUrgency] = useState<'Normal' | 'High'>('Normal')
  const [toast, setToast] = useState<string | null>(null)
  const { lat, lng, address, detect, loading, error, setAddress } = useGeolocation(false)
  const user = useAuthStore((s) => s.user)

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

        {/* Step progress */}
        <div className="flex items-center gap-2 mb-8">
          {stepLabels.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <StepDot n={i + 1} current={step} />
                <span className={`text-[9px] font-mono uppercase tracking-wider ${step === i + 1 ? 'text-sky-400' : step > i + 1 ? 'text-sky-600' : 'text-slate-700'}`}>{label}</span>
              </div>
              {i < stepLabels.length - 1 && (
                <div className={`flex-1 h-px mb-4 transition-all duration-500 ${step > i + 1 ? 'bg-sky-500' : 'bg-slate-900'}`} />
              )}
            </div>
          ))}
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
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 resize-none transition-colors"
                placeholder="Describe the problem clearly (e.g., 'Water leak under kitchen sink, dripping for 2 days...')"
              />
              {description.length < 20 && description.length > 0 && (
                <p className="text-[10px] text-red-400 font-mono">Minimum 20 characters required</p>
              )}
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

            <button
              onClick={detect}
              disabled={loading}
              className="w-full flex items-center gap-3 p-5 rounded-2xl border border-sky-500/20 bg-sky-500/5 hover:bg-sky-500/10 transition-all duration-200 group disabled:opacity-60"
            >
              {loading ? (
                <Loader2 size={20} className="text-sky-400 animate-spin shrink-0" />
              ) : (
                <MapPin size={20} className="text-sky-400 shrink-0 group-hover:scale-110 transition-transform" />
              )}
              <div className="text-left">
                <p className="text-sm font-bold text-sky-400">{loading ? 'Detecting GPS...' : 'Use My Location'}</p>
                <p className="text-xs text-slate-500">Auto-detect via browser GPS</p>
              </div>
            </button>

            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{error}</div>
            )}

            {lat && lng && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                <Check size={14} />
                GPS locked: {lat.toFixed(4)}, {lng.toFixed(4)}
              </div>
            )}

            <div className="rounded-2xl border border-slate-900 bg-slate-900/60 p-5 space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Or enter address manually</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                placeholder="e.g. 14 Marine Drive, Kozhikode"
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
                { label: 'Location', value: lat ? `${lat.toFixed(4)}, ${lng?.toFixed(4)}` : (address || 'Kozhikode area (fallback)'), edit: 3 },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-0.5">{row.label}</p>
                    <p className="text-sm font-semibold text-white">{row.value}</p>
                  </div>
                  <button
                    onClick={() => { setToast(null); setStep(row.edit) }}
                    className="text-[10px] text-sky-400 font-bold uppercase tracking-wider hover:text-sky-300 transition-colors"
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
