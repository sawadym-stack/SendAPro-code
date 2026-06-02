import React from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  /** Show home icon as first crumb (default true) */
  showHome?: boolean
  className?: string
}

/**
 * Breadcrumb navigation component.
 * - All items except the last are clickable links
 * - Last item is the current page (greyed out, no link)
 * - Separator: chevron icon
 */
export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  items,
  showHome = false,
  className = '',
}) => {
  const allItems: BreadcrumbItem[] = showHome
    ? [{ label: 'Home', href: '/' }, ...items]
    : items

  return (
    <nav
      aria-label="breadcrumb"
      className={`flex items-center gap-1 text-sm ${className}`}
    >
      {showHome && (
        <>
          <Link
            to="/"
            className="flex items-center text-slate-500 hover:text-slate-300 transition-colors"
            aria-label="Home"
          >
            <Home size={14} />
          </Link>
          <ChevronRight size={14} className="text-slate-700 flex-shrink-0" />
        </>
      )}

      {items.map((item, index) => {
        const isLast = index === items.length - 1

        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {isLast ? (
              <span
                className="text-slate-300 font-medium truncate max-w-[180px]"
                aria-current="page"
              >
                {item.label}
              </span>
            ) : (
              <>
                {item.href ? (
                  <Link
                    to={item.href}
                    className="text-slate-500 hover:text-slate-300 transition-colors truncate max-w-[160px]"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-slate-500 truncate max-w-[160px]">
                    {item.label}
                  </span>
                )}
                <ChevronRight
                  size={14}
                  className="text-slate-700 flex-shrink-0"
                />
              </>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}

export default Breadcrumb
