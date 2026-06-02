import React, { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import LoginPage from '../pages/auth/LoginPage'
import RegisterPage from '../pages/auth/RegisterPage'
import AdminLoginPage from '../pages/auth/AdminLoginPage'
import CustomerRegisterPage from '../pages/auth/CustomerRegisterPage'
import TechnicianRegisterPage from '../pages/auth/TechnicianRegisterPage'
import SupplierRegisterPage from '../pages/auth/SupplierRegisterPage'
import AdminApprovalPanel from '../pages/admin/ApprovalPanel'
import RoleGuard from '../components/shared/RoleGuard'
import jobService from '../services/job.service'
import { JobStatus } from '../types'
import CustomerLayout from '../layouts/CustomerLayout'
import DashboardPage from '../pages/customer/DashboardPage'
import RequestServicePage from '../pages/customer/RequestServicePage'
import EmergencyRequestPage from '../pages/customer/EmergencyRequestPage'
import JobHistoryPage from '../pages/customer/JobHistoryPage'
import TrackJobPage from '../pages/customer/TrackJobPage'
import { PaymentPage } from '../pages/customer/PaymentPage'
import { PaymentHistoryPage } from '../pages/customer/PaymentHistoryPage'
import CustomerProfilePage from '../pages/customer/ProfilePage'
import TechnicianLayout from '../layouts/TechnicianLayout'
import TechnicianDashboardPage from '../pages/technician/DashboardPage'
import IncomingRequestsPage from '../pages/technician/IncomingRequestsPage'
import ActiveJobPage from '../pages/technician/ActiveJobPage'
import NavigationPage from '../pages/technician/NavigationPage'
import { InvoicePage } from '../pages/technician/InvoicePage'
import { EarningsPage } from '../pages/technician/EarningsPage'
import TechnicianJobHistoryPage from '../pages/technician/JobHistoryPage'
import CustomerChatPage from '../pages/customer/ChatPage'
import TechnicianChatPage from '../pages/technician/ChatPage'
import SupplierLayout from '../layouts/SupplierLayout'
import SupplierDashboardPage from '../pages/supplier/DashboardPage'
import MaterialsPage from '../pages/supplier/MaterialsPage'
import QuotationsPage from '../pages/supplier/QuotationsPage'
import OrdersPage from '../pages/supplier/OrdersPage'
import SupplierProfilePage from '../pages/supplier/ProfilePage'
import SupplierAnalyticsPage from '../pages/supplier/AnalyticsPage'
import SupplierDiscoveryPage from '../pages/customer/SupplierDiscoveryPage'
import CustomerQuotationsPage from '../pages/customer/QuotationsPage'
import AdminLayout from '../layouts/AdminLayout'
import AdminAnalyticsPage from '../pages/admin/AnalyticsPage'
import AdminUsersPage from '../pages/admin/UsersPage'
import ScheduleBookingPage from '../pages/customer/ScheduleBookingPage'
import ScheduledJobsPage from '../pages/customer/ScheduledJobsPage'
import DisputePage from '../pages/customer/DisputePage'
import DisputeStatusPage from '../pages/customer/DisputeStatusPage'
import NearbyTechniciansPage from '../pages/customer/NearbyTechniciansPage'
import TechnicianProfilePage from '../pages/technician/ProfilePage'
import AdminDisputesPage from '../pages/admin/DisputesPage'
import AdminLiveJobsPage from '../pages/admin/LiveJobsPage'
import AdminReportsPage from '../pages/admin/ReportsPage'
import SystemHealthPage from '../pages/admin/SystemHealthPage'

const Placeholder = ({ title }: { title: string }) => (
  <div className="min-h-[50vh] flex items-center justify-center p-6 bg-slate-950">
    <div className="w-full max-w-md rounded-2xl border border-slate-900 bg-slate-900/60 p-8 text-center backdrop-blur-xl shadow-xl">
      <div className="w-12 h-12 rounded-full border border-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-500 text-lg">
        📡
      </div>
      <h1 className="text-xl font-black text-white tracking-tight">{title}</h1>
      <p className="text-xs text-slate-500 font-mono mt-2">
        There is currently no active job matching this request.
      </p>
    </div>
  </div>
)

/** Updates document.title on mount. Use at the top of each route element. */
const PageTitle = ({ title }: { title: string }) => {
  useEffect(() => {
    document.title = `${title} — SendAPro`
    return () => {
      document.title = 'SendAPro'
    }
  }, [title])
  return null
}

/** Wraps a page element with a document.title update */
const withTitle = (element: React.ReactElement, title: string) => (
  <>
    <PageTitle title={title} />
    {element}
  </>
)

const ActiveJobRedirect = () => {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['technician-jobs-redirect'],
    queryFn: () => jobService.listJobs({ limit: 20, page: 1 }),
  })

  useEffect(() => {
    if (isLoading) return
    const jobs = data?.jobs ?? []
    const active = jobs.find((job) =>
      [JobStatus.Accepted, JobStatus.OnTheWay, JobStatus.Arrived, JobStatus.Working].includes(job.status)
    )
    if (active) {
      navigate(`/technician/job/${active.id}`, { replace: true })
    } else {
      navigate('/technician/job/active', { replace: true })
    }
  }, [data, isLoading, navigate])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center gap-3 text-slate-400">
      <Loader2 size={20} className="animate-spin text-sky-500" />
      <span className="text-sm font-mono">Checking active dispatches...</span>
    </div>
  )
}

