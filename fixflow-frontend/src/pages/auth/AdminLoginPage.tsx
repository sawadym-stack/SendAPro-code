import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Shield } from 'lucide-react'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { Button, Alert } from '../../components/ui'

const adminLoginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(4, 'Password must be at least 4 characters'),
})

type AdminLoginFormValues = z.infer<typeof adminLoginSchema>

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<AdminLoginFormValues>({
    resolver: zodResolver(adminLoginSchema),
  })

  const onSubmit = async (data: AdminLoginFormValues) => {
    setError('')
    setIsLoading(true)

    try {
      const response = await api.post('/auth/admin/login', {
        email: data.email,
        password: data.password,
      })

      const { userID, accessToken, refreshToken, role } = response.data

      // Mock user object for admin
      const mockUser = {
        id: userID,
        name: 'Admin User',
        email: data.email,
        phone: '00000000000',
        role: 'admin' as const,
        isVerified: true,
        createdAt: new Date().toISOString(),
      }

      setAuth(mockUser, accessToken, role, refreshToken)
      navigate('/admin/analytics')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid admin credentials')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-stretch font-sans text-neutral-200 selection:bg-red-500 selection:text-white overflow-x-hidden">
      {/* Centered Login Form Card */}
      <div className="w-full flex flex-col justify-center items-center p-6 sm:p-12 md:p-16 relative overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-red-900/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-20 right-10 w-72 h-72 rounded-full bg-red-900/10 blur-[120px] pointer-events-none" />

        <div className="w-full max-w-md space-y-8 z-10 bg-neutral-900/40 p-8 rounded-2xl border border-neutral-800 backdrop-blur-md">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2.5 mb-2">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 shadow-lg shadow-red-500/20">
                <Shield size={20} className="text-white" />
              </div>
              <span className="text-xl font-bold font-display tracking-tight text-white">SendAPro Admin</span>
            </div>
            <h1 className="text-3xl font-bold font-display text-white tracking-tight">
              Control Portal
            </h1>
            <p className="text-neutral-400 text-sm">
              Authorized credentials required to access core systems.
            </p>
          </div>

          {error && (
            <Alert variant="danger" className="bg-red-950/20 border-red-900/40 text-red-400">
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="admin@gmail.com"
                  {...register('email')}
                  className={`w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 transition-all duration-200 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:bg-neutral-900 ${
                    errors.email ? 'border-red-500 focus:ring-red-500' : ''
                  }`}
                />
                {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    {...register('password')}
                    className={`w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 pr-11 text-sm text-white placeholder-neutral-500 transition-all duration-200 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:bg-neutral-900 ${
                      errors.password ? 'border-red-500 focus:ring-red-500' : ''
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
                {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>}
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-semibold text-sm shadow-[0_4px_20px_rgba(220,38,38,0.2)] hover:shadow-[0_4px_20px_rgba(220,38,38,0.35)] transition-all duration-300 transform hover:-translate-y-[1px] flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : null}
              {isLoading ? 'Validating...' : 'Secure Authorization'}
            </Button>
          </form>

          <div className="text-center pt-2">
            <Link to="/auth/login" className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
              Return to Public Portals
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
