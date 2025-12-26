import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  HomeIcon,
  UsersIcon,
  CurrencyDollarIcon,
  CalendarIcon,
  ChartBarIcon,
  UserGroupIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  AcademicCapIcon,
  BanknotesIcon,
  DocumentTextIcon,
  PresentationChartLineIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline'

// All navigation items with role requirements
const allNavigation = [
  { name: 'Schools', href: '/platform/schools', icon: HomeIcon, roles: ['super_admin'] },

  { name: 'Dashboard', href: '/', icon: HomeIcon, roles: ['admin', 'school_admin'] },
  { name: 'Students', href: '/students', icon: UsersIcon, roles: ['admin', 'school_admin', 'cashier'] },
  { name: 'Collect Fee', href: '/collect-fee', icon: CurrencyDollarIcon, roles: ['admin', 'school_admin', 'cashier'] },
  { name: 'Teachers', href: '/teachers', icon: AcademicCapIcon, roles: ['admin', 'school_admin'] },
  { name: 'Pay Teacher Salary', href: '/pay-teacher-salary', icon: BanknotesIcon, roles: ['admin', 'school_admin'] },
  { name: 'Expenses', href: '/expenses', icon: DocumentTextIcon, roles: ['admin', 'school_admin'] },
  { name: 'Month Setup', href: '/month-setup', icon: CalendarIcon, roles: ['admin', 'school_admin'] },
  { name: 'Reports', href: '/reports', icon: ChartBarIcon, roles: ['admin', 'school_admin'] },
  { name: 'Users', href: '/users', icon: UserGroupIcon, roles: ['admin', 'school_admin'] },
  { name: 'User Monitoring', href: '/user-monitoring', icon: PresentationChartLineIcon, roles: ['admin', 'school_admin'] },
  { name: 'School Branding', href: '/school-branding', icon: Cog6ToothIcon, roles: ['admin', 'school_admin'] },
]

export default function Sidebar({ isOpen, onClose, collapsed, onToggleCollapse }) {
  const location = useLocation()
  const { user, branding } = useAuth()
  
  // Filter navigation based on user role
  const navigation = allNavigation.filter(item => 
    item.roles.includes(user?.role || 'cashier')
  )

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 bg-white border-r border-gray-200 transform transition-all duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 md:fixed md:z-auto ${
          collapsed ? 'md:w-20' : 'w-64'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-5 border-b border-gray-200 ${
            collapsed ? 'md:justify-center' : ''
          }`}>
            {!collapsed && (
              <div className="flex items-center flex-shrink-0">
                <img
                  src={branding?.school?.logo_path || '/systemlogo.png'}
                  alt={branding?.school?.name || 'School Logo'}
                  className="h-10 w-10 rounded-full object-cover"
                />
                <div className="ml-3">
                  <h1 className="text-base font-bold text-gray-900 leading-tight">{branding?.system_name || 'FEE-KULMIS'}</h1>
                  <p className="text-xs text-gray-500">{branding?.school?.name || 'School'}</p>
                </div>
              </div>
            )}
            {collapsed && (
              <img
                src={branding?.school?.logo_path || '/systemlogo.png'}
                alt="Logo"
                className="h-10 w-10 rounded-full object-cover mx-auto"
              />
            )}
            <div className="flex items-center">
              <button
                onClick={onToggleCollapse}
                className="hidden md:flex items-center justify-center w-8 h-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors ml-auto"
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? (
                  <ChevronRightIcon className="h-5 w-5" />
                ) : (
                  <ChevronLeftIcon className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={onClose}
                className="md:hidden text-gray-500 hover:text-gray-700 p-1 ml-auto"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 pt-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={onClose}
                  className={`${
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  } group flex items-center ${
                    collapsed ? 'md:justify-center md:px-2' : 'px-3'
                  } py-2.5 text-sm font-medium rounded-lg transition-all duration-200 relative`}
                  title={collapsed ? item.name : ''}
                >
                  <item.icon
                    className={`${
                      isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-500'
                    } flex-shrink-0 h-5 w-5 ${
                      collapsed ? 'md:mx-0' : 'mr-3'
                    }`}
                  />
                  {!collapsed && (
                    <span className="truncate">{item.name}</span>
                  )}
                  {isActive && !collapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-600 rounded-r-full" />
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          {!collapsed && (
            <div className="px-4 py-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                © 2024 {branding?.system_name || 'FEE-KULMIS'}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