const NavigationRedirect = () => {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['technician-jobs-nav-redirect'],
    queryFn: () => jobService.listJobs({ limit: 20, page: 1 }),
  })

  useEffect(() => {
    if (isLoading) return
    const jobs = data?.jobs ?? []
    const active = jobs.find((job) =>
      [JobStatus.Accepted, JobStatus.OnTheWay, JobStatus.Arrived, JobStatus.Working].includes(job.status)
    )
    if (active) {
      navigate(`/technician/navigation/${active.id}`, { replace: true })
    } else {
      navigate('/technician/navigation/active', { replace: true })
    }
  }, [data, isLoading, navigate])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center gap-3 text-slate-400">
      <Loader2 size={20} className="animate-spin text-sky-500" />
      <span className="text-sm font-mono">Checking active dispatches for navigation...</span>
    </div>
  )
}

const AppRouter = () => {
  return (
    <Routes>
      <Route path="/login" element={withTitle(<LoginPage />, 'Login')} />
      <Route path="/register" element={withTitle(<RegisterPage />, 'Create Account')} />
      <Route path="/auth/admin/login" element={withTitle(<AdminLoginPage />, 'Admin Login')} />
      <Route path="/auth/register/customer" element={withTitle(<CustomerRegisterPage />, 'Register as Customer')} />
      <Route path="/auth/register/technician" element={withTitle(<TechnicianRegisterPage />, 'Register as Technician')} />
      <Route path="/auth/register/supplier" element={withTitle(<SupplierRegisterPage />, 'Register as Supplier')} />

      <Route path="/customer/*" element={<RoleGuard allowedRoles={['customer']}><CustomerLayout /></RoleGuard>}>
        <Route index element={<Navigate to="/customer/dashboard" replace />} />
        <Route path="dashboard" element={withTitle(<DashboardPage />, 'Dashboard')} />
        <Route path="request" element={withTitle(<RequestServicePage />, 'Request Service')} />
        <Route path="emergency" element={withTitle(<EmergencyRequestPage />, 'Emergency Request')} />
        <Route path="jobs" element={withTitle(<JobHistoryPage />, 'My Jobs')} />
        <Route path="track/:jobId" element={withTitle(<TrackJobPage />, 'Track Job')} />
        <Route path="chat/:jobId" element={withTitle(<CustomerChatPage />, 'Chat')} />
        <Route path="nearby-technicians" element={withTitle(<NearbyTechniciansPage />, 'Nearby Technicians')} />
        <Route path="suppliers" element={withTitle(<SupplierDiscoveryPage />, 'Find Suppliers')} />
        <Route path="quotations" element={withTitle(<CustomerQuotationsPage />, 'My Quotations')} />
        <Route path="payments" element={withTitle(<PaymentHistoryPage />, 'Payment History')} />
        <Route path="payment/:jobId" element={withTitle(<PaymentPage />, 'Make Payment')} />
        <Route path="profile" element={withTitle(<CustomerProfilePage />, 'My Profile')} />
        <Route path="schedule" element={withTitle(<ScheduleBookingPage />, 'Schedule Booking')} />
        <Route path="scheduled-jobs" element={withTitle(<ScheduledJobsPage />, 'Scheduled Jobs')} />
        <Route path="disputes/new" element={withTitle(<DisputePage />, 'Raise Dispute')} />
        <Route path="disputes/:disputeId" element={withTitle(<DisputeStatusPage />, 'Dispute Status')} />
      </Route>

      <Route path="/technician/*" element={<RoleGuard allowedRoles={['technician']}><TechnicianLayout /></RoleGuard>}>
        <Route index element={<Navigate to="/technician/dashboard" replace />} />
        <Route path="dashboard" element={withTitle(<TechnicianDashboardPage />, 'Dashboard')} />
        <Route path="requests" element={withTitle(<IncomingRequestsPage />, 'Incoming Requests')} />
        <Route path="job" element={<ActiveJobRedirect />} />
        <Route path="job/:jobId" element={withTitle(<ActiveJobPage />, 'Active Job')} />
        <Route path="job/active" element={withTitle(<Placeholder title="No Active Job" />, 'No Active Job')} />
        <Route path="navigation" element={<NavigationRedirect />} />
        <Route path="navigation/:jobId" element={withTitle(<NavigationPage />, 'Navigation')} />
        <Route path="navigation/active" element={withTitle(<Placeholder title="No Active Navigation" />, 'No Active Navigation')} />
        <Route path="chat/:jobId" element={withTitle(<TechnicianChatPage />, 'Chat')} />
        <Route path="invoice/:jobId" element={withTitle(<InvoicePage />, 'Create Invoice')} />
        <Route path="suppliers" element={withTitle(<SupplierDiscoveryPage />, 'Find Suppliers')} />
        <Route path="quotations" element={withTitle(<CustomerQuotationsPage />, 'My Quotations')} />
        <Route path="earnings" element={withTitle(<EarningsPage />, 'Earnings')} />
        <Route path="history" element={withTitle(<TechnicianJobHistoryPage />, 'Job History')} />
        <Route path="profile" element={withTitle(<TechnicianProfilePage />, 'Profile')} />
      </Route>

      <Route path="/supplier/*" element={<RoleGuard allowedRoles={['supplier']}><SupplierLayout /></RoleGuard>}>
        <Route path="dashboard" element={withTitle(<SupplierDashboardPage />, 'Dashboard')} />
        <Route path="materials" element={withTitle(<MaterialsPage />, 'My Materials')} />
        <Route path="quotations" element={withTitle(<QuotationsPage />, 'Quotations')} />
        <Route path="orders" element={withTitle(<OrdersPage />, 'Orders')} />
        <Route path="analytics" element={withTitle(<SupplierAnalyticsPage />, 'Analytics')} />
        <Route path="profile" element={withTitle(<SupplierProfilePage />, 'Profile')} />
        <Route index element={<Navigate to="/supplier/dashboard" replace />} />
      </Route>

      <Route path="/admin/*" element={<RoleGuard allowedRoles={['admin']}><AdminLayout /></RoleGuard>}>
        <Route path="analytics" element={withTitle(<AdminAnalyticsPage />, 'Analytics')} />
        <Route path="users" element={withTitle(<AdminUsersPage />, 'Users')} />
        <Route path="approvals" element={withTitle(<AdminApprovalPanel />, 'Approvals')} />
        <Route path="jobs" element={withTitle(<AdminLiveJobsPage />, 'Live Jobs')} />
        <Route path="jobs/live" element={withTitle(<AdminLiveJobsPage />, 'Live Jobs')} />
        <Route path="disputes" element={withTitle(<AdminDisputesPage />, 'Disputes')} />
        <Route path="reports" element={withTitle(<AdminReportsPage />, 'Reports')} />
        <Route path="health" element={withTitle(<SystemHealthPage />, 'System Health')} />
        <Route index element={<Navigate to="/admin/analytics" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default AppRouter
