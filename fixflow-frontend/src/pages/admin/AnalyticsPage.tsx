import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ComposedChart,
  AreaChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import {
  TrendingUp,
  Users,
  Activity,
  AlertTriangle,
  DollarSign,
  Clock,
  Briefcase,
  ChevronUp,
  ChevronDown,
  Calendar,
  Zap,
  Award,
  Star
} from 'lucide-react'
import analyticsService from '../../services/analytics.service'
import type { OverviewStats } from '../../services/analytics.service'
import { QUERY_KEYS } from '../../constants/queryKeys'
import { useWS } from '../../context/WSContext'
import { useAuthStore } from '../../store/authStore'
import Skeleton from '../../components/ui/Skeleton'
import { formatCurrency } from '../../utils/formatters'

const AdminAnalyticsPage = () => {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const { connect, disconnect, on, off } = useWS()

  // Date filter states
  const [preset, setPreset] = useState<'7d' | '14d' | '30d' | 'custom'>('14d')
  const [fromDate, setFromDate] = useState(
    new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [toDate, setToDate] = useState(
    new Date().toISOString().split('T')[0]
  )

  // Handle Preset Changes
  const handlePresetChange = (p: '7d' | '14d' | '30d' | 'custom') => {
    setPreset(p)
    const today = new Date()
    let days = 14
    if (p === '7d') days = 7
    if (p === '30d') days = 30
    if (p !== 'custom') {
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      setFromDate(from.toISOString().split('T')[0])
      setToDate(today.toISOString().split('T')[0])
    }
  }

  // Queries
  const { data: overview, isLoading: isOverviewLoading } = useQuery({
    queryKey: QUERY_KEYS.adminOverview,
    queryFn: analyticsService.getOverview,
    refetchInterval: 30000,
  })

  const { data: jobStats, isLoading: isJobStatsLoading } = useQuery({
    queryKey: QUERY_KEYS.adminJobStats(fromDate, toDate),
    queryFn: () => analyticsService.getJobStats(fromDate, toDate),
  })

  const { data: revenueStats, isLoading: isRevenueStatsLoading } = useQuery({
    queryKey: QUERY_KEYS.adminRevenueStats(fromDate, toDate),
    queryFn: () => analyticsService.getRevenueStats(fromDate, toDate),
  })

  const { data: topTechnicians, isLoading: isTechsLoading } = useQuery({
    queryKey: QUERY_KEYS.topTechnicians(10),
    queryFn: () => analyticsService.getTopTechnicians(10),
  })

  // Delta states & ref to keep track of previous values for live updates
  const prevStats = useRef<OverviewStats | null>(null)
  const [deltas, setDeltas] = useState<Record<string, number>>({})

  // Update deltas when overview data changes (either from API polling or WebSockets)
  useEffect(() => {
    if (overview) {
      if (prevStats.current) {
        const newDeltas: Record<string, number> = {}
        const keys: (keyof OverviewStats)[] = [
          'activeJobs',
          'onlineTechnicians',
          'completedToday',
          'revenueToday',
          'revenueThisMonth',
          'avgResponseTimeMin',
          'disputesOpen',
          'newUsersToday',
          'emergencyJobsToday',
          'totalJobsAllTime',
        ]
        keys.forEach((key) => {
          const prevVal = Number(prevStats.current?.[key] ?? 0)
          const newVal = Number(overview[key] ?? 0)
          if (newVal !== prevVal) {
            newDeltas[key] = newVal - prevVal
          } else if (deltas[key]) {
            // retain existing delta briefly or reset
            newDeltas[key] = deltas[key]
          }
        })
        if (Object.keys(newDeltas).length > 0) {
          setDeltas((prev) => ({ ...prev, ...newDeltas }))
        }
      }
      prevStats.current = overview
    }
  }, [overview])

  // WebSocket Live Updates subscription
  useEffect(() => {
    if (token) {
      // Connect to the admin room
      connect('admin:all', token)

      const handleMetricsUpdate = (updatedStats: OverviewStats) => {
        console.log('[WS Analytics] Received live metrics update:', updatedStats)
        // Manually update the react-query cache for overview
        queryClient.setQueryData(QUERY_KEYS.adminOverview, updatedStats)
      }

      on('metrics_update', handleMetricsUpdate)

      return () => {
        off('metrics_update', handleMetricsUpdate)
        disconnect()
      }
    }
  }, [token, connect, disconnect, on, off, queryClient])

  // Format currency helper
  const formatCurrencyLocal = (val: number) => {
    return formatCurrency(val)
  }

  // Render delta indicator
  const renderDelta = (field: string) => {
    const d = deltas[field]
    if (!d || d === 0) return null
    const isPositive = d > 0
    return (
      <span
        className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${
          isPositive
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'bg-rose-500/10 text-rose-400'
        } animate-pulse`}
      >
        {isPositive ? '+' : ''}
        {d.toFixed(field.includes('revenue') ? 1 : 0)}
      </span>
    )
  }

  return (
    <div className="space-y-8 pb-12 text-slate-100">
      {/* Upper Section: Title and Date Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-sky-400 to-teal-400 bg-clip-text text-transparent">
            Admin Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Real-time platform overview, user signups, disputes, and technician stats.
          </p>
        </div>

        {/* Date Filters */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800">
          {(['7d', '14d', '30d', 'custom'] as const).map((p) => (
            <button
              key={p}
              onClick={() => handlePresetChange(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                preset === p
                  ? 'bg-gradient-to-r from-sky-500 to-teal-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              {p === '7d' ? '7 Days' : p === '14d' ? '14 Days' : p === '30d' ? '30 Days' : 'Custom'}
            </button>
          ))}

          {preset === 'custom' && (
            <div className="flex items-center gap-1.5 ml-2 border-l border-slate-800 pl-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-teal-500"
              />
              <span className="text-slate-600 text-xs">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-teal-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Grid of Key Overview Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {isOverviewLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-slate-900/30 rounded-2xl border border-slate-800 animate-pulse" />
          ))
        ) : (
          <>
            <OverviewCard
              title="Active Jobs"
              value={overview?.activeJobs ?? 0}
              icon={<Briefcase className="h-6 w-6 text-sky-400" />}
              delta={renderDelta('activeJobs')}
              subtitle="Jobs in request/working/scheduled"
              bgColor="from-sky-500/10 to-blue-500/5 border-sky-500/20"
            />
            <OverviewCard
              title="Online Technicians"
              value={overview?.onlineTechnicians ?? 0}
              icon={<Activity className="h-6 w-6 text-emerald-400" />}
              delta={renderDelta('onlineTechnicians')}
              subtitle="Technicians active on the field"
              bgColor="from-emerald-500/10 to-teal-500/5 border-emerald-500/20"
            />
            <OverviewCard
              title="Revenue Today"
              value={formatCurrencyLocal(overview?.revenueToday ?? 0)}
              icon={<DollarSign className="h-6 w-6 text-teal-400" />}
              delta={renderDelta('revenueToday')}
              subtitle="Captured payment totals today"
              bgColor="from-teal-500/10 to-emerald-500/5 border-teal-500/20"
            />
            <OverviewCard
              title="Open Disputes"
              value={overview?.disputesOpen ?? 0}
              icon={<AlertTriangle className="h-6 w-6 text-amber-400" />}
              delta={renderDelta('disputesOpen')}
              subtitle="Disputes requiring admin review"
              bgColor="from-amber-500/10 to-yellow-500/5 border-amber-500/20"
            />
          </>
        )}
      </div>

      {/* Quick Metrics Grid */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {isOverviewLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-slate-900/20 rounded-xl border border-slate-900 animate-pulse" />
          ))
        ) : (
          <>
            <QuickMetricCard
              title="Avg Response Time"
              value={`${(overview?.avgResponseTimeMin ?? 0).toFixed(1)}m`}
              icon={<Clock className="h-4 w-4 text-violet-400" />}
              delta={renderDelta('avgResponseTimeMin')}
            />
            <QuickMetricCard
              title="New Users Today"
              value={overview?.newUsersToday ?? 0}
              icon={<Users className="h-4 w-4 text-pink-400" />}
              delta={renderDelta('newUsersToday')}
            />
            <QuickMetricCard
              title="Emergency Jobs"
              value={overview?.emergencyJobsToday ?? 0}
              icon={<Zap className="h-4 w-4 text-rose-400" />}
              delta={renderDelta('emergencyJobsToday')}
            />
            <QuickMetricCard
              title="Completed Today"
              value={overview?.completedToday ?? 0}
              icon={<Award className="h-4 w-4 text-indigo-400" />}
              delta={renderDelta('completedToday')}
            />
          </>
        )}
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Job Analytics ComposedChart */}
        <div className="bg-slate-900/40 rounded-2xl border border-slate-800/80 p-5 shadow-xl backdrop-blur-md">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-200">Jobs Activity</h3>
              <p className="text-xs text-slate-400">Created, completed, and cancelled jobs breakdown.</p>
            </div>
            <TrendingUp className="h-5 w-5 text-sky-400" />
          </div>

          <div className="h-80 w-full">
            {isJobStatsLoading ? (
              <div className="h-full w-full bg-slate-950/20 rounded-lg border border-slate-800/40 animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={jobStats} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="createdGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                    labelClassName="text-slate-400 text-xs font-semibold mb-1"
                    itemStyle={{ fontSize: '12px' }}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                  <Area name="Created" type="monotone" dataKey="created" fill="url(#createdGrad)" stroke="#38bdf8" strokeWidth={2} />
                  <Bar name="Completed" dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} />
                  <Line name="Cancelled" type="monotone" dataKey="cancelled" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Revenue Analytics AreaChart */}
        <div className="bg-slate-900/40 rounded-2xl border border-slate-800/80 p-5 shadow-xl backdrop-blur-md">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-200">Revenue Generation</h3>
              <p className="text-xs text-slate-400">Captured payments timeline within filter date range.</p>
            </div>
            <DollarSign className="h-5 w-5 text-teal-400" />
          </div>

          <div className="h-80 w-full">
            {isRevenueStatsLoading ? (
              <div className="h-full w-full bg-slate-950/20 rounded-lg border border-slate-800/40 animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueStats} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(val) => `Rs.${val}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                    labelClassName="text-slate-400 text-xs font-semibold mb-1"
                    itemStyle={{ fontSize: '12px' }}
                    formatter={(val: any) => [`Rs.${Number(val).toLocaleString()}`, 'Revenue']}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                  <Area name="Captured Revenue" type="monotone" dataKey="amount" fill="url(#revGrad)" stroke="#14b8a6" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Top Technicians Section */}
      <div className="bg-slate-900/30 rounded-2xl border border-slate-800 p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-200">Top Performing Technicians</h3>
            <p className="text-xs text-slate-400">Ranked by completed jobs and customer reviews.</p>
          </div>
          <Award className="h-5 w-5 text-teal-400" />
        </div>

        {isTechsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-950/40 rounded-xl border border-slate-900 animate-pulse" />
            ))}
          </div>
        ) : !topTechnicians || topTechnicians.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">No technician stats available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <th className="pb-3 pl-4">Rank</th>
                  <th className="pb-3">Technician</th>
                  <th className="pb-3 text-center">Completed Jobs</th>
                  <th className="pb-3 text-center">Rating</th>
                  <th className="pb-3 text-right">Revenue Generated</th>
                  <th className="pb-3 pr-4 text-right">Avg Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/60 text-slate-300 text-sm">
                {topTechnicians.map((tech, index) => (
                  <tr
                    key={tech.id}
                    className="hover:bg-slate-800/20 transition-all rounded-lg"
                  >
                    <td className="py-3.5 pl-4 font-bold">
                      {index === 0 ? (
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs">
                          🥇
                        </span>
                      ) : index === 1 ? (
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-300/20 text-slate-300 border border-slate-300/30 text-xs">
                          🥈
                        </span>
                      ) : index === 2 ? (
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs">
                          🥉
                        </span>
                      ) : (
                        <span className="text-slate-500 pl-2">#{index + 1}</span>
                      )}
                    </td>
                    <td className="py-3.5">
                      <div className="flex items-center gap-3">
                        <img
                          src={tech.avatarUrl || 'https://via.placeholder.com/40'}
                          alt={tech.name}
                          className="h-9 w-9 rounded-full object-cover bg-slate-800 border border-slate-700 shadow-inner"
                          onError={(e) => {
                            ;(e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${tech.name}`
                          }}
                        />
                        <div>
                          <span className="font-semibold text-slate-200">{tech.name}</span>
                          <span className="block text-[10px] text-slate-500 font-mono select-all">
                            ID: {tech.id.substring(0, 8)}...
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 text-center font-mono font-bold text-slate-200">
                      {tech.completedJobs}
                    </td>
                    <td className="py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                        <span className="font-mono text-sm font-semibold">{tech.rating.toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="py-3.5 text-right font-mono font-bold text-teal-400">
                      {formatCurrencyLocal(tech.revenue)}
                    </td>
                    <td className="py-3.5 pr-4 text-right font-mono text-xs text-slate-400">
                      {tech.avgResponseMin > 0 ? `${tech.avgResponseMin.toFixed(1)} min` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// Sub-components
const OverviewCard = ({
  title,
  value,
  icon,
  delta,
  subtitle,
  bgColor
}: {
  title: string
  value: string | number
  icon: React.ReactNode
  delta: React.ReactNode
  subtitle: string
  bgColor: string
}) => {
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br ${bgColor} p-5 shadow-lg backdrop-blur-sm transition-all hover:scale-[1.01] hover:shadow-xl`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-400">{title}</p>
        <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">{icon}</div>
      </div>
      <div className="mt-2 flex items-baseline">
        <span className="text-3xl font-extrabold text-white tracking-tight">{value}</span>
        {delta}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{subtitle}</p>
    </div>
  )
}

const QuickMetricCard = ({
  title,
  value,
  icon,
  delta
}: {
  title: string
  value: string | number
  icon: React.ReactNode
  delta: React.ReactNode
}) => {
  return (
    <div className="bg-slate-900/20 border border-slate-800/60 rounded-xl p-4 flex items-center justify-between hover:border-slate-700 transition-all">
      <div className="space-y-1">
        <span className="text-xs font-semibold text-slate-500 block">{title}</span>
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold text-slate-200 font-mono">{value}</span>
          {delta}
        </div>
      </div>
      <div className="p-1.5 rounded-lg bg-slate-950/40 border border-slate-900">{icon}</div>
    </div>
  )
}

export default AdminAnalyticsPage
