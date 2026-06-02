import { useState } from 'react'
import { Bolt, Droplets, Wind, MapPin, Check, AlertCircle, Loader2, ChevronRight, ChevronLeft, Calendar as CalendarIcon, Clock, Bell } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { z } from 'zod'
import jobService from '../../services/job.service'
import { useGeolocation } from '../../hooks/useGeolocation'
import { useAuthStore } from '../../store/authStore'

const serviceConfig = {
  Electrician: { icon: Bolt, color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20', glow: 'shadow-[0_0_20px_rgba(250,204,21,0.1)]', desc: 'Wiring, panels, outlets, repairs' },
  Plumber: { icon: Droplets, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20', glow: 'shadow-[0_0_20px_rgba(96,165,250,0.1)]', desc: 'Leaks, pipes, drainage, fixtures' },
  'AC Repair': { icon: Wind, color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/20', glow: 'shadow-[0_0_20px_rgba(34,211,238,0.1)]', desc: 'Cooling, servicing, gas refill' },
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

// Generate calendar dates starting from tomorrow up to 3 months from now
const getCalendarDates = () => {
  const dates = []
  const start = new Date()
  start.setDate(start.getDate() + 1) // Min date: tomorrow
  const end = new Date()
  end.setMonth(end.getMonth() + 3) // Max date: 3 months

  let curr = new Date(start)
  while (curr <= end) {
    dates.push(new Date(curr))
    curr.setDate(curr.getDate() + 1)
  }
  return dates
}

// Generate time slots: 8:00 AM to 8:00 PM (12 hours) in 30-min increments
const getTimeSlots = () => {
  const slots = []
  let hour = 8
  let min = 0
  while (hour < 20 || (hour === 20 && min === 0)) {
    const hh = hour.toString().padStart(2, '0')
    const mm = min.toString().padStart(2, '0')
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
    slots.push({
      value: `${hh}:${mm}`,
      label: `${displayHour}:${mm} ${ampm}`,
      hour,
      min,
    })
    min += 30
    if (min === 60) {
      min = 0
      hour += 1
    }
  }
  return slots
}

export default function ScheduleBookingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [serviceType, setServiceType] = useState<keyof typeof serviceConfig>('Electrician')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<{ value: string; label: string } | null>(null)
  const [description, setDescription] = useState('')
  const [sendReminder, setSendReminder] = useState(true)
  
  const { lat, lng, address, detect, loading, error, setAddress } = useGeolocation(false)
  const user = useAuthStore((s) => s.user)
  const [formError, setFormError] = useState<string | null>(null)

  const scheduleMutation = useMutation({
    mutationFn: jobService.scheduleJob,
    onSuccess: (job) => {
      toast.success(`Booking scheduled for ${selectedDate?.toLocaleDateString()} at ${selectedTime?.label}!`)
      navigate('/customer/scheduled-jobs')
    },
    onError: (err: any) => {
      setFormError(err?.message ?? 'Failed to schedule booking')
    },
  })

  // Date lists
  const dates = getCalendarDates()
  const timeSlots = getTimeSlots()

  // Format date helper
  const formatDateFull = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const handleNext = () => {
    setFormError(null)

    if (step === 1) {
      setStep(2)
      return
    }

    if (step === 2) {
      if (!selectedDate || !selectedTime) {
        setFormError('Please select both a date and time slot')
        return
      }

      // Validate selected datetime must be >= now() + 2 hours
      const scheduledDateTime = new Date(selectedDate)
      const [h, m] = selectedTime.value.split(':').map(Number)
      scheduledDateTime.setHours(h, m, 0, 0)

      const twoHoursFromNow = new Date()
      twoHoursFromNow.setHours(twoHoursFromNow.getHours() + 2)

      if (scheduledDateTime < twoHoursFromNow) {
        setFormError('Please select a time at least 2 hours from now')
        return
      }

      setStep(3)
      return
    }

    if (step === 3) {
      if (description.trim().length < 20) {
        setFormError('Description must be at least 20 characters')
        return
      }
      setStep(4)
      return
    }

    // Submit Step 4
    if (!user?.id) {
      setFormError('You must be logged in')
      return
    }

    const scheduledDateTime = new Date(selectedDate!)
    const [h, m] = selectedTime!.value.split(':').map(Number)
    scheduledDateTime.setHours(h, m, 0, 0)

    scheduleMutation.mutate({
      serviceType,
      description,
      scheduledAt: scheduledDateTime.toISOString(),
      lat: lat ?? 11.02,
      lng: lng ?? 76.12,
    })
  }

  const stepLabels = ['Service', 'Schedule', 'Location', 'Confirm']

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Advance Booking</p>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <CalendarIcon size={20} className="text-sky-400" />
            Schedule a Service
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

        {/* Error notification */}
        {formError && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 flex items-center gap-3 text-sm text-red-400">
            <AlertCircle size={16} className="shrink-0" />
            {formError}
          </div>
        )}

        {/* STEP 1: Service Selection */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white mb-4">Select service to schedule</h2>
            <div className="grid gap-4">
              {(Object.keys(serviceConfig) as Array<keyof typeof serviceConfig>).map((type) => {
                const cfg = serviceConfig[type]
                const Icon = cfg.icon
                const isSelected = serviceType === type
                return (
                  <button
                    key={type}
                    onClick={() => { setServiceType(type); setStep(2) }}
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

        {/* STEP 2: Date & Time selection */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white mb-3">Select Date</h2>
              {/* Horizontal scroll dates */}
              <div className="flex gap-2.5 overflow-x-auto pb-3 scrollbar-thin">
                {dates.map((d) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6
                  const isSelected = selectedDate?.toDateString() === d.toDateString()
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      onClick={() => { setSelectedDate(d); setFormError(null) }}
                      className={`flex flex-col items-center p-3.5 min-w-[76px] rounded-xl border-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-sky-500/15 border-sky-500 text-sky-400'
                          : isWeekend
                          ? 'bg-slate-900/20 border-slate-900 text-rose-400/90 hover:border-slate-800'
                          : 'bg-slate-900/40 border-slate-900 text-slate-300 hover:border-slate-800'
                      }`}
                    >
                      <span className="text-[10px] uppercase font-mono tracking-wider">
                        {d.toLocaleDateString('en', { weekday: 'short' })}
                      </span>
                      <span className="text-lg font-black mt-1">
                        {d.getDate()}
                      </span>
                      <span className="text-[9px] uppercase font-mono opacity-60">
                        {d.toLocaleDateString('en', { month: 'short' })}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {selectedDate && (
              <div className="animate-slide-up">
                <h2 className="text-lg font-bold text-white mb-3">Select Time Slot</h2>
                <div className="grid grid-cols-4 gap-2">
                  {timeSlots.map((slot) => {
                    const isSelected = selectedTime?.value === slot.value
                    
                    // Validate if slot is too soon (datetime < now + 2 hours)
                    const slotDateTime = new Date(selectedDate)
                    slotDateTime.setHours(slot.hour, slot.min, 0, 0)
                    const limitTime = new Date()
                    limitTime.setHours(limitTime.getHours() + 2)
                    const isDisabled = slotDateTime < limitTime

                    return (
                      <button
                        key={slot.value}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setSelectedTime(slot)}
                        className={`py-2 px-1 text-center text-xs font-mono font-bold rounded-lg border-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-sky-500/15 border-sky-500 text-sky-400'
                            : isDisabled
                            ? 'border-slate-950 bg-slate-950 text-slate-700 cursor-not-allowed opacity-40'
                            : 'border-slate-900 bg-slate-900/40 text-slate-300 hover:border-slate-800'
                        }`}
                      >
                        {slot.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Details & Location */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-white">Describe the issue & select location</h2>

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
                rows={4}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 resize-none transition-colors"
                placeholder="Explain the problem clearly (e.g., 'Flickering ceiling light fixture in living room since yesterday...')"
              />
              {description.length < 20 && description.length > 0 && (
                <p className="text-[10px] text-red-400 font-mono">Minimum 20 characters required</p>
              )}
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Service Location</label>
              
              <button
                type="button"
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
                  <p className="text-xs text-slate-500">Detect current coordinates</p>
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

              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                placeholder="Or enter address manually..."
              />
            </div>
          </div>
        )}

        {/* STEP 4: Confirm */}
        {step === 4 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-white">Review & Confirm</h2>

            <div className="rounded-2xl border border-slate-900 bg-slate-900/60 divide-y divide-slate-900/80">
              <div className="flex items-center gap-4 p-5">
                <div className="w-12 h-12 rounded-xl bg-slate-850 flex items-center justify-center border border-slate-800 text-sky-400">
                  {serviceType === 'Electrician' && <Bolt size={22} />}
                  {serviceType === 'Plumber' && <Droplets size={22} />}
                  {serviceType === 'AC Repair' && <Wind size={22} />}
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Service</p>
                  <p className="text-base font-black text-white">{serviceType}</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-5">
                <CalendarIcon size={20} className="text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Date</p>
                  <p className="text-sm font-semibold text-white mt-0.5">{formatDateFull(selectedDate!)}</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-5">
                <Clock size={20} className="text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Time</p>
                  <p className="text-sm font-semibold text-white mt-0.5">{selectedTime?.label}</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-5">
                <MapPin size={20} className="text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Location</p>
                  <p className="text-sm font-semibold text-white mt-0.5">
                    {address || `${lat?.toFixed(4)}, ${lng?.toFixed(4)}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Reminder Toggle */}
            <div className="flex items-center justify-between p-5 rounded-2xl border border-slate-900 bg-slate-900/60">
              <div className="flex items-center gap-3">
                <Bell size={20} className="text-slate-400" />
                <div>
                  <p className="text-sm font-bold text-white">Send Reminder</p>
                  <p className="text-xs text-slate-500 mt-0.5">Notify me 15 minutes before slot starts</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSendReminder(!sendReminder)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  sendReminder ? 'bg-sky-500' : 'bg-slate-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    sendReminder ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-3 mt-8">
          {step > 1 && (
            <button
              onClick={() => { setFormError(null); setStep((s) => s - 1) }}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-800 text-slate-400 text-sm font-semibold hover:border-slate-700 hover:text-slate-200 transition-all duration-200 cursor-pointer"
            >
              <ChevronLeft size={16} /> Back
            </button>
          )}
          
          <button
            onClick={handleNext}
            disabled={scheduleMutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-sky-500 text-white hover:bg-sky-600 text-sm font-bold transition-all duration-200 disabled:opacity-60 cursor-pointer"
          >
            {scheduleMutation.isPending ? (
              <><Loader2 size={16} className="animate-spin" /> Scheduling...</>
            ) : step < 4 ? (
              <>Next <ChevronRight size={16} /></>
            ) : (
              <>Confirm Booking <Check size={16} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
