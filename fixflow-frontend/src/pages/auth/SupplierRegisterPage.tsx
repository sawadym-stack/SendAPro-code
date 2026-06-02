import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Truck, CheckCircle, ArrowLeft, MapPin } from 'lucide-react'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { Button, Alert } from '../../components/ui'

const schema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  address: z.string().min(5, 'Please provide your business address'),
  lat: z.number({ message: 'Latitude is required' }),
  lng: z.number({ message: 'Longitude is required' }),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type FormValues = z.infer<typeof schema>

export default function SupplierRegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [otpStep, setOtpStep] = useState(false)
  const [otp, setOtp] = useState('')
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState('')
  const [locating, setLocating] = useState(false)

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { lat: 0, lng: 0 },
  })

  const lat = watch('lat')
  const lng = watch('lng')

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue('lat', pos.coords.latitude)
        setValue('lng', pos.coords.longitude)
        setLocating(false)
      },
      () => {
        setError('Could not get your location. Please enter coordinates manually.')
        setLocating(false)
      }
    )
  }

  const onSubmit = async (values: FormValues) => {
    setError('')
    try {
      const res = await api.post('/auth/register/supplier', {
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        password: values.password,
        address: values.address,
        lat: values.lat,
        lng: values.lng,
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
      const res = await api.post('/auth/verify-otp', { userId, otp })
      const { accessToken, refreshToken } = res.data
      const mockUser = { id: userId, name: '', email, phone: '', role: 'supplier' as const, isVerified: true, createdAt: new Date().toISOString() }
      setAuth(mockUser, accessToken, 'supplier', refreshToken)
      navigate('/supplier/dashboard')
    } catch (err: any) {
      setOtpError(err.response?.data?.error || 'Invalid OTP. Please try again.')
    } finally {
      setOtpLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 font-sans">
      <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-emerald-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-72 h-72 rounded-full bg-green-900/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-lg space-y-8 z-10 bg-neutral-900/40 p-8 rounded-2xl border border-neutral-800 backdrop-blur-md">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 shadow-lg shadow-emerald-500/20">
              <Truck size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">SendAPro</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{otpStep ? 'Verify Your Email' : 'Register as Supplier'}</h1>
          <p className="text-neutral-400 text-sm">
            {otpStep ? `We sent an OTP to ${email}` : 'Supply materials to our technician network.'}
          </p>
        </div>

        {!otpStep ? (
          <>
            {error && <Alert variant="danger">{error}</Alert>}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Full Name / Business Name</label>
                <input {...register('fullName')} placeholder="Kerala Hardware Supplies" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                {errors.fullName && <p className="mt-1 text-xs text-red-400">{errors.fullName.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Email</label>
                  <input type="email" {...register('email')} placeholder="you@business.com" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                  {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Phone</label>
                  <input type="tel" {...register('phone')} placeholder="+91 9876543210" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                  {errors.phone && <p className="mt-1 text-xs text-red-400">{errors.phone.message}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Business Address</label>
                <input {...register('address')} placeholder="123 Market Road, Kozhikode, Kerala" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                {errors.address && <p className="mt-1 text-xs text-red-400">{errors.address.message}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">Location Coordinates</label>
                  <button type="button" onClick={detectLocation} disabled={locating} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50">
                    {locating ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
                    {locating ? 'Detecting...' : 'Auto-detect'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input type="number" step="any" {...register('lat', { valueAsNumber: true })} placeholder="Latitude (e.g. 11.25)" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                    {errors.lat && <p className="mt-1 text-xs text-red-400">{errors.lat.message}</p>}
                  </div>
                  <div>
                    <input type="number" step="any" {...register('lng', { valueAsNumber: true })} placeholder="Longitude (e.g. 75.77)" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                    {errors.lng && <p className="mt-1 text-xs text-red-400">{errors.lng.message}</p>}
                  </div>
                </div>
                {lat !== 0 && lng !== 0 && (
                  <p className="mt-1 text-xs text-emerald-400">✓ Location set: {lat.toFixed(4)}, {lng.toFixed(4)}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Password</label>
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'} {...register('password')} placeholder="••••••••" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 pr-10 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300">
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Confirm</label>
                  <div className="relative">
                    <input type={showConfirm ? 'text' : 'password'} {...register('confirmPassword')} placeholder="••••••••" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 pr-10 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300">
                      {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {errors.confirmPassword && <p className="mt-1 text-xs text-red-400">{errors.confirmPassword.message}</p>}
                </div>
              </div>

              <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-3 text-xs text-emerald-300">
                ⚠️ Your supplier account requires admin approval before you can list materials.
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2">
                {isSubmitting ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : 'Submit Registration'}
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
                className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-4 text-2xl text-center tracking-[0.5em] text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <Button onClick={handleVerifyOtp} disabled={otpLoading} className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-semibold text-sm flex items-center justify-center gap-2">
              {otpLoading ? <><Loader2 size={16} className="animate-spin" /> Verifying...</> : <><CheckCircle size={16} /> Verify OTP</>}
            </Button>
            <button onClick={() => setOtpStep(false)} className="w-full flex items-center justify-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
              <ArrowLeft size={14} /> Go back
            </button>
          </div>
        )}

        <div className="text-center pt-2">
          <p className="text-xs text-neutral-500">
            Already have an account?{' '}
            <Link to="/auth/login" className="text-emerald-400 font-semibold hover:text-emerald-300 transition-colors">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
