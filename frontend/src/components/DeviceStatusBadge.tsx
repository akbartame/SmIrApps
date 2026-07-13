import { cn } from '../utils/cn'

export interface DeviceStatusBadgeProps {
  status: 'online' | 'stale' | 'offline' | 'waiting'
  className?: string
}

export const DeviceStatusBadge = ({ status, className = '' }: DeviceStatusBadgeProps) => {
  // Pemetaan class Tailwind untuk setiap status
  const statusConfig = {
    online: {
      label: 'ONLINE',
      classes: 'bg-green-500/10 text-green-500 border-green-500/20',
    },
    stale: {
      label: 'STALE',
      classes: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    },
    offline: {
      label: 'OFFLINE',
      classes: 'bg-red-500/10 text-red-500 border-red-500/20',
    },
    waiting: {
      label: 'WAITING',
      classes: 'bg-text-secondary/10 text-text-secondary border-text-secondary/20',
    },
  }

  const config = statusConfig[status]

  return (
    <div
      className={cn(
        "inline-block rounded-sm border px-2 py-0.75",
        "font-mono text-[10px] font-semibold uppercase tracking-wider",
        config.classes,
        className
      )}
    >
      {config.label}
    </div>
  )
}