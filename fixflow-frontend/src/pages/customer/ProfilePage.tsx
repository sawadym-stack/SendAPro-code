import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { User, Mail, Phone, Calendar, Star, Briefcase, CheckCircle, Clock, AlertTriangle, BadgeCheck } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import jobService from '../../services/job.service'
import { JobStatus } from '../../types'
import { Link } from 'react-router-dom'

const StatCard = ({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: any; color: string }) => (
  <div className={`rounded-2xl border border-slate-100 bg-white p-5 shadow-xs flex items-center gap-4`}>
    <div className={`rounded-xl p-3 ${color}`}>
      <Icon className="h-5 w-5 text-white" />
    </div>
    <div>
      <p className="text-2xl font-extrabold text-slate-800">{value}</p>
      <p className="text-xs font-semibold text-slate-400 mt-0.5">{label}</p>
    </div>
  </div>
)

const ProfilePage = () => {
  const { user } = useAuthStore()
  const [initials] = useState(() =>
    (user?.name ?? 'User')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  )

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
    [JobStatus.Completed]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    [JobStatus.Cancelled]: 'bg-red-50 text-red-700 border-red-200',
    [JobStatus.Working]: 'bg-blue-50 text-blue-700 border-blue-200',
    [JobStatus.Requested]: 'bg-amber-50 text-amber-700 border-amber-200',
    [JobStatus.Accepted]: 'bg-sky-50 text-sky-700 border-sky-200',
    [JobStatus.OnTheWay]: 'bg-violet-50 text-violet-700 border-violet-200',
    [JobStatus.Arrived]: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    [JobStatus.Scheduled]: 'bg-orange-50 text-orange-700 border-orange-200',
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">My Profile</h1>
        <p className="text-sm text-slate-500 mt-0.5">Your account details and service history at a glance.</p>
      </div>

      {/* Profile Card */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-xs overflow-hidden">
        {/* Cover gradient */}
        <div className="h-24 bg-gradient-to-r from-blue-600 to-indigo-600" />
        <div className="px-6 pb-6">
          {/* Avatar */}
          <div className="-mt-10 mb-4 flex items-end justify-between">
            <div className="w-20 h-20 rounded-2xl bg-white border-4 border-white shadow-lg flex items-center justify-center text-2xl font-black text-blue-600">
              {initials}
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1 text-xs font-bold uppercase tracking-wider">
              <BadgeCheck className="h-4 w-4" /> Verified
            </span>
          </div>

          <h2 className="text-xl font-bold text-slate-800">{user?.name}</h2>
          <p className="text-sm text-slate-400 mt-0.5">Customer Account</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-2.5 text-sm text-slate-600">
              <Mail className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="truncate">{user?.email}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-slate-600">
              <Phone className="h-4 w-4 text-slate-400 shrink-0" />
              <span>{user?.phone || 'Not provided'}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-slate-600">
              <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
              <span>Joined {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '—'}</span>
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
      <div className="rounded-2xl border border-slate-100 bg-white shadow-xs">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-700 text-sm">Recent Jobs</h3>
          <Link to="/customer/jobs" className="text-xs text-blue-600 font-semibold hover:underline">
            View All →
          </Link>
        </div>

        {recentJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <User className="h-10 w-10 opacity-30" />
            <p className="text-sm font-semibold">No jobs yet</p>
            <Link
              to="/customer/request"
              className="mt-1 inline-flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
            >
              Book Your First Service
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {recentJobs.map((job) => (
              <li key={job.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{job.title || job.serviceType || 'Service Job'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{new Date(job.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${statusColor[job.status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {job.status}
                  </span>
                  {job.status === JobStatus.Completed && (
                    <Link to={`/customer/track/${job.id}`} className="text-xs text-blue-600 font-semibold hover:underline">
                      Details
                    </Link>
                  )}
                  {[JobStatus.Accepted, JobStatus.OnTheWay, JobStatus.Arrived, JobStatus.Working].includes(job.status) && (
                    <Link to={`/customer/track/${job.id}`} className="text-xs text-emerald-600 font-semibold hover:underline animate-pulse">
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Link
          to="/customer/request"
          className="rounded-2xl border border-slate-100 bg-white shadow-xs p-5 flex flex-col gap-2 hover:border-blue-200 hover:bg-blue-50/30 transition group"
        >
          <Briefcase className="h-7 w-7 text-blue-500 group-hover:scale-110 transition-transform" />
          <p className="font-bold text-slate-700 text-sm">Book Service</p>
          <p className="text-xs text-slate-400">Request a new home repair</p>
        </Link>
        <Link
          to="/customer/schedule"
          className="rounded-2xl border border-slate-100 bg-white shadow-xs p-5 flex flex-col gap-2 hover:border-violet-200 hover:bg-violet-50/30 transition group"
        >
          <Clock className="h-7 w-7 text-violet-500 group-hover:scale-110 transition-transform" />
          <p className="font-bold text-slate-700 text-sm">Schedule Job</p>
          <p className="text-xs text-slate-400">Pick a future date & time</p>
        </Link>
        <Link
          to="/customer/disputes/new"
          className="rounded-2xl border border-slate-100 bg-white shadow-xs p-5 flex flex-col gap-2 hover:border-red-200 hover:bg-red-50/30 transition group"
        >
          <AlertTriangle className="h-7 w-7 text-red-400 group-hover:scale-110 transition-transform" />
          <p className="font-bold text-slate-700 text-sm">Raise Dispute</p>
          <p className="text-xs text-slate-400">Report an issue with a job</p>
        </Link>
      </div>
    </div>
  )
}

export default ProfilePage
