import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useWebSocket } from './hooks/useWebSocket'
import { DashboardPage } from './pages/DashboardPage'
import { LandingPage } from './pages/LandingPage'
import { RemoteControlPage } from './pages/RemoteControlPage'
import { RoutesPage } from './pages/RoutesPage'

function AppInner() {
  useWebSocket()
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="control" element={<RemoteControlPage />} />
        <Route path="routes" element={<RoutesPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
