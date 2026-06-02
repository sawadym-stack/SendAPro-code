import { useMemo, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Shield, Truck, UserRound, Wrench, Eye, EyeOff, Loader2, Cpu, Navigation, CheckCircle, ArrowLeft } from 'lucide-react'
import authService, { AuthError } from '../../services/auth.service'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { Button, Alert } from '../../components/ui'
import type { Role } from '../../types'
import authBanner from '../../assets/auth_banner.png'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginFormValues = z.infer<typeof loginSchema>

const roles: { value: Role; label: string; description: string; icon: ReactNode; glowColor: string }[] = [
  {
    value: 'customer',
    label: 'Customer',
    description: 'Book Services',
    icon: <UserRound size={20} />,
    glowColor: 'group-hover:shadow-[0_0_15px_rgba(14,165,233,0.3)]',
  },
  {
    value: 'technician',
    label: 'Technician',
    description: 'Offer Services',
    icon: <Wrench size={20} />,
    glowColor: 'group-hover:shadow-[0_0_15px_rgba(139,92,246,0.3)]',
  },
  {
    value: 'supplier',
    label: 'Supplier',
    description: 'Supply Materials',
    icon: <Truck size={20} />,
    glowColor: 'group-hover:shadow-[0_0_15px_rgba(34,197,94,0.3)]',
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Manage App',
    icon: <Shield size={20} />,
    glowColor: 'group-hover:shadow-[0_0_15px_rgba(239,68,68,0.3)]',
  },
]

