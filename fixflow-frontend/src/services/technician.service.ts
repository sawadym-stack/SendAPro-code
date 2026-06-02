import api from './api'
import type { Job, Technician } from '../types'

const technicianService = {
  getMe: async (): Promise<Technician> => (await api.get<Technician>('/technicians/me')).data,
  updateAvailability: async (status: 'Online' | 'Busy' | 'Offline'): Promise<void> => {
    await api.patch('/technicians/availability', { status })
  },
  getIncoming: async (): Promise<Job[]> => (await api.get<Job[]>('/technicians/requests')).data,
  acceptJob: async (id: string): Promise<Job> => (await api.post<Job>(`/jobs/${id}/accept`, {})).data,
  rejectJob: async (id: string): Promise<void> => {
    await api.post(`/jobs/${id}/reject`, {})
  },
  patchJobStatus: async (id: string, status: string): Promise<Job> => (await api.patch<Job>(`/jobs/${id}/status`, { status })).data,
  uploadJobImages: async (id: string, type: 'before' | 'after', files: File[]): Promise<void> => {
    const form = new FormData()
    files.forEach((file) => form.append('images', file))
    await api.post(`/jobs/${id}/images?type=${type}`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  updateSkills: async (skills: string[]): Promise<void> => {
    await api.put('/technicians/skills', { skills })
  },
  updateLocation: async (lat: number, lng: number): Promise<void> => {
    await api.post('/technicians/location', { lat, lng })
  },
}

export default technicianService
