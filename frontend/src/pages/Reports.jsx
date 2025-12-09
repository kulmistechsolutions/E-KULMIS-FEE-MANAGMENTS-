import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { useSocket } from '../contexts/SocketContext'
import { ArrowDownTrayIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline'

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

  const handleExport = async () => {
    try {
      const params = selectedMonth ? { month: selectedMonth } : {}
      const response = await api.get('/reports/export-excel', {
        params,
        responseType: 'blob'
      })

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `fee-records-${selectedMonth || 'active'}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()

      toast.success('Excel file downloaded successfully')
    } catch (error) {
      toast.error('Failed to export Excel')
    }
  }

  const handleExportPDF = async () => {
    try {
      const params = selectedMonth ? { month: selectedMonth } : {}
      const response = await api.get('/reports/export-pdf', {
        params,
        responseType: 'blob'
      })

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `financial-report-${selectedMonth || 'active'}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()

      toast.success('PDF report downloaded successfully')
    } catch (error) {
      toast.error('Failed to export PDF')
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
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input w-full sm:w-48 text-sm sm:text-base"
          />
          <button onClick={handleExport} className="btn btn-primary w-full sm:w-auto text-sm sm:text-base">
            <ArrowDownTrayIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            <span className="hidden sm:inline">Export Excel</span>
            <span className="sm:hidden">Excel</span>
          </button>
          <button onClick={handleExportPDF} className="btn btn-outline w-full sm:w-auto text-sm sm:text-base">
            <DocumentArrowDownIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            <span className="hidden sm:inline">Export PDF</span>
            <span className="sm:hidden">PDF</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
        <div className="card p-3 sm:p-4 md:p-6">
          <p className="text-xs sm:text-sm font-medium text-gray-600">Total Parents</p>
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

