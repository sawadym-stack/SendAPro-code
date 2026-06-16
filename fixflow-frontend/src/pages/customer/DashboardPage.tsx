import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ClipboardPlus, Siren, MapPin, Clock, Zap, Droplet, Wind, CheckCircle2, CircleDot, Loader2, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import jobService from '../../services/job.service'
import paymentService from '../../services/payment.service'
import { QUERY_KEYS } from '../../constants/queryKeys'
import { JobStatus } from '../../types'
import { formatDate, formatCurrency } from '../../utils/formatters'
import { useAuthStore } from '../../store/authStore'

const serviceIconMap: Record<string, React.ReactNode> = {
  Electrician: <Zap size={14} className="text-yellow-400" />,
  electrical: <Zap size={14} className="text-yellow-400" />,
  Plumber: <Droplet size={14} className="text-blue-400" />,
  plumbing: <Droplet size={14} className="text-blue-400" />,
  'AC Repair': <Wind size={14} className="text-cyan-400" />,
  ac_repair: <Wind size={14} className="text-cyan-400" />,
}

const statusConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  [JobStatus.Requested]: { label: 'Pending', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-400' },
  [JobStatus.Accepted]: { label: 'Accepted', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20', dot: 'bg-sky-400' },
  [JobStatus.OnTheWay]: { label: 'On The Way', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', dot: 'bg-blue-400 animate-pulse' },
  [JobStatus.Arrived]: { label: 'Arrived', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20', dot: 'bg-violet-400' },
  [JobStatus.Working]: { label: 'In Progress', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-400 animate-pulse' },
  [JobStatus.Completed]: { label: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  [JobStatus.Cancelled]: { label: 'Cancelled', color: 'text-slate-500', bg: 'bg-slate-800/60 border-slate-700/30', dot: 'bg-slate-600' },
}

const DashboardPage = () => {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [showStats, setShowStats] = useState(false)

  const { data: statsData, isLoading: isLoadingStats } = useQuery({
    queryKey: ['customer-stats'],
    queryFn: () => jobService.getCustomerStats(),
  })

  const { data: jobsData, isLoading: isLoadingJobs } = useQuery({
    queryKey: QUERY_KEYS.recentJobs,
    queryFn: () => jobService.listJobs({ page: 1, limit: 10 }),
  })

  const { data: paymentData } = useQuery({
    queryKey: ['customer-payments-dashboard'],
    queryFn: () => paymentService.getHistory({ page: 1, limit: 20 }),
  })

  const jobs = jobsData?.jobs ?? []
  const activeJobs = jobs.filter((j) => ![JobStatus.Completed, JobStatus.Cancelled].includes(j.status))
  const hasActive = (statsData?.activeJobs ?? 0) > 0

  const pendingPayments = paymentData?.payments?.filter((p) => p.status === 'Pending') ?? []
  const hasPendingPayments = (statsData?.pendingPayments ?? 0) > 0
  const totalPendingAmount = pendingPayments.reduce((acc, p) => acc + p.amount, 0)

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative">
      {/* Top ambient glow */}
      <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none" />
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-sky-500/5 blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 pb-24">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-6">
          <div>
            <p className="text-xs font-mono text-sky-400 uppercase tracking-widest mb-1">{greeting()}</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Welcome back, {user?.name?.split(' ')[0] ?? 'Customer'}
            </h1>
            <p className="text-sm text-slate-400 mt-1">Track and book field service providers in real-time</p>
          </div>
        </div>

        {/* Primary Action Buttons Callout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Emergency Booking Card */}
          <button
            onClick={() => navigate('/customer/emergency')}
            className="group relative overflow-hidden p-6 rounded-3xl border border-red-500/30 bg-gradient-to-br from-red-950/20 via-red-900/5 to-slate-950 text-left hover:border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.05)] transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-red-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500" />
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-red-550/10 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <Siren size={24} className="animate-pulse" />
              </div>
              <div>
                <h3 className="text-md font-black text-white uppercase tracking-wide">🚨 Emergency Dispatch</h3>
                <p className="text-[10px] text-red-400/80 font-bold uppercase tracking-wider mt-0.5">Instant Priority Response</p>
                <p className="text-xs text-slate-400 mt-1">For urgent emergencies requiring immediate technician dispatch.</p>
              </div>
            </div>
          </button>

          {/* Standard Service Booking Card */}
          <button
            onClick={() => navigate('/customer/request')}
            className="group relative overflow-hidden p-6 rounded-3xl border border-sky-500/30 bg-gradient-to-br from-sky-950/20 via-sky-900/5 to-slate-950 text-left hover:border-sky-500/60 shadow-[0_0_30px_rgba(14,165,233,0.05)] transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500" />
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-sky-550/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                <ClipboardPlus size={24} />
              </div>
              <div>
                <h3 className="text-md font-black text-white uppercase tracking-wide">📅 Request a Service</h3>
                <p className="text-[10px] text-sky-400/80 font-bold uppercase tracking-wider mt-0.5">Book Plumbers, Electricians & ACs</p>
                <p className="text-xs text-slate-400 mt-1">Regular service booking with step-by-step assistant options.</p>
              </div>
            </div>
          </button>
        </div>

        {/* Quick Booking Categories */}
        <div className="space-y-4">
          <h2 className="text-xs font-black text-slate-550 uppercase tracking-widest font-mono">
            Quick Booking Categories
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => navigate('/customer/request?service=Electrician')}
              className="group p-5 rounded-2xl border border-slate-900 bg-slate-900/30 hover:bg-slate-900/60 hover:border-yellow-500/30 text-left transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400 shrink-0">
                <Zap size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white group-hover:text-yellow-450 transition-colors">Electrician</h3>
                <p className="text-[10px] text-slate-455 mt-0.5">Wiring, switches, lights, repairs</p>
              </div>
            </button>
            <button
              onClick={() => navigate('/customer/request?service=Plumber')}
              className="group p-5 rounded-2xl border border-slate-900 bg-slate-900/30 hover:bg-slate-900/60 hover:border-blue-500/30 text-left transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                <Droplet size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white group-hover:text-blue-450 transition-colors">Plumber</h3>
                <p className="text-[10px] text-slate-455 mt-0.5">Leaks, pipes, drainage, taps</p>
              </div>
            </button>
            <button
              onClick={() => navigate('/customer/request?service=AC%20Repair')}
              className="group p-5 rounded-2xl border border-slate-900 bg-slate-900/30 hover:bg-slate-900/60 hover:border-cyan-500/30 text-left transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                <Wind size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white group-hover:text-cyan-455 transition-colors">AC & Cooling</h3>
                <p className="text-[10px] text-slate-455 mt-0.5">AC servicing, cooling repairs</p>
              </div>
            </button>
          </div>
        </div>

        {/* Pending Payments Alert */}
        {hasPendingPayments && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 backdrop-blur shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-500 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-500 mb-0.5 font-display">
                  Outstanding Payment Invoice
                </h3>
                <p className="text-xs text-slate-450">
                  You have {pendingPayments.length} unpaid invoice{pendingPayments.length > 1 ? 's' : ''} totaling <span className="text-amber-400 font-bold font-mono">Rs. {totalPendingAmount.toFixed(2)}</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (pendingPayments.length === 1) {
                  navigate(`/customer/payment/${pendingPayments[0].jobId}`)
                } else {
                  navigate('/customer/payments')
                }
              }}
              className="flex items-center gap-1 bg-amber-500 text-slate-950 font-black text-xs uppercase px-4 py-2 rounded-xl hover:bg-amber-400 transition-colors shrink-0 shadow cursor-pointer border-none"
            >
              Pay Invoice <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Active Job Alert */}
        {hasActive && (
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5 flex items-center justify-between gap-4 backdrop-blur">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                <CircleDot size={18} className="text-sky-400 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-sky-400 mb-0.5">
                  Active Appointment Status
                </h3>
                <p className="text-xs text-slate-400 truncate font-semibold">
                  {activeJobs[0]?.serviceType ?? 'Service'} — {statusConfig[activeJobs[0]?.status]?.label ?? 'Processing'}
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate(`/customer/track/${activeJobs[0]?.id}`)}
              className="flex items-center gap-1 bg-sky-500/15 border border-sky-500/30 text-sky-400 font-extrabold text-xs uppercase px-4 py-2 rounded-xl hover:bg-sky-500/20 transition-all shrink-0 cursor-pointer"
            >
              Track Job <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Job Feed */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black text-slate-550 uppercase tracking-widest font-mono">
              My Service History
            </h2>
            <button
              onClick={() => navigate('/customer/jobs')}
              className="text-xs text-sky-400 font-bold hover:text-sky-300 transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-none"
            >
              See All Bookings <ChevronRight size={14} />
            </button>
          </div>

          {isLoadingJobs && (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
              <Loader2 size={20} className="animate-spin text-sky-500" />
              <span className="text-sm font-mono">Loading service history...</span>
            </div>
          )}

          {!isLoadingJobs && jobs.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-900 bg-slate-950/40 py-16 px-6 text-center">
              <div className="w-14 h-14 rounded-full border border-slate-800 flex items-center justify-center mx-auto mb-4 text-2xl">
                📋
              </div>
              <h3 className="text-base font-bold text-slate-400 mb-1">No service history yet</h3>
              <p className="text-sm text-slate-600 mb-6 max-w-xs mx-auto">
                Book your first service and get matched with a skilled technician in minutes.
              </p>
              <button
                onClick={() => navigate('/customer/request')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-bold hover:bg-sky-500/20 transition-all duration-200 cursor-pointer border-none"
              >
                <ClipboardPlus size={16} />
                Request a Service
              </button>
            </div>
          )}

          {!isLoadingJobs && jobs.length > 0 && (
            <div className="space-y-3">
              {jobs.slice(0, 8).map((job) => {
                const sc = statusConfig[job.status] ?? statusConfig[JobStatus.Requested]
                const ServiceIcon = serviceIconMap[job.serviceType ?? ''] ?? <ClipboardPlus size={14} className="text-slate-400" />
                return (
                  <button
                    key={job.id}
                    onClick={() => navigate(`/customer/track/${job.id}`)}
                    className="w-full text-left rounded-2xl border border-slate-900 bg-slate-900/30 hover:bg-slate-900/60 hover:border-slate-800 p-4 transition-all duration-200 group flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Service icon pill */}
                      <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-850 flex items-center justify-center shrink-0">
                        {ServiceIcon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-sm font-bold text-white truncate">
                            {job.serviceType ?? 'Service Request'}
                          </h3>
                          {job.urgency === 'Emergency' && (
                            <span className="text-[9px] font-black uppercase tracking-wider text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-1.5 py-0.5">
                              SOS
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 text-[10px] text-slate-500 font-mono">
                          <span className="flex items-center gap-1">
                            <Clock size={10} className="text-slate-600" />
                            {formatDate(job.createdAt)}
                          </span>
                          {job.address && (
                            <span className="flex items-center gap-1 truncate max-w-xs">
                              <MapPin size={10} className="text-slate-600" />
                              {job.address}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Status badge */}
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${sc.bg} ${sc.color}`}>
                        <span className={`w-1 h-1 rounded-full ${sc.dot}`} />
                        {sc.label}
                      </span>
                      {job.status === JobStatus.Completed && (
                        <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                      )}
                      <ChevronRight size={15} className="text-slate-700 group-hover:text-slate-400 transition-colors shrink-0" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Collapsible Stats Section */}
        <div className="rounded-2xl border border-slate-900 bg-slate-900/25 overflow-hidden">
          <button
            onClick={() => setShowStats(!showStats)}
            className="w-full flex items-center justify-between px-6 py-4 text-xs font-bold font-mono text-slate-550 hover:bg-slate-900/40 hover:text-white transition-colors cursor-pointer border-none bg-transparent"
          >
            <span>📊 {showStats ? 'HIDE' : 'SHOW'} MY ACTIVITY STATISTICS</span>
            <span>{showStats ? '▲' : '▼'}</span>
          </button>
          
          {showStats && (
            <div className="p-6 border-t border-slate-900 bg-slate-950/20 grid grid-cols-2 lg:grid-cols-4 gap-4 animate-slide-down">
              {[
                { label: 'Active Jobs', value: statsData?.activeJobs ?? 0, accent: 'text-sky-400', border: 'border-sky-500/15', bg: 'bg-sky-500/5' },
                { label: 'Jobs Completed', value: statsData?.completedJobs ?? 0, accent: 'text-emerald-400', border: 'border-emerald-500/15', bg: 'bg-emerald-500/5' },
                { label: 'Total Amount Spent', value: formatCurrency(statsData?.totalSpent ?? 0), accent: 'text-violet-400', border: 'border-violet-500/15', bg: 'bg-violet-500/5' },
                { label: 'Total Service Bookings', value: `${statsData?.totalJobs ?? 0} jobs`, accent: 'text-amber-400', border: 'border-amber-500/15', bg: 'bg-amber-500/5' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className={`rounded-2xl border ${stat.border} ${stat.bg} p-5 hover:bg-slate-900/40 transition-all duration-300`}
                >
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1.5">{stat.label}</p>
                  <p className={`text-xl font-black ${stat.accent}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            onClick={() => navigate('/customer/nearby-technicians')}
            className="group p-5 rounded-2xl border border-slate-900 bg-slate-900/30 hover:bg-slate-900/60 hover:border-sky-500/30 text-left transition-all duration-350 transform hover:-translate-y-0.5 cursor-pointer"
          >
            <MapPin size={22} className="text-sky-400 mb-3 group-hover:scale-110 transition-transform duration-350" />
            <h3 className="text-sm font-bold text-white mb-1">Nearby Technicians Map</h3>
            <p className="text-xs text-slate-450">Scan for active service specialists in your area</p>
          </button>
          <button
            onClick={() => navigate('/customer/suppliers')}
            className="group p-5 rounded-2xl border border-slate-900 bg-slate-900/30 hover:bg-slate-900/60 hover:border-violet-500/30 text-left transition-all duration-355 transform hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="text-xl mb-3 group-hover:scale-110 transition-transform duration-355">🏪</div>
            <h3 className="text-sm font-bold text-white mb-1">Browse Parts Suppliers</h3>
            <p className="text-xs text-slate-455">Browse and request quotations for materials</p>
          </button>
          <button
            onClick={() => navigate('/customer/payments')}
            className="group p-5 rounded-2xl border border-slate-900 bg-slate-900/30 hover:bg-slate-900/60 hover:border-emerald-500/30 text-left transition-all duration-355 transform hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="text-xl mb-3 group-hover:scale-110 transition-transform duration-355">💳</div>
            <h3 className="text-sm font-bold text-white mb-1">Payment History & Invoices</h3>
            <p className="text-xs text-slate-455">Manage billing details and view invoices</p>
          </button>
        </div>

      </div>
    </div>
  )
}

export default DashboardPage
