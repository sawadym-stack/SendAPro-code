import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Wrench, CheckCircle, ArrowLeft, Plus, X } from 'lucide-react'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { Button, Alert } from '../../components/ui'

const schema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  yearsExperience: z.number({ message: 'Years required' }).min(0).max(50),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type FormValues = z.infer<typeof schema>

const SKILL_OPTIONS = ['electrical', 'plumbing', 'ac_repair', 'carpentry', 'painting', 'welding', 'general_maintenance']

export default function TechnicianRegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [skillsError, setSkillsError] = useState('')
  const [otpStep, setOtpStep] = useState(false)
  const [otp, setOtp] = useState('')
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { yearsExperience: 0 },
  })

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    )
    setSkillsError('')
  }

  const onSubmit = async (values: FormValues) => {
    if (selectedSkills.length === 0) {
      setSkillsError('Please select at least one skill')
      return
    }
    setError('')
    try {
      const res = await api.post('/auth/register/technician', {
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        password: values.password,
        skills: selectedSkills,
        yearsExperience: values.yearsExperience,
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
      const mockUser = { id: userId, name: '', email, phone: '', role: 'technician' as const, isVerified: true, createdAt: new Date().toISOString() }
      setAuth(mockUser, accessToken, 'technician', refreshToken)
      navigate('/technician/dashboard')
    } catch (err: any) {
      setOtpError(err.response?.data?.error || 'Invalid OTP. Please try again.')
    } finally {
      setOtpLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 font-sans">
      <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-violet-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-72 h-72 rounded-full bg-purple-900/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-lg space-y-8 z-10 bg-neutral-900/40 p-8 rounded-2xl border border-neutral-800 backdrop-blur-md">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 shadow-lg shadow-violet-500/20">
              <Wrench size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">SendAPro</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{otpStep ? 'Verify Your Email' : 'Register as Technician'}</h1>
          <p className="text-neutral-400 text-sm">
            {otpStep ? `We sent an OTP to ${email}` : 'Join our network of certified field engineers.'}
          </p>
        </div>

        {!otpStep ? (
          <>
            {error && <Alert variant="danger">{error}</Alert>}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Full Name</label>
                  <input {...register('fullName')} placeholder="John Doe" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500" />
                  {errors.fullName && <p className="mt-1 text-xs text-red-400">{errors.fullName.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Years Exp.</label>
                  <input type="number" min={0} max={50} {...register('yearsExperience', { valueAsNumber: true })} placeholder="0" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500" />
                  {errors.yearsExperience && <p className="mt-1 text-xs text-red-400">{errors.yearsExperience.message}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Email Address</label>
                <input type="email" {...register('email')} placeholder="you@example.com" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500" />
                {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Phone Number</label>
                <input type="tel" {...register('phone')} placeholder="+91 9876543210" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500" />
                {errors.phone && <p className="mt-1 text-xs text-red-400">{errors.phone.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Skills</label>
                <div className="flex flex-wrap gap-2">
                  {SKILL_OPTIONS.map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                        selectedSkills.includes(skill)
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300'
                      }`}
                    >
                      {selectedSkills.includes(skill) ? <span className="flex items-center gap-1"><X size={10} />{skill.replace('_', ' ')}</span> : <span className="flex items-center gap-1"><Plus size={10} />{skill.replace('_', ' ')}</span>}
                    </button>
                  ))}
                </div>
                {skillsError && <p className="mt-1 text-xs text-red-400">{skillsError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Password</label>
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'} {...register('password')} placeholder="••••••••" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 pr-10 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500" />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300">
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Confirm</label>
                  <div className="relative">
                    <input type={showConfirm ? 'text' : 'password'} {...register('confirmPassword')} placeholder="••••••••" className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-3 pr-10 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500" />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300">
                      {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {errors.confirmPassword && <p className="mt-1 text-xs text-red-400">{errors.confirmPassword.message}</p>}
                </div>
              </div>

              <div className="bg-violet-950/20 border border-violet-900/30 rounded-xl p-3 text-xs text-violet-300">
                ⚠️ Your registration will be reviewed by an admin before you can accept jobs.
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2">
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
                className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-4 py-4 text-2xl text-center tracking-[0.5em] text-white placeholder-neutral-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <Button onClick={handleVerifyOtp} disabled={otpLoading} className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold text-sm flex items-center justify-center gap-2">
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
            <Link to="/auth/login" className="text-violet-400 font-semibold hover:text-violet-300 transition-colors">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
