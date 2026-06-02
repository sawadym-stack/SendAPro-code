import { create } from 'zustand'
import type { Job } from '../types'

interface TechnicianPosition {
  lat: number
  lng: number
  eta: number
}

interface JobState {
  activeJob: Job | null
  technicianPosition: TechnicianPosition | null
  setActiveJob: (job: Job) => void
  clearActiveJob: () => void
  updateTechnicianPosition: (lat: number, lng: number, eta: number) => void
}

export const useJobStore = create<JobState>((set) => ({
  activeJob: null,
  technicianPosition: null,
  setActiveJob: (job) => set({ activeJob: job }),
  clearActiveJob: () => set({ activeJob: null, technicianPosition: null }),
  updateTechnicianPosition: (lat, lng, eta) => set({ technicianPosition: { lat, lng, eta } }),
}))
