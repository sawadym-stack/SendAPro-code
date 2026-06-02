import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Mail, Phone, Calendar, CheckSquare, Square, Save, Loader2, Sparkles } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import technicianService from '../../services/technician.service'
import ReviewsSection from './ReviewsSection'
import { toast } from 'react-hot-toast'
import type { Technician } from '../../types'

const AVAILABLE_SKILLS = [
  'Electrician',
  'Plumber',
  'AC Repair',
  'Appliance Repair',
  'Carpenter',
  'Painter',
  'Mason',
  'Cleaning'
]

export default function ProfilePage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])

  // Fetch technician details
  const { data: tech, isLoading, isError } = useQuery<Technician>({
    queryKey: ['technician', 'me'],
    queryFn: () => technicianService.getMe(),
  })

  useEffect(() => {
    if (tech?.skills) {
      setSelectedSkills(tech.skills)
    }
  }, [tech])

  // Update skills mutation
  const updateSkillsMutation = useMutation({
    mutationFn: (skills: string[]) => technicianService.updateSkills(skills),
    onSuccess: () => {
      toast.success('Skills updated successfully!')
      qc.invalidateQueries({ queryKey: ['technician', 'me'] })
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Failed to update skills')
    }
  })

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    )
  }

  const handleSaveSkills = () => {
    updateSkillsMutation.mutate(selectedSkills)
  }

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center gap-3 text-slate-400">
        <Loader2 className="animate-spin text-sky-500" size={24} />
        <span className="font-mono text-sm">Loading profile info...</span>
      </div>
    )
  }

  if (isError || !tech) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center max-w-lg mx-auto mt-12">
        <h3 className="text-lg font-bold text-red-400">Unable to load profile</h3>
        <p className="text-sm text-slate-500 mt-2">Check your connection or credentials and try again.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto p-4 md:p-6 text-white">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
          Profile Settings
          <Sparkles className="text-sky-400" size={24} />
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Manage your service skills, contact details, and view customer reviews.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column: Bio Card */}
        <div className="md:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl font-black text-sky-400 mb-4 shadow-lg shadow-sky-500/5">
              {user?.name
                ?.split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2) || 'TE'}
            </div>
            <h2 className="text-lg font-bold text-slate-100">{user?.name}</h2>
            <span className="text-xs bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider mt-1">
              Technician
            </span>
          </div>

          <div className="border-t border-slate-800/80 pt-6 space-y-4 text-sm">
            <div className="flex items-center gap-3">
              <Mail className="text-slate-500" size={16} />
              <div className="overflow-hidden">
                <p className="text-xs text-slate-500 font-semibold">Email Address</p>
                <p className="text-slate-300 truncate">{user?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Phone className="text-slate-500" size={16} />
              <div>
                <p className="text-xs text-slate-500 font-semibold">Phone Number</p>
                <p className="text-slate-300">{user?.phone || 'Not provided'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Calendar className="text-slate-500" size={16} />
              <div>
                <p className="text-xs text-slate-500 font-semibold">Member Since</p>
                <p className="text-slate-300">
                  {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Columns: Skills Editor */}
        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-200">Skills & Expertise</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Select the service categories you are qualified to perform. You will only receive incoming dispatches matching these services.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 pt-2">
              {AVAILABLE_SKILLS.map((skill) => {
                const isSelected = selectedSkills.includes(skill)
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-sky-500 bg-sky-500/5 text-white'
                        : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare className="text-sky-500 shrink-0" size={18} />
                    ) : (
                      <Square className="text-slate-700 shrink-0" size={18} />
                    )}
                    <span className="text-sm font-semibold">{skill}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-8 border-t border-slate-800/80 pt-6 flex justify-end">
            <button
              type="button"
              onClick={handleSaveSkills}
              disabled={updateSkillsMutation.isPending}
              className="px-5 py-3 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-800 text-white disabled:text-slate-500 font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer"
            >
              {updateSkillsMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Save Expertise
            </button>
          </div>
        </div>
      </div>

      {/* Reviews List Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-xl font-black text-slate-100 flex items-center gap-2.5">
            Customer Feedback
          </h3>
          <p className="text-slate-500 text-xs mt-0.5">
            Below are reviews left by customers after completed job dispatches.
          </p>
        </div>
        <ReviewsSection technicianId={user?.id || tech.userId} />
      </div>
    </div>
  )
}
