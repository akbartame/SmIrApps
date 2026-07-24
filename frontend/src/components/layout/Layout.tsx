import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { SystemStatusBar } from './SystemStatusBar';

export function Layout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  // Menutup menu otomatis jika rute (URL) berubah
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  return (
    <div>
      <SystemStatusBar />
      
      {/* Area Navigasi dan Hamburger */}
      <header>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)}>
          {isMenuOpen ? 'Tutup' : 'Menu'}
        </button>

        {isMenuOpen && (
          <nav>
            <ul>
              <li><Link to="/">Dashboard</Link></li>
              <li><Link to="/sensor">Data Sensor</Link></li>
              <li><Link to="/control">Kontrol Relay</Link></li>
            </ul>
          </nav>
        )}
      </header>

      {/* Area Konten Halaman */}
      <main>
        <Outlet />
      </main>
    </div>
  );
}