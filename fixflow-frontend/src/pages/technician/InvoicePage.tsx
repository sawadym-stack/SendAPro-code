import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { Loader2, Plus, Trash2, ArrowLeft, FileText, CheckCircle2 } from 'lucide-react'
import jobService from '../../services/job.service'
import supplierService from '../../services/supplier.service'
import paymentService from '../../services/payment.service'
import { Button, Input, Card } from '../../components/ui'
import type { Job, Quotation } from '../../types'

const invoiceFormSchema = z.object({
  labourCharge: z.coerce.number().min(0, 'Labour charge must be positive'),
  materialItems: z.array(
    z.object({
      description: z.string().min(1, 'Description is required'),
      quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
      unitPrice: z.coerce.number().min(0, 'Unit price must be positive'),
    })
  ),
})

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>

export const InvoicePage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const [job, setJob] = useState<Job | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema) as any,
    defaultValues: {
      labourCharge: 0,
      materialItems: [],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'materialItems',
  })

  // Watch fields for real-time total calculations
  const watchLabourCharge = watch('labourCharge')
  const watchMaterialItems = watch('materialItems')

  const labourCharge = Number(watchLabourCharge) || 0
  const materialItems = (watchMaterialItems || []).map((item) => {
    if (!item) return { description: '', quantity: 0, unitPrice: 0 }
    return {
      description: item.description || '',
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
    }
  })

  // Calculate totals
  const subtotal = labourCharge + materialItems.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0)
  const taxAmount = subtotal * 0.18
  const grandTotal = subtotal + taxAmount

  useEffect(() => {
    const fetchData = async () => {
      if (!jobId) return
      try {
        setIsLoadingData(true)
        // Fetch Job Details
        const jobData = await jobService.getJob(jobId)
        setJob(jobData)

        // Check if invoice already exists
        try {
          const existingInvoice = await paymentService.getInvoice(jobId)
          if (existingInvoice) {
            toast.error('Invoice has already been generated for this job.')
            navigate('/technician/earnings')
            return
          }
        } catch (invoiceErr: any) {
          // A 404 error is expected when no invoice exists yet
          if (invoiceErr.statusCode !== 404) {
            console.error('Error checking existing invoice:', invoiceErr)
          }
        }

        // Fetch accepted quotations for this job
        const { quotations } = await supplierService.listQuotations({ limit: 100 })
        const acceptedQuotations = quotations.filter(
          (q: Quotation) => q.jobId === jobId && q.status === 'Accepted'
        )

        // Pre-populate material items from accepted quotations
        if (acceptedQuotations.length > 0) {
          const prefilledMaterials = acceptedQuotations.map((q: Quotation) => ({
            description: q.materialName || 'Material Item',
            quantity: q.requestedQty,
            unitPrice: q.counterPrice ?? q.offeredPrice ?? 0,
          }))
          setValue('materialItems', prefilledMaterials)
        }
      } catch (err) {
        console.error('Error fetching invoice details:', err)
        toast.error('Failed to load job details or quotations')
      } finally {
        setIsLoadingData(false)
      }
    }

    fetchData()
  }, [jobId, setValue, navigate])

  const onSubmit = async (values: InvoiceFormValues) => {
    if (!jobId) return
    try {
      setIsSubmitting(true)
      await paymentService.generateInvoice({
        jobId,
        labourCharge: values.labourCharge,
        materialItems: values.materialItems,
      })
      toast.success('Invoice generated successfully!')
      
      // Redirect to technician earnings page
      navigate('/technician/earnings')
    } catch (err: any) {
      console.error('Invoice generation failed:', err)
      toast.error(err.message || 'Failed to generate invoice')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoadingData) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
        <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mb-4" />
        <p className="text-slate-400 font-medium font-mono">Loading job & quotation details...</p>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
        <p className="text-slate-400 text-lg font-bold font-mono mb-4">Job not found.</p>
        <Button onClick={() => navigate(-1)} variant="outline" className="border-slate-800 hover:bg-slate-900 text-white">
          Go Back
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-slate-100 relative">
      {/* Ambient background glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,58,138,0.15),transparent_70%)] pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-2 text-slate-500 hover:text-white text-sm font-semibold transition-colors focus:outline-none cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Header Title */}
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 p-2.5 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black font-display text-white tracking-tight">Generate Invoice</h1>
            <p className="text-slate-450 text-sm">Create an itemized invoice for the completed job</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form Area */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 bg-slate-900/60 border-slate-900 shadow-xl backdrop-blur-xl">
              <h2 className="text-lg font-black font-display text-slate-200 border-b border-slate-900 pb-3 mb-4">Job Summary</h2>
              <div className="space-y-3 text-sm text-slate-300">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-500 font-mono">Customer:</span>
                  <span className="font-medium text-white">{job.customerName || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-500 font-mono">Service:</span>
                  <span className="font-medium text-white">{job.serviceType || 'General Service'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-500 font-mono mb-1">Description:</span>
                  <span className="text-slate-300 bg-slate-950/60 p-3 rounded-lg border border-slate-900 italic">
                    "{job.description}"
                  </span>
                </div>
              </div>
            </Card>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Charge Inputs */}
              <Card className="p-6 bg-slate-900/60 border-slate-900 shadow-xl backdrop-blur-xl">
                <h2 className="text-lg font-black font-display text-slate-200 border-b border-slate-900 pb-3 mb-6">Service Charges</h2>
                
                <Input
                  label="Labour Charge (Rs.)"
                  type="number"
                  placeholder="0.00"
                  error={errors.labourCharge?.message}
                  {...register('labourCharge')}
                  className="bg-slate-950 border-slate-900 text-white"
                />
              </Card>

              {/* Material Items */}
              <Card className="p-6 bg-slate-900/60 border-slate-900 shadow-xl backdrop-blur-xl">
                <div className="flex justify-between items-center border-b border-slate-900 pb-3 mb-6">
                  <h2 className="text-lg font-black font-display text-slate-200">Materials Used</h2>
                  <button
                    type="button"
                    onClick={() => append({ description: '', quantity: 1, unitPrice: 0 })}
                    className="flex items-center gap-1.5 text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>

                {fields.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 border-2 border-dashed border-slate-900 rounded-lg bg-slate-950/20">
                    <p className="text-sm font-semibold mb-1">No materials added yet.</p>
                    <p className="text-xs text-slate-650">Click 'Add Item' to add supplier materials or custom parts used.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {fields.map((field, idx) => (
                      <div key={field.id} className="flex flex-col md:flex-row gap-4 items-end border-b border-slate-900 pb-4 last:border-0 last:pb-0">
                        <div className="flex-1 w-full">
                          <Input
                            label={idx === 0 ? "Description" : undefined}
                            placeholder="e.g. Copper wire roll"
                            error={errors.materialItems?.[idx]?.description?.message}
                            {...register(`materialItems.${idx}.description`)}
                            className="bg-slate-950 border-slate-900 text-white"
                          />
                        </div>
                        <div className="w-full md:w-24">
                          <Input
                            label={idx === 0 ? "Qty" : undefined}
                            type="number"
                            placeholder="1"
                            error={errors.materialItems?.[idx]?.quantity?.message}
                            {...register(`materialItems.${idx}.quantity`)}
                            className="bg-slate-950 border-slate-900 text-white"
                          />
                        </div>
                        <div className="w-full md:w-32">
                          <Input
                            label={idx === 0 ? "Unit Price" : undefined}
                            type="number"
                            placeholder="0.00"
                            error={errors.materialItems?.[idx]?.unitPrice?.message}
                            {...register(`materialItems.${idx}.unitPrice`)}
                            className="bg-slate-950 border-slate-900 text-white"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(idx)}
                          className="text-red-400 hover:text-red-300 p-2.5 rounded-lg hover:bg-red-550/10 border border-transparent hover:border-red-500/20 transition-colors focus:outline-none mb-0.5 cursor-pointer"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Submit Buttons */}
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  fullWidth
                  disabled={isSubmitting}
                  onClick={() => navigate(-1)}
                  className="border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  isLoading={isSubmitting}
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 border-none font-bold shadow-lg shadow-emerald-500/10"
                >
                  Create & Send Invoice
                </Button>
              </div>
            </form>
          </div>

          {/* Pricing Summary Sidepanel */}
          <div className="lg:col-span-1">
            <Card className="sticky top-6 p-6 bg-slate-900/60 border-slate-900 shadow-xl backdrop-blur-xl overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full -mr-8 -mt-8 opacity-50 z-0"></div>
              <div className="relative z-10">
                <h3 className="text-base font-black font-display text-slate-200 border-b border-slate-900 pb-3 mb-4">Invoice Summary</h3>
                <div className="space-y-3.5 text-sm text-slate-400">
                  <div className="flex justify-between font-mono">
                    <span>Labour Charge</span>
                    <span className="font-semibold text-slate-200">Rs. {labourCharge.toFixed(2)}</span>
                  </div>
                  
                  {materialItems.length > 0 && (
                    <div className="flex justify-between font-mono">
                      <span>Materials ({materialItems.length} items)</span>
                      <span className="font-semibold text-slate-200">
                        Rs. {materialItems.reduce((acc, item) => acc + ((item.quantity || 0) * (item.unitPrice || 0)), 0).toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="border-t border-slate-900 pt-3 flex justify-between font-semibold text-slate-300 font-mono">
                    <span>Subtotal</span>
                    <span className="text-slate-200 font-bold">Rs. {subtotal.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-xs text-slate-500 font-mono">
                    <span>GST (18%)</span>
                    <span>Rs. {taxAmount.toFixed(2)}</span>
                  </div>

                  <div className="border-t border-indigo-900/50 pt-4 flex justify-between font-bold text-white text-lg font-display">
                    <span>Total Due</span>
                    <span className="text-indigo-400">Rs. {grandTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="mt-6 bg-slate-950/60 p-4 rounded-xl border border-slate-900 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-500 space-y-1">
                    <p className="font-semibold text-slate-350">Automatic PDF Generation</p>
                    <p>Submitting generates an official PDF, uploads it, and makes it available to the customer instantly.</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
