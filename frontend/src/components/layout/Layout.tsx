import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { SystemStatusBar } from './SystemStatusBar';
import { Menu, X } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: '📊' },
  { label: 'Data Sensor', path: '/sensor', icon: '📡' },
  { label: 'Kontrol Relay', path: '/control', icon: '🎛️' },
  { label: 'Otomasi', path: '/automation', icon: '⚙️' },
];

export function Layout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  // Fully close menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  // Close menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMenuOpen) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMenuOpen]);

  return (
    <div className="flex flex-col min-h-screen bg-canvas">
      <SystemStatusBar />

      {/* Hamburger Header — mobile only */}
      <div className="sticky top-0 z-20 md:hidden bg-surface border-b border-line">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="font-display font-semibold text-sm text-ink">SmIr</h1>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 hover:bg-canvas rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label="Toggle menu"
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? (
              <X className="w-5 h-5 text-ink" />
            ) : (
              <Menu className="w-5 h-5 text-ink" />
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-1">
        {/* Sidebar Navigation */}
        <nav
          className={`
            fixed md:relative
            top-0 left-0 h-screen md:h-auto
            w-64 md:w-56
            bg-surface border-r border-line
            transform transition-transform duration-200 ease-out
            md:translate-x-0
            z-30
            ${isMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            md:border-r md:sticky md:top-16
          `}
        >
          <div className="pt-4 md:pt-2 px-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg
                    font-body text-sm font-medium
                    transition-colors
                    ${
                      isActive
                        ? 'bg-accent-soft text-accent-strong'
                        : 'text-ink hover:bg-canvas'
                    }
                  `}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Overlay — mobile only, dismiss sidebar when tapped */}
        {isMenuOpen && (
          <div
            className="fixed inset-0 z-20 md:hidden bg-black/20"
            onClick={() => setIsMenuOpen(false)}
            aria-hidden
          />
        )}

        {/* Main Content */}
        <main className="flex-1 w-full overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}