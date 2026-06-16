import React, { useState } from 'react'
import { Card, Button } from '../ui'
import { CreditCard, Shield, Landmark, Smartphone, AlertCircle, Loader2 } from 'lucide-react'

interface MockPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  amount: number // in Rs
  orderId: string
  onSubmit: (paymentId: string, signature: string) => Promise<void>
}

export const MockPaymentModal: React.FC<MockPaymentModalProps> = ({
  isOpen,
  onClose,
  amount,
  orderId,
  onSubmit,
}) => {
  const [activeTab, setActiveTab] = useState<'card' | 'upi'>('card')
  const [step, setStep] = useState<'form' | 'processing' | 'otp'>('form')
  
  // Form states
  const [cardNumber, setCardNumber] = useState('4111 1111 1111 1111')
  const [expiry, setExpiry] = useState('12/30')
  const [cvv, setCvv] = useState('111')
  const [cardName, setCardName] = useState('John Doe')
  const [upiId, setUpiId] = useState('sawad@upi')

  // OTP state
  const [otp, setOtp] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault()
    setStep('processing')
    setError('')
    setTimeout(() => {
      setStep('otp')
    }, 2000) // Simulate gateway redirect
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length < 4) {
      setError('Enter a valid OTP')
      return
    }

    setIsSubmitting(true)
    setError('')
    try {
      const mockPaymentId = `pay_mock_${Math.random().toString(36).substring(2, 11)}`
      const mockSignature = `sig_mock_${Math.random().toString(36).substring(2, 11)}`
      await onSubmit(mockPaymentId, mockSignature)
    } catch (err: any) {
      setError(err.message || 'Payment capture failed. Please try again.')
      setStep('form')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-xl transition-all duration-300">
        
        {/* Header decoration */}
        <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 w-full" />
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 p-2 rounded-xl">
              <Shield size={18} />
            </div>
            <div>
              <h3 className="text-md font-black text-white font-display uppercase tracking-wider">Secure Checkout</h3>
              <p className="text-[10px] text-slate-500 font-mono">Sandbox Mock Payment Gateway</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-500 hover:text-white transition-colors cursor-pointer text-sm font-mono"
            disabled={step === 'processing' || isSubmitting}
          >
            ✕ CLOSE
          </button>
        </div>

        {step === 'form' && (
          <div className="p-6 space-y-6">
            {/* Amount Banner */}
            <div className="bg-slate-950/60 border border-slate-900 rounded-2xl p-4 flex justify-between items-center font-mono">
              <span className="text-xs text-slate-500">Payable Amount:</span>
              <span className="text-lg font-black text-indigo-400">Rs. {amount.toFixed(2)}</span>
            </div>

            {/* Payment Method Selector */}
            <div className="grid grid-cols-2 gap-3 p-1 bg-slate-950/40 rounded-xl border border-slate-900">
              <button
                type="button"
                onClick={() => setActiveTab('card')}
                className={`py-2 rounded-lg text-xs font-bold font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'card' 
                    ? 'bg-slate-800 text-white border border-slate-700/50 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-350'
                }`}
              >
                <CreditCard size={14} /> Card Payment
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('upi')}
                className={`py-2 rounded-lg text-xs font-bold font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'upi' 
                    ? 'bg-slate-800 text-white border border-slate-700/50 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-350'
                }`}
              >
                <Smartphone size={14} /> UPI
              </button>
            </div>

            {activeTab === 'card' ? (
              <form onSubmit={handlePay} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Card Holder Name</label>
                  <input
                    type="text"
                    required
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Card Number</label>
                  <input
                    type="text"
                    required
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="4111 1111 1111 1111"
                    className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Expiry (MM/YY)</label>
                    <input
                      type="text"
                      required
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      placeholder="12/30"
                      className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">CVV</label>
                    <input
                      type="password"
                      required
                      maxLength={3}
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value)}
                      placeholder="111"
                      className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                    />
                  </div>
                </div>

                <Button type="submit" fullWidth className="bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 border-none font-bold py-3 mt-4 text-white shadow-lg shadow-indigo-500/10">
                  Pay Securely
                </Button>
              </form>
            ) : (
              <form onSubmit={handlePay} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">UPI ID (VPA)</label>
                  <input
                    type="text"
                    required
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="username@upi"
                    className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                  />
                </div>

                <Button type="submit" fullWidth className="bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 border-none font-bold py-3 mt-4 text-white shadow-lg shadow-indigo-500/10">
                  Request UPI Payment
                </Button>
              </form>
            )}
          </div>
        )}

        {step === 'processing' && (
          <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
            <h4 className="text-md font-bold text-white font-display">Processing Transaction</h4>
            <p className="text-xs text-slate-500 font-mono max-w-xs">
              Redirecting you to 3D Secure Verified Bank Gateway. Do not close this window.
            </p>
          </div>
        )}

        {step === 'otp' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-3 p-4 border border-indigo-500/20 bg-indigo-500/5 rounded-2xl">
              <Landmark className="text-indigo-400 shrink-0" size={20} />
              <div className="text-xs text-slate-350">
                <p className="font-bold text-white">Bank Authentication OTP</p>
                <p>We've sent a 6-digit OTP code to verify your transaction.</p>
              </div>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">One Time Password (OTP)</label>
                  <span className="text-[10px] text-amber-500 font-mono">Use default: 123456</span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit OTP"
                  className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-4 py-2.5 text-center text-lg font-black tracking-widest text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                />
              </div>

              {error && (
                <div className="flex gap-2 text-xs text-red-500 bg-red-950/20 border border-red-500/20 p-3 rounded-xl">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  disabled={isSubmitting}
                  className="flex-1 border border-slate-800 hover:bg-slate-950 py-2.5 rounded-xl text-xs font-bold font-mono transition-all text-slate-400 cursor-pointer"
                >
                  Cancel
                </button>
                <Button 
                  type="submit" 
                  isLoading={isSubmitting}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 border-none font-bold py-2.5 text-white shadow-lg shadow-emerald-500/10"
                >
                  Confirm Payout
                </Button>
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  )
}
