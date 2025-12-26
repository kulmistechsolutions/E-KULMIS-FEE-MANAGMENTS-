// Updated: Latest version with all features
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { SocketProvider } from './contexts/SocketContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Parents from './pages/Parents'
import CollectFee from './pages/CollectFee'
import MonthSetup from './pages/MonthSetup'
import Reports from './pages/Reports'
import Users from './pages/Users'
import FeeHistory from './pages/FeeHistory'
import ParentProfile from './pages/ParentProfile'
import Teachers from './pages/Teachers'
import PayTeacherSalary from './pages/PayTeacherSalary'
import TeacherProfile from './pages/TeacherProfile'
import Expenses from './pages/Expenses'
import UserMonitoring from './pages/UserMonitoring'
import SuperAdminSchools from './pages/SuperAdminSchools'
import SchoolBranding from './pages/SchoolBranding'
import Layout from './components/Layout'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // Landing page behavior:
  // If not authenticated, show Login directly at the current URL (e.g. "/")
  return user ? children : <Login />
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" />
  }

  if (user.role === 'super_admin') {
    return <Navigate to="/platform/schools" />
  }

  if (user.role !== 'admin' && user.role !== 'school_admin') {
    return <Navigate to="/collect-fee" />
  }

  return children
}

function SuperAdminRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" />

  if (user.role !== 'super_admin') {
    return <Navigate to="/" />
  }

  return children
}

function AppRoutes() {
  return (
    <Routes>
      {/* Backward compatible login URL */}
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<AdminRoute><Dashboard /></AdminRoute>} />

        {/* Super Admin (Platform) */}
        <Route path="platform/schools" element={<SuperAdminRoute><SuperAdminSchools /></SuperAdminRoute>} />

        {/* Students (was Parents) */}
        <Route path="students" element={<Parents />} />
        <Route path="students/:id/profile" element={<ParentProfile />} />
        <Route path="students/:id/history" element={<FeeHistory />} />
        {/* Backward compatible paths */}
        <Route path="parents" element={<Navigate to="/students" replace />} />
        <Route path="parents/:id/profile" element={<Navigate to="/students/:id/profile" replace />} />
        <Route path="parents/:id/history" element={<Navigate to="/students/:id/history" replace />} />

        <Route path="collect-fee" element={<CollectFee />} />
        {/* Admin-only routes */}
        <Route path="school-branding" element={<AdminRoute><SchoolBranding /></AdminRoute>} />
        <Route path="reports" element={<AdminRoute><Reports /></AdminRoute>} />
        <Route path="teachers" element={<AdminRoute><Teachers /></AdminRoute>} />
        <Route path="teachers/:id/profile" element={<AdminRoute><TeacherProfile /></AdminRoute>} />
        <Route path="pay-teacher-salary" element={<AdminRoute><PayTeacherSalary /></AdminRoute>} />
        <Route path="expenses" element={<AdminRoute><Expenses /></AdminRoute>} />
        <Route path="month-setup" element={<AdminRoute><MonthSetup /></AdminRoute>} />
        <Route path="users" element={<AdminRoute><Users /></AdminRoute>} />
        <Route path="user-monitoring" element={<AdminRoute><UserMonitoring /></AdminRoute>} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <Router>
          <AppRoutes />
          <Toaster position="top-right" />
        </Router>
      </SocketProvider>
    </AuthProvider>
  )
}

export default App

