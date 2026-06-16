import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Package, Clock, User, ClipboardList, Loader2, MapPin, Wrench } from 'lucide-react'
import { QUERY_KEYS } from '../../constants/queryKeys'
import supplierService from '../../services/supplier.service'
import { useWS } from '../../context/WSContext'
import { formatTimeAgo } from '../../utils/formatters'
import type { Quotation } from '../../types'

const STATUS_TABS = ['All', 'Pending', 'Quoted', 'CounterOffered', 'Accepted', 'Rejected', 'Expired'] as const

const getStatusBadgeStyles = (status: string) => {
  switch (status) {
    case 'Pending':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/25'
    case 'Quoted':
      return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25'
    case 'CounterOffered':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/25'
    case 'Accepted':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 animate-pulse'
    case 'Rejected':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/25'
    case 'Expired':
    default:
      return 'bg-slate-800/50 text-slate-400 border-slate-700/50'
  }
}

const parseNotes = (notesStr?: string) => {
  if (!notesStr) return { isBulk: false, isPickup: false, displayNotes: '', bulkItems: [] as Array<{ id: string; name: string; qty: number; price: number }> }
  const isPickup = notesStr.includes('[Mode: Self-Pickup]')
  let cleanNotes = notesStr.replace('[Mode: Self-Pickup]', '').trim()
  
  const isBulk = cleanNotes.startsWith('[Bulk BOM Request]')
  let bulkItems: Array<{ id: string; name: string; qty: number; price: number }> = []
  if (isBulk) {
    try {
      const jsonStart = cleanNotes.indexOf('[')
      const contentAfterPrefix = cleanNotes.substring('[Bulk BOM Request]'.length).trim()
      const jsonEnd = contentAfterPrefix.indexOf(']')
      if (jsonEnd !== -1) {
        const jsonStr = contentAfterPrefix.substring(0, jsonEnd + 1)
        bulkItems = JSON.parse(jsonStr)
        const rest = contentAfterPrefix.substring(jsonEnd + 1).trim()
        cleanNotes = rest.replace(/^\|\s*Project Notes:\s*/, '').trim()
      }
    } catch (e) {
      console.error('Failed to parse bulk BOM items:', e)
    }
  }
  return { isBulk, isPickup, displayNotes: cleanNotes, bulkItems }
}

