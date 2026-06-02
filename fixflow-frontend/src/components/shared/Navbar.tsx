import { Menu, Wrench, User, Settings, LogOut, X } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import NotificationBell from './NotificationBell'

const links = [
  { label: 'Dashboard', to: '/customer' },
  { label: 'My Jobs', to: '/customer/jobs' },
  { label: 'Find Technicians', to: '/customer/nearby-technicians' },
  { label: 'Suppliers', to: '/customer/suppliers' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:bg-slate-100'}`

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <button className="md:hidden" onClick={() => setMobileOpen((prev) => !prev)}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Wrench className="h-5 w-5 text-blue-600" />
          SendAPro
        </div>

        <nav className="hidden items-center gap-2 md:flex">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === '/customer'} className={linkClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <NotificationBell />
          <div className="relative">
            <button className="rounded-full border p-2" onClick={() => setMenuOpen((prev) => !prev)}>
              <User className="h-5 w-5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-md border bg-white p-1 shadow">
                <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-slate-100">
                  <User className="h-4 w-4" /> My Profile
                </button>
                <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-slate-100">
                  <Settings className="h-4 w-4" /> Settings
                </button>
                <button onClick={handleLogout} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileOpen && (
        <nav className="space-y-1 border-t px-4 py-3 md:hidden">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === '/customer'} className={linkClass} onClick={() => setMobileOpen(false)}>
              {link.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}

export default Navbar
