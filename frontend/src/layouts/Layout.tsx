import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { cn } from '../utils/cn'
import { Typography } from '../components/Typography'
import { getHealth, type HealthStatus } from '../api'

const NAV_ITEMS = [
  { to: '/',        label: 'DASHBOARD', icon: '⬡' },
  { to: '/history', label: 'HISTORY',   icon: '◈' },
  { to: '/devices', label: 'DEVICES',   icon: '◎' },
  { to: '/export',  label: 'EXPORT',    icon: '↓' },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(true)
  
  // State untuk Modal Diagnostik
  const [isHealthOpen, setIsHealthOpen] = useState(false)
  const [healthData, setHealthData] = useState<HealthStatus | null>(null)
  const [isFetchingHealth, setIsFetchingHealth] = useState(false)

  const handleOpenDiagnostic = async () => {
    setIsHealthOpen(true)
    setIsFetchingHealth(true)
    try {
      const data = await getHealth()
      setHealthData(data)
    } finally {
      setIsFetchingHealth(false)
    }
  }
  return (
    <div className="flex h-screen overflow-hidden bg-base text-text-primary">
      
      {/* Backdrop Sidebar Mobile */}
      {!collapsed && (
        <div 
          className="fixed inset-0 z-20 bg-black/50 transition-opacity md:hidden"
          onClick={() => setCollapsed(true)}
          aria-hidden="true"
        />
      )}

      {/* Modal Diagnostik (Muncul saat tombol footer diklik) */}
      {isHealthOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-up">
          <div className="w-full max-w-sm rounded-md border border-border-subtle bg-surface p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <Typography variant="h2">System Diagnostics</Typography>
              <button 
                onClick={() => setIsHealthOpen(false)}
                className="cursor-pointer border-none bg-transparent font-mono text-lg text-text-secondary hover:text-red-500"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 font-mono text-sm">
              {/* Versi Aplikasi */}
              <div className="flex justify-between border-b border-border-subtle pb-2">
                <span className="text-text-muted">Frontend Version</span>
                <span className="text-accent">v1.0.0</span> {/* Bisa diganti dinamis ambil dari package.json nanti */}
              </div>
              <div className="flex justify-between border-b border-border-subtle pb-2">
                <span className="text-text-muted">Backend Version</span>
                <span className="text-accent">v1.0.0</span>
              </div>

              {/* Status Backend */}
              <div className="pt-2">
                <Typography variant="caption" className="mb-2 block text-text-muted">
                  BACKEND HEALTH
                </Typography>
                
                {isFetchingHealth ? (
                  <div className="animate-pulse text-text-secondary">Pinging server...</div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded border border-border-subtle bg-base p-3">
                      <div className="text-[10px] text-text-muted">MQTT CLIENT</div>
                      <div className={cn(
                        "mt-1 font-semibold capitalize",
                        healthData?.checks?.mqtt === 'ok' ? "text-green-500" : healthData?.checks?.mqtt === 'unreachable' ? "text-yellow-500" : "text-red-500"
                      )}>
                        {healthData?.checks?.mqtt || 'Unknown'}
                      </div>
                    </div>
                    <div className="rounded border border-border-subtle bg-base p-3">
                      <div className="text-[10px] text-text-muted">DATABASE</div>
                      <div className={cn(
                        "mt-1 font-semibold capitalize",
                        healthData?.checks?.db === 'ok' ? "text-green-500" : healthData?.checks?.db === 'unreachable' ? "text-yellow-500" : "text-red-500"
                      )}>
                        {healthData?.checks?.db || 'Unknown'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-30 flex h-full flex-col shrink-0 border-r border-border-subtle bg-surface transition-[width] duration-200 ease-in-out overflow-hidden md:relative",
          collapsed ? "w-12 md:w-18" : "w-50"
        )}
      >
        {/* ... (Header dan Navigasi tetap sama seperti sebelumnya) ... */}
        <div className={cn("flex items-center border-b border-border-subtle p-5", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && (
            <div>
              <Typography variant="caption" className="mb-1 block">SYSTEM</Typography>
              <Typography variant="h2" className="tracking-widest text-accent">FSIOT</Typography>
            </div>
          )}
          <button
            onClick={() => setCollapsed(prev => !prev)}
            className="cursor-pointer border-none bg-transparent text-lg text-text-secondary transition-colors hover:text-text-primary"
          >
            {collapsed ? '☰' : '←'}
          </button>
        </div>

        <nav className="flex-1 py-3">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => cn(
                "group flex items-center gap-3 font-mono text-[11px] font-medium tracking-[0.12em] no-underline transition-all duration-150 ease-in-out",
                collapsed ? "justify-center py-3" : "justify-start px-5 py-3",
                isActive ? "border-l-2 border-accent bg-accent/10 text-accent" : "border-l-2 border-transparent text-text-secondary hover:bg-raised hover:text-text-primary"
              )}
              onClick={() => { if (window.innerWidth < 768) setCollapsed(true) }}
            >
              {({ isActive }) => (
                <>
                  <span className={cn("shrink-0 text-base font-bold transition-colors duration-150", isActive ? "text-accent" : "text-text-secondary group-hover:text-text-primary")}>
                    {icon}
                  </span>
                  {!collapsed && label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer Diubah Menjadi Tombol Interaktif */}
        <button
          onClick={handleOpenDiagnostic}
          className={cn(
            "group w-full cursor-pointer border-t border-border-subtle bg-transparent px-5 py-4 text-left transition-colors hover:bg-raised focus:outline-none",
            collapsed ? "items-center justify-center" : ""
          )}
        >
          <div className={cn(
            "flex items-center gap-2",
            collapsed ? "justify-center" : "justify-start"
          )}>
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            
            {!collapsed && (
              <Typography variant="caption" className="leading-none text-green-500">
                {/* Trik CSS: Teks normal terlihat, disembunyikan saat di-hover */}
                <span className="block group-hover:hidden">
                  SYSTEM ONLINE
                </span>
                
                {/* Trik CSS: Teks rahasia disembunyikan, ditampilkan & berkedip saat di-hover */}
                <span className="hidden animate-pulse text-accent group-hover:block">
                  interesting stuff!!
                </span>
              </Typography>
            )}
          </div>
        </button>
      </aside>

      <main className={cn(
        "flex-1 overflow-auto bg-base relative transition-all duration-200",
        "ml-10 md:ml-0" 
      )}>
        <Outlet />
      </main>
    </div>
  )
}