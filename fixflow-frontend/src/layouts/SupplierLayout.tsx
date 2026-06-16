import { Outlet } from 'react-router-dom'
import { Home, Package, FileText, ShoppingCart, BarChart3, Settings } from 'lucide-react'
import { Sidebar } from '../components/shared/Navigation'

const navigationItems = [
  { label: 'Dashboard', path: '/supplier/dashboard', icon: <Home size={20} /> },
  { label: 'Materials', path: '/supplier/materials', icon: <Package size={20} /> },
  { label: 'Quotations', path: '/supplier/quotations', icon: <FileText size={20} /> },
  { label: 'Orders', path: '/supplier/orders', icon: <ShoppingCart size={20} /> },
  { label: 'Analytics', path: '/supplier/analytics', icon: <BarChart3 size={20} /> },
  { label: 'Profile', path: '/supplier/profile', icon: <Settings size={20} /> },
]

const SupplierLayout = () => {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Sidebar items={navigationItems} title="SendAPro Supply" dark />
      <main className="flex-1 overflow-auto pt-20 md:pt-8 p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}

export default SupplierLayout
