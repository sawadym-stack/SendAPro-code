import React from 'react'

// Helper utility to merge default classes with custom overrides cleanly
const cleanClasses = (defaultClasses: string, customClasses: string = '') => {
  const customList = customClasses.split(/\s+/).filter(Boolean);
  const defaultList = defaultClasses.split(/\s+/).filter(Boolean);

  const hasBg = customList.some(c => c.startsWith('bg-'));
  const hasBorder = customList.some(c => c.startsWith('border') || c.startsWith('border-'));
  const hasShadow = customList.some(c => c.startsWith('shadow') || c.startsWith('shadow-'));
  const hasRounded = customList.some(c => c.startsWith('rounded') || c.startsWith('rounded-'));

  const filteredDefaults = defaultList.filter(c => {
    if (hasBg && c.startsWith('bg-')) return false;
    if (hasBorder && (c.startsWith('border') || c.startsWith('border-'))) return false;
    if (hasShadow && (c.startsWith('shadow') || c.startsWith('shadow-'))) return false;
    if (hasRounded && (c.startsWith('rounded') || c.startsWith('rounded-'))) return false;
    return true;
  });

  return [...filteredDefaults, ...customList].join(' ');
};

// Button Component
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  fullWidth?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, fullWidth, children, className, ...props }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2'

    const variantClasses = {
      primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
      secondary: 'bg-secondary-600 text-white hover:bg-secondary-700 focus:ring-secondary-500',
      danger: 'bg-danger-600 text-white hover:bg-danger-700 focus:ring-danger-500',
      success: 'bg-success-600 text-white hover:bg-success-700 focus:ring-success-500',
      ghost: 'text-neutral-700 hover:bg-neutral-100 focus:ring-primary-500',
      outline: 'border-2 border-neutral-300 text-neutral-700 hover:border-primary-600 hover:text-primary-600 focus:ring-primary-500',
    }

    const sizeClasses = {
      sm: 'px-3 py-2 text-sm',
      md: 'px-4 py-2.5 text-base',
      lg: 'px-6 py-3 text-lg',
    }

    return (
      <button
        ref={ref}
        className={cleanClasses(`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''}`, className)}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading && <span className="animate-spin">⚙️</span>}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

// Card Component
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({ hover, className, ...props }, ref) => (
  <div
    ref={ref}
    className={cleanClasses(`bg-white rounded-xl border border-neutral-200 shadow-base transition-all duration-200 ${hover ? 'hover:shadow-lg hover:border-primary-300' : ''}`, className)}
    {...props}
  />
))

Card.displayName = 'Card'

// Input Component
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helpText?: string
  icon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ label, error, helpText, icon, className, ...props }, ref) => (
  <div className="w-full">
    {label && <label className="mb-2 block text-sm font-medium text-neutral-700">{label}</label>}
    <div className="relative">
      {icon && <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">{icon}</div>}
      <input
        ref={ref}
        className={cleanClasses(`w-full rounded-lg border px-4 py-2.5 text-base transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 ${
          icon ? 'pl-10' : ''
        } ${error ? 'border-danger-500 focus:ring-danger-500' : 'border-neutral-300 hover:border-neutral-400'}`, className)}
        {...props}
      />
    </div>
    {error && <p className="mt-1 text-sm text-danger-600">{error}</p>}
    {helpText && <p className="mt-1 text-sm text-neutral-500">{helpText}</p>}
  </div>
))

Input.displayName = 'Input'

// Badge Component
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'neutral'
  size?: 'sm' | 'md'
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ variant = 'primary', size = 'md', className, ...props }, ref) => {
  const variantClasses = {
    primary: 'bg-primary-100 text-primary-700',
    secondary: 'bg-secondary-100 text-secondary-700',
    success: 'bg-success-100 text-success-700',
    warning: 'bg-warning-100 text-warning-700',
    danger: 'bg-danger-100 text-danger-700',
    neutral: 'bg-neutral-100 text-neutral-700',
  }

  const sizeClasses = {
    sm: 'px-2.5 py-1 text-xs font-medium',
    md: 'px-3 py-1.5 text-sm font-medium',
  }

  return <span ref={ref} className={cleanClasses(`inline-flex items-center rounded-full ${variantClasses[variant]} ${sizeClasses[size]}`, className)} {...props} />
})

Badge.displayName = 'Badge'