const QuotationsPage = () => {
  const queryClient = useQueryClient()
  const { on, off } = useWS()
  const [activeTab, setActiveTab] = useState<(typeof STATUS_TABS)[number]>('All')
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [respondItem, setRespondItem] = useState<Quotation | null>(null)

  // Fetch quotations
  const { data, isLoading } = useQuery({
    queryKey: [QUERY_KEYS.quotations, activeTab],
    queryFn: () => supplierService.listQuotations({ status: activeTab === 'All' ? undefined : activeTab }),
  })

  // Sync with local state
  useEffect(() => {
    if (data?.quotations) {
      setQuotations(data.quotations)
    }
  }, [data])

  // Setup WS Subscriptions
  useEffect(() => {
    const handleQuotationRequest = (payload: any) => {
      // Create new quotation structure
      const newQuotation: Quotation = {
        id: payload.quotationId,
        materialId: '',
        materialName: payload.materialName,
        jobId: payload.jobId,
        requesterId: '',
        supplierId: '',
        status: 'Pending',
        requestedQty: payload.qty,
        area: payload.requesterArea,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        requestedAt: new Date().toISOString(),
      }

      // Prepend to list
      setQuotations((prev) => [newQuotation, ...prev])

      // Highlight for 3s
      setNewIds((prev) => new Set([...prev, payload.quotationId]))
      setTimeout(() => {
        setNewIds((prev) => {
          const next = new Set(prev)
          next.delete(payload.quotationId)
          return next
        })
      }, 3000)

      toast(`New quotation request for ${payload.materialName}`, { icon: '📦' })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.quotations })
    }

    const handleQuotationUpdate = (payload: any) => {
      setQuotations((prev) =>
        prev.map((q) => (q.id === payload.quotationId ? { ...q, status: payload.status } : q)),
      )
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.quotations })
    }

    on('quotation_request', handleQuotationRequest)
    on('quotation_update', handleQuotationUpdate)

    return () => {
      off('quotation_request', handleQuotationRequest)
      off('quotation_update', handleQuotationUpdate)
    }
  }, [on, off, queryClient])

  // Mutations
  const acceptCounterMutation = useMutation({
    mutationFn: (id: string) => supplierService.acceptQuotation(id),
    onSuccess: (updated) => {
      toast.success('Counter offer accepted!')
      setQuotations((prev) => prev.map((q) => (q.id === updated.id ? updated : q)))
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.quotations })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to accept counter offer')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => supplierService.rejectQuotation(id),
    onSuccess: (_, id) => {
      toast.success('Quotation rejected')
      setQuotations((prev) => prev.map((q) => (q.id === id ? { ...q, status: 'Rejected' } : q)))
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.quotations })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to reject quotation')
    },
  })

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Quotation Pipeline</h1>
        <p className="text-sm text-slate-400">Track and respond to client price requests in real time</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {STATUS_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition border ${
              activeTab === t
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {t === 'CounterOffered' ? 'Counter Offers' : t}
          </button>
        ))}
      </div>

      {/* Quotation List */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      ) : quotations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 p-12 text-center shadow-sm">
          <div className="rounded-full bg-slate-800 p-4 text-slate-500 border border-slate-800">
            <ClipboardList className="h-8 w-8 text-emerald-500" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-200">No quotation records</h3>
          <p className="mt-1 text-sm text-slate-400">Any active user requests will appear here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {quotations.map((q) => {
            const isNew = newIds.has(q.id)
            const isMuted = q.status === 'Rejected' || q.status === 'Expired'
            const { isBulk, isPickup, displayNotes, bulkItems } = parseNotes(q.notes)

            return (
              <div
                key={q.id}
                className={`relative overflow-hidden rounded-2xl border p-5 shadow-sm transition duration-300 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isNew
                    ? 'border-amber-500/40 bg-amber-500/5 shadow-md ring-1 ring-amber-500/10'
                    : 'border-slate-800 bg-slate-900/40 backdrop-blur-md hover:border-slate-700/80 hover:shadow-md'
                } ${isMuted ? 'opacity-65' : ''}`}
              >
                {/* Visual New Item indicator */}
                {isNew && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-500" />}

                {/* Left & Center Information */}
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800/50 text-slate-400 border border-slate-700/50 mt-1">
                    <Package className="h-6 w-6 text-emerald-500" />
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-white text-base truncate">
                        {isBulk ? '📋 Bulk Project Bidding Request' : q.materialName}
                      </h4>
                      {isPickup ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/25 px-2.5 py-0.5 text-[10px] font-bold text-amber-400">
                          🛍️ Self-Pickup
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/25 px-2.5 py-0.5 text-[10px] font-bold text-blue-400">
                          🚚 Delivery
                        </span>
                      )}
                      {isBulk && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/25 px-2.5 py-0.5 text-[10px] font-bold text-purple-400">
                          📦 Project BOM
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-medium">
                      {!isBulk && (
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-200">
                          Requested: {q.requestedQty} units
                        </span>
                      )}
                      {isBulk && (
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-200">
                          {bulkItems.length} items total
                        </span>
                      )}
                      {q.serviceType && (
                        <span className="inline-flex items-center gap-1">
                          <Wrench className="h-3.5 w-3.5 text-emerald-500/70" /> {q.serviceType}
                        </span>
                      )}
                      {q.area && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-emerald-500/70" /> {q.area}
                        </span>
                      )}
                    </div>

                    {/* Bulk items list table */}
                    {isBulk && bulkItems.length > 0 && (
                      <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/45 max-w-xl">
                        <table className="min-w-full divide-y divide-slate-800 text-left text-xs text-slate-350">
                          <thead className="bg-slate-900/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <tr>
                              <th className="px-3 py-2">Material</th>
                              <th className="px-3 py-2 text-right">Qty</th>
                              <th className="px-3 py-2 text-right">Catalog Price</th>
                              <th className="px-3 py-2 text-right">Est. Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 text-slate-350">
                            {bulkItems.map((item: { id: string; name: string; qty: number; price: number }) => (
                              <tr key={item.id} className="hover:bg-slate-900/30">
                                <td className="px-3 py-2 font-semibold text-white">{item.name}</td>
                                <td className="px-3 py-2 text-right">{item.qty}</td>
                                <td className="px-3 py-2 text-right">Rs. {item.price.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-white">
                                  Rs. {(item.price * item.qty).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-slate-900/50 font-bold text-white">
                              <td colSpan={3} className="px-3 py-2 text-right text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                                Est. Catalog Total
                              </td>
                              <td className="px-3 py-2 text-right text-xs font-extrabold text-emerald-400">
                                Rs. {bulkItems.reduce((sum: number, item: { id: string; name: string; qty: number; price: number }) => sum + item.price * item.qty, 0).toFixed(2)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}

                    {displayNotes && (
                      <p className="text-xs italic bg-slate-950/40 border border-slate-800/80 rounded-lg px-2.5 py-1 text-slate-300 mt-2 max-w-md">
                        <span className="font-bold text-[9px] uppercase tracking-wider block text-slate-500 not-italic">Client Notes:</span>
                        "{displayNotes}"
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-2.5">
                      <User className="h-3 w-3 text-slate-500" />
                      <span>By: {q.requesterName || 'Client ID ' + q.requesterId.substring(0, 5)}</span>
                      <span>•</span>
                      <Clock className="h-3 w-3 text-slate-500" />
                      <span>{formatTimeAgo(q.requestedAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Right Status Badge & Actions */}
                <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 border-t md:border-t-0 border-slate-800/60 pt-3 md:pt-0">
                  <span
                    className={`rounded-full border px-3 py-0.5 text-xs font-semibold uppercase tracking-wider ${getStatusBadgeStyles(
                      q.status,
                    )}`}
                  >
                    {q.status}
                  </span>

                  <div className="flex items-center gap-2">
                    {q.status === 'Pending' && (
                      <button
                        onClick={() => setRespondItem(q)}
                        className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition cursor-pointer"
                      >
                        Respond
                      </button>
                    )}

                    {q.status === 'CounterOffered' && (
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-right mr-1">
                          <p className="font-semibold text-slate-400">Counter offer</p>
                          <p className="font-bold text-amber-400 text-sm">Rs. {q.counterPrice?.toFixed(2)}</p>
                        </div>
                        <button
                          onClick={() => acceptCounterMutation.mutate(q.id)}
                          disabled={acceptCounterMutation.isPending}
                          className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition cursor-pointer"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => rejectMutation.mutate(q.id)}
                          disabled={rejectMutation.isPending}
                          className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    )}

                    {q.status === 'Quoted' && (
                      <div className="text-right">
                        <p className="text-xs font-bold text-indigo-400">
                          Offered Rs. {q.offeredPrice?.toFixed(2)} {isBulk && '(Package Total)'}
                        </p>
                        <p className="text-[10px] text-slate-500 font-medium mt-0.5">Awaiting user response...</p>
                      </div>
                    )}

                    {q.status === 'Accepted' && (
                      <Link
                        to="/supplier/orders"
                        className="rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-3.5 py-1.5 text-xs font-bold hover:bg-emerald-500/20 transition"
                      >
                        View Order
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Respond Dialog */}
      {respondItem && (
        <RespondDialog
          quotation={respondItem}
          onClose={() => setRespondItem(null)}
          onSuccess={(updated) => {
            setQuotations((prev) => prev.map((q) => (q.id === updated.id ? updated : q)))
            setRespondItem(null)
          }}
        />
      )}
    </div>
  )
}

// RespondDialog component
const RespondDialog = ({
  quotation,
  onClose,
  onSuccess,
}: {
  quotation: Quotation
  onClose: () => void
  onSuccess: (q: Quotation) => void
}) => {
  const isBulk = quotation.notes ? quotation.notes.includes('[Bulk BOM Request]') : false
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState(isBulk ? '1' : `${quotation.requestedQty}`)
  const [notes, setNotes] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const tomorrowStr = useMemo(() => {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000)
    return tomorrow.toISOString().split('T')[0]
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const offeredPrice = parseFloat(price)
    const availableQty = parseInt(qty, 10)

    if (isNaN(offeredPrice) || offeredPrice <= 0) {
      toast.error('Please enter a valid offered price greater than 0')
      return
    }
    if (!isBulk && (isNaN(availableQty) || availableQty <= 0)) {
      toast.error('Please enter a valid quantity')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await supplierService.respondToQuotation(quotation.id, {
        price: offeredPrice,
        qty: availableQty,
        deliveryDate: deliveryDate || undefined,
      })
      toast.success('Quotation response sent!')
      onSuccess(result)
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit response')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 p-6 shadow-2xl border border-slate-800">
        <h3 className="text-lg font-bold text-white mb-4">
          {isBulk ? 'Respond to Bulk Project Quote Request' : `Respond to ${quotation.materialName}`}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {isBulk ? 'Offered Package Price (Rs.)' : 'Offered Unit Price (Rs.)'}
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={isBulk ? "Enter total package price" : "Enter price per unit"}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {!isBulk && (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Available Quantity</label>
              <input
                type="number"
                required
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="Quantity available for delivery"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {quotation.notes && quotation.notes.includes('[Mode: Self-Pickup]')
                ? 'Estimated Ready for Pickup Date'
                : 'Estimated Delivery Date'}
            </label>
            <input
              type="date"
              min={tomorrowStr}
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Notes to Client (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Specify warranty, quality, or delivery remarks..."
              rows={3}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800/60">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-2 text-sm font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-200 focus:outline-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Offer
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default QuotationsPage
