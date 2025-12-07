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
  ArrowDownOnSquareIcon
} from '@heroicons/react/24/outline'

export default function Parents() {
  const [parents, setParents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingParent, setEditingParent] = useState(null)
  const [formData, setFormData] = useState({
    parent_name: '',
    phone_number: '',
    number_of_children: 1,
    monthly_fee_amount: ''
  })
  const navigate = useNavigate()
  const { socket } = useSocket()

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    fetchParents()
  }, [debouncedSearch])

  const fetchParents = useCallback(async () => {
    try {
      setLoading(true)
      const response = await api.get('/parents', { params: { search: debouncedSearch } })
      setParents(response.data.parents)
    } catch (error) {
      toast.error('Failed to fetch parents')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch])

  // Listen for real-time updates
  useEffect(() => {
    if (!socket) return

    const handleParentCreated = (data) => {
      fetchParents()
      toast.success('New parent added', { icon: '👤' })
    }

    const handleParentUpdated = (data) => {
      fetchParents()
      if (data.parent_id !== editingParent?.id) {
        toast.success('Parent updated', { icon: '✓' })
      }
    }

    const handleParentImported = (data) => {
      fetchParents()
      toast.success(`${data.count} parents imported`, { icon: '📥' })
    }

    const handleParentDeleted = (data) => {
      fetchParents()
      toast.success('Parent deleted', { icon: '🗑️' })
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
        await api.put(`/parents/${editingParent.id}`, formData)
        toast.success('Parent updated successfully')
      } else {
        await api.post('/parents', formData)
        toast.success('Parent added successfully')
      }
      setShowAddModal(false)
      setEditingParent(null)
      setFormData({ parent_name: '', phone_number: '', number_of_children: 1, monthly_fee_amount: '' })
      fetchParents()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save parent')
    }
  }

  const handleEdit = (parent) => {
    setEditingParent(parent)
    setFormData({
      parent_name: parent.parent_name,
      phone_number: parent.phone_number,
      number_of_children: parent.number_of_children,
      monthly_fee_amount: parent.monthly_fee_amount
    })
    setShowAddModal(true)
  }

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get('/parents/import/template', {
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'parents_import_template.xlsx')
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
      const response = await api.get('/parents/export', {
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
      
      toast.success('All parents exported successfully')
    } catch (error) {
      toast.error('Failed to export parents')
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await api.post('/parents/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success(`Imported ${response.data.imported} parents`)
      fetchParents()
    } catch (error) {
      toast.error('Failed to import parents')
    }
  }

  const handleDelete = async (parent) => {
    if (!window.confirm(`Are you sure you want to delete "${parent.parent_name}"? This will also delete all associated payment records. This action cannot be undone.`)) {
      return
    }

    try {
      await api.delete(`/parents/${parent.id}`)
      toast.success('Parent deleted successfully')
      fetchParents()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete parent')
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
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Parents</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Manage parent information and fee records</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          <button 
            onClick={handleExportAllParents} 
            className="btn btn-outline w-full sm:w-auto text-sm"
            title="Export all parents to Excel"
          >
            <ArrowDownOnSquareIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            <span className="hidden sm:inline">Export All</span>
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
            Add Parent
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-9 sm:pl-10 text-sm sm:text-base"
        />
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block card overflow-hidden p-0 w-full">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : parents.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No parents found. Add a new parent to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Parent Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone
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
                      {parent.parent_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {parent.phone_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {parent.number_of_children}
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
                          onClick={() => navigate(`/parents/${parent.id}/profile`)}
                          className="text-gray-600 hover:text-gray-900"
                          title="View Profile & Timeline"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(parent)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete Parent"
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
            No parents found. Add a new parent to get started.
          </div>
        ) : (
          parents.map((parent) => (
            <div key={parent.id} className="card p-4 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-900 truncate mb-1">
                    {parent.parent_name}
                  </h3>
                  <p className="text-sm text-gray-600 break-all">{parent.phone_number}</p>
                </div>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full flex-shrink-0 ml-2 ${getStatusBadge(parent.current_month_status)}`}>
                  {parent.current_month_status || 'N/A'}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                <div>
                  <p className="text-xs text-gray-600">Children</p>
                  <p className="font-semibold">{parent.number_of_children}</p>
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
                  onClick={() => navigate(`/parents/${parent.id}/profile`)}
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
              {editingParent ? 'Edit Parent' : 'Add New Parent'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Name</label>
                <input
                  type="text"
                  required
                  className="input text-sm sm:text-base"
                  value={formData.parent_name}
                  onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  required
                  className="input text-sm sm:text-base"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of Children</label>
                <input
                  type="number"
                  min="1"
                  required
                  className="input text-sm sm:text-base"
                  value={formData.number_of_children}
                  onChange={(e) => setFormData({ ...formData, number_of_children: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Fee Amount</label>
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
                  {editingParent ? 'Update' : 'Add'} Parent
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false)
                    setEditingParent(null)
                    setFormData({ parent_name: '', phone_number: '', number_of_children: 1, monthly_fee_amount: '' })
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

