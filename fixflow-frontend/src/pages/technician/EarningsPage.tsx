import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Loader2, DollarSign, Clock, CheckCircle2, TrendingUp, Calendar, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import paymentService from '../../services/payment.service'
import { useWS } from '../../context/WSContext'
import { Card, Badge, Button } from '../../components/ui'
import type { Payment } from '../../types'

export const EarningsPage: React.FC = () => {
  const navigate = useNavigate()
  const { on, off } = useWS()
  const [payments, setPayments] = useState<Payment[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  const limit = 10

  const fetchEarnings = async () => {
    try {
      setIsLoading(true)
      const data = await paymentService.getHistory({ page, limit })
      setPayments(data.payments || [])
      setTotalCount(data.total || 0)
    } catch (err: any) {
      console.error('Failed to load earnings history:', err)
      toast.error('Failed to load earnings statistics')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchEarnings()
  }, [page])

  // Real-time WebSocket listener for payment updates
  useEffect(() => {
    const handlePaymentNotification = (payload: any) => {
      console.log('[WS Technician Earnings] Received event:', payload)
      if (payload.status === 'Captured') {
        toast(
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 text-emerald-600 p-2 rounded-full">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">Payment Received!</p>
              <p className="text-xs text-slate-500">Rs. {payload.amount} captured for Job #{payload.jobId.substring(0, 8).toUpperCase()}</p>
            </div>
          </div>,
          { duration: 5000 }
        )
        // Refresh statistics
        fetchEarnings()
      }
    }

    on('payment_status', handlePaymentNotification)
    return () => {
      off('payment_status', handlePaymentNotification)
    }
  }, [on, off])

  // Aggregate stats
  const totalEarned = payments
    .filter((p) => p.status === 'Captured')
    .reduce((acc, curr) => acc + curr.amount, 0)

  const totalPending = payments
    .filter((p) => p.status === 'Pending')
    .reduce((acc, curr) => acc + curr.amount, 0)

  const completedJobsCount = payments.filter((p) => p.status === 'Captured').length

  // Build chart data grouping by date (last 7 payments or sorted by date)
  const getChartData = () => {
    const dailyEarnings: { [date: string]: number } = {}
    
    // Sort payments by date oldest to newest
    const sortedPayments = [...payments]
      .filter((p) => p.status === 'Captured')
      .reverse()

    sortedPayments.forEach((p) => {
      try {
        const date = new Date(p.createdAt).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        })
        dailyEarnings[date] = (dailyEarnings[date] || 0) + p.amount
      } catch {
        // Fallback
      }
    })

    return Object.entries(dailyEarnings).map(([date, amount]) => ({
      date,
      amount,
    }))
  }

  const chartData = getChartData()
  const totalPages = Math.ceil(totalCount / limit)

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-slate-100 relative">
      {/* Ambient background glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,58,138,0.15),transparent_70%)] pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 p-2.5 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black font-display text-white tracking-tight">Earnings Dashboard</h1>
            <p className="text-slate-450 text-sm">Monitor your income, pending payouts, and performance</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 bg-slate-900/60 border-slate-900 shadow-xl backdrop-blur-xl relative overflow-hidden flex items-center justify-between hover:border-slate-805 transition-all duration-300">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Total Earned</span>
              <span className="text-2xl font-black font-display text-emerald-400">Rs. {totalEarned.toFixed(2)}</span>
              <p className="text-xs text-slate-500 mt-2">Captured & settled payouts</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3.5 rounded-xl">
              <DollarSign className="w-6 h-6" />
            </div>
          </Card>

          <Card className="p-6 bg-slate-900/60 border-slate-900 shadow-xl backdrop-blur-xl relative overflow-hidden flex items-center justify-between hover:border-slate-805 transition-all duration-300">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Pending Invoices</span>
              <span className="text-2xl font-black font-display text-amber-400">Rs. {totalPending.toFixed(2)}</span>
              <p className="text-xs text-slate-500 mt-2">Awaiting customer payment</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-3.5 rounded-xl">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>
          </Card>

          <Card className="p-6 bg-slate-900/60 border-slate-900 shadow-xl backdrop-blur-xl relative overflow-hidden flex items-center justify-between hover:border-slate-805 transition-all duration-300">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Completed Jobs</span>
              <span className="text-2xl font-black font-display text-indigo-400">{completedJobsCount}</span>
              <p className="text-xs text-slate-500 mt-2">With successfully captured payments</p>
            </div>
            <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 p-3.5 rounded-xl">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </Card>
        </div>

        {/* Chart Section */}
        {chartData.length > 0 && (
          <Card className="p-6 bg-slate-900/60 border-slate-900 shadow-xl backdrop-blur-xl mb-8">
            <h2 className="text-lg font-black font-display text-slate-200 mb-6 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" /> Earnings Timeline
            </h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1E293B" />
                  <XAxis dataKey="date" stroke="#475569" fontSize={11} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip formatter={(value) => [`Rs. ${value}`, 'Earnings']} contentStyle={{ borderRadius: '12px', border: '1px solid #1E293B', backgroundColor: '#0B0F19', color: '#F8FAFC' }} />
                  <Area type="monotone" dataKey="amount" stroke="#6366F1" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Transaction History Section */}
        <Card className="overflow-hidden bg-slate-900/60 border-slate-900 shadow-xl backdrop-blur-xl">
          <div className="p-6 border-b border-slate-900 bg-slate-950/40">
            <h2 className="text-lg font-black font-display text-slate-205">Job Payouts & Invoices</h2>
          </div>

          {isLoading ? (
            <div className="p-12 text-center flex flex-col justify-center items-center">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
              <span className="text-sm text-slate-500 font-medium font-mono">Loading billing logs...</span>
            </div>
          ) : payments.length === 0 ? (
            <div className="p-12 text-center text-slate-550 border-t border-slate-900">
              <AlertCircle className="w-10 h-10 mx-auto text-slate-700 mb-3" />
              <p className="text-sm font-semibold">No billing logs recorded yet.</p>
              <p className="text-xs mt-1 text-slate-600">Once you submit an invoice and complete jobs, they will appear here.</p>
            </div>
          ) : (
            <div className="bg-slate-950/20">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 text-slate-500 text-xs uppercase font-semibold bg-slate-950/60">
                      <th className="py-3.5 px-6 font-display">Payout ID</th>
                      <th className="py-3.5 px-6 font-display">Job Reference</th>
                      <th className="py-3.5 px-6 font-display">Date & Time</th>
                      <th className="py-3.5 px-6 text-right font-display">Grand Total</th>
                      <th className="py-3.5 px-6 text-center font-display">Payout Status</th>
                      <th className="py-3.5 px-6 text-center font-display">Receipts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 text-slate-300 text-sm">
                    {payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-slate-900/30 transition-colors">
                        <td className="py-4 px-6 font-mono text-xs text-slate-500">
                          {payment.id.substring(0, 12)}
                        </td>
                        <td className="py-4 px-6 font-semibold text-slate-200">
                          Job #{payment.jobId.substring(0, 8).toUpperCase()}
                        </td>
                        <td className="py-4 px-6 text-slate-450">
                          {new Date(payment.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-4 px-6 text-right font-bold text-white">
                          Rs. {payment.amount.toFixed(2)}
                        </td>
                        <td className="py-4 px-6 text-center">
                          <Badge variant={payment.status === 'Captured' ? 'success' : 'warning'}>
                            {payment.status === 'Captured' ? 'Received' : 'Pending'}
                          </Badge>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <button
                            onClick={() => navigate(`/customer/payment/${payment.jobId}`)}
                            className="text-indigo-400 hover:text-indigo-300 font-bold text-xs cursor-pointer"
                          >
                            View Invoice
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center px-6 py-4 border-t border-slate-900 bg-slate-950/40">
                  <span className="text-xs text-slate-500">
                    Page {page} of {totalPages} ({totalCount} total)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="border-slate-800 hover:bg-slate-900 hover:text-white"
                    >
                      <ChevronLeft className="w-4 h-4" /> Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page === totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="border-slate-800 hover:bg-slate-900 hover:text-white"
                    >
                      Next <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
