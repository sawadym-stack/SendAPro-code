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
        return <Badge variant="success">Paid</Badge>
      case 'Pending':
        return <Badge variant="warning">Pending</Badge>
      case 'Failed':
        return <Badge variant="danger">Failed</Badge>
      default:
        return <Badge variant="neutral">{status}</Badge>
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
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-indigo-150 text-indigo-700 p-2.5 rounded-xl">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-slate-900">Payment History</h1>
            <p className="text-slate-500 text-sm">Track your invoices, payments, and billing details</p>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="p-6 bg-white border border-slate-200">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Total Spent</span>
            <span className="text-2xl font-bold font-display text-indigo-650">Rs. {totalSpent.toFixed(2)}</span>
            <p className="text-xs text-slate-400 mt-2">Active billing cycle total</p>
          </Card>
          <Card className="p-6 bg-white border border-slate-200">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Paid Invoices</span>
            <span className="text-2xl font-bold font-display text-emerald-600">{successfulCount}</span>
            <p className="text-xs text-slate-400 mt-2">Successfully cleared transactions</p>
          </Card>
          <Card className="p-6 bg-white border border-slate-200">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Pending Invoices</span>
            <span className="text-2xl font-bold font-display text-amber-500">{pendingCount}</span>
            <p className="text-xs text-slate-400 mt-2">Awaiting payment completion</p>
          </Card>
          <Card className="p-6 bg-white border border-slate-200">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Failed Payments</span>
            <span className="text-2xl font-bold font-display text-red-500">{failedCount}</span>
            <p className="text-xs text-slate-400 mt-2">Declined or aborted attempts</p>
          </Card>
        </div>

        {/* Table list */}
        <Card className="overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-white">
            <h2 className="text-lg font-bold font-display text-slate-800">Transactions</h2>
          </div>

          {isLoading ? (
            <div className="p-12 text-center flex flex-col justify-center items-center">
              <Loader2 className="w-8 h-8 text-indigo-650 animate-spin mb-2" />
              <span className="text-sm text-slate-500 font-medium font-display">Loading transaction history...</span>
            </div>
          ) : payments.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <AlertCircle className="w-10 h-10 mx-auto text-slate-350 mb-3" />
              <p className="text-sm font-medium">No payments recorded yet.</p>
              <p className="text-xs mt-1">Once you complete a service and pay the invoice, it will appear here.</p>
            </div>
          ) : (
            <div className="bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 text-xs uppercase font-semibold bg-slate-50">
                      <th className="py-3.5 px-6 font-display">Transaction ID</th>
                      <th className="py-3.5 px-6 font-display">Job ID</th>
                      <th className="py-3.5 px-6 font-display">Date</th>
                      <th className="py-3.5 px-6 font-display text-right">Amount</th>
                      <th className="py-3.5 px-6 text-center font-display">Status</th>
                      <th className="py-3.5 px-6 text-center font-display">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
                    {payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-6 font-mono text-xs text-slate-500">
                          {payment.razorpayOrderId || payment.id.substring(0, 12)}
                        </td>
                        <td className="py-4 px-6 font-medium text-indigo-650 hover:underline cursor-pointer" onClick={() => navigate(`/customer/payment/${payment.jobId}`)}>
                          #{payment.jobId.substring(0, 8).toUpperCase()}
                        </td>
                        <td className="py-4 px-6 text-slate-500">{formatDate(payment.createdAt)}</td>
                        <td className="py-4 px-6 text-right font-bold text-slate-900">
                          Rs. {payment.amount.toFixed(2)}
                        </td>
                        <td className="py-4 px-6 text-center">{getPaymentStatusBadge(payment.status)}</td>
                        <td className="py-4 px-6 text-center">
                          <div className="flex justify-center items-center gap-3">
                            <button
                              onClick={() => navigate(`/customer/payment/${payment.jobId}`)}
                              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-bold"
                            >
                              {payment.status === 'Captured' ? 'View Details' : 'Pay Now'} <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                            <a
                              href={`mailto:support@sendapro.com?subject=Dispute / Support Request for Transaction ${payment.id}`}
                              className="inline-flex items-center gap-0.5 text-xs text-slate-400 hover:text-slate-650"
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
                <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 bg-slate-50">
                  <span className="text-xs text-slate-500">
                    Page {page} of {totalPages} ({totalCount} total)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" /> Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page === totalPages}
                      onClick={() => setPage((p) => p + 1)}
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
