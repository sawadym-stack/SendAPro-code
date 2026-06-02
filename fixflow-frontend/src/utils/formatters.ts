import { JobStatus } from '../types'

/**
 * Formats a currency amount in Indian denomination:
 * - >= 1,00,000 (1 lakh): "Rs. 1.5L"
 * - >= 1,000: "Rs. 12,500"
 * - otherwise: "Rs. 500"
 */
export const formatCurrency = (amount: number): string => {
  if (amount >= 100000) {
    return `Rs. ${(amount / 100000).toFixed(1)}L`
  }
  if (amount >= 1000) {
    return `Rs. ${amount.toLocaleString('en-IN')}`
  }
  return `Rs. ${Math.round(amount)}`
}

/** Alias for crore/lakh full denomination (backward compat) */
export const formatCurrencyINR = formatCurrency

/**
 * Formats a distance value.
 * Backend sends km (floats like 2.3, 0.35).
 * - < 1 km: "350 m away"
 * - >= 1 km: "2.3 km away"
 */
export const formatDistance = (km: number): string => {
  if (km < 1) {
    return `${Math.round(km * 1000)} m away`
  }
  return `${km.toFixed(1)} km away`
}

/**
 * Formats an ETA in minutes:
 * - < 1 min: "Arriving now"
 * - 1 min: "1 min away"
 * - < 60 min: "15 min away"
 * - >= 60 min: "1h 5m away"
 */
export const formatETA = (minutes: number): string => {
  if (minutes < 1) return 'Arriving now'
  if (minutes === 1) return '1 min away'
  if (minutes < 60) return `${Math.round(minutes)} min away`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m away` : `${hours}h away`
}

/**
 * Formats an Indian phone number for display:
 * 10-digit → "+91 98765 43210"
 * 12-digit (with country code) → "+91 98765 43210"
 */
export const formatPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) {
    const num = digits.slice(2)
    return `+91 ${num.slice(0, 5)} ${num.slice(5)}`
  }
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
  }
  return phone
}

/**
 * Returns last 8 chars of UUID prefixed with #
 * "a1b2c3d4-..." → "#A1B2C3D4"
 */
export const formatJobID = (id: string): string => {
  if (!id) return '#—'
  return '#' + id.slice(-8).toUpperCase()
}

export const formatDate = (iso: string): string => {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const formatTimeAgo = (iso: string): string => {
  const date = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = now - date
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export const statusLabel = (status: JobStatus): string => {
  switch (status) {
    case JobStatus.OnTheWay:
      return 'On The Way'
    case JobStatus.Working:
      return 'In Progress'
    case JobStatus.Scheduled:
      return 'Scheduled'
    default:
      return status
  }
}

export const statusColor = (status: JobStatus): string => {
  switch (status) {
    case JobStatus.Requested:
      return 'bg-yellow-100 text-yellow-800'
    case JobStatus.Accepted:
      return 'bg-blue-100 text-blue-800'
    case JobStatus.OnTheWay:
      return 'bg-purple-100 text-purple-800'
    case JobStatus.Arrived:
      return 'bg-indigo-100 text-indigo-800'
    case JobStatus.Working:
      return 'bg-orange-100 text-orange-800'
    case JobStatus.Completed:
      return 'bg-green-100 text-green-800'
    case JobStatus.Cancelled:
      return 'bg-red-100 text-red-800'
    case JobStatus.Scheduled:
      return 'bg-teal-100 text-teal-800'
    default:
      return 'bg-slate-100 text-slate-800'
  }
}

export const serviceTypeIcon = (type: string): string => {
  const normalized = type.toLowerCase()
  if (normalized.includes('electric')) return 'Bolt'
  if (normalized.includes('plumb')) return 'Droplets'
  if (normalized.includes('carpent')) return 'Hammer'
  if (normalized.includes('paint')) return 'Paintbrush'
  if (normalized.includes('ac') || normalized.includes('air')) return 'Wind'
  if (normalized.includes('clean')) return 'Sparkles'
  if (normalized.includes('pest')) return 'Bug'
  return 'Wrench'
}
