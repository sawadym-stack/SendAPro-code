import React from 'react'
import {
  Briefcase,
  CheckCircle2,
  Bell,
  Package,
  FileText,
  MessageCircle,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

interface EmptyStateProps {
  /** Lucide icon component */
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}
    >
      {Icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800/60 text-slate-500">
          <Icon size={28} strokeWidth={1.5} />
        </div>
      )}
      <h3 className="mb-1 text-base font-semibold text-slate-300">{title}</h3>
      {description && (
        <p className="mb-5 max-w-xs text-sm text-slate-500 leading-relaxed">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  )
}

// ── Role-specific Preset Empty States ───────────────────────────────────────

/** Customer: no jobs at all */
export const NoJobsEmpty: React.FC<{ action?: React.ReactNode }> = ({ action }) => (
  <EmptyState
    icon={Briefcase}
    title="No jobs yet"
    description="Request your first service and get help in minutes."
    action={action}
  />
)

/** Customer: no completed jobs */
export const NoCompletedJobsEmpty: React.FC = () => (
  <EmptyState
    icon={CheckCircle2}
    title="No completed jobs"
    description="Completed jobs will appear here."
  />
)

/** Technician: no incoming requests */
export const NoRequestsEmpty: React.FC<{ action?: React.ReactNode }> = ({ action }) => (
  <EmptyState
    icon={Bell}
    title="No requests right now"
    description="Set yourself Online to receive booking requests."
    action={action}
  />
)

/** Supplier: no materials listed */
export const NoMaterialsEmpty: React.FC<{ action?: React.ReactNode }> = ({ action }) => (
  <EmptyState
    icon={Package}
    title="No materials listed"
    description="Add your first material to start receiving quotation requests."
    action={action}
  />
)

/** Supplier/Customer: no quotations */
export const NoQuotationsEmpty: React.FC = () => (
  <EmptyState
    icon={FileText}
    title="No quotation requests"
    description="Requests from technicians and customers will appear here."
  />
)

/** Notifications: none */
export const NoNotificationsEmpty: React.FC = () => (
  <EmptyState
    icon={Bell}
    title="All caught up!"
    description="You have no notifications."
  />
)

/** Chat: no messages yet */
export const NoChatMessagesEmpty: React.FC = () => (
  <EmptyState
    icon={MessageCircle}
    title="No messages yet"
    description="Send the first message to start the conversation."
  />
)

/** Admin: no disputes */
export const NoDisputesEmpty: React.FC = () => (
  <EmptyState
    icon={ShieldCheck}
    title="No disputes"
    description="All disputes will appear here for review."
  />
)

export default EmptyState
