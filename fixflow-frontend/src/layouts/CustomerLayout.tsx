import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, Siren, Clock, MapPin, Store, CreditCard, User, Menu, X, LogOut } from 'lucide-react'
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
  const [isMoreOpen, setIsMoreOpen] = useState(false)

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
        {/* Render 4 main links */}
        {[navItems[0], navItems[1], navItems[2], navItems[4]].map((item) => {
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
        {/* Render the 5th 'More' button */}
        <button
          onClick={() => setIsMoreOpen(true)}
          className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-[10px] font-semibold transition-all duration-200 cursor-pointer ${
            isMoreOpen ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Menu size={18} />
          <span>More</span>
        </button>
      </nav>

      {/* More menu drawer overlay */}
      {isMoreOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden" onClick={() => setIsMoreOpen(false)} />
      )}

      {/* Slide-up drawer */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 bg-slate-950 border-t border-slate-900 rounded-t-3xl p-6 transition-all duration-350 transform md:hidden ${
        isMoreOpen ? 'translate-y-0 opacity-100 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]' : 'translate-y-full opacity-0 pointer-events-none'
      }`}>
        <div className="flex justify-between items-center pb-4 border-b border-slate-900 mb-4">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 font-mono">Menu & Settings</span>
          <button 
            onClick={() => setIsMoreOpen(false)} 
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="space-y-1.5 mb-6">
          {[navItems[3], navItems[5], navItems[6], navItems[7]].map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsMoreOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                      : 'text-slate-450 hover:text-slate-200 hover:bg-slate-900/60'
                  }`
                }
              >
                <Icon size={16} className="shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        {/* Logout in drawer */}
        <button
          onClick={() => {
            setIsMoreOpen(false)
            logout()
            navigate('/login')
          }}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all duration-200 cursor-pointer"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        <Outlet />
      </main>
    </div>
  )
}

export default CustomerLayout