// Alert Component
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'success' | 'warning' | 'danger'
  title?: string
  icon?: React.ReactNode
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(({ variant = 'info', title, icon, children, className, ...props }, ref) => {
  const variantClasses = {
    info: 'bg-primary-50 border-primary-200 text-primary-800',
    success: 'bg-success-50 border-success-200 text-success-800',
    warning: 'bg-warning-50 border-warning-200 text-warning-800',
    danger: 'bg-danger-50 border-danger-200 text-danger-800',
  }

  return (
    <div ref={ref} className={cleanClasses(`rounded-lg border p-4 ${variantClasses[variant]}`, className)} {...props}>
      {title && <div className="mb-1 flex items-center gap-2 font-medium">{icon && icon}{title}</div>}
      <div className="text-sm">{children}</div>
    </div>
  )
})

Alert.displayName = 'Alert'

// Spinner Component
export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  color?: 'primary' | 'secondary'
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', color = 'primary' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  }

  const colorClass = color === 'primary' ? 'text-primary-600' : 'text-secondary-600'

  return <div className={`${sizeClasses[size]} ${colorClass} animate-spin`}>⚙️</div>
}

// Empty State Component
export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    {icon && <div className="mb-4 text-5xl opacity-50">{icon}</div>}
    <h3 className="mb-2 text-lg font-semibold text-neutral-900">{title}</h3>
    {description && <p className="mb-6 max-w-md text-neutral-600">{description}</p>}
    {action && action}
  </div>
)

// Avatar Component
export interface AvatarProps {
  src?: string
  alt?: string
  initials?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger'
}

export const Avatar: React.FC<AvatarProps> = ({ src, alt = 'Avatar', initials = '?', size = 'md', variant = 'primary' }) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  }

  const variantClasses = {
    primary: 'bg-primary-100 text-primary-700',
    secondary: 'bg-secondary-100 text-secondary-700',
    success: 'bg-success-100 text-success-700',
    warning: 'bg-warning-100 text-warning-700',
    danger: 'bg-danger-100 text-danger-700',
  }

  return src ? <img src={src} alt={alt} className={`${sizeClasses[size]} rounded-full object-cover`} /> : <div className={`flex items-center justify-center rounded-full font-semibold ${sizeClasses[size]} ${variantClasses[variant]}`}>{initials}</div>
}

// Progress Component
export interface ProgressProps {
  value: number
  max?: number
  variant?: 'primary' | 'success' | 'warning' | 'danger'
}

export const Progress: React.FC<ProgressProps> = ({ value, max = 100, variant = 'primary' }) => {
  const percentage = (value / max) * 100

  const variantClasses = {
    primary: 'bg-primary-600',
    success: 'bg-success-600',
    warning: 'bg-warning-600',
    danger: 'bg-danger-600',
  }

  return (
    <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
      <div className={`h-full transition-all duration-300 ${variantClasses[variant]}`} style={{ width: `${percentage}%` }} />
    </div>
  )
}

// Separator Component
export const Separator: React.FC<{ vertical?: boolean }> = ({ vertical }) => (vertical ? <div className="h-full w-px bg-neutral-200" /> : <div className="h-px w-full bg-neutral-200" />)

// Stats Card Component
export interface StatsCardProps {
  label: string
  value: string | number
  change?: number
  icon?: React.ReactNode
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger'
}

export const StatsCard: React.FC<StatsCardProps> = ({ label, value, change, icon, variant = 'primary' }) => {
  const bgClasses = {
    primary: 'bg-primary-50',
    secondary: 'bg-secondary-50',
    success: 'bg-success-50',
    warning: 'bg-warning-50',
    danger: 'bg-danger-50',
  }

  const textClasses = {
    primary: 'text-primary-700',
    secondary: 'text-secondary-700',
    success: 'text-success-700',
    warning: 'text-warning-700',
    danger: 'text-danger-700',
  }

  return (
    <Card hover className={`p-6 ${bgClasses[variant]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-600">{label}</p>
          <p className="mt-2 text-3xl font-bold text-neutral-900">{value}</p>
          {change !== undefined && <p className={`mt-2 text-sm font-medium ${change > 0 ? 'text-success-600' : 'text-danger-600'}`}>{change > 0 ? '↑' : '↓'} {Math.abs(change)}%</p>}
        </div>
        {icon && <div className={`text-3xl ${textClasses[variant]}`}>{icon}</div>}
      </div>
    </Card>
  )
}

export { PageHeader, Breadcrumb } from '../shared/Navigation'

