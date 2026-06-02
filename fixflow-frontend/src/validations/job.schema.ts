import { z } from 'zod'

export const serviceTypes = [
  'Electrician',
  'Plumber',
  'AC Repair'
] as const

export const createJobSchema = z.object({
  serviceType: z.enum(serviceTypes),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  urgency: z.enum(['Normal', 'High']),
  lat: z.number().optional(),
  lng: z.number().optional(),
  address: z.string().min(3, 'Address is required').optional(),
  images: z.array(z.instanceof(File)).max(3, 'You can upload up to 3 images').default([]),
})

export const createEmergencySchema = z.object({
  serviceType: z.enum(serviceTypes),
  description: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
})

export type CreateJobFormValues = z.infer<typeof createJobSchema>
export type CreateEmergencyFormValues = z.infer<typeof createEmergencySchema>
