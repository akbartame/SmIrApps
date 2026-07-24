import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { NodesProvider } from './context/NodesContext';
import { Layout } from './components/layout/Layout';

// Import komponen halaman yang baru dibuat
import { Dashboard } from './pages/Dashboard';
import { SensorPage } from './pages/SensorPage';
import { ControlPage } from './pages/ControlPage';

export default function App() {
  return (
    <NodesProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* Rute / akan memuat Dashboard */}
            <Route index element={<Dashboard />} />
            {/* Rute /sensor akan memuat SensorPage */}
            <Route path="sensor" element={<SensorPage />} />
            {/* Rute /control akan memuat ControlPage */}
            <Route path="control" element={<ControlPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </NodesProvider>
  );
}