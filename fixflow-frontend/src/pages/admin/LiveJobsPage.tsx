import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Loader2, Radio, MapPin, Wrench, Eye, Bolt, Droplets, Wind, AlertCircle, Clock, CheckCircle, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import jobService from '../../services/job.service'
import api from '../../services/api'
import { QUERY_KEYS } from '../../constants/queryKeys'
import { useWS } from '../../context/WSContext'
import { useAuthStore } from '../../store/authStore'
import { formatTimeAgo } from '../../utils/formatters'
import { JobStatus } from '../../types'
import type { Job } from '../../types'

const serviceIcon: Record<string, any> = {
  Electrician: Bolt,
  electrical: Bolt,
  Plumber: Droplets,
  plumbing: Droplets,
  'AC Repair': Wind,
  ac_repair: Wind,
}

export default function LiveJobsPage() {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const ws = useWS()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<'All' | 'Requested' | 'Accepted' | 'OnTheWay' | 'Working'>('All')
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [flashingJobIds, setFlashingJobIds] = useState<Record<string, boolean>>({})

  // Fetch live jobs, refetch every 30 seconds
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.adminJobs,
    queryFn: () => jobService.listJobs({ limit: 100 }),
    refetchInterval: 30000,
  })

  const jobs: Job[] = data?.jobs ?? []

  // Connect WebSockets to admin:all room
  useEffect(() => {
    if (!token) return
    ws.connect('admin:all', token)

    const handleJobStatusChange = (payload: any) => {
      const jobId = payload.jobId ?? payload.id
      if (jobId) {
        // Flash row yellow
        setFlashingJobIds((prev) => ({ ...prev, [jobId]: true }))
        setTimeout(() => {
          setFlashingJobIds((prev) => ({ ...prev, [jobId]: false }))
        }, 2000)

        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminJobs })
      }
    }

    ws.on('job_status', handleJobStatusChange)
    ws.on('job_updated', handleJobStatusChange)

    return () => {
      ws.off('job_status', handleJobStatusChange)
      ws.off('job_updated', handleJobStatusChange)
      ws.disconnect()
    }
  }, [token, ws, queryClient])

  // Client-side search and status filter
  const filteredJobs = jobs.filter((job) => {
    const idMatches = job.id.toLowerCase().includes(searchQuery.toLowerCase())
    const customerMatches = (job.customerName ?? '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesSearch = idMatches || customerMatches

    if (!matchesSearch) return false

    if (activeFilter === 'All') return true
    if (activeFilter === 'Requested') return job.status === JobStatus.Requested
    if (activeFilter === 'Accepted') return job.status === JobStatus.Accepted
    if (activeFilter === 'OnTheWay') return job.status === JobStatus.OnTheWay
    if (activeFilter === 'Working') return job.status === JobStatus.Working
    return true
  })

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 relative">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">Real-Time Dispatch</p>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Radio className="text-sky-400 animate-pulse" size={24} />
              Live Operations Monitor
            </h1>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Job ID or Customer..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-2">
          {(['All', 'Requested', 'Accepted', 'OnTheWay', 'Working'] as const).map((filter) => {
            const label = filter === 'OnTheWay' ? 'En Route' : filter
            const count = filter === 'All' ? jobs.length : jobs.filter((j) => {
              if (filter === 'Requested') return j.status === JobStatus.Requested
              if (filter === 'Accepted') return j.status === JobStatus.Accepted
              if (filter === 'OnTheWay') return j.status === JobStatus.OnTheWay
              if (filter === 'Working') return j.status === JobStatus.Working
              return false
            }).length

            const isActive = activeFilter === filter
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-sky-500/15 border-sky-500 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.15)]'
                    : 'bg-slate-900/60 border-slate-900 text-slate-400 hover:border-slate-800 hover:text-slate-200'
                }`}
              >
                {label} <span className="ml-1 opacity-60 font-mono">({count})</span>
              </button>
            )
          })}
        </div>

        {/* Table list */}
        {isLoading ? (
          <div className="h-64 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 size={20} className="animate-spin text-sky-500" />
            <span className="text-sm font-mono">Loading operations log...</span>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="rounded-2xl border border-slate-900 bg-slate-900/20 p-12 text-center max-w-sm mx-auto space-y-3">
            <AlertCircle className="h-8 w-8 text-slate-500 mx-auto" />
            <h3 className="text-sm font-bold text-white">No active jobs found</h3>
            <p className="text-xs text-slate-500">Either there are no jobs matching the filter, or search returned no results.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-900 bg-slate-900/60 overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-900 bg-slate-950/60 text-slate-500 uppercase tracking-wider font-mono">
                  <th className="px-5 py-4">Job ID</th>
                  <th className="px-5 py-4">Service</th>
                  <th className="px-5 py-4">Customer</th>
                  <th className="px-5 py-4">Technician</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Last Updated</th>
                  <th className="px-5 py-4">Location</th>
                  <th className="px-5 py-4 text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60">
                {filteredJobs.map((job) => {
                  const Icon = serviceIcon[job.serviceType ?? ''] ?? Wrench
                  const isEmergency = job.urgency === 'Emergency' || job.isEmergency
                  const isOnTheWay = job.status === JobStatus.OnTheWay
                  const isWorking = job.status === JobStatus.Working
                  const isFlashing = flashingJobIds[job.id]

                  return (
                    <tr
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className={`hover:bg-slate-900/20 transition-all cursor-pointer ${
                        isFlashing ? 'bg-yellow-500/10' : ''
                      } ${
                        isEmergency
                          ? 'border-l-4 border-l-red-500'
                          : isOnTheWay
                          ? 'bg-blue-500/5'
                          : isWorking
                          ? 'bg-emerald-500/5'
                          : ''
                      }`}
                    >
                      <td className="px-5 py-4 font-mono text-slate-400">
                        {job.id.slice(0, 8)}
                      </td>
                      <td className="px-5 py-4">
                        <span className="flex items-center gap-1.5 font-bold text-white">
                          <Icon size={14} className="text-sky-400" />
                          {job.serviceType}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-200">
                        {job.customerName ?? 'N/A'}
                      </td>
                      <td className="px-5 py-4 text-slate-300">
                        {job.technicianName ?? <span className="text-slate-550 italic">Unassigned</span>}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                            isEmergency
                              ? 'bg-red-500/10 border-red-500/20 text-red-400'
                              : isOnTheWay
                              ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                              : isWorking
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-500">
                        {formatTimeAgo(job.updatedAt ?? job.createdAt)}
                      </td>
                      <td className="px-5 py-4 text-slate-400 truncate max-w-[150px]">
                        {job.address || `${job.latitude?.toFixed(4)}, ${job.longitude?.toFixed(4)}`}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button type="button" className="p-1 bg-slate-900 border border-slate-800 rounded text-sky-400 hover:text-sky-300">
                          <Eye size={12} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail override modal */}
      {selectedJob && (
        <JobOverrideModal
          job={selectedJob}
          onClose={() => { setSelectedJob(null); queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminJobs }) }}
        />
      )}
    </div>
  )
}

function JobOverrideModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const [status, setStatus] = useState<JobStatus>(job.status)
  const [isUpdating, setIsUpdating] = useState(false)

  const overrideMutation = useMutation({
    mutationFn: (newStatus: JobStatus) =>
      api.patch(`/jobs/${job.id}/status`, { newStatus, technicianId: job.technicianId || '' }),
    onSuccess: () => {
      toast.success('Job status updated successfully')
      onClose()
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Failed to update job status')
    },
    onSettled: () => {
      setIsUpdating(false)
    },
  })

  const handleUpdate = () => {
    setIsUpdating(true)
    overrideMutation.mutate(status)
  }

  const mapLink = `https://www.google.com/maps/search/?api=1&query=${job.latitude},${job.longitude}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6 relative">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-black text-white">Job Operational Override</h3>
            <p className="text-[10px] text-slate-500 font-mono">Job ID: {job.id}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 bg-slate-950 border border-slate-850 rounded-full hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Info detail grid */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-850">
            <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider block">Customer</span>
            <span className="font-bold text-white block mt-1">{job.customerName ?? 'N/A'}</span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{job.customerPhone ?? 'No phone'}</span>
          </div>
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-855">
            <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider block">Technician</span>
            <span className="font-bold text-white block mt-1">{job.technicianName ?? 'Unassigned'}</span>
            <span className="text-[10px] text-slate-500 italic block mt-0.5">Rating: {job.rating ?? 'No rating'}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block">Address</span>
          <p className="text-xs text-slate-350 bg-slate-950/40 border border-slate-850 rounded-xl p-3.5 leading-relaxed">
            {job.address || 'Fallback location coordinates locked.'}
          </p>
        </div>

        {/* Map link button */}
        {job.latitude && job.longitude && (
          <a
            href={mapLink}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl text-sky-400 text-xs font-bold transition-colors"
          >
            <MapPin size={12} /> View on Map
          </a>
        )}

        {/* Status override editor */}
        <div className="space-y-3 pt-4 border-t border-slate-800">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Manual Status Override
          </label>
          <div className="flex flex-wrap gap-1.5">
            {Object.values(JobStatus).map((s) => {
              const isSelected = status === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-sky-500/15 border-sky-500 text-sky-400'
                      : 'border-slate-800 bg-slate-950 text-slate-500 hover:border-slate-700 hover:text-slate-350'
                  }`}
                >
                  {s}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-850 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpdate}
            disabled={status === job.status || isUpdating}
            className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-800 text-white disabled:text-slate-500 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            {isUpdating ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            Override Status
          </button>
        </div>
      </div>
    </div>
  )
}
