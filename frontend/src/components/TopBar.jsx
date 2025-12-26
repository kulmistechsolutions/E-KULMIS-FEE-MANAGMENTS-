import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { UserCircleIcon, Bars3Icon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'

export default function TopBar({ onMenuClick, onSidebarToggle, sidebarCollapsed }) {
  const { user, branding, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side */}
          <div className="flex items-center space-x-4">
            <button
              onClick={onMenuClick}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Open menu"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900">{branding?.system_name || 'FEE-KULMIS'}</h1>
              <p className="hidden sm:block text-xs text-gray-500">{branding?.school?.name || 'SaaS Fee Management Platform'}</p>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="hidden sm:flex items-center space-x-3 px-3 py-1.5 bg-gray-50 rounded-lg">
              <UserCircleIcon className="h-5 w-5 text-gray-400" />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-900">{user?.username}</span>
                <span className="text-xs text-gray-500 capitalize">{user?.role}</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Logout"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

