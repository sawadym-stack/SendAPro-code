import React from 'react'

// ── Shared pulse animation class ────────────────────────────────────────────
// Applied via CSS; we inline a style tag for self-containment.
const shimmerClass = 'animate-pulse bg-slate-700/60 rounded-lg'

// ── Primitive Skeleton ───────────────────────────────────────────────────────
interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', style }) => (
  <div className={`${shimmerClass} ${className}`} style={style} />
)

// ── Table Row Skeleton ───────────────────────────────────────────────────────
interface TableSkeletonProps {
  rows?: number
  cols?: number
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({ rows = 5, cols = 4 }) => (
  <div className="w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
    {/* Header */}
    <div className="flex gap-4 border-b border-slate-800 bg-slate-800/40 px-5 py-3">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-3 rounded-md" style={{ width: `${80 + i * 20}px` }} />
      ))}
    </div>
    {/* Rows */}
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex items-center gap-4 border-b border-slate-800/50 px-5 py-4 last:border-0">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton
            key={c}
            className="h-3.5 rounded-md"
            style={{ width: `${60 + ((r + c) * 17) % 80}px` }}
          />
        ))}
      </div>
    ))}
  </div>
)

// ── Card Skeleton ────────────────────────────────────────────────────────────
interface CardSkeletonProps {
  count?: number
  className?: string
}

export const CardSkeleton: React.FC<CardSkeletonProps> = ({ count = 3, className = '' }) => (
  <div className={`grid gap-4 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3"
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-3 w-48" />
        <div className="flex gap-3 pt-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    ))}
  </div>
)

// ── Stat Card Skeleton ───────────────────────────────────────────────────────
export const StatCardSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className={`grid gap-4 grid-cols-2 lg:grid-cols-${count}`}>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3"
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
    ))}
  </div>
)

// ── Map Skeleton ─────────────────────────────────────────────────────────────
export const MapSkeleton: React.FC<{ height?: string }> = ({ height = '400px' }) => (
  <div
    className="w-full rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden relative"
    style={{ height }}
  >
    <div className="absolute inset-0 animate-pulse bg-slate-800/50" />
    {/* Fake map grid lines */}
    <div className="absolute inset-0 opacity-10">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="absolute border-t border-slate-500"
          style={{ top: `${(i + 1) * 16}%`, left: 0, right: 0 }}
        />
      ))}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="absolute border-l border-slate-500"
          style={{ left: `${(i + 1) * 12}%`, top: 0, bottom: 0 }}
        />
      ))}
    </div>
    <div className="absolute bottom-4 right-4 flex flex-col gap-2">
      <Skeleton className="h-8 w-8 rounded-lg" />
      <Skeleton className="h-8 w-8 rounded-lg" />
    </div>
  </div>
)

// ── Chat Skeleton ─────────────────────────────────────────────────────────────
export const ChatSkeleton: React.FC = () => (
  <div className="flex h-full flex-col gap-4 p-4">
    {/* Chat bubbles — alternating left/right */}
    {[false, true, false, false, true].map((isMe, i) => (
      <div key={i} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
        <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
        <div className={`space-y-1 ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
          <Skeleton className={`h-10 rounded-2xl ${isMe ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
            style={{ width: `${120 + i * 30}px` }} />
          <Skeleton className="h-2.5 w-12" />
        </div>
      </div>
    ))}
    {/* Input bar */}
    <div className="mt-auto flex gap-2 border-t border-slate-800 pt-3">
      <Skeleton className="h-10 flex-1 rounded-xl" />
      <Skeleton className="h-10 w-10 rounded-xl" />
    </div>
  </div>
)

export default Skeleton
