import { z } from 'zod'

// ── Review ────────────────────────────────────────────────────────────────────
export const submitReviewSchema = z.object({
  rating: z.number().int().min(1, 'Rating must be at least 1').max(5, 'Rating cannot exceed 5'),
  comment: z.string().min(10, 'Comment must be at least 10 characters').optional().or(z.literal('')),
  imageUrls: z.array(z.string().url('Must be a valid URL')).max(3, 'Up to 3 images allowed').default([]),
})
export type SubmitReviewFormValues = z.infer<typeof submitReviewSchema>

// ── Dispute ───────────────────────────────────────────────────────────────────
export const raiseDisputeSchema = z.object({
  reason: z.enum(
    ['BillingIssue', 'QualityIssue', 'NoShow', 'Misconduct', 'Other'],
    { message: 'Please select a reason' },
  ),
  description: z
    .string()
    .min(30, 'Please describe the issue in at least 30 characters')
    .max(1000, 'Description cannot exceed 1000 characters'),
})
export type RaiseDisputeFormValues = z.infer<typeof raiseDisputeSchema>

// ── Invoice / Payment ─────────────────────────────────────────────────────────
export const generateInvoiceSchema = z.object({
  labourCharge: z
    .number({ message: 'Labour charge is required' })
    .min(1, 'Labour charge must be greater than zero'),
  materialItems: z
    .array(
      z.object({
        description: z.string().min(2, 'Description required'),
        quantity: z.number().int().positive('Quantity must be a positive integer'),
        unitPrice: z.number().positive('Unit price must be positive'),
      }),
    )
    .default([]),
})
export type GenerateInvoiceFormValues = z.infer<typeof generateInvoiceSchema>

// ── Quotation ─────────────────────────────────────────────────────────────────
export const requestQuotationSchema = z.object({
  materialId: z.string().uuid('Invalid material ID'),
  jobId: z.string().uuid('Invalid job ID').optional().or(z.literal('')),
  requestedQty: z
    .number({ message: 'Quantity is required' })
    .int()
    .positive('Quantity must be at least 1'),
  notes: z.string().max(300, 'Notes cannot exceed 300 characters').optional().or(z.literal('')),
})
export type RequestQuotationFormValues = z.infer<typeof requestQuotationSchema>

// ── Auth ──────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  phone: z
    .string()
    .regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number (e.g. +919876543210)'),
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must be numeric'),
  rememberMe: z.boolean().default(false),
})
export type LoginFormValues = z.infer<typeof loginSchema>

// ── Profile ───────────────────────────────────────────────────────────────────
export const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email address').optional().or(z.literal('')),
})
export type UpdateProfileFormValues = z.infer<typeof updateProfileSchema>
