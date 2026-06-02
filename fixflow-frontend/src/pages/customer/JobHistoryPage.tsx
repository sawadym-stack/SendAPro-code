import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Clock, Zap, Droplet, Wind, Loader2, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import jobService from '../../services/job.service'
import { QUERY_KEYS } from '../../constants/queryKeys'
import { JobStatus } from '../../types'
import { formatCurrency, formatDate } from '../../utils/formatters'
import ReviewModal from '../../components/job/ReviewModal'

type FilterTab = 'All' | 'Active' | 'Completed' | 'Cancelled'

const statusConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  [JobStatus.Requested]: { label: 'Pending', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-400' },
  [JobStatus.Accepted]: { label: 'Accepted', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20', dot: 'bg-sky-400' },
  [JobStatus.OnTheWay]: { label: 'On The Way', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', dot: 'bg-blue-400 animate-pulse' },
  [JobStatus.Arrived]: { label: 'Arrived', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20', dot: 'bg-violet-400' },
  [JobStatus.Working]: { label: 'In Progress', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-400 animate-pulse' },
  [JobStatus.Completed]: { label: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  [JobStatus.Cancelled]: { label: 'Cancelled', color: 'text-slate-500', bg: 'bg-slate-800/60 border-slate-700/30', dot: 'bg-slate-600' },
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
  { tab: 'All', label: 'All Jobs' },
  { tab: 'Active', label: 'Active' },
  { tab: 'Completed', label: 'Completed' },
  { tab: 'Cancelled', label: 'Cancelled' },
]

const JobHistoryPage = () => {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState<FilterTab>('All')
  const [activeJobForReview, setActiveJobForReview] = useState<{ jobId: string; revieweeId: string; technicianName: string } | null>(null)

  const statusFilter = useMemo(() => {
    if (tab === 'Completed') return JobStatus.Completed
    if (tab === 'Cancelled') return JobStatus.Cancelled
    return undefined
  }, [tab])

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.jobsList({ page, limit: 10, status: statusFilter }),
    queryFn: () => jobService.listJobs({ page, limit: 10, status: statusFilter }),
  })

  const jobs = useMemo(() => {
    const list = data?.jobs ?? []
    if (tab === 'Active') return list.filter((job) => ![JobStatus.Completed, JobStatus.Cancelled].includes(job.status))
    return list
  }, [data?.jobs, tab])

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Service History</p>
        <h1 className="text-2xl font-black text-white tracking-tight">My Jobs</h1>
      </div>

      {/* Tab Filters */}
      <div className="flex gap-2">
        {tabConfig.map(({ tab: t, label }) => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(1) }}
            className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
              tab === t
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                : 'text-slate-500 border border-slate-900 hover:text-slate-300 hover:border-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
          <Loader2 size={20} className="animate-spin text-sky-500" />
          <span className="text-sm font-mono">Loading jobs...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && jobs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-900 bg-slate-950/40 py-14 px-6 text-center">
          <div className="text-2xl mb-3">📋</div>
          <h3 className="text-sm font-bold text-slate-400 mb-1">No jobs found</h3>
          <p className="text-xs text-slate-600">Try changing filters or create a new service request.</p>
        </div>
      )}

      {/* Job list */}
      {!isLoading && jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map((job) => {
            const sc = statusConfig[job.status] ?? statusConfig[JobStatus.Requested]
            const Icon = serviceIcon[job.serviceType ?? ''] ?? <Zap size={14} className="text-slate-500" />
            return (
              <div
                key={job.id}
                className="w-full rounded-2xl border border-slate-900 bg-slate-900/40 hover:bg-slate-900/70 hover:border-slate-800 p-4 transition-all duration-200 group flex flex-col gap-3"
              >
                <div
                  onClick={() => navigate(`/customer/track/${job.id}`)}
                  className="flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-800 flex items-center justify-center shrink-0">{Icon}</div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white truncate">{job.serviceType ?? 'Service Request'}</h3>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1"><Clock size={9} />{formatDate(job.createdAt)}</span>
                        {job.technicianName && <span className="truncate">Tech: {job.technicianName}</span>}
                        {job.amount ? <span className="text-emerald-400">{formatCurrency(job.amount)}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${sc.bg} ${sc.color}`}>
                      <span className={`w-1 h-1 rounded-full ${sc.dot}`} />
                      {sc.label}
                    </span>
                    <ChevronRight size={15} className="text-slate-700 group-hover:text-slate-400 transition-colors" />
                  </div>
                </div>

                {job.status === JobStatus.Completed && job.technicianId && localStorage.getItem(`reviewed_${job.id}`) !== 'true' && (
                  <div className="flex justify-end border-t border-slate-850 pt-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveJobForReview({
                          jobId: job.id,
                          revieweeId: job.technicianId!,
                          technicianName: job.technicianName || 'Professional Tech',
                        })
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-[10px] font-bold text-amber-400 transition-colors cursor-pointer"
                    >
                      <Star size={11} className="fill-amber-450 text-amber-450" />
                      Leave Review
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="px-4 py-2 rounded-xl border border-slate-800 text-sm text-slate-400 disabled:opacity-30 hover:border-slate-700 hover:text-white transition-all"
        >
          Previous
        </button>
        <span className="text-xs text-slate-600 font-mono">Page {page}</span>
        <button
          disabled={(data?.jobs?.length ?? 0) < 10}
          onClick={() => setPage((p) => p + 1)}
          className="px-4 py-2 rounded-xl border border-slate-800 text-sm text-slate-400 disabled:opacity-30 hover:border-slate-700 hover:text-white transition-all"
        >
          Next
        </button>
      </div>

      {/* Review Modal */}
      {activeJobForReview && (
        <ReviewModal
          jobId={activeJobForReview.jobId}
          revieweeId={activeJobForReview.revieweeId}
          technicianName={activeJobForReview.technicianName}
          isOpen={!!activeJobForReview}
          onClose={() => {
            setActiveJobForReview(null)
          }}
        />
      )}
    </div>
  )
}

export default JobHistoryPage
