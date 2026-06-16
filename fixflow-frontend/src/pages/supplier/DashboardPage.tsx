import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Plus,
  PackageOpen,
  Boxes,
  Clock,
  CheckCircle,
  IndianRupee,
  ChevronRight,
  TrendingUp,
  Loader2,
  Wrench,
  User,
} from 'lucide-react'
import api from '../../services/api'
import supplierService from '../../services/supplier.service'
import { QUERY_KEYS } from '../../constants/queryKeys'
import { formatCurrency, formatTimeAgo } from '../../utils/formatters'

const DashboardPage = () => {
  const navigate = useNavigate()

  // 1. Fetch Supplier Stats (including lowStockMaterials list)
  const { data: stats, isLoading: statsLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.supplierStats,
    queryFn: async () => (await api.get('/suppliers/me/stats')).data,
  })

  // 2. Fetch Recent Quotations
  const { data: quotationsData, isLoading: quotesLoading } = useQuery({
    queryKey: [QUERY_KEYS.quotations, 'recent'],
    queryFn: () => supplierService.listQuotations({ limit: 5 }),
  })

  const isLoading = statsLoading || quotesLoading

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-900/40 border border-slate-900" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-12">
          <div className="md:col-span-7 h-80 animate-pulse rounded-2xl bg-slate-900/40 border border-slate-900" />
          <div className="md:col-span-5 h-80 animate-pulse rounded-2xl bg-slate-900/40 border border-slate-900" />
        </div>
      </div>
    )
  }

  if (isError || !stats) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-950 bg-rose-950/20 p-12 text-center shadow-sm">
        <div className="rounded-full bg-rose-900/20 p-4 text-rose-400 border border-rose-900/30">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-slate-200">Unable to load dashboard</h3>
        <p className="mt-1 text-sm text-slate-400 max-w-sm">
          Please check your connection and verify you are registered as a supplier.
        </p>
      </div>
    )
  }

  const recentQuotations = quotationsData?.quotations ?? []
  const lowStock = stats.lowStockMaterials ?? []

  return (
    <div className="space-y-6 pb-20 text-slate-200">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Supplier Workspace</h1>
          <p className="text-sm text-slate-400 font-medium">Review pending quotation requests and fulfill customer material orders</p>
        </div>
        <button
          onClick={() => navigate('/supplier/materials')}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 hover:shadow-emerald-500/30 transition cursor-pointer"
        >
          <Plus className="h-4.5 w-4.5" />
          Manage Catalog
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Active Catalog Items"
          value={stats.totalMaterials ?? 0}
          subtitle="Listed in directory"
          icon={<Boxes className="h-5 w-5 text-emerald-400" />}
          iconBg="bg-emerald-500/10 border border-emerald-500/25"
        />
        <StatCard
          title="Pending Quotes"
          value={stats.pendingQuotations ?? 0}
          subtitle="Awaiting price offers"
          icon={<Clock className="h-5 w-5 text-amber-400" />}
          iconBg="bg-amber-500/10 border border-amber-500/25"
        />
        <StatCard
          title="Accepted Orders"
          value={stats.acceptedThisMonth ?? 0}
          subtitle="Fulfilled this month"
          icon={<CheckCircle className="h-5 w-5 text-emerald-400" />}
          iconBg="bg-emerald-500/10 border border-emerald-500/25"
        />
        <StatCard
          title="Monthly Revenue"
          value={formatCurrency(Number(stats.revenueThisMonth ?? 0))}
          subtitle="Calculated from accepted offers"
          icon={<TrendingUp className="h-5 w-5 text-violet-400" />}
          iconBg="bg-violet-500/10 border border-violet-500/25"
        />
      </div>

      {/* Main Grid Content */}
      <div className="grid gap-6 md:grid-cols-12">
        {/* Left: Recent Quotation requests */}
        <div className="md:col-span-7 rounded-2xl border border-slate-900 bg-slate-900/40 p-5 shadow-xl backdrop-blur-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-4">
              <h3 className="font-bold text-white text-base">Incoming Price Requests</h3>
              <Link to="/supplier/quotations" className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5">
                View pipeline <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="space-y-3">
              {recentQuotations.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  <PackageOpen className="h-8 w-8 mx-auto mb-2 text-slate-600" />
                  No quotation requests yet.
                </div>
              ) : (
                recentQuotations.slice(0, 5).map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between rounded-xl border border-slate-900/80 p-3.5 hover:border-slate-800 transition bg-slate-950/40"
                  >
                    <div>
                      <p className="font-bold text-slate-200 text-sm">{q.materialName}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-400 font-medium mt-1">
                        <span>Qty: {q.requestedQty}</span>
                        {q.area && (
                          <>
                            <span>•</span>
                            <span>{q.area}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex rounded-full bg-slate-900 border border-slate-800 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-300">
                        {q.status}
                      </span>
                      <p className="text-[10px] text-slate-500 font-medium mt-1">{formatTimeAgo(q.requestedAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Low Stock alerts & Quick Actions */}
        <div className="md:col-span-5 space-y-6">
          {/* Low Stock Panel */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-5 shadow-xl backdrop-blur-md">
            <h3 className="font-bold text-white text-base border-b border-slate-900 pb-3 mb-4">Low Stock Warnings</h3>

            <div className="space-y-2.5">
              {lowStock.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-500/70" />
                  All materials are adequately stocked!
                </div>
              ) : (
                lowStock.map((m: any) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-xl border border-amber-950/40 bg-amber-950/10 p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-200 text-sm truncate">{m.name}</p>
                      <p className="text-xs text-amber-400 font-medium mt-0.5">Only {m.stock} units remaining</p>
                    </div>
                    <Link
                      to="/supplier/materials"
                      className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-1 text-xs font-bold text-white shadow-sm transition cursor-pointer"
                    >
                      Update
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Actions Panel */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-5 shadow-xl backdrop-blur-md">
            <h3 className="font-bold text-white text-base border-b border-slate-900 pb-3 mb-4 font-sans">Quick Operations</h3>
            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/supplier/materials"
                className="flex flex-col items-center justify-center p-4 border border-slate-900 rounded-xl bg-slate-950/40 hover:bg-slate-900 hover:border-slate-800 transition text-center gap-1.5"
              >
                <Plus className="h-5 w-5 text-emerald-400" />
                <span className="text-xs font-bold text-slate-300">Add Material</span>
              </Link>
              <Link
                to="/supplier/orders"
                className="flex flex-col items-center justify-center p-4 border border-slate-900 rounded-xl bg-slate-950/40 hover:bg-slate-900 hover:border-slate-800 transition text-center gap-1.5"
              >
                <Boxes className="h-5 w-5 text-emerald-400" />
                <span className="text-xs font-bold text-slate-300">Track Orders</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle: string
  icon: React.ReactNode
  iconBg: string
}

const StatCard = ({ title, value, subtitle, icon, iconBg }: StatCardProps) => (
  <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-5 shadow-md backdrop-blur-md flex items-center justify-between gap-4">
    <div className="space-y-1">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</p>
      <p className="text-2xl font-black text-white tracking-tight">{value}</p>
      <p className="text-[10px] text-slate-400 font-semibold">{subtitle}</p>
    </div>
    <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
      {icon}
    </div>
  </div>
)

export default DashboardPage
