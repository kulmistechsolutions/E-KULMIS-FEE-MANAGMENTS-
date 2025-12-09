import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { useSocket } from '../contexts/SocketContext'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  EyeIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon
} from '@heroicons/react/24/outline'

const DEPARTMENTS = ['Quraan', 'Primary/Middle/Secondary', 'Shareeca']

export default function Teachers() {
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState(null)
  const [formData, setFormData] = useState({
    teacher_name: '',
    department: '',
    monthly_salary: '',
    phone_number: '',
    date_of_joining: ''
  })
  const navigate = useNavigate()
  const { socket } = useSocket()

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    fetchTeachers()
  }, [debouncedSearch, departmentFilter])

  const fetchTeachers = useCallback(async () => {
    try {
      setLoading(true)
      const params = { search: debouncedSearch }
      if (departmentFilter !== 'all') params.department = departmentFilter
      const response = await api.get('/teachers', { params })
      setTeachers(response.data.teachers)
    } catch (error) {
      toast.error('Failed to fetch teachers')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, departmentFilter])

  useEffect(() => {
    if (!socket) return

    const handleTeacherCreated = () => {
      fetchTeachers()
      toast.success('New teacher added')
    }

    const handleTeacherUpdated = () => {
      fetchTeachers()
      toast.success('Teacher updated')
    }

    const handleTeacherDeleted = () => {
      fetchTeachers()
      toast.success('Teacher deleted')
    }

    socket.on('teacher:created', handleTeacherCreated)
    socket.on('teacher:updated', handleTeacherUpdated)
    socket.on('teacher:deleted', handleTeacherDeleted)

    return () => {
      socket.off('teacher:created', handleTeacherCreated)
      socket.off('teacher:updated', handleTeacherUpdated)
      socket.off('teacher:deleted', handleTeacherDeleted)
      socket.off('teacher:imported', handleTeacherImported)
    }
  }, [socket, fetchTeachers])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingTeacher) {
        await api.put(`/teachers/${editingTeacher.id}`, formData)
        toast.success('Teacher updated successfully')
      } else {
        await api.post('/teachers', formData)
        toast.success('Teacher added successfully')
      }
      setShowAddModal(false)
      setEditingTeacher(null)
      setFormData({ teacher_name: '', department: '', monthly_salary: '', phone_number: '', date_of_joining: '' })
      fetchTeachers()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save teacher')
    }
  }

  const handleEdit = (teacher) => {
    setEditingTeacher(teacher)
    setFormData({
      teacher_name: teacher.teacher_name,
      department: teacher.department,
      monthly_salary: teacher.monthly_salary,
      phone_number: teacher.phone_number || '',
      date_of_joining: teacher.date_of_joining
    })
    setShowAddModal(true)
  }

  const handleDelete = async (teacher) => {
    if (!window.confirm(`Are you sure you want to delete "${teacher.teacher_name}"?`)) {
      return
    }

    try {
      await api.delete(`/teachers/${teacher.id}`)
      toast.success('Teacher deleted successfully')
      fetchTeachers()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete teacher')
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get('/teachers/import/template', {
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'teachers_import_template.xlsx')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      
      toast.success('Template downloaded successfully')
    } catch (error) {
      toast.error('Failed to download template')
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await api.post('/teachers/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success(`Imported ${response.data.imported} teachers${response.data.errors > 0 ? ` (${response.data.errors} errors)` : ''}`)
      if (response.data.errors > 0 && response.data.details?.errors?.length > 0) {
        console.error('Import errors:', response.data.details.errors)
      }
      fetchTeachers()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to import teachers')
    }
  }

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div className="flex flex-col gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Teachers</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Manage teacher information and salary records</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button onClick={handleDownloadTemplate} className="btn btn-outline w-full sm:w-auto text-sm">
            <ArrowDownTrayIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            <span className="hidden sm:inline">Download Template</span>
            <span className="sm:hidden">Template</span>
          </button>
          <label className="btn btn-outline w-full sm:w-auto text-sm cursor-pointer">
            <ArrowUpTrayIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            <span className="hidden sm:inline">Import Teachers</span>
            <span className="sm:hidden">Import</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              className="hidden"
            />
          </label>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary w-full sm:w-auto text-sm">
            <PlusIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            Add Teacher
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

      {/* Department Filter */}
      <div>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="input w-full sm:w-64 text-sm sm:text-base"
        >
          <option value="all">All Departments</option>
          {DEPARTMENTS.map(dept => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block card overflow-hidden p-0 w-full">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : teachers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No teachers found. Add a new teacher to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Monthly Salary
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date Joined
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {teachers.map((teacher) => (
                  <tr key={teacher.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {teacher.teacher_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {teacher.department}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${parseFloat(teacher.monthly_salary).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {teacher.phone_number || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(teacher.date_of_joining).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleEdit(teacher)}
                          className="text-primary-600 hover:text-primary-900"
                          title="Edit"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => navigate(`/teachers/${teacher.id}/profile`)}
                          className="text-gray-600 hover:text-gray-900"
                          title="View Profile"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(teacher)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete"
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
        ) : teachers.length === 0 ? (
          <div className="card p-6 text-center text-gray-500">
            No teachers found. Add a new teacher to get started.
          </div>
        ) : (
          teachers.map((teacher) => (
            <div key={teacher.id} className="card p-4 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-900 truncate mb-1">
                    {teacher.teacher_name}
                  </h3>
                  <p className="text-sm text-gray-600">{teacher.department}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                <div>
                  <p className="text-xs text-gray-600">Monthly Salary</p>
                  <p className="font-semibold">${parseFloat(teacher.monthly_salary).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Phone</p>
                  <p className="font-semibold break-all">{teacher.phone_number || 'N/A'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-600">Date Joined</p>
                  <p className="font-semibold">{new Date(teacher.date_of_joining).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-gray-200">
                <button
                  onClick={() => handleEdit(teacher)}
                  className="flex-1 btn btn-outline text-sm py-2 flex items-center justify-center gap-2"
                >
                  <PencilIcon className="h-4 w-4" />
                  Edit
                </button>
                <button
                  onClick={() => navigate(`/teachers/${teacher.id}/profile`)}
                  className="flex-1 btn btn-primary text-sm py-2 flex items-center justify-center gap-2"
                >
                  <EyeIcon className="h-4 w-4" />
                  View
                </button>
                <button
                  onClick={() => handleDelete(teacher)}
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
              {editingTeacher ? 'Edit Teacher' : 'Add New Teacher'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teacher Name *</label>
                <input
                  type="text"
                  required
                  className="input text-sm sm:text-base"
                  value={formData.teacher_name}
                  onChange={(e) => setFormData({ ...formData, teacher_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
                <select
                  required
                  className="input text-sm sm:text-base"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                >
                  <option value="">Select Department</option>
                  {DEPARTMENTS.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Salary *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="input text-sm sm:text-base"
                  value={formData.monthly_salary}
                  onChange={(e) => setFormData({ ...formData, monthly_salary: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  className="input text-sm sm:text-base"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date of Joining *</label>
                <input
                  type="date"
                  required
                  className="input text-sm sm:text-base"
                  value={formData.date_of_joining}
                  onChange={(e) => setFormData({ ...formData, date_of_joining: e.target.value })}
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4">
                <button type="submit" className="flex-1 btn btn-primary text-sm sm:text-base">
                  {editingTeacher ? 'Update' : 'Add'} Teacher
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false)
                    setEditingTeacher(null)
                    setFormData({ teacher_name: '', department: '', monthly_salary: '', phone_number: '', date_of_joining: '' })
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

