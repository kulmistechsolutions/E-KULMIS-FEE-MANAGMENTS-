import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { useSocket } from '../contexts/SocketContext'
import { CalendarIcon, PlayIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'

export default function MonthSetup() {
  const [months, setMonths] = useState([])
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [deletingMonth, setDeletingMonth] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmAnswers, setDeleteConfirmAnswers] = useState({
    question1: '',
    question2: '',
    question3: ''
  })
  const { socket } = useSocket()

  useEffect(() => {
    fetchMonths()
  }, [])

  // Listen for real-time month updates
  useEffect(() => {
    if (!socket) return

    const handleMonthCreated = (data) => {
      fetchMonths()
      toast.success('New month created in real-time!', { icon: '📅' })
    }

    const handleMonthDeleted = (data) => {
      fetchMonths()
      toast.success('Month deleted in real-time!', { icon: '🗑️' })
    }

    socket.on('month:created', handleMonthCreated)
    socket.on('month:deleted', handleMonthDeleted)

    return () => {
      socket.off('month:created', handleMonthCreated)
      socket.off('month:deleted', handleMonthDeleted)
    }
  }, [socket])

  const fetchMonths = async () => {
    try {
      const response = await api.get('/months')
      setMonths(response.data || [])
    } catch (error) {
      console.error('Fetch months error:', error)
      if (error.response?.status === 401) {
        toast.error('Session expired. Please login again.')
      } else if (!error.response) {
        toast.error('Cannot connect to server. Please check your connection.')
      } else {
      toast.error('Failed to fetch months')
      }
      setMonths([])
    }
  }

  const handleSetup = async () => {
    // Validate inputs
    if (!selectedYear || !selectedMonth) {
      toast.error('Please select year and month')
      return
    }

    // Validate year range
    if (selectedYear < 2000 || selectedYear > 2100) {
      toast.error('Year must be between 2000 and 2100')
      return
    }

    // Validate month range
    if (selectedMonth < 1 || selectedMonth > 12) {
      toast.error('Please select a valid month')
      return
    }

    // Check if month already exists
    const exists = months.find(
      m => m.year === selectedYear && m.month === selectedMonth
    )

    if (exists) {
      if (!confirm('This month already exists. Do you want to continue?')) {
        return
      }
    }

    try {
      setLoading(true)
      const response = await api.post('/months/setup', {
        year: parseInt(selectedYear),
        month: parseInt(selectedMonth)
      })
      toast.success('Month setup completed successfully!')
      fetchMonths()
      // Reset to current date after successful setup
      setSelectedYear(new Date().getFullYear())
      setSelectedMonth(new Date().getMonth() + 1)
    } catch (error) {
      console.error('Month setup error:', error)
      if (error.response?.data?.error) {
        toast.error(error.response.data.error)
      } else if (error.message) {
        toast.error(`Failed to setup month: ${error.message}`)
      } else if (!error.response) {
        toast.error('Network error: Cannot connect to server. Please check your connection.')
      } else {
        toast.error('Failed to setup month. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = (month) => {
    setDeletingMonth(month)
    setShowDeleteConfirm(true)
    setDeleteConfirmAnswers({ question1: '', question2: '', question3: '' })
  }

  const handleDeleteConfirm = async () => {
    const month = deletingMonth
    const monthName = `${monthNames[month.month - 1]} ${month.year}`
    
    // Validate all 3 questions are answered correctly
    const correctAnswers = {
      question1: monthName.toLowerCase(),
      question2: 'delete',
      question3: 'yes'
    }
    
    const userAnswers = {
      question1: deleteConfirmAnswers.question1.toLowerCase().trim(),
      question2: deleteConfirmAnswers.question2.toLowerCase().trim(),
      question3: deleteConfirmAnswers.question3.toLowerCase().trim()
    }
    
    // Check all answers
    if (userAnswers.question1 !== correctAnswers.question1) {
      toast.error('Question 1: Please type the exact month name to confirm')
      return
    }
    
    if (userAnswers.question2 !== correctAnswers.question2) {
      toast.error('Question 2: Please type "DELETE" to confirm')
      return
    }
    
    if (userAnswers.question3 !== correctAnswers.question3) {
      toast.error('Question 3: Please type "YES" to confirm')
      return
    }
    
    // All answers correct, proceed with deletion
    try {
      setLoading(true)
      await api.delete(`/months/${month.id}`)
      toast.success(`Month ${monthName} deleted successfully`)
      fetchMonths()
      setShowDeleteConfirm(false)
      setDeletingMonth(null)
      setDeleteConfirmAnswers({ question1: '', question2: '', question3: '' })
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete month')
    } finally {
      setLoading(false)
    }
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Month Setup</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">Create new billing months and initialize fee records</p>
      </div>

      <div className="card max-w-2xl p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 sm:mb-6">Start New Billing Month</h2>

        <div className="space-y-4 sm:space-y-6">
          <div>
            <label className="form-label">
              Enter Year
            </label>
            <input
              type="number"
              value={selectedYear}
              onChange={(e) => {
                const year = e.target.value ? parseInt(e.target.value) : new Date().getFullYear()
                // Validate year is between 2000 and 2100
                if (year >= 2000 && year <= 2100) {
                  setSelectedYear(year)
                } else if (e.target.value === '') {
                  setSelectedYear(new Date().getFullYear())
                }
              }}
              min="2000"
              max="2100"
              placeholder="Enter year (e.g., 2025)"
              className="input text-sm sm:text-base w-full"
            />
          </div>

          <div>
            <label className="form-label">
              Select Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="input text-sm sm:text-base w-full"
            >
              {monthNames.map((name, index) => (
                <option key={index + 1} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
            <h3 className="font-semibold text-blue-900 mb-2 text-sm sm:text-base">What happens when you start a new month?</h3>
            <ul className="text-xs sm:text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>All previous months will be deactivated</li>
              <li>Unpaid amounts from previous months will be carried forward</li>
              <li>Partial payments will have their remaining balance carried forward</li>
              <li>Advance payments will be applied to cover the new month</li>
              <li>New fee records will be created for all parents</li>
            </ul>
          </div>

          <button
            onClick={handleSetup}
            disabled={loading}
            className="w-full btn btn-primary py-2.5 sm:py-3 disabled:opacity-50 flex items-center justify-center text-sm sm:text-base"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-white mr-2"></div>
                Setting up...
              </>
            ) : (
              <>
                <PlayIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                Start New Month
              </>
            )}
          </button>
        </div>
      </div>

      {/* Existing Months - Desktop Table View */}
      <div className="hidden lg:block card overflow-hidden p-0">
        <div className="p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Existing Billing Months</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {months.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                    No billing months created yet. Start a new month to begin.
                  </td>
                </tr>
              ) : (
                months.map((month) => (
                  <tr key={month.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{month.year}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {monthNames[month.month - 1]}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        month.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {month.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(month.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      {month.is_active ? (
                        <span className="text-gray-400 text-xs" title="Cannot delete active month">
                          Active
                        </span>
                      ) : (
                        <button
                          onClick={() => handleDeleteClick(month)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                          title="Delete Month"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Existing Months - Mobile Card View */}
      <div className="lg:hidden space-y-3">
        <h2 className="text-lg font-bold text-gray-900 px-2">Existing Billing Months</h2>
        {months.length === 0 ? (
          <div className="card p-6 text-center text-gray-500">
            No billing months created yet. Start a new month to begin.
          </div>
        ) : (
          months.map((month) => (
            <div key={month.id} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-bold text-gray-900">
                      {monthNames[month.month - 1]} {month.year}
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500">
                    Created: {new Date(month.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full flex-shrink-0 ml-2 ${
                  month.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {month.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {!month.is_active && (
                <button
                  onClick={() => handleDeleteClick(month)}
                  className="mt-3 w-full btn btn-outline text-sm py-2 text-red-600 hover:bg-red-50 border-red-300 flex items-center justify-center gap-2"
                >
                  <TrashIcon className="h-4 w-4" />
                  Delete Month
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingMonth && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-red-600">⚠️ Delete Month Confirmation</h2>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeletingMonth(null)
                  setDeleteConfirmAnswers({ question1: '', question2: '', question3: '' })
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm font-semibold text-red-900 mb-2">
                You are about to delete: <span className="font-bold">{monthNames[deletingMonth.month - 1]} {deletingMonth.year}</span>
              </p>
              <p className="text-xs text-red-800">
                This will permanently delete all fee records and payments for this month. This action cannot be undone!
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="form-label">
                  Question 1: Type the month name to confirm ({monthNames[deletingMonth.month - 1]} {deletingMonth.year})
                </label>
                <input
                  type="text"
                  value={deleteConfirmAnswers.question1}
                  onChange={(e) => setDeleteConfirmAnswers({ ...deleteConfirmAnswers, question1: e.target.value })}
                  className="input w-full"
                  placeholder={`Type: ${monthNames[deletingMonth.month - 1]} ${deletingMonth.year}`}
                />
              </div>

              <div>
                <label className="form-label">
                  Question 2: Type "DELETE" to confirm deletion
                </label>
                <input
                  type="text"
                  value={deleteConfirmAnswers.question2}
                  onChange={(e) => setDeleteConfirmAnswers({ ...deleteConfirmAnswers, question2: e.target.value })}
                  className="input w-full"
                  placeholder="Type: DELETE"
                />
              </div>

              <div>
                <label className="form-label">
                  Question 3: Type "YES" if you understand this cannot be undone
                </label>
                <input
                  type="text"
                  value={deleteConfirmAnswers.question3}
                  onChange={(e) => setDeleteConfirmAnswers({ ...deleteConfirmAnswers, question3: e.target.value })}
                  className="input w-full"
                  placeholder="Type: YES"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeletingMonth(null)
                  setDeleteConfirmAnswers({ question1: '', question2: '', question3: '' })
                }}
                className="flex-1 btn btn-outline"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={loading}
                className="flex-1 btn bg-red-600 hover:bg-red-700 text-white"
              >
                {loading ? 'Deleting...' : 'Delete Month'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

