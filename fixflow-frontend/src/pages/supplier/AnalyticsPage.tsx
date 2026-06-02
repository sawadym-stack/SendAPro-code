import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import {
  TrendingUp,
  Package,
  CheckCircle,
  FileText,
  DollarSign,
  Percent,
  Clock,
  ArrowRight,
  ShoppingBag
} from 'lucide-react'
import analyticsService from '../../services/analytics.service'
import { QUERY_KEYS } from '../../constants/queryKeys'
import Skeleton from '../../components/ui/Skeleton'
import { formatCurrency } from '../../utils/formatters'

const SupplierAnalyticsPage = () => {
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.supplierAnalytics,
    queryFn: analyticsService.getSupplierAnalytics,
  })

  if (isLoading) {
    return (
      <div className="space-y-8 pb-12 text-slate-100 animate-pulse">
        <div className="h-20 bg-slate-900/30 rounded-2xl border border-slate-800" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-slate-900/30 rounded-2xl border border-slate-800" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-80 bg-slate-900/30 rounded-2xl border border-slate-800" />
          <div className="h-80 bg-slate-900/30 rounded-2xl border border-slate-800" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-slate-100">
        <h3 className="text-lg font-bold text-red-400">Failed to Load Analytics</h3>
        <p className="text-sm text-slate-300 mt-2">
          There was an error communicating with the server. Please check your credentials and try again.
        </p>
      </div>
    )
  }

  // Quotation Pie Chart Data
  const pieData = [
    { name: 'Accepted', value: Number(stats?.acceptedQuotations ?? 0), color: '#10b981' },
    { name: 'Rejected', value: Number(stats?.rejectedQuotations ?? 0), color: '#f43f5e' },
    { name: 'Expired', value: Number(stats?.expiredQuotations ?? 0), color: '#f59e0b' },
  ].filter((item) => item.value > 0)

  // Fallback if there are no quotes to display in chart
  const hasPieData = pieData.length > 0

  const totalQuotations = stats?.totalQuotations ?? 0
  const conversionRate = stats?.conversionRate ?? 0

  // Category Badge Colors Map
  const getCategoryBadgeClass = (category: string) => {
    const c = category.toLowerCase()
    if (c.includes('plumb')) return 'bg-sky-500/10 text-sky-400 border-sky-500/20'
    if (c.includes('elect')) return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    if (c.includes('hvac') || c.includes('air')) return 'bg-teal-500/10 text-teal-400 border-teal-500/20'
    if (c.includes('tool') || c.includes('hard')) return 'bg-pink-500/10 text-pink-400 border-pink-500/20'
    return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  }

  return (
    <div className="space-y-8 pb-12 text-slate-100">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">
          Supplier Analytics
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Monitor your material orders, quotation conversions, and monthly revenue performance.
        </p>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewCard
          title="Total Quotations"
          value={totalQuotations}
          icon={<FileText className="h-6 w-6 text-teal-400" />}
          subtitle="All submitted price quotes"
          bgColor="from-teal-500/10 to-teal-900/5 border-teal-500/20"
        />
        <OverviewCard
          title="Accepted Quotes"
          value={stats?.acceptedQuotations ?? 0}
          icon={<CheckCircle className="h-6 w-6 text-emerald-400" />}
          subtitle="Approved by technicians"
          bgColor="from-emerald-500/10 to-emerald-900/5 border-emerald-500/20"
        />
        <OverviewCard
          title="Conversion Rate"
          value={`${conversionRate.toFixed(1)}%`}
          icon={<Percent className="h-6 w-6 text-sky-400" />}
          subtitle="Accepted quotes vs total quotes"
          bgColor="from-sky-500/10 to-sky-900/5 border-sky-500/20"
        />
        <OverviewCard
          title="Revenue This Month"
          value={formatCurrency(stats?.revenueThisMonth ?? 0)}
          icon={<DollarSign className="h-6 w-6 text-amber-400" />}
          subtitle="Earnings from accepted jobs"
          bgColor="from-amber-500/10 to-amber-900/5 border-amber-500/20"
        />
      </div>

      {/* Charts & Top Products section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quotation Status Breakdown (Donut PieChart) */}
        <div className="bg-slate-900/40 rounded-2xl border border-slate-800 p-5 shadow-xl backdrop-blur-md flex flex-col justify-between">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-200">Quotation Outcomes</h3>
              <p className="text-xs text-slate-400">Distribution status of submitted quotations.</p>
            </div>
            <TrendingUp className="h-5 w-5 text-teal-400" />
          </div>

          <div className="h-72 w-full flex items-center justify-center">
            {hasPieData ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                    itemStyle={{ fontSize: '13px', color: '#f8fafc' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-slate-500 text-sm py-12 flex flex-col items-center gap-2">
                <Clock className="h-8 w-8 text-slate-600 animate-pulse" />
                <span>No quotations data to display status breakdown yet.</span>
              </div>
            )}
          </div>
        </div>

        {/* Top Ordered Materials Table */}
        <div className="bg-slate-900/40 rounded-2xl border border-slate-800 p-5 shadow-xl backdrop-blur-md flex flex-col justify-between">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-200">Top Ordered Materials</h3>
              <p className="text-xs text-slate-400">Your materials with the highest frequency and sales volume.</p>
            </div>
            <ShoppingBag className="h-5 w-5 text-emerald-400" />
          </div>

          <div className="flex-1 overflow-y-auto max-h-[290px] pr-1">
            {!stats?.topMaterials || stats.topMaterials.length === 0 ? (
              <div className="text-center text-slate-500 text-sm py-12">
                No orders/purchases recorded yet.
              </div>
            ) : (
              <div className="space-y-3.5">
                {stats.topMaterials.map((mat, idx) => (
                  <div
                    key={mat.materialId}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-900 hover:border-slate-800 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 text-xs font-bold font-mono">
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-200 block truncate">{mat.name}</span>
                        <span
                          className={`inline-block px-1.5 py-0.5 mt-1 border text-[10px] rounded font-medium ${getCategoryBadgeClass(
                            mat.category
                          )}`}
                        >
                          {mat.category}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-right">
                      <div className="text-xs font-semibold text-slate-500">
                        <span className="block text-slate-300 font-mono font-bold text-sm">
                          {mat.timesOrdered}
                        </span>
                        <span>Orders</span>
                      </div>
                      <div className="text-right">
                        <span className="block font-mono font-bold text-emerald-400 text-sm">
                          {formatCurrency(mat.revenue)}
                        </span>
                        <span className="text-[10px] text-slate-500">Total Sales</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Sub-components
const OverviewCard = ({
  title,
  value,
  icon,
  subtitle,
  bgColor
}: {
  title: string
  value: string | number
  icon: React.ReactNode
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
      <div className="mt-2">
        <span className="text-3xl font-extrabold text-white tracking-tight">{value}</span>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{subtitle}</p>
    </div>
  )
}

export default SupplierAnalyticsPage