const LoginPage = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  const [selectedRole, setSelectedRole] = useState<Role>('customer')
  const [showPassword, setShowPassword] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [rememberMe, setRememberMe] = useState(false)

  // OTP Verification States
  const [otpStep, setOtpStep] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpUserId, setOtpUserId] = useState('')
  const [otpEmail, setOtpEmail] = useState('')
  const [otpRole, setOtpRole] = useState<Role>('customer')
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState('')

  const redirectPath = useMemo(() => searchParams.get('redirect'), [searchParams])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: localStorage.getItem('fixflow_saved_email') || '',
    }
  })

  const goToDashboard = (role: Role) => {
    if (redirectPath) {
      navigate(redirectPath)
      return
    }
    if (role === 'admin') {
      navigate('/admin/analytics')
    } else {
      navigate(`/${role}/dashboard`)
    }
  }

  const onSubmit = async (values: LoginFormValues) => {
    setEmailError(null)
    try {
      if (rememberMe) {
        localStorage.setItem('fixflow_saved_email', values.email)
      } else {
        localStorage.removeItem('fixflow_saved_email')
      }

      const response = await authService.login(values)

      if (response.role !== selectedRole) {
        setEmailError(`This account is registered as a ${response.role}. Please select the ${response.role} portal above.`)
        return
      }

      setAuth(response.user, response.token, response.role, response.refreshToken, rememberMe)
      goToDashboard(response.role)
    } catch (error) {
      if (error instanceof AuthError) {
        if (error.message === 'email not verified') {
          setOtpUserId(error.userId || '')
          setOtpEmail(error.email || '')
          setOtpRole((error.role as Role) || selectedRole)
          setOtpStep(true)
          return
        }
        setEmailError(error.message)
      } else {
        setEmailError(error instanceof Error ? error.message : 'Invalid credentials. Please check your email or password.')
      }
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
      const res = await api.post('/auth/verify-otp', { userId: otpUserId, otp })
      const { accessToken, refreshToken } = res.data
      const mockUser = {
        id: otpUserId,
        name: otpEmail.split('@')[0] || 'User',
        email: otpEmail,
        phone: '',
        role: otpRole,
        isVerified: true,
        createdAt: new Date().toISOString(),
      }
      setAuth(mockUser, accessToken, otpRole, refreshToken, rememberMe)
      goToDashboard(otpRole)
    } catch (err: any) {
      setOtpError(err.response?.data?.error || 'Invalid OTP. Please try again.')
    } finally {
      setOtpLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-stretch font-sans text-neutral-200 selection:bg-sky-500 selection:text-white">
      
      {/* Left panel: Telemetry & Premium branding (Desktop only) */}
      <div className="relative hidden lg:flex lg:w-1/2 xl:w-3/5 flex-col justify-between p-12 overflow-hidden">
        {/* Background visual banner with heavy overlays */}
        <div className="absolute inset-0 z-0">
          <img 
            src={authBanner} 
            alt="SendAPro Control Telemetry" 
            className="w-full h-full object-cover scale-105 filter blur-[1px] brightness-90 transition-transform duration-10000 ease-out hover:scale-100"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-neutral-950 via-neutral-900/80 to-neutral-950/40" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.15),transparent_50%)]" />
        </div>

        {/* Header Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-500 shadow-[0_0_20px_rgba(14,165,233,0.3)] animate-pulse-soft">
            <Cpu size={20} className="text-white" />
          </div>
          <span className="text-xl font-bold font-display tracking-tight bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
            SendAPro
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-800/80 text-neutral-400 font-semibold tracking-wider uppercase">
            v1.2 Live
          </span>
        </div>

        {/* Center content: Live Stats Showcase & Info */}
        <div className="relative z-10 max-w-xl my-auto space-y-8">
          <div className="space-y-4">
            <h2 className="text-4xl xl:text-5xl font-bold font-display text-white tracking-tight leading-tight">
              Empowering Field Service <span className="bg-gradient-to-r from-sky-400 to-blue-400 bg-clip-text text-transparent">Operations Control</span>
            </h2>
            <p className="text-base text-neutral-400 leading-relaxed">
              Experience the next-generation platform for real-time dispatches, micro-route optimizations, material workflows, and instant customer engagement.
            </p>
          </div>

          {/* Interactive Status Overlay Card */}
          <div className="p-6 rounded-2xl border border-neutral-800 bg-neutral-950/60 backdrop-blur-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Active System Metrics
              </span>
              <span className="text-xs text-neutral-500">Real-time update</span>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <p className="text-xs text-neutral-500 font-medium">Active Dispatch</p>
                <p className="text-xl font-bold text-white mt-1">142</p>
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <p className="text-xs text-neutral-500 font-medium">Avg Dispatch Speed</p>
                <p className="text-xl font-bold text-white mt-1">14.8m</p>
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <p className="text-xs text-neutral-500 font-medium">SLA Adherence</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">98.6%</p>
              </div>
            </div>

            {/* Glowing path status log mock */}
            <div className="text-xs text-neutral-400 font-mono space-y-2 pt-2 border-t border-neutral-900">
              <div className="flex items-center justify-between text-neutral-500">
                <span className="flex items-center gap-1.5"><Navigation size={12} className="text-sky-400" /> Route Optimizer</span>
                <span>Active</span>
              </div>
              <div className="text-[11px] truncate text-sky-300">
                &gt; Dispatching technician [Tech_42] to Job #3018 (Plumbing)...
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between text-xs text-neutral-500 border-t border-neutral-900 pt-6">
          <span>&copy; {new Date().getFullYear()} SendAPro Inc. All rights reserved.</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-neutral-300 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-neutral-300 transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>

      {/* Right panel: Login Form Card */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex flex-col justify-center items-center p-6 sm:p-12 md:p-16 relative">
        {/* Mobile decorative circles */}
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-sky-900/10 blur-[120px] pointer-events-none lg:hidden" />
        <div className="absolute bottom-20 right-10 w-72 h-72 rounded-full bg-blue-900/10 blur-[120px] pointer-events-none lg:hidden" />

        <div className="w-full max-w-md space-y-8 z-10">
          
          {/* Logo block for mobile */}
          <div className="text-center lg:text-left space-y-2">
            <div className="inline-flex lg:hidden items-center gap-2.5 mb-2">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-500 shadow-lg">
                <Cpu size={18} className="text-white" />
              </div>
              <span className="text-lg font-bold font-display tracking-tight text-white">SendAPro</span>
            </div>
            <h1 className="text-3xl font-bold font-display text-white tracking-tight">
              {otpStep ? 'Verify Your Email' : 'Welcome back'}
            </h1>
            <p className="text-neutral-400 text-sm">
              {otpStep ? `Please enter the verification code sent to ${otpEmail}` : 'Please enter your details to access your account.'}
            </p>
          </div>

          {!otpStep ? (
            <>
              {emailError && (
                <Alert variant="danger" title="Authentication Error" className="bg-danger-950/20 border-danger-900/40 text-danger-400">
                  {emailError}
                </Alert>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                
                {/* Custom Role Selector */}
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    Select Your System Portal
                  </label>
                  
                  <div className="grid grid-cols-2 gap-2.5">
                    {roles.map((role) => {
                      const isSelected = selectedRole === role.value
                      return (
                        <button
                          key={role.value}
                          type="button"
                          onClick={() => {
                            if (role.value === 'admin') {
                              navigate('/auth/admin/login')
                            } else {
                              setSelectedRole(role.value)
                            }
                          }}
                          className={`group relative p-3 rounded-xl border text-left transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                            isSelected
                              ? 'border-sky-500 bg-sky-950/20 shadow-[0_0_20px_rgba(14,165,233,0.1)]'
                              : 'border-neutral-800 bg-neutral-900/30 hover:border-neutral-700 hover:bg-neutral-900/50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`p-1.5 rounded-lg transition-colors ${
                              isSelected ? 'bg-sky-500 text-white' : 'bg-neutral-800 text-neutral-400 group-hover:bg-neutral-700 group-hover:text-neutral-300'
                            }`}>
                              {role.icon}
                            </div>
                            <div>
                              <p className={`text-xs font-bold leading-none ${isSelected ? 'text-white' : 'text-neutral-300'}`}>
                                {role.label}
                              </p>
                              <p className="text-[10px] text-neutral-500 mt-0.5">
                                {role.description}
                              </p>
                            </div>
                          </div>
                          
                          {/* Selection bottom accent line */}
                          {isSelected && (
                            <div className="absolute bottom-0 inset-x-4 h-[2px] bg-gradient-to-r from-sky-500 to-blue-500 rounded-full" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Inputs Container */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      {...register('email')}
                      className={`w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 transition-all duration-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 focus:bg-neutral-900 ${
                        errors.email ? 'border-danger-500 focus:ring-danger-500' : ''
                      }`}
                    />
                    {errors.email && <p className="mt-1 text-xs text-danger-400">{errors.email.message}</p>}
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                        Password
                      </label>
                      <a href="#" className="text-xs text-sky-400 hover:text-sky-300 transition-colors">
                        Forgot password?
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        {...register('password')}
                        className={`w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 pr-11 text-sm text-white placeholder-neutral-500 transition-all duration-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 focus:bg-neutral-900 ${
                          errors.password ? 'border-danger-500 focus:ring-danger-500' : ''
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {errors.password && <p className="mt-1 text-xs text-danger-400">{errors.password.message}</p>}
                  </div>
                </div>

                {/* Remember Me */}
                <div className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-neutral-800 bg-neutral-900 text-sky-500 focus:ring-sky-500 h-4 w-4"
                    />
                    <span className="text-xs text-neutral-400 font-medium">Keep me logged in on this device</span>
                  </label>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-semibold text-sm shadow-[0_4px_20px_rgba(2,132,199,0.2)] hover:shadow-[0_4px_20px_rgba(2,132,199,0.35)] transition-all duration-300 transform hover:-translate-y-[1px]"
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      <span>Validating session...</span>
                    </div>
                  ) : (
                    <span>Access Portal</span>
                  )}
                </Button>
              </form>

              {/* Redirection Link */}
              <div className="text-center pt-2">
                <p className="text-xs text-neutral-500">
                  Need a portal account?{' '}
                  <Link to="/register" className="text-sky-400 font-semibold hover:text-sky-300 transition-colors">
                    Create Account
                  </Link>
                </p>
              </div>
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
                {otpLoading ? <><Loader2 size={16} className="animate-spin" /> Verifying...</> : <><CheckCircle size={16} /> Verify & Access Portal</>}
              </Button>
              <button onClick={() => setOtpStep(false)} className="w-full flex items-center justify-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
                <ArrowLeft size={14} /> Go back
              </button>
            </div>
          )}

        </div>
      </div>

    </div>
  )
}

export default LoginPage
