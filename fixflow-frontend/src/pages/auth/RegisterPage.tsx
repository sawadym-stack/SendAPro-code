import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, Link } from 'react-router-dom'
import { Truck, UserRound, Wrench, Eye, EyeOff, Loader2, Cpu, CheckCircle2, AlertTriangle } from 'lucide-react'
import authService from '../../services/auth.service'
import { useAuthStore } from '../../store/authStore'
import { Button, Alert } from '../../components/ui'
import type { Role } from '../../types'
import authBanner from '../../assets/auth_banner.png'

const registerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    phone: z.string().min(8, 'Phone number must be at least 8 digits'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Confirm password is required'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })

type RegisterFormValues = z.infer<typeof registerSchema>

const roles: { value: Role; label: string; description: string; icon: ReactNode }[] = [
  { value: 'customer', label: 'Customer', description: 'Book services', icon: <UserRound size={20} /> },
  { value: 'technician', label: 'Technician', description: 'Offer services', icon: <Wrench size={20} /> },
  { value: 'supplier', label: 'Supplier', description: 'Supply materials', icon: <Truck size={20} /> },
]

// Password strength calculation helper
const getPasswordStrength = (password: string) => {
  if (!password) return { score: 0, label: '', color: 'bg-neutral-800' }
  let score = 0
  if (password.length >= 6) score += 1
  if (password.length >= 10) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1

  if (score <= 2) return { score, label: 'Weak', color: 'bg-danger-500' }
  if (score <= 4) return { score, label: 'Medium', color: 'bg-warning-500' }
  return { score, label: 'Strong', color: 'bg-success-500' }
}

const RegisterPage = () => {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)
  const [selectedRole, setSelectedRole] = useState<Role>('customer')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  })

  const watchedPassword = watch('password', '')
  const passwordStrength = getPasswordStrength(watchedPassword)

  const goToDashboard = (role: Role) => {
    if (role === 'admin') {
      navigate('/admin/analytics')
    } else {
      navigate(`/${role}/dashboard`)
    }
  }

  const onSubmit = async (values: RegisterFormValues) => {
    setSubmitError(null)
    try {
      const response = await authService.register({
        name: values.name,
        email: values.email,
        phone: values.phone,
        password: values.password,
        role: selectedRole,
      })

      setAuth(response.user, response.token, response.role, response.refreshToken)
      goToDashboard(response.role)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed'
      const friendlyMessage =
        message.toLowerCase().includes('already registered') || message.toLowerCase().includes('duplicate')
          ? 'This email address is already registered. Please sign in instead.'
          : message
      setSubmitError(friendlyMessage)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-stretch font-sans text-neutral-200 selection:bg-primary-500 selection:text-white overflow-x-hidden">
      
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
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 shadow-[0_0_20px_rgba(14,165,233,0.3)] animate-pulse-soft">
            <Cpu size={20} className="text-white" />
          </div>
          <span className="text-xl font-bold font-display tracking-tight bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
            SendAPro
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-800/80 text-neutral-400 font-semibold tracking-wider uppercase">
            Onboarding
          </span>
        </div>

        {/* Center content: Value Proposition */}
        <div className="relative z-10 max-w-xl my-auto space-y-8">
          <div className="space-y-4">
            <h2 className="text-4xl xl:text-5xl font-bold font-display text-white tracking-tight leading-tight">
              Begin Your Journey with <span className="bg-gradient-to-r from-primary-400 to-secondary-400 bg-clip-text text-transparent">SendAPro Workspace</span>
            </h2>
            <p className="text-base text-neutral-400 leading-relaxed">
              Create a free account to coordinate dispatcher operations, bid on supplier material tenders, or find top-tier certified field engineers in seconds.
            </p>
          </div>

          {/* Value Highlights Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-neutral-900 bg-neutral-950/40 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-primary-400 font-bold text-sm">
                <CheckCircle2 size={16} /> Instant Dispatch
              </div>
              <p className="text-xs text-neutral-500 mt-1">Real-time scheduling and routing dispatch control.</p>
            </div>
            <div className="p-4 rounded-xl border border-neutral-900 bg-neutral-950/40 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-secondary-400 font-bold text-sm">
                <CheckCircle2 size={16} /> Material Supply
              </div>
              <p className="text-xs text-neutral-500 mt-1">Direct integration with wholesale hardware suppliers.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between text-xs text-neutral-500 border-t border-neutral-900 pt-6">
          <span>&copy; {new Date().getFullYear()} SendAPro Inc. All rights reserved.</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-neutral-300 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-neutral-300 transition-colors">Terms</a>
          </div>
        </div>
      </div>

      {/* Right panel: Registration Form Card */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex flex-col justify-center items-center p-6 sm:p-12 relative overflow-x-hidden overflow-y-auto">
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-primary-900/10 blur-[120px] pointer-events-none lg:hidden" />
        <div className="absolute bottom-20 right-10 w-72 h-72 rounded-full bg-secondary-900/10 blur-[120px] pointer-events-none lg:hidden" />

        <div className="w-full max-w-md space-y-6 z-10 py-8">
          
          {/* Header */}
          <div className="text-center lg:text-left space-y-2">
            <div className="inline-flex lg:hidden items-center gap-2.5 mb-1">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 shadow-lg">
                <Cpu size={18} className="text-white" />
              </div>
              <span className="text-lg font-bold font-display tracking-tight text-white">SendAPro</span>
            </div>
            <h1 className="text-3xl font-bold font-display text-white tracking-tight">
              Create Account
            </h1>
            <p className="text-neutral-400 text-sm">
              Get access to the most advanced field operations tool.
            </p>
          </div>

          {submitError && (
            <Alert variant="danger" title="Registration Failed" className="bg-danger-950/20 border-danger-900/40 text-danger-400">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>{submitError}</span>
              </div>
            </Alert>
          )}

          {/* Form */}
          <div className="space-y-6">
            
            {/* Role Portal Selector */}
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Select Your System Portal to Register:
              </label>
              
              <div className="grid grid-cols-1 gap-3">
                {roles.map((role) => {
                  const isSelected = selectedRole === role.value
                  return (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => setSelectedRole(role.value)}
                      className={`group relative p-4 rounded-xl border text-left transition-all duration-300 cursor-pointer ${
                        isSelected
                          ? 'border-primary-500 bg-primary-950/20 shadow-[0_0_20px_rgba(14,165,233,0.1)]'
                          : 'border-neutral-800 bg-neutral-900/30 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg transition-colors ${
                          isSelected ? 'bg-primary-500 text-white' : 'bg-neutral-800 text-neutral-400 group-hover:bg-neutral-700'
                        }`}>
                          {role.icon}
                        </div>
                        <div>
                          <p className={`text-sm font-bold leading-none ${isSelected ? 'text-white' : 'text-neutral-300'}`}>
                            {role.label}
                          </p>
                          <p className="text-xs text-neutral-500 mt-1 leading-none">
                            {role.description}
                          </p>
                        </div>
                      </div>
                      
                      {isSelected && (
                        <div className="absolute bottom-0 inset-x-4 h-[2px] bg-gradient-to-r from-primary-500 to-secondary-500 rounded-full" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Submit Button */}
            <Button
              onClick={() => navigate(`/auth/register/${selectedRole}`)}
              fullWidth
              size="lg"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-600 to-secondary-600 hover:from-primary-500 hover:to-secondary-500 text-white font-semibold text-sm shadow-[0_4px_20px_rgba(2,132,199,0.2)] hover:shadow-[0_4px_20px_rgba(2,132,199,0.35)] transition-all duration-300 transform hover:-translate-y-[1px] mt-6"
            >
              Continue to Registration
            </Button>
          </div>

          {/* Redirection Link */}
          <div className="text-center pt-2">
            <p className="text-xs text-neutral-500">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-400 font-semibold hover:text-primary-300 transition-colors">
                Sign In
              </Link>
            </p>
          </div>

        </div>
      </div>

    </div>
  )
}

export default RegisterPage
