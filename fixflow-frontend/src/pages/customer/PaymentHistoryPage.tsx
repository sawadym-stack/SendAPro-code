import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Loader2, Receipt, ArrowUpRight, HelpCircle, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import paymentService from '../../services/payment.service'
import { Card, Badge, Button } from '../../components/ui'
import type { Payment } from '../../types'

export const PaymentHistoryPage: React.FC = () => {
  const navigate = useNavigate()
  const [payments, setPayments] = useState<Payment[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  const limit = 10

  const fetchHistory = async () => {
    try {
      setIsLoading(true)
      const data = await paymentService.getHistory({ page, limit })
      setPayments(data.payments || [])
      setTotalCount(data.total || 0)
    } catch (err: any) {
      console.error('Failed to load payment history:', err)
      toast.error('Failed to load payment history')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [page])

  // Stats calculation
  const totalSpent = payments
    .filter((p) => p.status === 'Captured')
    .reduce((acc, curr) => acc + curr.amount, 0)
  
  const successfulCount = payments.filter((p) => p.status === 'Captured').length
  const pendingCount = payments.filter((p) => p.status === 'Pending').length
  const failedCount = payments.filter((p) => p.status === 'Failed').length

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'Captured':
        return <Badge className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">Paid</Badge>
      case 'Pending':
        return <Badge className="bg-amber-500/10 border border-amber-500/20 text-amber-400 animate-pulse">Pending</Badge>
      case 'Failed':
        return <Badge className="bg-red-500/10 border border-red-500/20 text-red-400">Failed</Badge>
      default:
        return <Badge className="bg-slate-800 border border-slate-700 text-slate-400">{status}</Badge>
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  const totalPages = Math.ceil(totalCount / limit)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative py-8 px-4 sm:px-6 lg:px-8">
      {/* Top ambient glow */}
      <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none" />
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-sky-500/5 blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="bg-sky-500/10 border border-sky-500/20 text-sky-400 p-2.5 rounded-xl">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-1">Billing & Invoices</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Payment History</h1>
            <p className="text-slate-400 text-sm mt-1">Track your invoices, payments, and billing details</p>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-900 bg-slate-900/60 backdrop-blur p-5 hover:bg-slate-900/80 transition-all duration-200">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mb-2">Total Spent</span>
            <span className="text-2xl font-black text-violet-400 font-mono">Rs. {totalSpent.toFixed(2)}</span>
            <p className="text-xs text-slate-500 mt-2 font-mono">Active billing cycle total</p>
          </div>
          <div className="rounded-2xl border border-slate-900 bg-slate-900/60 backdrop-blur p-5 hover:bg-slate-900/80 transition-all duration-200">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mb-2">Paid Invoices</span>
            <span className="text-2xl font-black text-emerald-400 font-mono">{successfulCount}</span>
            <p className="text-xs text-slate-500 mt-2 font-mono">Successfully cleared transactions</p>
          </div>
          <div className="rounded-2xl border border-slate-900 bg-slate-900/60 backdrop-blur p-5 hover:bg-slate-900/80 transition-all duration-200">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mb-2">Pending Invoices</span>
            <span className="text-2xl font-black text-amber-400 font-mono">{pendingCount}</span>
            <p className="text-xs text-slate-500 mt-2 font-mono">Awaiting payment completion</p>
          </div>
          <div className="rounded-2xl border border-slate-900 bg-slate-900/60 backdrop-blur p-5 hover:bg-slate-900/80 transition-all duration-200">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mb-2">Failed Payments</span>
            <span className="text-2xl font-black text-red-400 font-mono">{failedCount}</span>
            <p className="text-xs text-slate-500 mt-2 font-mono">Declined or aborted attempts</p>
          </div>
        </div>

        {/* Table list */}
        <div className="rounded-2xl border border-slate-900 bg-slate-900/60 backdrop-blur overflow-hidden">
          <div className="p-6 border-b border-slate-900 bg-slate-900/40">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest font-mono">Transactions</h2>
          </div>

          {isLoading ? (
            <div className="p-12 text-center flex flex-col justify-center items-center">
              <Loader2 className="w-8 h-8 text-sky-500 animate-spin mb-2" />
              <span className="text-sm text-slate-500 font-mono">Loading transaction history...</span>
            </div>
          ) : payments.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <AlertCircle className="w-10 h-10 mx-auto text-slate-650 mb-3" />
              <p className="text-sm font-semibold font-mono">No payments recorded yet.</p>
              <p className="text-xs mt-1 text-slate-600">Once you complete a service and pay the invoice, it will appear here.</p>
            </div>
          ) : (
            <div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 text-slate-500 text-[10px] uppercase font-mono bg-slate-950/60">
                      <th className="py-3.5 px-6 font-semibold tracking-wider">Transaction ID</th>
                      <th className="py-3.5 px-6 font-semibold tracking-wider">Job ID</th>
                      <th className="py-3.5 px-6 font-semibold tracking-wider">Date</th>
                      <th className="py-3.5 px-6 font-semibold tracking-wider text-right">Amount</th>
                      <th className="py-3.5 px-6 text-center font-semibold tracking-wider">Status</th>
                      <th className="py-3.5 px-6 text-center font-semibold tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 text-slate-355 text-sm bg-transparent">
                    {payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-slate-900/30 transition-colors">
                        <td className="py-4 px-6 font-mono text-xs text-slate-500">
                          {payment.razorpayOrderId || payment.id.substring(0, 12)}
                        </td>
                        <td className="py-4 px-6 font-semibold text-sky-400 hover:text-sky-350 hover:underline cursor-pointer" onClick={() => navigate(`/customer/payment/${payment.jobId}`)}>
                          #{payment.jobId.substring(0, 8).toUpperCase()}
                        </td>
                        <td className="py-4 px-6 text-slate-400">{formatDate(payment.createdAt)}</td>
                        <td className="py-4 px-6 text-right font-black text-white font-mono">
                          Rs. {payment.amount.toFixed(2)}
                        </td>
                        <td className="py-4 px-6 text-center">{getPaymentStatusBadge(payment.status)}</td>
                        <td className="py-4 px-6 text-center">
                          <div className="flex justify-center items-center gap-3">
                            <button
                              onClick={() => navigate(`/customer/payment/${payment.jobId}`)}
                              className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-bold uppercase tracking-wider cursor-pointer"
                            >
                              {payment.status === 'Captured' ? 'View Details' : 'Pay Now'} <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                            <a
                              href={`mailto:support@sendapro.com?subject=Dispute / Support Request for Transaction ${payment.id}`}
                              className="inline-flex items-center gap-0.5 text-xs text-slate-500 hover:text-slate-400"
                              title="Help or raise dispute"
                            >
                              <HelpCircle className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center px-6 py-4 border-t border-slate-900 bg-slate-950/60">
                  <span className="text-xs text-slate-500 font-mono">
                    Page {page} of {totalPages} ({totalCount} total)
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="inline-flex items-center gap-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 transition cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" /> Previous
                    </button>
                    <button
                      disabled={page === totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="inline-flex items-center gap-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 transition cursor-pointer"
                    >
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
