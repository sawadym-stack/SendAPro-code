import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Calendar as CalendarIcon, Clock, MapPin, Loader2, ArrowRight, XCircle, AlertTriangle, RefreshCw, Check } from 'lucide-react'
import { toast } from 'react-hot-toast'
import jobService from '../../services/job.service'
import { QUERY_KEYS } from '../../constants/queryKeys'
import type { Job } from '../../types'

// Generate calendar dates starting from tomorrow up to 3 months from now
const getCalendarDates = () => {
  const dates = []
  const start = new Date()
  start.setDate(start.getDate() + 1)
  const end = new Date()
  end.setMonth(end.getMonth() + 3)

  let curr = new Date(start)
  while (curr <= end) {
    dates.push(new Date(curr))
    curr.setDate(curr.getDate() + 1)
  }
  return dates
}

// Generate time slots: 8:00 AM to 8:00 PM in 30-min increments
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

export default function ScheduledJobsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [reschedulingJob, setReschedulingJob] = useState<Job | null>(null)
  const [newDate, setNewDate] = useState<Date | null>(null)
  const [newTime, setNewTime] = useState<{ value: string; label: string } | null>(null)

  const { data: jobs = [], isLoading, refetch } = useQuery({
    queryKey: QUERY_KEYS.scheduledJobs,
    queryFn: jobService.listScheduledJobs,
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => jobService.cancelScheduledJob(id),
    onSuccess: () => {
      toast.success('Booking cancelled successfully')
      refetch()
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Failed to cancel booking')
    },
  })

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      jobService.rescheduleJob(id, scheduledAt),
    onSuccess: () => {
      toast.success('Booking rescheduled successfully')
      setReschedulingJob(null)
      refetch()
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Failed to reschedule booking')
    },
  })

  const handleCancel = (job: Job) => {
    if (!window.confirm('Cancel this booking?')) return
    cancelMutation.mutate(job.id)
  }

  const handleRescheduleSubmit = () => {
    if (!reschedulingJob || !newDate || !newTime) return
    const scheduledDateTime = new Date(newDate)
    const [h, m] = newTime.value.split(':').map(Number)
    scheduledDateTime.setHours(h, m, 0, 0)

    rescheduleMutation.mutate({
      id: reschedulingJob.id,
      scheduledAt: scheduledDateTime.toISOString(),
    })
  }

  // Time indicator logic
  const getTimeIndicator = (scheduledAtStr: string) => {
    const scheduled = new Date(scheduledAtStr)
    const now = new Date()

    const diffMs = scheduled.getTime() - now.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)

    const isSameDay = scheduled.toDateString() === now.toDateString()
    const isTomorrow =
      new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString() ===
      scheduled.toDateString()

    const timeStr = scheduled.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })

    if (isSameDay) {
      if (diffHours <= 2) {
        return `Starting in ${Math.ceil(diffHours * 60)} minutes`
      }
      return `Today at ${timeStr}`
    }

    if (isTomorrow) {
      return `Tomorrow at ${timeStr}`
    }

    if (diffHours < 48) {
      return `In 1 day — ${scheduled.toLocaleDateString('en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })} at ${timeStr}`
    }

    const daysLeft = Math.ceil(diffHours / 24)
    return `In ${daysLeft} days — ${scheduled.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })} at ${timeStr}`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center gap-3 text-slate-400">
        <Loader2 size={20} className="animate-spin text-sky-500" />
        <span className="text-sm font-mono">Loading scheduled bookings...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative pb-12">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Advance Bookings</p>
            <h1 className="text-2xl font-black text-white tracking-tight">Upcoming Bookings</h1>
          </div>
          <button
            onClick={() => navigate('/customer/schedule')}
            className="px-5 py-2.5 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl text-sm flex items-center gap-2 cursor-pointer transition-colors"
          >
            Schedule a Service <ArrowRight size={16} />
          </button>
        </div>

        {/* List */}
        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-12 text-center max-w-md mx-auto mt-12 space-y-4">
            <CalendarIcon size={44} className="text-slate-600 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">No upcoming bookings</h3>
              <p className="text-xs text-slate-500">Need plumbing, electrical, or AC servicing? Book in advance!</p>
            </div>
            <button
              onClick={() => navigate('/customer/schedule')}
              className="w-full py-3 bg-slate-900 border border-slate-800 hover:border-sky-500/30 text-sky-400 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              Schedule a Service
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => {
              const scheduledDate = new Date(job.createdAt) // Wait, use scheduledAt if present
              const scheduledTime = job.createdAt // Wait, is scheduledAt mapped? Yes, job.createdAt is string, let's verify if `job.scheduledAt` is available.
              const timeToUse = job.createdAt // Fallback
              const actualScheduledTime = (job as any).scheduledAt || timeToUse
              const sDate = new Date(actualScheduledTime)

              const timeDiffHours = (sDate.getTime() - Date.now()) / (1000 * 60 * 60)
              const canReschedule = timeDiffHours > 24
              const canCancel = timeDiffHours > 1

              return (
                <div
                  key={job.id}
                  className="rounded-2xl border border-slate-900 bg-slate-900/60 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-slate-800 transition-all"
                >
                  {/* Left: Date column */}
                  <div className="flex md:flex-col items-center justify-center shrink-0 min-w-[70px] bg-slate-950 p-3 rounded-xl border border-slate-900 text-center gap-2 md:gap-0">
                    <span className="text-2xl font-black text-sky-400">{sDate.getDate()}</span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mt-0.5">
                      {sDate.toLocaleDateString('en', { month: 'short' })}
                    </span>
                  </div>

                  {/* Center: Details */}
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                        {job.serviceType}
                      </span>
                      <span className="text-xs text-amber-400 font-mono font-bold">
                        {getTimeIndicator(actualScheduledTime)}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-slate-300">{job.description}</p>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Clock size={12} />
                        {sDate.toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin size={12} className="shrink-0" />
                        <span className="truncate max-w-[250px]">{job.address || 'Address not resolved'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-row md:flex-col gap-2 w-full md:w-auto self-stretch justify-end items-center md:items-stretch">
                    {!canCancel && (
                      <span className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-1">
                        <AlertTriangle size={12} /> Starting soon
                      </span>
                    )}

                    <div className="flex items-center gap-2 w-full justify-end">
                      {canReschedule && (
                        <button
                          type="button"
                          onClick={() => {
                            setReschedulingJob(job)
                            setNewDate(null)
                            setNewTime(null)
                          }}
                          className="px-3 py-2 bg-slate-900 border border-slate-800 hover:border-sky-500/30 text-sky-400 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <RefreshCw size={12} /> Reschedule
                        </button>
                      )}

                      {canCancel && (
                        <button
                          type="button"
                          onClick={() => handleCancel(job)}
                          disabled={cancelMutation.isPending}
                          className="px-3 py-2 bg-slate-900 border border-slate-850 hover:border-red-500/30 text-red-400 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <XCircle size={12} /> Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Reschedule Picker Modal */}
      {reschedulingJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-black text-white">Reschedule Booking</h3>
                <p className="text-xs text-slate-400">Select a new date and time slot</p>
              </div>
              <button
                type="button"
                onClick={() => setReschedulingJob(null)}
                className="p-1 bg-slate-950/60 rounded-full text-slate-500 hover:text-white transition-colors"
              >
                <XCircle size={18} />
              </button>
            </div>

            {/* Date Picker */}
            <div className="space-y-3 mb-6">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select New Date</h4>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {getCalendarDates().map((d) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6
                  const isSelected = newDate?.toDateString() === d.toDateString()
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      onClick={() => setNewDate(d)}
                      className={`flex flex-col items-center p-2.5 min-w-[64px] rounded-lg border-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-sky-500/15 border-sky-500 text-sky-400'
                          : isWeekend
                          ? 'bg-slate-950 border-slate-950 text-rose-400 hover:border-slate-800'
                          : 'bg-slate-950 border-slate-950 text-slate-300 hover:border-slate-800'
                      }`}
                    >
                      <span className="text-[9px] uppercase font-mono">{d.toLocaleDateString('en', { weekday: 'short' })}</span>
                      <span className="text-sm font-black mt-0.5">{d.getDate()}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Time Slot Picker */}
            {newDate && (
              <div className="space-y-3 mb-6 animate-slide-up">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select New Time Slot</h4>
                <div className="grid grid-cols-4 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {getTimeSlots().map((slot) => {
                    const isSelected = newTime?.value === slot.value
                    
                    // Validate if slot is too soon
                    const slotDateTime = new Date(newDate)
                    slotDateTime.setHours(slot.hour, slot.min, 0, 0)
                    const limitTime = new Date()
                    limitTime.setHours(limitTime.getHours() + 2)
                    const isDisabled = slotDateTime < limitTime

                    return (
                      <button
                        key={slot.value}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setNewTime(slot)}
                        className={`py-1.5 text-center text-[10px] font-mono font-bold rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-sky-500/15 border-sky-500 text-sky-400'
                            : isDisabled
                            ? 'border-slate-950 bg-slate-950 text-slate-800 cursor-not-allowed opacity-30'
                            : 'border-slate-950 bg-slate-950 text-slate-400 hover:border-slate-800'
                        }`}
                      >
                        {slot.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReschedulingJob(null)}
                className="flex-1 py-2.5 bg-slate-850 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newDate || !newTime || rescheduleMutation.isPending}
                onClick={handleRescheduleSubmit}
                className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-800 text-white disabled:text-slate-500 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {rescheduleMutation.isPending ? (
                  <><Loader2 size={12} className="animate-spin" /> Updating...</>
                ) : (
                  <><Check size={12} /> Confirm</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
