import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { useSocket } from '../contexts/SocketContext'
import { ArrowDownTrayIcon, DocumentArrowDownIcon, UsersIcon, AcademicCapIcon, ReceiptPercentIcon, Square3Stack3DIcon } from '@heroicons/react/24/outline'

export default function Reports() {
  const [summary, setSummary] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const { socket } = useSocket()

  useEffect(() => {
    fetchSummary()
  }, [selectedMonth])

  // Listen for real-time report updates
  useEffect(() => {
    if (!socket) return

    const handleReportsUpdated = () => {
      fetchSummary()
    }

    socket.on('reports:updated', handleReportsUpdated)

    return () => {
      socket.off('reports:updated', handleReportsUpdated)
    }
  }, [socket])

  const fetchSummary = async () => {
    try {
      setLoading(true)
      const params = selectedMonth ? { month: selectedMonth } : {}
      const response = await api.get('/reports/summary', { params })
      setSummary(response.data.summary)
    } catch (error) {
      toast.error('Failed to fetch report data')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (type = 'all', format = 'excel') => {
    try {
      const params = selectedMonth ? { month: selectedMonth } : {}
      const endpoint = type === 'all' 
        ? `/reports/export-${format}` 
        : `/reports/export-${type}-${format}`
      
      const response = await api.get(endpoint, {
        params,
        responseType: 'blob'
      })

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      const typeName = type === 'all' ? 'complete-report' : `${type}-report`
      const extension = format === 'excel' ? 'xlsx' : 'pdf'
      link.setAttribute('download', `${typeName}-${selectedMonth || 'active'}.${extension}`)
      document.body.appendChild(link)
      link.click()
      link.remove()

      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} ${format.toUpperCase()} downloaded successfully`)
    } catch (error) {
      toast.error(`Failed to export ${type} ${format}`)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div className="flex flex-col gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Reports</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">View and export fee collection reports</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input w-full sm:w-48 text-sm sm:text-base"
          />
        </div>

        {/* All Reports Export - Prominent Section */}
        <div className="card p-4 sm:p-6 border-2 border-primary-200 bg-primary-50">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4">
            <h2 className="text-lg sm:text-xl font-bold text-primary-800 flex items-center">
              <Square3Stack3DIcon className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3 text-primary-600" />
              All Financial Reports
            </h2>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button onClick={() => handleExport('all', 'excel')} className="btn btn-primary text-sm w-full sm:w-auto">
                <ArrowDownTrayIcon className="h-4 w-4 mr-2" /> Excel
              </button>
              <button onClick={() => handleExport('all', 'pdf')} className="btn btn-outline text-sm w-full sm:w-auto">
                <DocumentArrowDownIcon className="h-4 w-4 mr-2" /> PDF
              </button>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-primary-700">
            Download a comprehensive report including all student fees, teacher salaries, and expenses.
          </p>
        </div>

        {/* Separate Export Sections */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Students Export */}
          <div className="card p-4 sm:p-6">
            <div className="flex justify-between items-center mb-3 sm:mb-4">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center">
                <UsersIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-blue-600" />
                Students Fees
              </h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleExport('students', 'excel')} 
                  className="btn btn-primary btn-sm text-xs sm:text-sm"
                  title="Export Students to Excel"
                >
                  <ArrowDownTrayIcon className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Excel</span>
                </button>
                <button 
                  onClick={() => handleExport('students', 'pdf')} 
                  className="btn btn-outline btn-sm text-xs sm:text-sm"
                  title="Export Students to PDF"
                >
                  <DocumentArrowDownIcon className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                  <span className="hidden sm:inline">PDF</span>
                </button>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-gray-600">Export detailed student fee records.</p>
          </div>

          {/* Teachers Export */}
          <div className="card p-4 sm:p-6">
            <div className="flex justify-between items-center mb-3 sm:mb-4">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center">
                <AcademicCapIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-green-600" />
                Teacher Salaries
              </h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleExport('teachers', 'excel')} 
                  className="btn btn-primary btn-sm text-xs sm:text-sm"
                  title="Export Teachers to Excel"
                >
                  <ArrowDownTrayIcon className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Excel</span>
                </button>
                <button 
                  onClick={() => handleExport('teachers', 'pdf')} 
                  className="btn btn-outline btn-sm text-xs sm:text-sm"
                  title="Export Teachers to PDF"
                >
                  <DocumentArrowDownIcon className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                  <span className="hidden sm:inline">PDF</span>
                </button>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-gray-600">Export detailed teacher salary records.</p>
          </div>

          {/* Expenses Export */}
          <div className="card p-4 sm:p-6">
            <div className="flex justify-between items-center mb-3 sm:mb-4">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center">
                <ReceiptPercentIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-orange-600" />
                Expenses
              </h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleExport('expenses', 'excel')} 
                  className="btn btn-primary btn-sm text-xs sm:text-sm"
                  title="Export Expenses to Excel"
                >
                  <ArrowDownTrayIcon className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Excel</span>
                </button>
                <button 
                  onClick={() => handleExport('expenses', 'pdf')} 
                  className="btn btn-outline btn-sm text-xs sm:text-sm"
                  title="Export Expenses to PDF"
                >
                  <DocumentArrowDownIcon className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                  <span className="hidden sm:inline">PDF</span>
                </button>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-gray-600">Export detailed expense records.</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
        <div className="card p-3 sm:p-4 md:p-6">
          <p className="text-xs sm:text-sm font-medium text-gray-600">Total Students</p>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1 sm:mt-2">{summary?.total_parents || 0}</p>
        </div>
        <div className="card p-3 sm:p-4 md:p-6">
          <p className="text-xs sm:text-sm font-medium text-gray-600">Paid</p>
          <p className="text-2xl sm:text-3xl font-bold text-green-600 mt-1 sm:mt-2">{summary?.paid_count || 0}</p>
        </div>
        <div className="card p-3 sm:p-4 md:p-6">
          <p className="text-xs sm:text-sm font-medium text-gray-600">Unpaid</p>
          <p className="text-2xl sm:text-3xl font-bold text-red-600 mt-1 sm:mt-2">{summary?.unpaid_count || 0}</p>
        </div>
        <div className="card p-3 sm:p-4 md:p-6">
          <p className="text-xs sm:text-sm font-medium text-gray-600">Partial</p>
          <p className="text-2xl sm:text-3xl font-bold text-orange-600 mt-1 sm:mt-2">{summary?.partial_count || 0}</p>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
        <div className="card p-3 sm:p-4 md:p-6">
          <p className="text-xs sm:text-sm font-medium text-gray-600">Total Fees Collected</p>
          <p className="text-xl sm:text-2xl font-bold text-primary-600 mt-1 sm:mt-2">
            ${parseFloat(summary?.total_collected || 0).toLocaleString()}
          </p>
        </div>
        <div className="card p-3 sm:p-4 md:p-6">
          <p className="text-xs sm:text-sm font-medium text-gray-600">Outstanding Fees</p>
          <p className="text-xl sm:text-2xl font-bold text-red-600 mt-1 sm:mt-2">
            ${parseFloat(summary?.total_outstanding || 0).toLocaleString()}
          </p>
        </div>
        <div className="card p-3 sm:p-4 md:p-6">
          <p className="text-xs sm:text-sm font-medium text-gray-600">Total Advance Value</p>
          <p className="text-xl sm:text-2xl font-bold text-blue-600 mt-1 sm:mt-2">
            ${parseFloat(summary?.total_advance_value || 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Teacher Salary & Expenses Summary */}
      <div className="card p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Teacher Salary & Expenses</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs sm:text-sm font-medium text-gray-600">Salary Required</p>
            <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">
              ${parseFloat(summary?.total_salary_required || 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs sm:text-sm font-medium text-gray-600">Salary Paid</p>
            <p className="text-xl sm:text-2xl font-bold text-green-600 mt-1">
              ${parseFloat(summary?.total_salary_paid || 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs sm:text-sm font-medium text-gray-600">Salary Outstanding</p>
            <p className="text-xl sm:text-2xl font-bold text-red-600 mt-1">
              ${parseFloat(summary?.total_salary_outstanding || 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs sm:text-sm font-medium text-gray-600">Total Expenses</p>
            <p className="text-xl sm:text-2xl font-bold text-orange-600 mt-1">
              ${parseFloat(summary?.total_expenses || 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Net Balance */}
      <div className="card p-4 sm:p-6 bg-gradient-to-r from-primary-50 to-blue-50">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Net Balance</h2>
        <p className="text-3xl sm:text-4xl font-bold mt-2" style={{
          color: (summary?.net_balance || 0) >= 0 ? '#059669' : '#dc2626'
        }}>
          ${parseFloat(summary?.net_balance || 0).toLocaleString()}
        </p>
        <p className="text-xs sm:text-sm text-gray-600 mt-2">
          (Fees Collected - Salary Paid - Expenses)
        </p>
      </div>

      {/* Detailed Statistics */}
      <div className="card p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">Payment Status Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="text-center p-3 sm:p-4 bg-green-50 rounded-lg">
            <p className="text-xl sm:text-2xl font-bold text-green-600">{summary?.paid_count || 0}</p>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">Fully Paid</p>
          </div>
          <div className="text-center p-3 sm:p-4 bg-red-50 rounded-lg">
            <p className="text-xl sm:text-2xl font-bold text-red-600">{summary?.unpaid_count || 0}</p>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">Unpaid</p>
          </div>
          <div className="text-center p-3 sm:p-4 bg-orange-50 rounded-lg">
            <p className="text-xl sm:text-2xl font-bold text-orange-600">{summary?.partial_count || 0}</p>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">Partial</p>
          </div>
          <div className="text-center p-3 sm:p-4 bg-blue-50 rounded-lg">
            <p className="text-xl sm:text-2xl font-bold text-blue-600">{summary?.advanced_count || 0}</p>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">Advanced</p>
          </div>
        </div>
      </div>
    </div>
  )
}

