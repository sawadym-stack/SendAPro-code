import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import type { Role } from '../../types'

interface RoleGuardProps {
  allowedRoles: Role[]
  children: ReactNode
}

const RoleGuard = ({ allowedRoles, children }: RoleGuardProps) => {
  const { isAuthenticated, role } = useAuthStore()
  const location = useLocation()

  if (!isAuthenticated || !role || !allowedRoles.includes(role)) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }

  return children
}

export default RoleGuard
