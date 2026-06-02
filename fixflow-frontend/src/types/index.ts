export type Role = 'customer' | 'technician' | 'supplier' | 'admin'

export enum JobStatus {
  Requested = 'Requested',
  Accepted = 'Accepted',
  OnTheWay = 'OnTheWay',
  Arrived = 'Arrived',
  Working = 'Working',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
  Scheduled = 'Scheduled',
}

export interface User {
  id: string
  name: string
  email: string
  phone: string
  role: Role
  createdAt: string
  updatedAt?: string
}

export interface Job {
  id: string
  customerId: string
  technicianId?: string
  technicianName?: string
  technicianPhone?: string
  customerName?: string
  customerPhone?: string
  title?: string
  serviceType?: string
  urgency?: 'Normal' | 'High' | 'Emergency'
  isEmergency?: boolean
  description: string
  address?: string
  latitude?: number
  longitude?: number
  amount?: number
  rating?: number
  status: JobStatus
  scheduledAt?: string
  acceptedAt?: string
  arrivedAt?: string
  startedAt?: string
  completedAt?: string
  isPaid?: boolean
  createdAt: string
  updatedAt?: string
}

export interface Technician {
  id: string
  userId: string
  name?: string
  phone?: string
  skills: string[]
  isAvailable: boolean
  availabilityStatus?: 'Online' | 'Busy' | 'Offline'
  status?: 'Online' | 'Busy' | 'Offline'
  rating: number
  currentJobId?: string
  completedTotal?: number
  todayEarnings?: number
  jobsToday?: number
  location?: {
    latitude: number
    longitude: number
  }
}

export interface Notification {
  id: string
  userId: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
}

export type WSEvent =
  | { type: 'room_joined'; room: string }
  | { type: 'job_created'; job: Job }
  | { type: 'job_updated'; job: Job }
  | { type: 'job_status_changed'; jobId: string; status: JobStatus }
  | { type: 'job_status'; jobId: string; status: JobStatus }
  | { type: 'location_update'; jobId: string; lat: number; lng: number; eta?: number }
  | { type: 'technician_location_updated'; technicianId: string; latitude: number; longitude: number }
  | { type: 'booking_request'; job: Job }
  | { type: 'booking_accepted'; jobId: string }
  | { type: 'notification'; notification: Notification }
  | { type: 'error'; message: string }
  | { type: 'pong'; timestamp: number }
  | { type: 'payment_status'; payload: { status: string; jobId: string; amount: number; reason?: string } }

export interface Supplier {
  id: string
  userId: string
  businessName: string
  contactPhone: string
  contactEmail: string
  lat: number
  lng: number
  serviceRadiusKm: number
  rating: number
  reviewCount: number
  isVerified: boolean
  createdAt: string
  distance?: number
}

export interface Material {
  id: string
  supplierId: string
  name: string
  category: string
  price: number
  stock: number
  isAvailable: boolean
  description?: string
  imageUrl?: string
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

export type QuotationStatus = 'Pending' | 'Quoted' | 'CounterOffered' | 'Accepted' | 'Rejected' | 'Expired' | 'Preparing' | 'Dispatched' | 'Delivered'

export interface Quotation {
  id: string
  materialId: string
  materialName?: string
  jobId?: string
  requesterId: string
  supplierId: string
  status: QuotationStatus
  requestedQty: number
  notes?: string
  offeredPrice?: number
  counterPrice?: number
  availableQty?: number
  deliveryDate?: string
  expiresAt: string
  requestedAt: string
  respondedAt?: string
  serviceType?: string
  area?: string
  requesterName?: string
  deliveryPhotoUrl?: string
}

export interface SupplierStats {
  totalMaterials: number
  lowStockMaterials: number
  totalQuotations: number
  pendingQuotations: number
  acceptedQuotations: number
  revenue: number
}

export interface ImportResult {
  importedCount: number
  failedCount: number
  errors: string[]
}

export type PaymentStatus = 'Pending' | 'Authorized' | 'Captured' | 'Failed' | 'Refunded'

export interface Payment {
  id: string
  jobId: string
  customerId: string
  technicianId: string
  amount: number
  currency: string
  status: PaymentStatus
  razorpayOrderId: string
  razorpayPaymentId?: string
  idempotencyKey: string
  failureReason?: string
  createdAt: string
  updatedAt?: string
}

export interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface Invoice {
  id: string
  jobId: string
  paymentId?: string
  customerName: string
  techName: string
  serviceType: string
  lineItems: InvoiceItem[]
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  pdfUrl?: string
  status: 'Paid' | 'Unpaid'
  createdAt: string
}

export interface Review {
  id: string
  jobId: string
  reviewerId: string
  revieweeId: string
  reviewerName?: string
  rating: number
  comment?: string
  imageUrls?: string[]
  createdAt: string
}

export type DisputeStatus = 'Open' | 'UnderReview' | 'Resolved'
export type DisputeReason = 'Poor Quality' | 'No Show' | 'Overcharged' | 'Unprofessional Behavior' | 'Other'

export interface Dispute {
  id: string
  jobId: string
  raisedById: string
  raisedByName?: string
  againstId: string
  reason: string
  description: string
  evidenceUrls: string[]
  status: DisputeStatus
  adminNote?: string
  action?: 'refund' | 'warn' | 'dismiss'
  resolvedAt?: string
  createdAt: string
}

