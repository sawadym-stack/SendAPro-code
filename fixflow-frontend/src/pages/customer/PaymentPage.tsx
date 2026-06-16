import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Loader2, CreditCard, CheckCircle, AlertCircle, FileText, ArrowLeft } from 'lucide-react'
import { useWS } from '../../context/WSContext'
import { useAuthStore } from '../../store/authStore'
import paymentService from '../../services/payment.service'
import { InvoiceSummaryCard } from '../../components/payment/InvoiceSummaryCard'
import { MockPaymentModal } from '../../components/payment/MockPaymentModal'
import { Button, Card, Alert } from '../../components/ui'
import { loadRazorpay } from '../../utils/loadRazorpay'
import type { Invoice } from '../../types'

export const PaymentPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { on, off } = useWS()
  
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [isMockModalOpen, setIsMockModalOpen] = useState(false)
  const [mockOrderDetails, setMockOrderDetails] = useState<{ orderId: string; amount: number } | null>(null)

  // Generate idempotency key for payment order
  const [idempotencyKey] = useState(() => `pay_key_${jobId}_${Date.now()}`)

  // Fetch Invoice Details
  const fetchInvoice = async () => {
    if (!jobId) return
    try {
      setIsLoading(true)
      const data = await paymentService.getInvoice(jobId)
      setInvoice(data)
      if (data.status === 'Paid') {
        setPaymentSuccess(true)
      }
    } catch (err: any) {
      console.error('Failed to fetch invoice:', err)
      toast.error('Failed to load invoice details')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchInvoice()
  }, [jobId])

  // WebSocket real-time subscription for payment updates
  useEffect(() => {
    if (!jobId) return

    const handlePaymentUpdate = (payload: any) => {
      console.log('[WS Payment Page] Received event:', payload)
      if (payload.jobId === jobId && payload.status === 'Captured') {
        setPaymentSuccess(true)
        if (invoice) {
          setInvoice((prev) => prev ? { ...prev, status: 'Paid' } : null)
        }
        toast.success('Payment captured successfully!')
      }
    }

    on('payment_status', handlePaymentUpdate)
    return () => {
      off('payment_status', handlePaymentUpdate)
    }
  }, [jobId, on, off, invoice])

  const handleMockPaymentSubmit = async (paymentId: string, signature: string) => {
    if (!mockOrderDetails) return
    try {
      await paymentService.verifyPayment({
        orderId: mockOrderDetails.orderId,
        paymentId,
        signature,
      })
      setPaymentSuccess(true)
      toast.success('Payment completed & verified!')
      setIsMockModalOpen(false)
      fetchInvoice()
    } catch (err: any) {
      console.error('Payment verification failed:', err)
      throw err
    }
  }

  const handlePayNow = async () => {
    if (!jobId || !invoice) return
    try {
      setIsProcessingCheckout(true)
      
      // 1. Create Razorpay order on backend
      const order = await paymentService.createOrder({
        jobId,
        idempotencyKey,
      })

      // Check for Mock mode order
      if (order.orderId.startsWith('order_mock_')) {
        setMockOrderDetails({
          orderId: order.orderId,
          amount: invoice.total,
        })
        setIsMockModalOpen(true)
        setIsProcessingCheckout(false)
        return
      }

      // 2. Load Razorpay SDK on demand and open modal
      try {
        await loadRazorpay()
      } catch {
        toast.error('Failed to load Razorpay Checkout. Please try again.')
        setIsProcessingCheckout(false)
        return
      }

      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'SendAPro Services',
        description: `Invoice Payment for Job #${jobId.substring(0, 8).toUpperCase()}`,
        order_id: order.orderId,
        theme: {
          color: '#4F46E5', // Brand Indigo-600
        },
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.phone || '',
        },
        handler: async (response: any) => {
          setIsProcessingCheckout(true)
          try {
            // 3. Verify payment on backend
            await paymentService.verifyPayment({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            })
            setPaymentSuccess(true)
            toast.success('Payment completed & verified!')
            fetchInvoice()
          } catch (err: any) {
            console.error('Payment verification failed:', err)
            toast.error(err.message || 'Payment verification failed')
          } finally {
            setIsProcessingCheckout(false)
          }
        },
        modal: {
          ondismiss: () => {
            setIsProcessingCheckout(false)
            toast.error('Payment cancelled by user')
          },
        },
      }

      const razorpay = new window.Razorpay(options)
      razorpay.open()
    } catch (err: any) {
      console.error('Failed to initialize checkout:', err)
      toast.error(err.message || 'Failed to start payment order')
      setIsProcessingCheckout(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
        <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mb-4" />
        <p className="text-slate-400 font-medium font-mono">Loading invoice details...</p>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full bg-slate-900 border border-slate-900 p-8 rounded-2xl text-center shadow-xl backdrop-blur-xl space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold font-display text-white">No Invoice Found</h2>
          <p className="text-xs text-slate-500 font-mono">No generated billing summary matches this job record. Please check back later.</p>
          <Button onClick={() => navigate(-1)} variant="outline" className="w-full border-slate-800 hover:bg-slate-950 text-slate-300">
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-slate-100 relative">
      {/* Background glow layers */}
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
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black font-display text-white tracking-tight">Checkout Payment</h1>
            <p className="text-slate-450 text-sm">Review invoice and secure your payment</p>
          </div>
        </div>

        {paymentSuccess ? (
          /* Payment Success Animation Screen */
          <Card className="p-8 text-center bg-slate-900/60 border-slate-900 shadow-2xl max-w-2xl mx-auto border border-emerald-500/30 relative overflow-hidden backdrop-blur-xl rounded-2xl">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
            <div className="flex justify-center mb-6">
              <div className="bg-emerald-500/10 p-4 rounded-full text-emerald-450 border border-emerald-500/25 animate-bounce">
                <CheckCircle className="w-14 h-14" />
              </div>
            </div>
            <h2 className="text-2xl font-black text-white font-display mb-2 tracking-tight">Payment Successful!</h2>
            <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
              Your payment has been successfully authorized and captured. The technician has been notified.
            </p>

            <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-5 mb-8 text-left space-y-2.5 max-w-md mx-auto">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-500">Invoice ID:</span>
                <span className="font-semibold text-slate-200">#{invoice.id.substring(0, 8).toUpperCase()}</span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-500">Amount Paid:</span>
                <span className="font-black text-indigo-400">Rs. {invoice.total.toFixed(2)}</span>
              </div>
              {invoice.pdfUrl && (
                <div className="pt-3 border-t border-slate-900 flex justify-center">
                  <a
                    href={invoice.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-indigo-450 hover:text-indigo-350 font-bold text-xs font-mono transition-colors"
                  >
                    <FileText className="w-4 h-4" /> Download PDF Receipt
                  </a>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                onClick={() => navigate('/customer/payments')} 
                variant="outline"
                className="border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-white"
              >
                View History
              </Button>
              <Button 
                onClick={() => navigate('/')} 
                variant="primary"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              >
                Return to Dashboard
              </Button>
            </div>
          </Card>
        ) : (
          /* Payment Processing Screen */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Invoice Summary */}
            <div className="lg:col-span-2 space-y-6">
              <InvoiceSummaryCard invoice={invoice} showDownloadBtn={false} />
            </div>

            {/* Payment Panel */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="p-6 bg-slate-900/60 border-slate-900 shadow-xl backdrop-blur-xl rounded-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full -mr-8 -mt-8 opacity-50 z-0"></div>
                <div className="relative z-10">
                  <h3 className="text-base font-black font-display text-slate-200 border-b border-slate-900 pb-3 mb-4 uppercase tracking-wider">
                    Payment Summary
                  </h3>
                  <div className="space-y-4 mb-6">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-500">Outstanding:</span>
                      <span className="font-bold text-slate-200">Rs. {invoice.total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-500">Currency:</span>
                      <span className="font-semibold text-slate-400">INR</span>
                    </div>
                  </div>

                  <Button
                    onClick={handlePayNow}
                    fullWidth
                    variant="primary"
                    isLoading={isProcessingCheckout}
                    className="bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 border-none font-bold shadow-lg shadow-indigo-500/10"
                  >
                    Pay Now
                  </Button>
                </div>
              </Card>

              {/* Developer Test Mode Help Alert */}
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4.5">
                <div className="flex gap-2">
                  <AlertCircle className="w-4.5 h-4.5 text-amber-450 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-500 space-y-2">
                    <p className="font-bold uppercase tracking-wider font-mono">Razorpay Sandbox Mode</p>
                    <p>Use the following details to simulate a successful payment in test mode:</p>
                    <ul className="list-disc pl-4 space-y-1.5 font-mono">
                      <li><strong>Card Number:</strong> <code className="bg-slate-950 border border-slate-900 text-amber-300 px-1.5 py-0.5 rounded">4111 1111 1111 1111</code></li>
                      <li><strong>Expiry:</strong> <code className="bg-slate-950 border border-slate-900 text-amber-300 px-1.5 py-0.5 rounded">12/30</code></li>
                      <li><strong>CVV:</strong> <code className="bg-slate-950 border border-slate-900 text-amber-300 px-1.5 py-0.5 rounded">111</code></li>
                      <li><strong>OTP:</strong> <code className="bg-slate-950 border border-slate-900 text-amber-300 px-1.5 py-0.5 rounded">123456</code> or any</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <MockPaymentModal
        isOpen={isMockModalOpen}
        onClose={() => setIsMockModalOpen(false)}
        amount={mockOrderDetails?.amount ?? 0}
        orderId={mockOrderDetails?.orderId ?? ''}
        onSubmit={handleMockPaymentSubmit}
      />
    </div>
  )
}
