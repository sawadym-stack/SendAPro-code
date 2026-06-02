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

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-1">{greeting()}</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {user?.name?.split(' ')[0] ?? 'Customer'} <span className="text-slate-600">·</span> Service Hub
            </h1>
            <p className="text-sm text-slate-500 mt-1">Track, manage and request field services in real-time</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/customer/emergency')}
              className="group flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-wider hover:bg-red-500/20 hover:border-red-500/40 transition-all duration-200 animate-pulse"
            >
              <Siren size={14} className="group-hover:scale-110 transition-transform" />
              Emergency
            </button>
            <button
              onClick={() => navigate('/customer/request')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-bold uppercase tracking-wider hover:bg-sky-500/20 hover:border-sky-500/40 transition-all duration-200"
            >
              <ClipboardPlus size={14} />
              Request
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
                  Outstanding Payment Warning
                </h3>
                <p className="text-xs text-slate-400">
                  You have {pendingPayments.length} unpaid service invoice{pendingPayments.length > 1 ? 's' : ''} totalling <span className="text-amber-400 font-semibold">Rs. {totalPendingAmount.toFixed(2)}</span>
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
              className="flex items-center gap-1 bg-amber-500 text-slate-950 font-black text-xs uppercase px-4 py-2 rounded-xl hover:bg-amber-400 transition-colors shrink-0 shadow cursor-pointer"
            >
              Pay Invoice <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Active Jobs', value: statsData?.activeJobs ?? 0, accent: 'text-sky-400', glow: 'shadow-[0_0_20px_rgba(14,165,233,0.05)]', border: 'border-sky-500/10' },
            { label: 'Completed', value: statsData?.completedJobs ?? 0, accent: 'text-emerald-400', glow: '', border: 'border-emerald-500/10' },
            { label: 'Total Spent', value: formatCurrency(statsData?.totalSpent ?? 0), accent: 'text-violet-400', glow: '', border: 'border-violet-500/10' },
            { label: 'Total Jobs', value: `${statsData?.totalJobs ?? 0} jobs`, accent: 'text-amber-400', glow: '', border: 'border-amber-500/10' },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`rounded-2xl border ${stat.border} bg-slate-900/60 backdrop-blur p-5 ${stat.glow} hover:bg-slate-900/80 transition-all duration-200`}
            >
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-2">{stat.label}</p>
              <p className={`text-2xl font-black ${stat.accent}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Active Job Alert */}
        {hasActive && (
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5 flex items-center gap-4 backdrop-blur">
            <div className="w-10 h-10 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
              <CircleDot size={18} className="text-sky-400 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-sky-400 mb-0.5">
                {activeJobs.length} Active Job{activeJobs.length > 1 ? 's' : ''} in Progress
              </h3>
              <p className="text-xs text-slate-400 truncate">
                {activeJobs[0]?.serviceType ?? 'Service'} — {statusConfig[activeJobs[0]?.status]?.label ?? 'Processing'}
              </p>
            </div>
            <button
              onClick={() => navigate(`/customer/track/${activeJobs[0]?.id}`)}
              className="flex items-center gap-1.5 text-xs text-sky-400 font-bold uppercase tracking-wider hover:text-sky-300 transition-colors shrink-0"
            >
              Track <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Job Feed */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest font-mono">
              Recent Jobs
            </h2>
            <button
              onClick={() => navigate('/customer/jobs')}
              className="text-xs text-sky-400 font-semibold hover:text-sky-300 transition-colors flex items-center gap-1"
            >
              View All <ChevronRight size={14} />
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
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-bold hover:bg-sky-500/20 transition-all duration-200"
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
                    className="w-full text-left rounded-2xl border border-slate-900 bg-slate-900/40 hover:bg-slate-900/70 hover:border-slate-800 p-4 transition-all duration-200 group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Service icon pill */}
                        <div className="w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-800 flex items-center justify-center shrink-0">
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
                          <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
                            <span className="flex items-center gap-1">
                              <Clock size={9} />
                              {formatDate(job.createdAt)}
                            </span>
                            {job.address && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin size={9} />
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
                          <CheckCircle2 size={15} className="text-emerald-500" />
                        )}
                        <ChevronRight size={15} className="text-slate-700 group-hover:text-slate-400 transition-colors" />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Quick Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            onClick={() => navigate('/customer/nearby-technicians')}
            className="group p-5 rounded-2xl border border-slate-900 bg-slate-900/40 hover:bg-slate-900/70 hover:border-sky-500/20 text-left transition-all duration-200"
          >
            <MapPin size={22} className="text-sky-400 mb-3 group-hover:scale-110 transition-transform duration-200" />
            <h3 className="text-sm font-bold text-white mb-1">Nearby Technicians</h3>
            <p className="text-xs text-slate-500">Find skilled pros near your location</p>
          </button>
          <button
            onClick={() => navigate('/customer/suppliers')}
            className="group p-5 rounded-2xl border border-slate-900 bg-slate-900/40 hover:bg-slate-900/70 hover:border-violet-500/20 text-left transition-all duration-200"
          >
            <div className="text-xl mb-3">🏪</div>
            <h3 className="text-sm font-bold text-white mb-1">Suppliers</h3>
            <p className="text-xs text-slate-500">Browse parts and material suppliers</p>
          </button>
          <button
            onClick={() => navigate('/customer/payments')}
            className="group p-5 rounded-2xl border border-slate-900 bg-slate-900/40 hover:bg-slate-900/70 hover:border-emerald-500/20 text-left transition-all duration-200"
          >
            <div className="text-xl mb-3">💳</div>
            <h3 className="text-sm font-bold text-white mb-1">Payment Methods</h3>
            <p className="text-xs text-slate-500">Manage your payment options</p>
          </button>
        </div>

      </div>
    </div>
  )
}

export default DashboardPage
