import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Loader2, UserRound, CheckCircle, ArrowLeft } from 'lucide-react'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { Button, Alert } from '../../components/ui'
import { toast } from 'react-hot-toast'

const schema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type FormValues = z.infer<typeof schema>

export default function CustomerRegisterPage() {
  const navigate = useNavigate()
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [otpStep, setOtpStep] = useState(false)
  const [otp, setOtp] = useState('')
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values: FormValues) => {
    setError('')
    try {
      const res = await api.post('/auth/register/customer', {
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        password: values.password,
      })
      setUserId(res.data.userID)
      setEmail(values.email)
      setOtpStep(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.')
    }
  }

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      setOtpError('Please enter the 6-digit OTP')
      return
    }
    setOtpLoading(true)
    setOtpError('')
    try {
      await api.post('/auth/verify-otp', { userId, otp })
      toast.success('Email verified successfully! Please sign in to continue.')
      navigate('/login')
    } catch (err: any) {
      setOtpError(err.response?.data?.error || 'Invalid OTP. Please try again.')
    } finally {
      setOtpLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 font-sans overflow-hidden relative">
      <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-sky-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-72 h-72 rounded-full bg-blue-900/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md space-y-8 z-10 bg-neutral-900/40 p-8 rounded-2xl border border-neutral-800 backdrop-blur-md">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-500 shadow-lg shadow-sky-500/20">
              <UserRound size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">SendAPro</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{otpStep ? 'Verify Your Email' : 'Create Customer Account'}</h1>
          <p className="text-neutral-400 text-sm">
            {otpStep ? `We sent an OTP to ${email}` : 'Book home services with ease.'}
          </p>
        </div>

        {!otpStep ? (
          <>
            {error && <Alert variant="danger">{error}</Alert>}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Full Name</label>
                <input {...register('fullName')} placeholder="John Doe" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
                {errors.fullName && <p className="mt-1 text-xs text-red-400">{errors.fullName.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Email Address</label>
                <input type="email" {...register('email')} placeholder="you@example.com" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
                {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Phone Number</label>
                <input type="tel" {...register('phone')} placeholder="+91 9876543210" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
                {errors.phone && <p className="mt-1 text-xs text-red-400">{errors.phone.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} {...register('password')} placeholder="••••••••" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 pr-11 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Confirm Password</label>
                <div className="relative">
                  <input type={showConfirm ? 'text' : 'password'} {...register('confirmPassword')} placeholder="••••••••" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 pr-11 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300">
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="mt-1 text-xs text-red-400">{errors.confirmPassword.message}</p>}
              </div>
              <Button type="submit" disabled={isSubmitting} className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2">
                {isSubmitting ? <><Loader2 size={16} className="animate-spin" /> Creating Account...</> : 'Create Account'}
              </Button>
            </form>
          </>
        ) : (
          <div className="space-y-6">
            {otpError && <Alert variant="danger">{otpError}</Alert>}
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Enter 6-digit OTP</label>
              <input
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-4 text-2xl text-center tracking-[0.5em] text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <Button onClick={handleVerifyOtp} disabled={otpLoading} className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2">
              {otpLoading ? <><Loader2 size={16} className="animate-spin" /> Verifying...</> : <><CheckCircle size={16} /> Verify & Continue</>}
            </Button>
            <button onClick={() => setOtpStep(false)} className="w-full flex items-center justify-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
              <ArrowLeft size={14} /> Go back
            </button>
          </div>
        )}

        <div className="text-center pt-2">
          <p className="text-xs text-neutral-500">
            Already have an account?{' '}
            <Link to="/auth/login" className="text-sky-400 font-semibold hover:text-sky-300 transition-colors">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
