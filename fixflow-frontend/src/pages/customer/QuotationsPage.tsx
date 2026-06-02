import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ClipboardList, Loader2, Package, Clock, User, Check, X, Send } from 'lucide-react'
import { QUERY_KEYS } from '../../constants/queryKeys'
import supplierService from '../../services/supplier.service'
import { useWS } from '../../context/WSContext'
import { formatTimeAgo, formatDate } from '../../utils/formatters'
import type { Quotation } from '../../types'

const getStatusBadgeStyles = (status: string) => {
  switch (status) {
    case 'Pending':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'Quoted':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse'
    case 'CounterOffered':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'Accepted':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'Rejected':
      return 'bg-rose-50 text-rose-700 border-rose-200'
    case 'Expired':
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

const QuotationsPage = () => {
  const queryClient = useQueryClient()
  const location = useLocation()
  const { on, off } = useWS()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [counterItem, setCounterItem] = useState<Quotation | null>(null)

  // Detect role: customer or technician
  const isTechnician = location.pathname.startsWith('/technician')

  // Fetch quotations (customer scoped)
  const { data, isLoading } = useQuery({
    queryKey: [QUERY_KEYS.quotations, 'customer-view'],
    queryFn: () => supplierService.listQuotations(),
  })

  // Sync state
  useEffect(() => {
    if (data?.quotations) {
      setQuotations(data.quotations)
    }
  }, [data])

  // WebSocket notifications
  useEffect(() => {
    const handleQuotationUpdate = (payload: any) => {
      setQuotations((prev) =>
        prev.map((q) => (q.id === payload.quotationId ? { ...q, status: payload.status } : q)),
      )
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.quotations, 'customer-view'] })

      if (payload.status === 'Quoted') {
        // Show clickable toast
        toast(
          (t) => (
            <div
              onClick={() => {
                toast.dismiss(t.id)
                document.getElementById(`quotation-${payload.quotationId}`)?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                })
              }}
              className="cursor-pointer flex flex-col gap-0.5 text-xs font-semibold text-slate-800 hover:underline"
            >
              <span>Supplier quoted Rs.{payload.price} for {payload.materialName}</span>
              <span className="text-[10px] text-blue-500 font-bold">Click here to view quote card</span>
            </div>
          ),
          { icon: '💰', duration: 7000 },
        )
      }
    }

    on('quotation_update', handleQuotationUpdate)

    return () => {
      off('quotation_update', handleQuotationUpdate)
    }
  }, [on, off, queryClient])

  // Mutations
  const acceptMutation = useMutation({
    mutationFn: (id: string) => supplierService.acceptQuotation(id),
    onSuccess: (updated) => {
      toast.success('Quotation accepted successfully!')
      setQuotations((prev) => prev.map((q) => (q.id === updated.id ? updated : q)))
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.quotations, 'customer-view'] })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to accept quotation')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => supplierService.rejectQuotation(id),
    onSuccess: (_, id) => {
      toast.success('Quotation rejected')
      setQuotations((prev) => prev.map((q) => (q.id === id ? { ...q, status: 'Rejected' } : q)))
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.quotations, 'customer-view'] })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to reject quotation')
    },
  })

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">My Material Quotes</h1>
        <p className="text-sm text-slate-500">Review quotes, submit counter-offers, and place orders</p>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border bg-white">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : quotations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="rounded-full bg-slate-50 p-4 text-slate-400">
            <ClipboardList className="h-8 w-8" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-700">No quotation requests</h3>
          <p className="mt-1 text-sm text-slate-500">Go to supplier discovery and select materials to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {quotations.map((q) => {
            const isQuoted = q.status === 'Quoted'
            const offeredPrice = q.offeredPrice ?? 0

            return (
              <div
                key={q.id}
                id={`quotation-${q.id}`}
                className={`overflow-hidden rounded-2xl border p-5 shadow-xs transition duration-300 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isQuoted ? 'border-blue-400 bg-blue-50/15 shadow-sm ring-1 ring-blue-100' : 'border-slate-200 bg-white'
                }`}
              >
                {/* Product details */}
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 border">
                    <Package className="h-6 w-6" />
                  </div>

                  <div className="space-y-1">
                    <h4 className="font-semibold text-slate-800 text-base">{q.materialName}</h4>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-medium">
                      <span className="font-semibold text-slate-700">Qty: {q.requestedQty} units</span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3.5 w-3.5" /> Supplier: {q.supplierId ? 'ID ' + q.supplierId.substring(0, 8) : 'Distributor'}
                      </span>
                    </div>

                    {isQuoted && (
                      <div className="pt-2 flex flex-col gap-1">
                        <span className="text-sm font-bold text-emerald-600">
                          Offered Price: Rs. {offeredPrice.toFixed(2)}
                          <span className="text-xs text-slate-500 font-medium ml-1">
                            (Total: Rs. {(offeredPrice * q.requestedQty).toFixed(2)})
                          </span>
                        </span>
                        {q.deliveryDate && (
                          <span className="text-xs text-slate-600 font-medium">
                            Delivers by: {formatDate(q.deliveryDate)}
                          </span>
                        )}
                      </div>
                    )}

                    {q.status === 'CounterOffered' && (
                      <p className="text-xs font-bold text-amber-600 pt-2">
                        You countered with price: Rs. {q.counterPrice?.toFixed(2)}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-2">
                      <Clock className="h-3 w-3" />
                      <span>Requested {formatTimeAgo(q.requestedAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Status and Action Buttons */}
                <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
                  <span
                    className={`rounded-full border px-3 py-0.5 text-xs font-semibold uppercase tracking-wider ${getStatusBadgeStyles(
                      q.status,
                    )}`}
                  >
                    {q.status}
                  </span>

                  <div className="flex items-center gap-2">
                    {isQuoted && (
                      <>
                        <button
                          onClick={() => acceptMutation.mutate(q.id)}
                          disabled={acceptMutation.isPending}
                          className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => setCounterItem(q)}
                          className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                        >
                          Counter Offer
                        </button>
                        <button
                          onClick={() => rejectMutation.mutate(q.id)}
                          disabled={rejectMutation.isPending}
                          className="rounded-xl border border-transparent bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {q.status === 'CounterOffered' && (
                      <span className="text-xs text-slate-400 font-semibold italic">
                        Awaiting supplier response...
                      </span>
                    )}

                    {q.status === 'Pending' && (
                      <span className="text-xs text-slate-400 font-semibold">
                        Awaiting initial quote...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Counter Offer Modal */}
      {counterItem && (
        <CounterOfferModal
          quotation={counterItem}
          onClose={() => setCounterItem(null)}
          onSuccess={(updated) => {
            setQuotations((prev) => prev.map((q) => (q.id === updated.id ? updated : q)))
            setCounterItem(null)
          }}
        />
      )}
    </div>
  )
}

// CounterOfferModal
const CounterOfferModal = ({
  quotation,
  onClose,
  onSuccess,
}: {
  quotation: Quotation
  onClose: () => void
  onSuccess: (q: Quotation) => void
}) => {
  const [price, setPrice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const counterPrice = parseFloat(price)

    if (isNaN(counterPrice) || counterPrice <= 0) {
      toast.error('Please enter a valid counter price')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await supplierService.counterOffer(quotation.id, counterPrice)
      toast.success('Counter offer submitted!')
      onSuccess(result)
    } catch (err: any) {
      toast.error(err.message || 'Counter offer submission failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-bold text-slate-800 mb-4">Counter Quote price</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Your Counter Price (Rs. per unit)</label>
            <input
              type="number"
              step="0.01"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={`Quoted price: Rs. ${quotation.offeredPrice}`}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit Counter
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default QuotationsPage
