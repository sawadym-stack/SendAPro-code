import { Car, Check, CircleCheck, Clock3, MapPin, Wrench } from 'lucide-react'
import { JobStatus } from '../../types'

const steps = [
  { key: JobStatus.Requested, label: 'Requested', icon: Clock3 },
  { key: JobStatus.Accepted, label: 'Accepted', icon: Check },
  { key: JobStatus.OnTheWay, label: 'On The Way', icon: Car },
  { key: JobStatus.Arrived, label: 'Arrived', icon: MapPin },
  { key: JobStatus.Working, label: 'Working', icon: Wrench },
  { key: JobStatus.Completed, label: 'Completed', icon: CircleCheck },
]

const JobStatusStepper = ({ currentStatus }: { currentStatus: JobStatus }) => {
  const currentIdx = steps.findIndex((step) => step.key === currentStatus)

  return (
    <div className="rounded-2xl border border-slate-900 bg-slate-900/40 backdrop-blur-xl p-6 shadow-xl shadow-slate-950/20">
      <h3 className="text-lg font-bold text-slate-100 mb-6 font-display">Job Status</h3>
      
      {/* Desktop Horizontal Stepper */}
      <div className="hidden md:block relative px-4">
        {/* Background Track Line */}
        <div className="absolute top-4.5 left-10 right-10 h-0.5 bg-slate-800 -translate-y-1/2 z-0" />
        
        {/* Active Track Line */}
        <div 
          className="absolute top-4.5 left-10 h-0.5 bg-emerald-500 -translate-y-1/2 z-0 transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
          style={{ 
            width: `${currentIdx > 0 ? (currentIdx / (steps.length - 1)) * 100 : 0}%`,
            maxWidth: 'calc(100% - 5rem)' 
          }} 
        />

        {/* Steps */}
        <div className="relative flex justify-between z-10">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isPast = index < currentIdx
            const isCurrent = index === currentIdx
            const stateClass = isPast 
              ? 'bg-emerald-500 text-white ring-4 ring-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]' 
              : isCurrent 
                ? 'bg-sky-500 text-white ring-4 ring-sky-500/20 scale-110 shadow-[0_0_12px_rgba(14,165,233,0.4)]' 
                : 'bg-slate-950 border-2 border-slate-800 text-slate-500'

            return (
              <div key={step.key} className="flex flex-col items-center flex-1">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300 ${stateClass}`}>
                  {isPast ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <p className={`mt-2 text-xs font-semibold text-center transition-colors duration-300 ${
                  isCurrent ? 'text-sky-400 font-extrabold' : isPast ? 'text-emerald-400 font-semibold' : 'text-slate-500'
                }`}>{step.label}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Mobile Vertical Stepper (Timeline style) */}
      <div className="md:hidden space-y-0 relative pl-4">
        {/* Vertical Track Line */}
        <div className="absolute left-[33px] top-4 bottom-4 w-0.5 bg-slate-800 z-0" />
        
        {/* Active Vertical Track Line */}
        <div 
          className="absolute left-[33px] top-4 w-0.5 bg-emerald-500 z-0 transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
          style={{ 
            height: `${currentIdx > 0 ? (currentIdx / (steps.length - 1)) * 100 : 0}%`,
            maxHeight: 'calc(100% - 2rem)'
          }} 
        />

        {steps.map((step, index) => {
          const Icon = step.icon
          const isPast = index < currentIdx
          const isCurrent = index === currentIdx
          const stateClass = isPast 
            ? 'bg-emerald-500 text-white ring-4 ring-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]' 
            : isCurrent 
              ? 'bg-sky-500 text-white ring-4 ring-sky-500/20 scale-105 shadow-[0_0_12px_rgba(14,165,233,0.4)]' 
              : 'bg-slate-950 border-2 border-slate-800 text-slate-500'

          return (
            <div key={step.key} className="relative flex items-start gap-4 pb-8 last:pb-0 z-10">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${stateClass}`}>
                {isPast ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <div className="pt-1.5">
                <p className={`text-sm font-bold transition-colors duration-300 ${
                  isCurrent ? 'text-sky-400 font-extrabold' : isPast ? 'text-emerald-400 font-semibold' : 'text-slate-500'
                }`}>{step.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isCurrent ? 'Active stage' : isPast ? 'Completed' : 'Pending'}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default JobStatusStepper
