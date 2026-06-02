import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Clock, Zap, Droplet, Wind, Loader2, Calendar, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import jobService from '../../services/job.service'
import { JobStatus } from '../../types'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { Card, Badge } from '../../components/ui'

type FilterTab = 'All' | 'Active' | 'Completed' | 'Cancelled'

const statusConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  [JobStatus.Requested]: { label: 'Requested', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-400' },
  [JobStatus.Accepted]: { label: 'Accepted', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20', dot: 'bg-sky-400' },
  [JobStatus.OnTheWay]: { label: 'On The Way', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', dot: 'bg-blue-400 animate-pulse' },
  [JobStatus.Arrived]: { label: 'Arrived', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20', dot: 'bg-violet-400' },
  [JobStatus.Working]: { label: 'In Progress', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-400 animate-pulse' },
  [JobStatus.Completed]: { label: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  [JobStatus.Cancelled]: { label: 'Cancelled', color: 'text-slate-550', bg: 'bg-slate-800/60 border-slate-700/30', dot: 'bg-slate-600' },
}

const serviceIcon: Record<string, React.ReactNode> = {
  Electrician: <Zap size={14} className="text-yellow-400" />,
  electrical: <Zap size={14} className="text-yellow-400" />,
  Plumber: <Droplet size={14} className="text-blue-400" />,
  plumbing: <Droplet size={14} className="text-blue-400" />,
  'AC Repair': <Wind size={14} className="text-cyan-400" />,
  ac_repair: <Wind size={14} className="text-cyan-400" />,
}

const tabConfig: { tab: FilterTab; label: string }[] = [
  { tab: 'All', label: 'All Dispatches' },
  { tab: 'Active', label: 'Active' },
  { tab: 'Completed', label: 'Completed' },
  { tab: 'Cancelled', label: 'Cancelled' },
]

export const JobHistoryPage: React.FC = () => {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState<FilterTab>('All')

  const statusFilter = useMemo(() => {
    if (tab === 'Completed') return JobStatus.Completed
    if (tab === 'Cancelled') return JobStatus.Cancelled
    return undefined
  }, [tab])

  const { data, isLoading } = useQuery({
    queryKey: ['technician-jobs-history', page, statusFilter],
    queryFn: () => jobService.listJobs({ page, limit: 10, status: statusFilter }),
  })

  const jobs = useMemo(() => {
    const list = data?.jobs ?? []
    if (tab === 'Active') {
      return list.filter((job) =>
        [JobStatus.Accepted, JobStatus.OnTheWay, JobStatus.Arrived, JobStatus.Working].includes(job.status)
      )
    }
    return list
  }, [data?.jobs, tab])

  const totalCount = data?.total ?? 0
  const totalPages = Math.ceil(totalCount / 10)

  const calculateJobAmount = (job: any) => {
    let base = 85
    if (job.serviceType === 'Electrician' || job.serviceType === 'electrical') base = 95
    if (job.serviceType === 'AC Repair' || job.serviceType === 'ac_repair') base = 110
    
    let urgencyFee = 0
    if (job.urgency === 'High') urgencyFee = 30
    if (job.urgency === 'Emergency' || job.isEmergency) urgencyFee = 75
    
    const tax = Math.round((base + urgencyFee) * 0.08)
    return base + urgencyFee + tax
  }

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-slate-100 relative">
      {/* Background glow layers */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,58,138,0.15),transparent_70%)] pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 border border-slate-800 text-slate-400 p-2.5 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black font-display text-white tracking-tight">Shift Dispatch History</h1>
            <p className="text-slate-450 text-xs font-mono">Logs of all service calls assigned to this terminal profile</p>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex flex-wrap gap-2 pt-2">
          {tabConfig.map(({ tab: t, label }) => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                setPage(1)
              }}
              className={`rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-250 cursor-pointer border ${
                tab === t
                  ? 'bg-sky-500/10 text-sky-400 border-sky-500/30 shadow-[0_0_15px_rgba(14,165,233,0.1)]'
                  : 'text-slate-500 border-slate-900 bg-slate-950/40 hover:text-slate-350 hover:border-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
            <Loader2 size={24} className="animate-spin text-sky-500" />
            <span className="text-xs font-mono">Loading dispatch records...</span>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && jobs.length === 0 && (
          <Card className="border-slate-900 bg-slate-900/60 p-12 text-center shadow-xl backdrop-blur-xl">
            <div className="w-12 h-12 rounded-full border border-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-600 text-lg">
              📂
            </div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wide">No dispatch records found</h3>
            <p className="text-xs text-slate-600 max-w-sm mx-auto mt-1 font-mono">
              There are no jobs matching the selected filter in your dispatch logs.
            </p>
          </Card>
        )}

        {/* Job List */}
        {!isLoading && jobs.length > 0 && (
          <div className="space-y-3.5">
            {jobs.map((job) => {
              const sc = statusConfig[job.status] ?? statusConfig[JobStatus.Requested]
              const Icon = serviceIcon[job.serviceType ?? ''] ?? <Zap size={14} className="text-slate-500" />
              const finalAmount = job.amount ?? calculateJobAmount(job)
              
              return (
                <div
                  key={job.id}
                  onClick={() => navigate(`/technician/job/${job.id}`)}
                  className="w-full rounded-2xl border border-slate-900 bg-slate-900/60 hover:bg-slate-900/80 hover:border-slate-800 p-4.5 transition-all duration-200 group flex items-center justify-between gap-4 cursor-pointer shadow-md"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-900 flex items-center justify-center shrink-0">
                      {Icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-white tracking-tight">{job.serviceType ?? 'General Service'}</h3>
                        <span className="text-[10px] text-slate-600 font-mono">#{job.id.slice(0, 8)}</span>
                      </div>
                      <div className="flex items-center gap-3.5 text-[10px] text-slate-500 font-mono mt-1">
                        <span className="flex items-center gap-1.5"><Clock size={11} />{formatDate(job.createdAt)}</span>
                        {job.customerName && <span className="truncate">Client: {job.customerName}</span>}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="font-mono font-black text-sm text-emerald-400 block">
                        {formatCurrency(finalAmount)}
                      </span>
                      <span className="text-[9px] text-slate-600 font-mono block">Estimated</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${sc.bg} ${sc.color}`}>
                        <span className={`w-1 h-1 rounded-full ${sc.dot}`} />
                        {sc.label}
                      </span>
                      <ChevronRight size={15} className="text-slate-700 group-hover:text-slate-400 transition-colors" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {!isLoading && totalCount > 0 && (
          <div className="flex items-center justify-between pt-4 border-t border-slate-900">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-4 py-2 rounded-xl border border-slate-900 text-xs font-mono text-slate-400 disabled:opacity-30 hover:border-slate-800 hover:text-white transition-all cursor-pointer"
            >
              PREV
            </button>
            <span className="text-[10px] text-slate-600 font-mono uppercase tracking-widest">
              Page {page} of {totalPages || 1}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-4 py-2 rounded-xl border border-slate-900 text-xs font-mono text-slate-400 disabled:opacity-30 hover:border-slate-800 hover:text-white transition-all cursor-pointer"
            >
              NEXT
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default JobHistoryPage
