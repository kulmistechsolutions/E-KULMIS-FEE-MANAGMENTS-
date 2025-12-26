import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { useSocket } from '../contexts/SocketContext'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  DocumentArrowDownIcon,
  TrashIcon,
  ArrowDownOnSquareIcon,
  FunnelIcon,
  CalendarIcon
} from '@heroicons/react/24/outline'

export default function Parents() {
  const [parents, setParents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [months, setMonths] = useState([])
  const [selectedMonthId, setSelectedMonthId] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingParent, setEditingParent] = useState(null)
  const [formData, setFormData] = useState({
    student_name: '',
    guardian_name: '',
    guardian_phone_number: '',
    class_section: '',
    monthly_fee_amount: ''
  })
  const navigate = useNavigate()
  const { socket } = useSocket()

  // Fetch months on mount
  useEffect(() => {
    fetchMonths()
  }, [])

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    fetchParents()
  }, [debouncedSearch, selectedMonthId, statusFilter])

  const fetchMonths = async () => {
    try {
      const response = await api.get('/months')
      setMonths(response.data || [])
      // Auto-select active month if available
      const activeMonth = response.data?.find(m => m.is_active)
      if (activeMonth) {
        setSelectedMonthId(activeMonth.id)
      }
    } catch (error) {
      toast.error('Failed to fetch months')
    }
  }

  const fetchParents = useCallback(async () => {
    try {
      setLoading(true)
      const params = { search: debouncedSearch }
      if (selectedMonthId) {
        params.month_id = selectedMonthId
      }
      if (statusFilter && statusFilter !== 'all') {
        params.status = statusFilter
      }
      const response = await api.get('/students', { params })
      setParents(response.data.students || response.data.parents || [])
    } catch (error) {
      toast.error('Failed to fetch students')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, selectedMonthId, statusFilter])

  // Listen for real-time updates
  useEffect(() => {
    if (!socket) return

    const handleParentCreated = (data) => {
      fetchParents()
      toast.success('New student added', { icon: '👤' })
    }

    const handleParentUpdated = (data) => {
      fetchParents()
      if (data.parent_id !== editingParent?.id) {
        toast.success('Student updated', { icon: '✓' })
      }
    }

    const handleParentImported = (data) => {
      fetchParents()
      toast.success(`${data.count} students imported`, { icon: '📥' })
    }

    const handleParentDeleted = (data) => {
      fetchParents()
      toast.success('Student deleted', { icon: '🗑️' })
    }

    socket.on('parent:created', handleParentCreated)
    socket.on('parent:updated', handleParentUpdated)
    socket.on('parent:imported', handleParentImported)
    socket.on('parent:deleted', handleParentDeleted)

    return () => {
      socket.off('parent:created', handleParentCreated)
      socket.off('parent:updated', handleParentUpdated)
      socket.off('parent:imported', handleParentImported)
      socket.off('parent:deleted', handleParentDeleted)
    }
  }, [socket, editingParent])


  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingParent) {
        await api.put(`/students/${editingParent.id}`, formData)
        toast.success('Student updated successfully')
      } else {
        await api.post('/students', formData)
        toast.success('Student added successfully')
      }
      setShowAddModal(false)
      setEditingParent(null)
      setFormData({ student_name: '', guardian_name: '', guardian_phone_number: '', class_section: '', monthly_fee_amount: '' })
      fetchParents()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save student')
    }
  }

  const handleEdit = (parent) => {
    setEditingParent(parent)
    setFormData({
      student_name: parent.student_name || parent.parent_name,
      guardian_name: parent.guardian_name || parent.parent_name,
      guardian_phone_number: parent.guardian_phone_number || parent.phone_number,
      class_section: parent.class_section || '',
      monthly_fee_amount: parent.monthly_fee_amount
    })
    setShowAddModal(true)
  }

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get('/students/import/template', {
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'students_import_template.xlsx')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      
      toast.success('Template downloaded successfully')
    } catch (error) {
      toast.error('Failed to download template')
    }
  }

  const handleExportAllParents = async () => {
    try {
      const params = {}
      if (selectedMonthId) {
        params.month_id = selectedMonthId
      }
      if (statusFilter && statusFilter !== 'all') {
        params.status = statusFilter
      }
      if (debouncedSearch) {
        params.search = debouncedSearch
      }
      
      const response = await api.get('/students/export', {
        params,
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      
      // Extract filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition']
      let filename = 'all_parents_export.xlsx'
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      }
      
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      
      toast.success('Students exported successfully')
    } catch (error) {
      toast.error('Failed to export students')
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await api.post('/students/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success(`Imported ${response.data.imported} students`)
      fetchParents()
    } catch (error) {
      toast.error('Failed to import students')
    }
  }

  const handleDelete = async (parent) => {
    if (!window.confirm(`Are you sure you want to delete "${parent.student_name || parent.parent_name}"? This will also delete all associated payment records. This action cannot be undone.`)) {
      return
    }

    try {
      await api.delete(`/students/${parent.id}`)
      toast.success('Student deleted successfully')
      fetchParents()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete student')
    }
  }

  const getStatusBadge = (status) => {
    const badges = {
      paid: 'bg-green-100 text-green-800',
      unpaid: 'bg-red-100 text-red-800',
      partial: 'bg-orange-100 text-orange-800',
      advanced: 'bg-blue-100 text-blue-800'
    }
    return badges[status] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div className="flex flex-col gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Students</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Manage student records and fee accounts</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          <button 
            onClick={handleExportAllParents} 
            className="btn btn-outline w-full sm:w-auto text-sm"
            title={
              statusFilter && statusFilter !== 'all' 
                ? `Export ${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Parents${selectedMonthId ? ' for selected month' : ''}`
                : selectedMonthId 
                  ? 'Export Students for selected month'
                  : 'Export all parents to Excel'
            }
          >
            <ArrowDownOnSquareIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            <span className="hidden sm:inline">
              {statusFilter && statusFilter !== 'all' 
                ? `Export ${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}`
                : 'Export Students'}
            </span>
            <span className="sm:hidden">Export</span>
          </button>
          <button 
            onClick={handleDownloadTemplate} 
            className="btn btn-outline w-full sm:w-auto text-sm"
            title="Download Excel template for importing parents"
          >
            <DocumentArrowDownIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            <span className="hidden sm:inline">Download Template</span>
            <span className="sm:hidden">Template</span>
          </button>
          <label className="btn btn-outline cursor-pointer w-full sm:w-auto text-sm">
            <ArrowDownTrayIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            <span className="hidden sm:inline">Import Excel</span>
            <span className="sm:hidden">Import</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
          </label>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary w-full sm:w-auto text-sm">
            <PlusIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            Add Student
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 sm:pl-10 text-sm sm:text-base w-full"
            />
          </div>
          
          {/* Month Filter */}
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400 pointer-events-none" />
            <select
              value={selectedMonthId}
              onChange={(e) => setSelectedMonthId(e.target.value)}
              className="input pl-9 sm:pl-10 text-sm sm:text-base w-full appearance-none"
            >
              <option value="">All Months</option>
              {months.map((month) => {
                if (!month || typeof month.year !== 'number' || typeof month.month !== 'number') {
                  return null
                }
                const monthDate = new Date(month.year, month.month - 1)
                if (isNaN(monthDate.getTime())) {
                  return null
                }
                const monthName = monthDate.toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric'
                })
                return (
                  <option key={month.id} value={month.id}>
                    {monthName}
                    {month.is_active && ' (Active)'}
                  </option>
                )
              })}
            </select>
          </div>
          
          {/* Status Filter */}
          <div className="relative">
            <FunnelIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input pl-9 sm:pl-10 text-sm sm:text-base w-full appearance-none"
            >
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="outstanding">Outstanding</option>
              <option value="advanced">Advance</option>
            </select>
          </div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block card overflow-hidden p-0 w-full">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : parents.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No students found. Add a new student to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Student Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Guardian Phone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Children
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Monthly Fee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Outstanding
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {parents.map((parent) => (
                  <tr key={parent.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {parent.student_name || parent.parent_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {parent.guardian_phone_number || parent.phone_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {parent.class_section || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${parseFloat(parent.monthly_fee_amount).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${parseFloat(parent.total_outstanding || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(parent.current_month_status)}`}>
                        {parent.current_month_status || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleEdit(parent)}
                          className="text-primary-600 hover:text-primary-900"
                          title="Edit"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => navigate(`/students/${parent.id}/profile`)}
                          className="text-gray-600 hover:text-gray-900"
                          title="View Profile & Timeline"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(parent)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete Student"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : parents.length === 0 ? (
          <div className="card p-6 text-center text-gray-500">
            No students found. Add a new student to get started.
          </div>
        ) : (
          parents.map((parent) => (
            <div key={parent.id} className="card p-4 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-900 truncate mb-1">
                    {parent.student_name || parent.parent_name}
                  </h3>
                  <p className="text-sm text-gray-600 break-all">{parent.guardian_phone_number || parent.phone_number}</p>
                </div>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full flex-shrink-0 ml-2 ${getStatusBadge(parent.current_month_status)}`}>
                  {parent.current_month_status || 'N/A'}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                <div>
                  <p className="text-xs text-gray-600">Children</p>
                  <p className="font-semibold">{parent.class_section || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Monthly Fee</p>
                  <p className="font-semibold">${parseFloat(parent.monthly_fee_amount).toLocaleString()}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-600">Outstanding</p>
                  <p className="font-bold text-red-600 text-base">
                    ${parseFloat(parent.total_outstanding || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-gray-200">
                <button
                  onClick={() => handleEdit(parent)}
                  className="flex-1 btn btn-outline text-sm py-2 flex items-center justify-center gap-2"
                >
                  <PencilIcon className="h-4 w-4" />
                  Edit
                </button>
                <button
                  onClick={() => navigate(`/students/${parent.id}/profile`)}
                  className="flex-1 btn btn-primary text-sm py-2 flex items-center justify-center gap-2"
                >
                  <EyeIcon className="h-4 w-4" />
                  View
                </button>
                <button
                  onClick={() => handleDelete(parent)}
                  className="btn btn-outline text-sm py-2 px-3 text-red-600 hover:bg-red-50 border-red-300 flex items-center justify-center"
                  title="Delete"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">
              {editingParent ? 'Edit Student' : 'Add New Student'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label mb-1">Student Name</label>
                <input
                  type="text"
                  required
                  className="input text-sm sm:text-base"
                  value={formData.student_name || ''}
                  onChange={(e) => setFormData({ ...formData, student_name: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label mb-1">Parent/Guardian Name</label>
                <input
                  type="text"
                  required
                  className="input text-sm sm:text-base"
                  value={formData.guardian_name || ''}
                  onChange={(e) => setFormData({ ...formData, guardian_name: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label mb-1">Parent/Guardian Phone Number</label>
                <input
                  type="text"
                  required
                  className="input text-sm sm:text-base"
                  value={formData.guardian_phone_number || ''}
                  onChange={(e) => setFormData({ ...formData, guardian_phone_number: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label mb-1">Class / Section</label>
                <input
                  type="text"
                  className="input text-sm sm:text-base"
                  value={formData.class_section || ''}
                  onChange={(e) => setFormData({ ...formData, class_section: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label mb-1">Monthly Fee Amount</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="input text-sm sm:text-base"
                  value={formData.monthly_fee_amount}
                  onChange={(e) => setFormData({ ...formData, monthly_fee_amount: e.target.value })}
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4">
                <button type="submit" className="flex-1 btn btn-primary text-sm sm:text-base">
                  {editingParent ? 'Update' : 'Add'} Student
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false)
                    setEditingParent(null)
                    setFormData({ student_name: '', guardian_name: '', guardian_phone_number: '', class_section: '', monthly_fee_amount: '' })
                  }}
                  className="flex-1 btn btn-outline text-sm sm:text-base"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

