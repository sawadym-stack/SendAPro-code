import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Package, MapPin, Calendar, Clock, Image as ImageIcon, Loader2, Check } from 'lucide-react'
import { QUERY_KEYS } from '../../constants/queryKeys'
import supplierService from '../../services/supplier.service'
import { formatCurrency, formatDate } from '../../utils/formatters'
import type { Quotation } from '../../types'

const parseOrderNotes = (notesStr?: string) => {
  if (!notesStr) return { isBulk: false, isPickup: false, displayNotes: '', bulkItems: [] }
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

const OrdersPage = () => {
  const queryClient = useQueryClient()
  const [photoFiles, setPhotoFiles] = useState<Record<string, File>>({})
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  // Fetch all orders (we retrieve all and filter in-progress orders client-side)
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.orders,
    queryFn: () => supplierService.listQuotations(),
  })

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => supplierService.updateOrderStatus(id, status),
    onSuccess: (updated) => {
      toast.success(`Order moved to ${updated.status}`)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orders })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update order status')
    },
  })

  const uploadPhotoMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => supplierService.uploadDeliveryPhoto(id, file),
    onSuccess: (_, variables) => {
      toast.success('Collection/delivery proof photo uploaded')
      // Remove file from local state
      setPhotoFiles((prev) => {
        const next = { ...prev }
        delete next[variables.id]
        return next
      })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orders })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to upload photo')
    },
  })

  const handleDeliver = async (id: string) => {
    const file = photoFiles[id]
    if (!file) {
      toast.error('Proof photo is required')
      return
    }

    setUploadingId(id)
    try {
      // 1. Upload photo
      await uploadPhotoMutation.mutateAsync({ id, file })
      // 2. Mark as delivered/collected
      await updateStatusMutation.mutateAsync({ id, status: 'Delivered' })
    } catch (e) {
      console.error('Failed to complete collection sequence', e)
    } finally {
      setUploadingId(null)
    }
  }

  const list = data?.quotations ?? []
  const activeOrders = list.filter((q) =>
    ['Accepted', 'Preparing', 'Dispatched', 'Delivered'].includes(q.status),
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-900/40 border border-slate-800/80" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Order Fulfillment</h1>
        <p className="text-sm text-slate-400">Track and prepare product shipments and complete deliveries</p>
      </div>

      {activeOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 p-12 text-center shadow-sm">
          <div className="rounded-full bg-slate-800 p-4 text-slate-500 border border-slate-800">
            <Package className="h-8 w-8 text-emerald-500" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-200">No active orders</h3>
          <p className="mt-1 text-sm text-slate-400">Accepted quotations will appear as order pipelines here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeOrders.map((o) => {
            const { isBulk, isPickup, displayNotes, bulkItems } = parseOrderNotes(o.notes)
            const orderSteps = isPickup
              ? ['Accepted', 'Preparing', 'Ready for Pickup', 'Collected']
              : ['Accepted', 'Preparing', 'Dispatched', 'Delivered']

            const dbStatusToStepName = (status: string, pickup: boolean) => {
              if (status === 'Dispatched' && pickup) return 'Ready for Pickup'
              if (status === 'Delivered' && pickup) return 'Collected'
              return status
            }

            const currentStepName = dbStatusToStepName(o.status, isPickup)
            const stepIndex = orderSteps.indexOf(currentStepName)
            const offeredPrice = o.offeredPrice ?? 0
            const totalPrice = o.requestedQty * offeredPrice
            const localPhoto = photoFiles[o.id]

            return (
              <div
                key={o.id}
                className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-md shadow-lg hover:border-slate-700/80 transition duration-300"
              >
                {/* Top header */}
                <div className="bg-slate-900/80 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800/60">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-200">ORDER ID: {o.id.substring(0, 8)}</span>
                    <span className="rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold uppercase">
                      In Progress
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-emerald-500/70" /> Ordered: {formatDate(o.requestedAt)}
                    </span>
                    {o.deliveryDate && (
                      <span className="flex items-center gap-1 font-semibold text-slate-200">
                        <Clock className="h-4 w-4 text-emerald-500" />{' '}
                        {isPickup ? 'Pickup by' : 'Deliver by'}: {formatDate(o.deliveryDate)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Content Row */}
                  <div className="flex flex-col md:flex-row justify-between gap-6">
                    {/* Left: Product & Client */}
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-800/50 text-slate-400 border border-slate-700/50 mt-1">
                        <Package className="h-8 w-8 text-emerald-500" />
                      </div>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-white text-base truncate">
                            {isBulk ? '📋 Bulk Project Package' : o.materialName}
                          </h4>
                          {isPickup ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-505/10 border border-amber-500/25 px-2.5 py-0.5 text-[10px] font-bold text-amber-400">
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

                        <p className="text-sm text-slate-300 font-semibold">
                          {isBulk ? (
                            <span className="text-base text-emerald-400 font-extrabold">
                              Total Package Price: Rs. {offeredPrice.toFixed(2)}
                            </span>
                          ) : (
                            <>
                              Qty {o.requestedQty} × Rs. {offeredPrice.toFixed(2)}
                              <span className="ml-3 text-base text-emerald-400 font-extrabold">
                                Total: Rs. {totalPrice.toFixed(2)}
                              </span>
                            </>
                          )}
                        </p>

                        {/* Bulk items list table */}
                        {isBulk && bulkItems.length > 0 && (
                          <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-955/45 max-w-xl">
                            <table className="min-w-full divide-y divide-slate-800 text-left text-xs text-slate-300">
                              <thead className="bg-slate-900/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                <tr>
                                  <th className="px-3 py-2">Material</th>
                                  <th className="px-3 py-2 text-right">Qty</th>
                                  <th className="px-3 py-2 text-right">Catalog Price</th>
                                  <th className="px-3 py-2 text-right">Est. Subtotal</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800 text-slate-350">
                                {bulkItems.map((item) => (
                                  <tr key={item.id} className="hover:bg-slate-900/30">
                                    <td className="px-3 py-2 font-semibold text-white">{item.name}</td>
                                    <td className="px-3 py-2 text-right">{item.qty}</td>
                                    <td className="px-3 py-2 text-right">Rs. {item.price.toFixed(2)}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-white">
                                      Rs. {(item.price * item.qty).toFixed(2)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-medium pt-1">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-slate-500" />{' '}
                            {isPickup
                              ? 'Customer collection at store'
                              : `Delivery to client: ${o.serviceType || 'Material delivery'} in ${o.area || 'Client Area'}`}
                          </span>
                        </div>

                        {displayNotes && (
                          <p className="text-xs italic bg-slate-950/30 border border-slate-800/80 rounded-lg px-2.5 py-1 text-slate-300 mt-2 max-w-md">
                            <span className="font-bold text-[9px] uppercase tracking-wider block text-slate-500 not-italic">Client Notes:</span>
                            "{displayNotes}"
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-col justify-center gap-3 w-full md:max-w-xs shrink-0">
                      {o.status === 'Accepted' && (
                        <button
                          type="button"
                          disabled={updateStatusMutation.isPending}
                          onClick={() => updateStatusMutation.mutate({ id: o.id, status: 'Preparing' })}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 font-bold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50 cursor-pointer"
                        >
                          {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                          Start Preparing
                        </button>
                      )}

                      {o.status === 'Preparing' && (
                        <button
                          type="button"
                          disabled={updateStatusMutation.isPending}
                          onClick={() => updateStatusMutation.mutate({ id: o.id, status: 'Dispatched' })}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 font-bold text-white shadow-sm hover:bg-amber-500 transition disabled:opacity-50 cursor-pointer"
                        >
                          {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                          {isPickup ? 'Mark as Ready for Pickup' : 'Mark as Dispatched'}
                        </button>
                      )}

                      {o.status === 'Dispatched' && (
                        <div className="space-y-2">
                          <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-800/40 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800/70 hover:border-slate-600 transition">
                            <ImageIcon className="h-4.5 w-4.5 text-slate-400" />
                            {localPhoto ? localPhoto.name : (isPickup ? 'Upload Signed Collection Receipt' : 'Upload Delivery Photo proof')}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) {
                                  setPhotoFiles((prev) => ({ ...prev, [o.id]: f }))
                                }
                              }}
                            />
                          </label>
                          {localPhoto && (
                            <button
                              type="button"
                              disabled={uploadingId === o.id}
                              onClick={() => handleDeliver(o.id)}
                              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 font-bold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50 cursor-pointer"
                            >
                              {uploadingId === o.id && <Loader2 className="h-4 w-4 animate-spin" />}
                              {isPickup ? 'Confirm Collection (Complete)' : 'Confirm Delivery (Complete)'}
                            </button>
                          )}
                        </div>
                      )}

                      {o.status === 'Delivered' && (
                        <div className="flex flex-col items-end gap-2">
                          <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3.5 py-1.5 text-xs font-bold uppercase">
                            <Check className="h-4 w-4" /> {isPickup ? 'Collected' : 'Delivered'}
                          </span>
                          {o.deliveryPhotoUrl && (
                            <div className="group relative h-14 w-20 overflow-hidden rounded-lg border border-slate-800">
                              <img
                                src={o.deliveryPhotoUrl}
                                alt={isPickup ? "Collection Proof" : "Delivery Proof"}
                                className="h-full w-full object-cover"
                              />
                              <a
                                href={o.deliveryPhotoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] text-white opacity-0 group-hover:opacity-100 transition"
                              >
                                View Proof
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 4-Step Pipeline Status bar */}
                  <div className="border-t border-slate-800/60 pt-5">
                    <div className="relative">
                      {/* Connecting Line */}
                      <div className="absolute inset-y-1/2 left-4 right-4 h-1 bg-slate-800 -translate-y-1/2" />
                      <div
                        className="absolute inset-y-1/2 left-4 h-1 bg-emerald-500 -translate-y-1/2 transition-all duration-300"
                        style={{ width: `${(stepIndex / (orderSteps.length - 1)) * 95}%` }}
                      />

                      {/* Nodes */}
                      <div className="relative z-10 flex justify-between">
                        {orderSteps.map((s, idx) => {
                          const isCompleted = idx <= stepIndex
                          const isActive = idx === stepIndex

                          return (
                            <div key={s} className="flex flex-col items-center gap-2">
                              <div
                                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold border-2 transition ${
                                  isActive
                                    ? 'bg-emerald-600 text-white border-emerald-600 ring-4 ring-emerald-500/20'
                                    : isCompleted
                                      ? 'bg-emerald-500 text-white border-emerald-500'
                                      : 'bg-slate-900 text-slate-500 border-slate-800'
                                }`}
                              >
                                {isCompleted && idx < stepIndex ? <Check className="h-4 w-4" /> : idx + 1}
                              </div>
                              <span
                                className={`text-[10px] sm:text-xs font-bold transition ${
                                  isActive ? 'text-emerald-400 font-extrabold' : 'text-slate-400'
                                }`}
                              >
                                {s}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default OrdersPage
