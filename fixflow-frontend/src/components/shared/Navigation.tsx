import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X, LogOut, User } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { Button } from '../ui'

export interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
  badge?: string | number
}

interface SidebarProps {
  items: NavItem[]
  logo?: string
  title: string
  dark?: boolean
}

export const Sidebar: React.FC<SidebarProps> = ({ items, logo, title, dark }) => {
  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()
  const { logout, role } = useAuthStore()

  const isActive = (path: string) => {
    if (path === '/customer' || path === '/technician' || path === '/supplier' || path === '/admin') {
      return location.pathname === path
    }
    return location.pathname.startsWith(path)
  }

  const handleLogout = () => {
    logout()
  }

  return (
    <>
      {/* Mobile menu button */}
      <div className="fixed right-4 top-4 z-50 md:hidden">
        <button onClick={() => setIsOpen(!isOpen)} className={`rounded-lg p-2 text-white ${dark ? 'bg-slate-900 border border-slate-800' : 'bg-primary-600'}`}>
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Overlay */}
      {isOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setIsOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 z-40 h-screen w-64 transform transition-transform duration-300 md:relative md:transform-none ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${
        dark 
          ? 'bg-slate-950 border-r border-slate-900 text-slate-200 flex flex-col justify-between' 
          : 'bg-white shadow-lg border-r border-neutral-200 flex flex-col justify-between'
      }`}>
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className={`p-6 border-b ${dark ? 'border-slate-900' : 'border-neutral-200'}`}>
            <div className="mb-4 flex items-center gap-3">
              {logo && <img src={logo} alt={title} className="h-8 w-8" />}
              <h1 className={`text-xl font-bold ${dark ? 'text-white' : 'text-primary-600'}`}>{title}</h1>
            </div>
            <p className={`text-sm ${dark ? 'text-slate-500' : 'text-neutral-600'}`}>Professional Field Services</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center justify-between rounded-lg px-4 py-2.5 transition-all duration-200 ${
                      isActive(item.path)
                        ? dark
                          ? 'bg-sky-500/10 font-bold text-sky-400 border-r-2 border-sky-500'
                          : 'bg-primary-100 font-semibold text-primary-700'
                        : dark
                        ? 'text-slate-450 hover:text-slate-200 hover:bg-slate-900/60'
                        : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.icon}
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && item.badge !== null && item.badge !== '' && item.badge !== 0 && (
                      <span className={`inline-flex items-center justify-center px-2 py-1 text-[10px] font-bold leading-none rounded-full shadow-inner ${
                        dark ? 'bg-sky-500 text-white animate-pulse' : 'bg-primary-600 text-white animate-pulse'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Footer */}
        <div className={`p-4 space-y-2 border-t shrink-0 ${dark ? 'border-slate-900' : 'border-neutral-200'}`}>
          {role && role !== 'admin' && (
            <Link
              to={`/${role}/profile`}
              className={`flex items-center gap-3 rounded-lg px-4 py-2.5 transition-all duration-200 ${
                dark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60' : 'text-neutral-700 hover:bg-neutral-100'
              }`}
              onClick={() => setIsOpen(false)}
            >
              <User size={18} />
              <span>Profile</span>
            </Link>
          )}
          <Button
            variant="danger"
            size="sm"
            fullWidth
            onClick={handleLogout}
            className="justify-start gap-3 w-full"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </Button>
        </div>
      </aside>
    </>
  )
}

// Header Component for layouts
interface HeaderProps {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}

export const PageHeader: React.FC<HeaderProps> = ({ title, subtitle, actions, className }) => (
  <div className={className || "border-b border-neutral-200 bg-white"}>
    <div className="container-base py-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          {title && <h1 className={`text-3xl font-bold ${className ? 'text-white' : 'text-neutral-900'}`}>{title}</h1>}
          {subtitle && <p className={`mt-2 ${className ? 'text-slate-400' : 'text-neutral-600'}`}>{subtitle}</p>}
        </div>
        {actions && <div className="flex gap-3">{actions}</div>}
      </div>
    </div>
  </div>
)

// Breadcrumb Component
interface BreadcrumbItem {
  label: string
  path?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => (
  <nav className="container-base py-3 text-sm">
    <ol className="flex items-center gap-2">
      {items.map((item, idx) => (
        <li key={idx} className="flex items-center gap-2">
          {item.path ? (
            <Link to={item.path} className="text-primary-600 hover:text-primary-700">
              {item.label}
            </Link>
          ) : (
            <span className="text-neutral-600">{item.label}</span>
          )}
          {idx < items.length - 1 && <span className="text-neutral-400">/</span>}
        </li>
      ))}
    </ol>
  </nav>
)
