import {
  Clock,
  CheckCircle,
  Car,
  MapPin,
  Wrench,
  CheckCircle2,
  XCircle,
  Calendar,
  type LucideIcon,
} from 'lucide-react'
import { JobStatus } from '../types'

export interface JobStatusConfig {
  label: string
  /** Tailwind classes for background + text */
  color: string
  /** Tailwind class for the dot indicator */
  dotColor: string
  icon: LucideIcon
  description: string
  /** Statuses whose dots should pulse (active states) */
  isPulsing: boolean
}

export const JOB_STATUS_CONFIG: Record<JobStatus, JobStatusConfig> = {
  [JobStatus.Requested]: {
    label: 'Requested',
    color: 'bg-yellow-100 text-yellow-800',
    dotColor: 'bg-yellow-400',
    icon: Clock,
    description: 'Waiting for technician',
    isPulsing: true,
  },
  [JobStatus.Accepted]: {
    label: 'Accepted',
    color: 'bg-blue-100 text-blue-800',
    dotColor: 'bg-blue-400',
    icon: CheckCircle,
    description: 'Technician assigned',
    isPulsing: false,
  },
  [JobStatus.OnTheWay]: {
    label: 'On The Way',
    color: 'bg-purple-100 text-purple-800',
    dotColor: 'bg-purple-400',
    icon: Car,
    description: 'Technician is coming',
    isPulsing: true,
  },
  [JobStatus.Arrived]: {
    label: 'Arrived',
    color: 'bg-indigo-100 text-indigo-800',
    dotColor: 'bg-indigo-400',
    icon: MapPin,
    description: 'Technician at location',
    isPulsing: false,
  },
  [JobStatus.Working]: {
    label: 'In Progress',
    color: 'bg-orange-100 text-orange-800',
    dotColor: 'bg-orange-400',
    icon: Wrench,
    description: 'Work in progress',
    isPulsing: true,
  },
  [JobStatus.Completed]: {
    label: 'Completed',
    color: 'bg-green-100 text-green-800',
    dotColor: 'bg-green-400',
    icon: CheckCircle2,
    description: 'Job done',
    isPulsing: false,
  },
  [JobStatus.Cancelled]: {
    label: 'Cancelled',
    color: 'bg-red-100 text-red-800',
    dotColor: 'bg-red-400',
    icon: XCircle,
    description: 'Job cancelled',
    isPulsing: false,
  },
  [JobStatus.Scheduled]: {
    label: 'Scheduled',
    color: 'bg-teal-100 text-teal-800',
    dotColor: 'bg-teal-400',
    icon: Calendar,
    description: 'Upcoming booking',
    isPulsing: false,
  },
}

/** Returns config for a given status, falling back to Requested if unknown */
export const getJobStatusConfig = (status: string): JobStatusConfig => {
  return (
    JOB_STATUS_CONFIG[status as JobStatus] ?? JOB_STATUS_CONFIG[JobStatus.Requested]
  )
}

/** Returns a user-friendly label for a status string */
export const getJobStatusLabel = (status: string): string =>
  getJobStatusConfig(status).label

/** Returns a user-friendly description for a status string */
export const getJobStatusDescription = (status: string): string =>
  getJobStatusConfig(status).description

/** Maps status to a toast message for WS job_status events */
export const getStatusToastMessage = (status: string): string => {
  const messages: Partial<Record<JobStatus, string>> = {
    [JobStatus.Accepted]: '🔧 Technician accepted your job',
    [JobStatus.OnTheWay]: '🚗 Technician is on the way',
    [JobStatus.Arrived]: '📍 Technician has arrived',
    [JobStatus.Working]: '⚙️ Work has started',
    [JobStatus.Completed]: '✅ Job completed successfully!',
    [JobStatus.Cancelled]: '❌ Job was cancelled',
  }
  return messages[status as JobStatus] ?? `Job status updated: ${getJobStatusLabel(status)}`
}
