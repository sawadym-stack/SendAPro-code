import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Package, MapPin, Calendar, Clock, Image as ImageIcon, Loader2, Check } from 'lucide-react'
import { QUERY_KEYS } from '../../constants/queryKeys'
import supplierService from '../../services/supplier.service'
import { formatCurrency, formatDate } from '../../utils/formatters'
import type { Quotation } from '../../types'

const STEPS = ['Accepted', 'Preparing', 'Dispatched', 'Delivered'] as const

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
      toast.success('Delivery proof photo uploaded')
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
      toast.error('Delivery photo proof is required')
      return
    }

    setUploadingId(id)
    try {
      // 1. Upload photo
      await uploadPhotoMutation.mutateAsync({ id, file })
      // 2. Mark as delivered
      await updateStatusMutation.mutateAsync({ id, status: 'Delivered' })
    } catch (e) {
      console.error('Failed to complete delivery sequence', e)
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
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-white border border-slate-100" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Order Fulfillment</h1>
        <p className="text-sm text-slate-500">Track and prepare product shipments and complete deliveries</p>
      </div>

      {activeOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="rounded-full bg-slate-50 p-4 text-slate-400">
            <Package className="h-8 w-8" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-700">No active orders</h3>
          <p className="mt-1 text-sm text-slate-500">Accepted quotations will appear as order pipelines here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeOrders.map((o) => {
            const stepIndex = STEPS.indexOf(o.status as any)
            const offeredPrice = o.offeredPrice ?? 0
            const totalPrice = o.requestedQty * offeredPrice
            const localPhoto = photoFiles[o.id]

            return (
              <div
                key={o.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition duration-150"
              >
                {/* Top header */}
                <div className="bg-slate-50 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-700">ORDER ID: {o.id.substring(0, 8)}</span>
                    <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-semibold uppercase">
                      In Progress
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" /> Ordered: {formatDate(o.requestedAt)}
                    </span>
                    {o.deliveryDate && (
                      <span className="flex items-center gap-1 font-semibold text-slate-700">
                        <Clock className="h-4 w-4 text-slate-500" /> Deliver by: {formatDate(o.deliveryDate)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Content Row */}
                  <div className="flex flex-col md:flex-row justify-between gap-6">
                    {/* Left: Product & Client */}
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 border">
                        <Package className="h-8 w-8" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-800 text-base">{o.materialName}</h4>
                        <p className="text-sm text-slate-600 font-semibold">
                          Qty {o.requestedQty} × Rs. {offeredPrice.toFixed(2)}
                          <span className="ml-3 text-base text-blue-600 font-extrabold">
                            Total: Rs. {totalPrice.toFixed(2)}
                          </span>
                        </p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium pt-1">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" /> Job context: {o.serviceType || 'Material delivery'} in{' '}
                            {o.area || 'Client Area'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-col justify-center gap-3 w-full md:max-w-xs shrink-0">
                      {o.status === 'Accepted' && (
                        <button
                          type="button"
                          disabled={updateStatusMutation.isPending}
                          onClick={() => updateStatusMutation.mutate({ id: o.id, status: 'Preparing' })}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 font-bold text-white shadow-sm hover:bg-blue-700 transition disabled:opacity-50"
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
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 font-bold text-white shadow-sm hover:bg-amber-700 transition disabled:opacity-50"
                        >
                          {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                          Mark as Dispatched
                        </button>
                      )}

                      {o.status === 'Dispatched' && (
                        <div className="space-y-2">
                          <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-350 bg-slate-50 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition">
                            <ImageIcon className="h-4.5 w-4.5 text-slate-500" />
                            {localPhoto ? localPhoto.name : 'Upload Delivery Photo proof'}
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
                              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50"
                            >
                              {uploadingId === o.id && <Loader2 className="h-4 w-4 animate-spin" />}
                              Confirm Delivery (Complete)
                            </button>
                          )}
                        </div>
                      )}

                      {o.status === 'Delivered' && (
                        <div className="flex flex-col items-end gap-2">
                          <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 px-3.5 py-1.5 text-xs font-bold uppercase">
                            <Check className="h-4 w-4" /> Delivered
                          </span>
                          {o.deliveryPhotoUrl && (
                            <div className="group relative h-14 w-20 overflow-hidden rounded-lg border border-slate-200">
                              <img
                                src={o.deliveryPhotoUrl}
                                alt="Delivery Proof"
                                className="h-full w-full object-cover"
                              />
                              <a
                                href={o.deliveryPhotoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="absolute inset-0 bg-black/40 flex items-center justify-center text-[10px] text-white opacity-0 group-hover:opacity-100 transition"
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
                  <div className="border-t border-slate-100 pt-5">
                    <div className="relative">
                      {/* Connecting Line */}
                      <div className="absolute inset-y-1/2 left-4 right-4 h-1 bg-slate-100 -translate-y-1/2" />
                      <div
                        className="absolute inset-y-1/2 left-4 h-1 bg-blue-500 -translate-y-1/2 transition-all duration-300"
                        style={{ width: `${(stepIndex / (STEPS.length - 1)) * 95}%` }}
                      />

                      {/* Nodes */}
                      <div className="relative z-10 flex justify-between">
                        {STEPS.map((s, idx) => {
                          const isCompleted = idx <= stepIndex
                          const isActive = idx === stepIndex

                          return (
                            <div key={s} className="flex flex-col items-center gap-2">
                              <div
                                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold border-2 transition ${
                                  isActive
                                    ? 'bg-blue-600 text-white border-blue-600 ring-4 ring-blue-100'
                                    : isCompleted
                                      ? 'bg-blue-500 text-white border-blue-500'
                                      : 'bg-white text-slate-400 border-slate-200'
                                }`}
                              >
                                {isCompleted && idx < stepIndex ? <Check className="h-4 w-4" /> : idx + 1}
                              </div>
                              <span
                                className={`text-[10px] sm:text-xs font-bold transition ${
                                  isActive ? 'text-blue-600 font-extrabold' : 'text-slate-500'
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
