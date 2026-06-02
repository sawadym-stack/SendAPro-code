import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, Users, Radar, AlertTriangle, FileWarning, HeartPulse } from 'lucide-react'
import { Sidebar } from '../components/shared/Navigation'
import { useWS } from '../context/WSContext'
import { useAuthStore } from '../store/authStore'
import { QUERY_KEYS } from '../constants/queryKeys'
import analyticsService from '../services/analytics.service'

const AdminLayout = () => {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const { connect, disconnect, on, off } = useWS()

  // Fetch overview metrics dynamically for badge counts
  const { data: overview } = useQuery({
    queryKey: QUERY_KEYS.adminOverview,
    queryFn: analyticsService.getOverview,
    refetchInterval: 30000,
  })

  // Subscribe to WebSocket metrics channel
  useEffect(() => {
    if (token) {
      connect('admin:all', token)

      const handleMetricsUpdate = (updatedStats: any) => {
        console.log('[WS AdminLayout] Received live update:', updatedStats)
        queryClient.setQueryData(QUERY_KEYS.adminOverview, updatedStats)
      }

      on('metrics_update', handleMetricsUpdate)

      return () => {
        off('metrics_update', handleMetricsUpdate)
        disconnect()
      }
    }
  }, [token, connect, disconnect, on, off, queryClient])

  // Build items list with dynamic badges
  const navigationItems = [
    { label: 'Analytics', path: '/admin/analytics', icon: <BarChart3 size={20} /> },
    { label: 'Users', path: '/admin/users', icon: <Users size={20} /> },
    { label: 'Live Jobs', path: '/admin/jobs', icon: <Radar size={20} />, badge: overview?.activeJobs ?? 0 },
    { label: 'Disputes', path: '/admin/disputes', icon: <AlertTriangle size={20} />, badge: overview?.disputesOpen ?? 0 },
    { label: 'Reports', path: '/admin/reports', icon: <FileWarning size={20} /> },
    { label: 'System Health', path: '/admin/health', icon: <HeartPulse size={20} /> },
  ]

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar items={navigationItems} title="SendAPro Admin" dark={true} />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout
