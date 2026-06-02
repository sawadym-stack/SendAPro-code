import { Outlet } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, Siren, Clock, MapPin, Store, CreditCard, User } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const navItems = [
  { label: 'Dashboard', path: '/customer', icon: LayoutDashboard, exact: true },
  { label: 'Request Service', path: '/customer/request', icon: ClipboardList },
  { label: 'Emergency', path: '/customer/emergency', icon: Siren, danger: true },
  { label: 'Job History', path: '/customer/jobs', icon: Clock },
  { label: 'Nearby Techs', path: '/customer/nearby-technicians', icon: MapPin },
  { label: 'Suppliers', path: '/customer/suppliers', icon: Store },
  { label: 'Payments', path: '/customer/payments', icon: CreditCard },
  { label: 'Profile', path: '/customer/profile', icon: User },
]

const CustomerLayout = () => {
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r border-slate-900 bg-slate-950/90 backdrop-blur-xl shrink-0 sticky top-0 h-screen">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-900">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-[0_0_12px_rgba(14,165,233,0.3)]">
            <span className="text-white text-xs font-black">SP</span>
          </div>
          <div>
            <span className="text-sm font-black text-white tracking-tight">SendAPro</span>
            <span className="block text-[9px] text-sky-400 font-mono uppercase tracking-widest">Customer Portal</span>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 group ${
                    item.danger
                      ? isActive
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                        : 'text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent'
                      : isActive
                      ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-[0_0_10px_rgba(14,165,233,0.05)]'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                  }`
                }
              >
                <Icon size={16} className="shrink-0" />
                <span>{item.label}</span>
                {item.danger && (
                  <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="px-2 py-4 border-t border-slate-900">
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all duration-200 cursor-pointer"
          >
            <span className="text-sm">⏻</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-xl border-t border-slate-900 flex items-center justify-around px-2 py-2">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-[10px] font-semibold transition-all duration-200 ${
                  item.danger
                    ? isActive ? 'text-red-400' : 'text-slate-500 hover:text-red-400'
                    : isActive ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'
                }`
              }
            >
              <Icon size={18} />
              <span>{item.label.split(' ')[0]}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        <Outlet />
      </main>
    </div>
  )
}

export default CustomerLayout
