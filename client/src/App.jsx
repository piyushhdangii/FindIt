import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/useAuth'
import AppLayout from './components/AppLayout'
import Loading from './components/Loading'
import AdminPage from './pages/AdminPage'
import AdminReportsPage from './pages/AdminReportsPage'
import AuthPage from './pages/AuthPage'
import ClaimsPage from './pages/ClaimsPage'
import ChatPage from './pages/ChatPage'
import DashboardPage from './pages/DashboardPage'
import HomePage from './pages/HomePage'
import MatchesPage from './pages/MatchesPage'
import NotFoundPage from './pages/NotFoundPage'
import NotificationsPage from './pages/NotificationsPage'
import ReportDetailPage from './pages/ReportDetailPage'
import ReportFormPage from './pages/ReportFormPage'
import ReportsPage from './pages/ReportsPage'
import './App.css'

function RequireAuth({ children, admin = false, userOnly = false }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading label="Checking your session" />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (admin && user.role !== 'admin') return <Navigate to="/dashboard" replace />
  if (userOnly && user.role === 'admin') return <Navigate to="/admin" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<RequireAuth userOnly><HomePage /></RequireAuth>} />
        <Route path="reports" element={<RequireAuth userOnly><ReportsPage /></RequireAuth>} />
        <Route path="reports/:id/edit" element={<RequireAuth userOnly><ReportFormPage /></RequireAuth>} />
        <Route path="reports/:id" element={<ReportDetailPage />} />
        <Route path="login" element={<AuthPage />} />
        <Route path="register" element={<AuthPage mode="register" />} />
        <Route path="dashboard" element={<RequireAuth userOnly><DashboardPage /></RequireAuth>} />
        <Route path="reports/new" element={<RequireAuth userOnly><ReportFormPage /></RequireAuth>} />
        <Route path="matches/:id" element={<RequireAuth userOnly><MatchesPage /></RequireAuth>} />
        <Route path="claims" element={<RequireAuth><ClaimsPage /></RequireAuth>} />
        <Route path="chat" element={<RequireAuth userOnly><ChatPage /></RequireAuth>} />
        <Route path="chat/:id" element={<RequireAuth userOnly><ChatPage /></RequireAuth>} />
        <Route path="notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
        <Route path="admin" element={<RequireAuth admin><AdminPage /></RequireAuth>} />
        <Route path="admin/reports" element={<RequireAuth admin><AdminReportsPage /></RequireAuth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>
}
