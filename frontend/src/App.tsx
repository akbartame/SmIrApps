import { Routes, Route } from 'react-router-dom'
import Layout from './layouts/Layout'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Devices from './pages/Devices'
import Export from './pages/Export'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/"        element={<Dashboard />} />
        <Route path="/history" element={<History />} />
        <Route path="/export" element={<Export />} />
        <Route path="/devices" element={<Devices />} />
      </Route>
    </Routes>
  )
}