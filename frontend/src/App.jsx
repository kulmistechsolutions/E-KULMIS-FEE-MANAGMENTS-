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

  return user ? children : <Navigate to="/login" />
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

  if (user.role !== 'admin') {
    return <Navigate to="/" />
  }

  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="parents" element={<Parents />} />
        <Route path="parents/:id/profile" element={<ParentProfile />} />
        <Route path="parents/:id/history" element={<FeeHistory />} />
        <Route path="collect-fee" element={<CollectFee />} />
        <Route path="reports" element={<Reports />} />
        {/* Admin-only routes */}
        <Route path="teachers" element={<AdminRoute><Teachers /></AdminRoute>} />
        <Route path="teachers/:id/profile" element={<AdminRoute><TeacherProfile /></AdminRoute>} />
        <Route path="pay-teacher-salary" element={<AdminRoute><PayTeacherSalary /></AdminRoute>} />
        <Route path="expenses" element={<AdminRoute><Expenses /></AdminRoute>} />
        <Route path="month-setup" element={<AdminRoute><MonthSetup /></AdminRoute>} />
        <Route path="users" element={<AdminRoute><Users /></AdminRoute>} />
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

