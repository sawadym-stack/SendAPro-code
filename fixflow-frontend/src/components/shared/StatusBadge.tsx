import React from 'react'

type JobStatus =
  | 'Requested'
  | 'Accepted'
  | 'OnTheWay'
  | 'Arrived'
  | 'Working'
  | 'Completed'
  | 'Cancelled'
  | 'Scheduled'

type PaymentStatus = 'Pending' | 'Authorized' | 'Captured' | 'Failed' | 'Refunded'

type DisputeStatus = 'Open' | 'UnderReview' | 'Resolved'

type StatusType = JobStatus | PaymentStatus | DisputeStatus | string

interface StatusBadgeProps {
  status: StatusType
  /** Optional explicit variant override */
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'purple'
  size?: 'sm' | 'md'
  className?: string
}

const statusConfig: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'purple' }
> = {
  // Job statuses
  Requested: { label: 'Requested', variant: 'info' },
  Accepted: { label: 'Accepted', variant: 'purple' },
  OnTheWay: { label: 'On The Way', variant: 'warning' },
  Arrived: { label: 'Arrived', variant: 'warning' },
  Working: { label: 'Working', variant: 'purple' },
  Completed: { label: 'Completed', variant: 'success' },
  Cancelled: { label: 'Cancelled', variant: 'error' },
  Scheduled: { label: 'Scheduled', variant: 'neutral' },
  // Payment statuses
  Pending: { label: 'Pending', variant: 'warning' },
  Authorized: { label: 'Authorized', variant: 'info' },
  Captured: { label: 'Paid', variant: 'success' },
  Failed: { label: 'Failed', variant: 'error' },
  Refunded: { label: 'Refunded', variant: 'neutral' },
  // Dispute statuses
  Open: { label: 'Open', variant: 'error' },
  UnderReview: { label: 'Under Review', variant: 'warning' },
  Resolved: { label: 'Resolved', variant: 'success' },
}

const variantStyles: Record<string, string> = {
  success:
    'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  warning:
    'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  error:
    'bg-red-500/15 text-red-400 border border-red-500/30',
  info:
    'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  neutral:
    'bg-slate-500/15 text-slate-400 border border-slate-500/30',
  purple:
    'bg-violet-500/15 text-violet-400 border border-violet-500/30',
}

const dotStyles: Record<string, string> = {
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error: 'bg-red-400',
  info: 'bg-blue-400',
  neutral: 'bg-slate-400',
  purple: 'bg-violet-400',
}

const sizeStyles = {
  sm: 'px-2 py-0.5 text-[11px] gap-1',
  md: 'px-2.5 py-1 text-xs gap-1.5',
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant: variantOverride,
  size = 'md',
  className = '',
}) => {
  const config = statusConfig[status] ?? {
    label: status,
    variant: 'neutral' as const,
  }
  const variant = variantOverride ?? config.variant

  const isActive = ['Requested', 'Accepted', 'OnTheWay', 'Arrived', 'Working', 'UnderReview'].includes(status)

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold tracking-wide ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {isActive ? (
        <span className={`relative flex ${size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'}`}>
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotStyles[variant]} opacity-75`} />
          <span className={`relative inline-flex rounded-full ${dotStyles[variant]} ${size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'}`} />
        </span>
      ) : (
        <span className={`rounded-full ${dotStyles[variant]} ${size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'}`} />
      )}
      {config.label}
    </span>
  )
}

export default StatusBadge
