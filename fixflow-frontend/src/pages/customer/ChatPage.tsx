import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Wrench } from 'lucide-react'
import jobService from '../../services/job.service'
import { useAuthStore } from '../../store/authStore'
import ChatRoom from '../../components/chat/ChatRoom'

const ChatPage: React.FC = () => {
  const { jobId: rawJobId = '' } = useParams()
  const jobId = rawJobId.startsWith('job:') ? rawJobId.replace('job:', '') : rawJobId
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobService.getJob(jobId),
    enabled: Boolean(jobId),
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center gap-3 text-slate-400">
        <Loader2 size={20} className="animate-spin text-sky-500" />
        <span className="text-sm font-mono">Connecting to chat...</span>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-450 p-6">
        <p className="text-sm">Job not found.</p>
        <button
          onClick={() => navigate('/customer/dashboard')}
          className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all text-slate-300"
        >
          Return to Dashboard
        </button>
      </div>
    )
  }

  const peerName = job.technicianName || 'Specialist Technician'
  const serviceType = job.serviceType || 'Service Professional'

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-900 bg-slate-950/70 backdrop-blur-xl px-4 py-3 shrink-0 z-40">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-850 bg-slate-900/50 text-slate-400 hover:bg-slate-900 hover:text-slate-200 transition-colors shadow-sm"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-800 flex items-center justify-center font-bold text-sky-400 shrink-0 shadow-inner">
              {peerName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-white truncate leading-tight">{peerName}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                </span>
                <span className="text-[10px] text-slate-500 font-semibold tracking-wide uppercase truncate">
                  {serviceType}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* View Job Link */}
        <button
          onClick={() => navigate(`/customer/track/${jobId}`)}
          className="flex items-center gap-1.5 rounded-xl border border-slate-850 bg-slate-900/50 py-2 px-3 text-[11px] font-bold text-slate-300 hover:bg-slate-900 hover:text-white transition-all shadow-sm shrink-0 cursor-pointer"
        >
          <Wrench className="h-3.5 w-3.5 text-slate-400" />
          <span className="hidden sm:inline">Track Job</span>
        </button>
      </div>

      {/* Main Chat Container */}
      {user && (
        <ChatRoom jobId={jobId} currentUserId={user.id} />
      )}
    </div>
  )
}

export default ChatPage
