import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { User, Mail, Phone, Calendar, Star, Briefcase, CheckCircle, Clock, AlertTriangle, BadgeCheck, Camera, Loader2 } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import jobService from '../../services/job.service'
import authService from '../../services/auth.service'
import api from '../../services/api'
import { JobStatus } from '../../types'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'

const StatCard = ({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: any; color: string }) => {
  // map bg-xxx-500 to text-xxx-400 for our dark theme
  const textClass = color.replace('bg-', 'text-').replace('-500', '-400')
  return (
    <div className="rounded-2xl border border-slate-900 bg-slate-900/60 backdrop-blur p-5 hover:bg-slate-900/80 transition-all duration-200 flex items-center gap-4">
      <div className="rounded-xl p-3 bg-slate-950 border border-slate-850/60 flex items-center justify-center shrink-0">
        <Icon className={`h-5 w-5 ${textClass}`} />
      </div>
      <div>
        <p className="text-2xl font-black text-white font-mono">{value}</p>
        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">{label}</p>
      </div>
    </div>
  )
}

const ProfilePage = () => {
  const { user, setAuth, token, role, refreshToken } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [imageError, setImageError] = useState(false)

  // Fetch full user record including profile picture and phone
  const { data: profileUser, refetch } = useQuery({
    queryKey: ['user-profile-me'],
    queryFn: () => authService.getMe(),
  })

  const currentUser = profileUser ?? user

  const initials = (currentUser?.name ?? 'User')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const triggerUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image exceeds 5MB limit')
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    setIsUploading(true)
    try {
      const res = await api.post<{ imageUrl: string }>('/users/me/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      
      const newUrl = res.data.imageUrl
      setImageError(false)
      if (user) {
        const updated = { ...user, profilePictureUrl: newUrl }
        setAuth(updated, token!, role!, refreshToken)
      }
      toast.success('Profile picture updated successfully!')
      refetch()
    } catch (err: any) {
      toast.error('Failed to upload profile picture')
    } finally {
      setIsUploading(false)
    }
  }

  const { data: statsData } = useQuery({
    queryKey: ['customer-stats'],
    queryFn: () => jobService.getCustomerStats(),
  })

  const { data: jobsData } = useQuery({
    queryKey: ['customer-jobs-profile'],
    queryFn: () => jobService.listJobs({ limit: 5, page: 1 }),
  })

  const stats = statsData
    ? {
        total: statsData.totalJobs,
        completed: statsData.completedJobs,
        cancelled: statsData.cancelledJobs,
        inProgress: statsData.activeJobs,
        spent: statsData.totalSpent,
      }
    : { total: 0, completed: 0, cancelled: 0, inProgress: 0, spent: 0 }
  const recentJobs = jobsData?.jobs?.slice(0, 5) ?? []

  const statusColor: Record<string, string> = {
    [JobStatus.Completed]: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    [JobStatus.Cancelled]: 'bg-slate-800/60 text-slate-400 border-slate-700/30',
    [JobStatus.Working]: 'bg-orange-500/10 text-orange-400 border-orange-500/20 animate-pulse',
    [JobStatus.Requested]: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    [JobStatus.Accepted]: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    [JobStatus.OnTheWay]: 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse',
    [JobStatus.Arrived]: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    [JobStatus.Scheduled]: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative py-8 px-4 sm:px-6 lg:px-8 space-y-8 pb-20">
      {/* Top ambient glow */}
      <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none" />
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-sky-500/5 blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-1">Customer Hub</p>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">My Profile</h1>
          <p className="text-sm text-slate-550 mt-1">Your account details and service history at a glance.</p>
        </div>

        {/* Profile Card */}
        <div className="rounded-2xl border border-slate-900 bg-slate-900/60 backdrop-blur-xl overflow-hidden">
          {/* Cover gradient */}
          <div className="h-24 bg-gradient-to-r from-sky-500/10 to-indigo-500/10 border-b border-slate-900/50" />
          <div className="px-6 pb-6">
            {/* Avatar */}
            <div className="-mt-10 mb-4 flex items-end justify-between">
              <div 
                onClick={triggerUpload}
                className="relative w-20 h-20 rounded-2xl bg-slate-900 border-4 border-slate-950 shadow-lg flex items-center justify-center text-2xl font-black text-sky-400 cursor-pointer overflow-hidden group transition-all hover:brightness-95"
                title="Click to change profile photo"
              >
                {isUploading ? (
                  <Loader2 className="animate-spin text-sky-400 h-6 w-6" />
                ) : currentUser?.profilePictureUrl && !imageError ? (
                  <img 
                    src={currentUser.profilePictureUrl} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  initials
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="text-white h-5 w-5" />
                </div>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
              />
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 text-xs font-bold uppercase tracking-wider">
                <BadgeCheck className="h-4 w-4" /> Verified
              </span>
            </div>

            <h2 className="text-xl font-bold text-white">{currentUser?.name}</h2>
            <p className="text-xs font-mono text-slate-500 uppercase tracking-wider mt-1">Customer Account</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-3 border-t border-slate-900 pt-5">
              <div className="flex items-center gap-2.5 text-sm text-slate-300">
                <Mail className="h-4 w-4 text-slate-500 shrink-0" />
                <span className="truncate">{currentUser?.email}</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-slate-300">
                <Phone className="h-4 w-4 text-slate-500 shrink-0" />
                <span>{currentUser?.phone || 'Not provided'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-slate-300">
                <Calendar className="h-4 w-4 text-slate-500 shrink-0" />
                <span>Joined {currentUser?.createdAt ? new Date(currentUser.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '—'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Jobs" value={stats.total} icon={Briefcase} color="bg-blue-500" />
          <StatCard label="Completed" value={stats.completed} icon={CheckCircle} color="bg-emerald-500" />
          <StatCard label="In Progress" value={stats.inProgress} icon={Clock} color="bg-amber-500" />
          <StatCard label="Total Spent" value={stats.spent ? `₹${stats.spent.toLocaleString('en-IN')}` : '₹0'} icon={Star} color="bg-violet-500" />
        </div>

        {/* Recent Jobs */}
        <div className="rounded-2xl border border-slate-900 bg-slate-900/60 backdrop-blur-xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-900">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest font-mono">Recent Jobs</h3>
            <Link to="/customer/jobs" className="text-xs text-sky-400 font-semibold hover:text-sky-300">
              View All →
            </Link>
          </div>

          {recentJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <User className="h-10 w-10 opacity-30" />
              <p className="text-sm font-semibold font-mono">No jobs yet</p>
              <Link
                to="/customer/request"
                className="mt-1 inline-flex items-center gap-1 rounded-xl bg-sky-500/10 border border-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-400 hover:bg-sky-500/20 transition"
              >
                Book Your First Service
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-900">
              {recentJobs.map((job) => (
                <li key={job.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-900/40 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{job.title || job.serviceType || 'Service Job'}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{new Date(job.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${statusColor[job.status] ?? 'bg-slate-900 text-slate-400 border-slate-800'}`}>
                      {job.status}
                    </span>
                    {job.status === JobStatus.Completed && (
                      <Link to={`/customer/track/${job.id}`} className="text-xs text-sky-400 font-semibold hover:text-sky-300">
                        Details
                      </Link>
                    )}
                    {[JobStatus.Accepted, JobStatus.OnTheWay, JobStatus.Arrived, JobStatus.Working].includes(job.status) && (
                      <Link to={`/customer/track/${job.id}`} className="text-xs text-emerald-400 font-semibold hover:text-emerald-350 animate-pulse">
                        Track Live
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            to="/customer/request"
            className="rounded-2xl border border-slate-900 bg-slate-900/40 hover:bg-slate-900/70 hover:border-sky-500/20 p-5 flex flex-col gap-2 transition group"
          >
            <Briefcase className="h-7 w-7 text-sky-400 group-hover:scale-110 transition-transform" />
            <p className="font-bold text-white text-sm">Book Service</p>
            <p className="text-xs text-slate-500">Request a new home repair</p>
          </Link>
          <Link
            to="/customer/schedule"
            className="rounded-2xl border border-slate-900 bg-slate-900/40 hover:bg-slate-900/70 hover:border-violet-500/20 p-5 flex flex-col gap-2 transition group"
          >
            <Clock className="h-7 w-7 text-violet-400 group-hover:scale-110 transition-transform" />
            <p className="font-bold text-white text-sm">Schedule Job</p>
            <p className="text-xs text-slate-500">Pick a future date & time</p>
          </Link>
          <Link
            to="/customer/disputes/new"
            className="rounded-2xl border border-slate-900 bg-slate-900/40 hover:bg-slate-900/70 hover:border-red-500/20 p-5 flex flex-col gap-2 transition group"
          >
            <AlertTriangle className="h-7 w-7 text-red-400 group-hover:scale-110 transition-transform" />
            <p className="font-bold text-white text-sm">Raise Dispute</p>
            <p className="text-xs text-slate-500">Report an issue with a job</p>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
