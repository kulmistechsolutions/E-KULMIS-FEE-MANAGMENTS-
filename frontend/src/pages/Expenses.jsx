import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { useSocket } from '../contexts/SocketContext'
import { PlusIcon, PencilIcon, TrashIcon, ArrowDownTrayIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'

export default function Expenses() {
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [months, setMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)
  const [categoryFormData, setCategoryFormData] = useState({
    category_name: '',
    description: ''
  })
  const [filters, setFilters] = useState({
    month: '',
    category_id: 'all'
  })
  const [formData, setFormData] = useState({
    category_id: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    billing_month_id: '',
    notes: ''
  })
  const { socket } = useSocket()

  useEffect(() => {
    fetchCategories()
    fetchMonths()
    fetchExpenses()
  }, [filters])

  useEffect(() => {
    if (!socket) return
    const handleExpenseCreated = () => {
      fetchExpenses()
      toast.success('Expense added')
    }
    const handleExpenseUpdated = () => {
      fetchExpenses()
      toast.success('Expense updated')
    }
    const handleExpenseDeleted = () => {
      fetchExpenses()
      toast.success('Expense deleted')
    }
    const handleCategoryCreated = () => {
      fetchCategories()
      toast.success('Category created')
    }
    const handleCategoryUpdated = () => {
      fetchCategories()
      toast.success('Category updated')
    }
    const handleCategoryDeleted = () => {
      fetchCategories()
      toast.success('Category deleted')
    }
    socket.on('expense:created', handleExpenseCreated)
    socket.on('expense:updated', handleExpenseUpdated)
    socket.on('expense:deleted', handleExpenseDeleted)
    socket.on('expense:category:created', handleCategoryCreated)
    socket.on('expense:category:updated', handleCategoryUpdated)
    socket.on('expense:category:deleted', handleCategoryDeleted)
    return () => {
      socket.off('expense:created', handleExpenseCreated)
      socket.off('expense:updated', handleExpenseUpdated)
      socket.off('expense:deleted', handleExpenseDeleted)
      socket.off('expense:category:created', handleCategoryCreated)
      socket.off('expense:category:updated', handleCategoryUpdated)
      socket.off('expense:category:deleted', handleCategoryDeleted)
    }
  }, [socket])

  const fetchCategories = async () => {
    try {
      const response = await api.get('/expenses/categories')
      setCategories(response.data)
    } catch (error) {
      toast.error('Failed to fetch categories')
    }
  }

  const fetchMonths = async () => {
    try {
      const response = await api.get('/months')
      setMonths(response.data)
    } catch (error) {
      toast.error('Failed to fetch months')
    }
  }

  const fetchExpenses = async () => {
    try {
      setLoading(true)
      const params = {}
      if (filters.month) params.month = filters.month
      if (filters.category_id !== 'all') params.category_id = filters.category_id
      const response = await api.get('/expenses', { params })
      setExpenses(response.data.expenses)
    } catch (error) {
      toast.error('Failed to fetch expenses')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingExpense) {
        await api.put(`/expenses/${editingExpense.id}`, formData)
        toast.success('Expense updated successfully')
      } else {
        await api.post('/expenses', formData)
        toast.success('Expense added successfully')
      }
      setShowAddModal(false)
      setEditingExpense(null)
      setFormData({ category_id: '', amount: '', expense_date: new Date().toISOString().split('T')[0], billing_month_id: '', notes: '' })
      fetchExpenses()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save expense')
    }
  }

  const handleEdit = (expense) => {
    setEditingExpense(expense)
    setFormData({
      category_id: expense.category_id,
      amount: expense.amount,
      expense_date: expense.expense_date,
      billing_month_id: expense.billing_month_id || '',
      notes: expense.notes || ''
    })
    setShowAddModal(true)
  }

  const handleDelete = async (expense) => {
    if (!window.confirm(`Delete expense of $${expense.amount}?`)) return
    try {
      await api.delete(`/expenses/${expense.id}`)
      toast.success('Expense deleted')
      fetchExpenses()
    } catch (error) {
      toast.error('Failed to delete expense')
    }
  }

  const handleExport = async () => {
    try {
      const params = {}
      if (filters.month) params.month = filters.month
      if (filters.category_id !== 'all') params.category_id = filters.category_id
      const response = await api.get('/expenses/export', { params, responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `expenses_export_${new Date().toISOString().split('T')[0]}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Expenses exported successfully')
    } catch (error) {
      toast.error('Failed to export expenses')
    }
  }

  const handleCategorySubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingCategory) {
        await api.put(`/expenses/categories/${editingCategory.id}`, categoryFormData)
        toast.success('Category updated successfully')
      } else {
        await api.post('/expenses/categories', categoryFormData)
        toast.success('Category created successfully')
      }
      setShowCategoryModal(false)
      setEditingCategory(null)
      setCategoryFormData({ category_name: '', description: '' })
      fetchCategories()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save category')
    }
  }

  const handleEditCategory = (category) => {
    setEditingCategory(category)
    setCategoryFormData({
      category_name: category.category_name,
      description: category.description || ''
    })
    setShowCategoryModal(true)
  }

  const handleDeleteCategory = async (category) => {
    if (!window.confirm(`Delete category "${category.category_name}"? This will only work if no expenses use this category.`)) {
      return
    }
    try {
      // Check if backend supports delete
      await api.delete(`/expenses/categories/${category.id}`)
      toast.success('Category deleted successfully')
      fetchCategories()
    } catch (error) {
      if (error.response?.status === 404) {
        toast.error('Delete category endpoint not available. Categories with expenses cannot be deleted.')
      } else {
        toast.error(error.response?.data?.error || 'Failed to delete category. Category may be in use.')
      }
    }
  }

  const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0)

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Expenses Management</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Track and manage school expenses</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          <button onClick={handleExport} className="btn btn-outline w-full sm:w-auto text-sm">
            <ArrowDownTrayIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary w-full sm:w-auto text-sm">
            <PlusIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            Add Expense
          </button>
        </div>
      </div>

      {/* Expense Categories Management */}
      <div className="card">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Expense Categories</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">Create categories first, then use them when adding expenses</p>
          </div>
          <button 
            onClick={() => {
              setEditingCategory(null)
              setCategoryFormData({ category_name: '', description: '' })
              setShowCategoryModal(true)
            }} 
            className="btn btn-primary text-sm w-full sm:w-auto"
          >
            <PlusIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            Add Category
          </button>
        </div>
        
        {categories.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="mb-2">No categories found.</p>
            <p className="text-sm">Create a category first to start adding expenses.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {categories.map((category) => (
              <div key={category.id} className="border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-gray-900 text-sm flex-1">{category.category_name}</h3>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEditCategory(category)}
                      className="text-primary-600 hover:text-primary-900 text-xs"
                      title="Edit Category"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(category)}
                      className="text-red-600 hover:text-red-900 text-xs"
                      title="Delete Category"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {category.description && (
                  <p className="text-xs text-gray-600 mt-1">{category.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="form-label">Month</label>
            <select
              className="input"
              value={filters.month}
              onChange={(e) => setFilters({ ...filters, month: e.target.value })}
            >
              <option value="">All Months</option>
              {months.map(month => (
                <option key={month.id} value={`${month.year}-${month.month}`}>
                  {new Date(month.year, month.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Category</label>
            <select
              className="input"
              value={filters.category_id}
              onChange={(e) => setFilters({ ...filters, category_id: e.target.value })}
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.category_name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <div className="text-right w-full">
              <p className="text-sm text-gray-600">Total Expenses</p>
              <p className="text-2xl font-bold text-red-600">${totalExpenses.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No expenses found. Add a new expense to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(expense.expense_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {expense.category_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600">
                      ${parseFloat(expense.amount).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {expense.month && expense.year ? `${expense.month}/${expense.year}` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {expense.notes || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex justify-end space-x-2">
                        <button onClick={() => handleEdit(expense)} className="text-primary-600 hover:text-primary-900">
                          <PencilIcon className="h-5 w-5" />
                        </button>
                        <button onClick={() => handleDelete(expense)} className="text-red-600 hover:text-red-900">
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

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {editingExpense ? 'Edit Expense' : 'Add New Expense'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label mb-1">Category *</label>
                <select
                  required
                  className="input"
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                >
                  <option value="">Select Category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.category_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label mb-1">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="input"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label mb-1">Date *</label>
                <input
                  type="date"
                  required
                  className="input"
                  value={formData.expense_date}
                  onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label mb-1">Month (Optional)</label>
                <select
                  className="input"
                  value={formData.billing_month_id}
                  onChange={(e) => setFormData({ ...formData, billing_month_id: e.target.value })}
                >
                  <option value="">Select Month</option>
                  {months.map(month => (
                    <option key={month.id} value={month.id}>
                      {new Date(month.year, month.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label mb-1">Notes</label>
                <textarea
                  className="input"
                  rows="3"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 btn btn-primary">
                  {editingExpense ? 'Update' : 'Add'} Expense
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false)
                    setEditingExpense(null)
                    setFormData({ category_id: '', amount: '', expense_date: new Date().toISOString().split('T')[0], billing_month_id: '', notes: '' })
                  }}
                  className="flex-1 btn btn-outline"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                {editingCategory ? 'Edit Category' : 'Add New Category'}
              </h2>
              <button
                onClick={() => {
                  setShowCategoryModal(false)
                  setEditingCategory(null)
                  setCategoryFormData({ category_name: '', description: '' })
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={handleCategorySubmit} className="space-y-4">
              <div>
                <label className="form-label mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  className="input text-sm sm:text-base"
                  value={categoryFormData.category_name}
                  onChange={(e) => setCategoryFormData({ ...categoryFormData, category_name: e.target.value })}
                  placeholder="e.g., Maintenance, Books, Electricity"
                />
              </div>
              <div>
                <label className="form-label mb-1">Description (Optional)</label>
                <textarea
                  className="input text-sm sm:text-base"
                  rows="3"
                  value={categoryFormData.description}
                  onChange={(e) => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
                  placeholder="Brief description of this category"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4">
                <button type="submit" className="flex-1 btn btn-primary text-sm sm:text-base">
                  {editingCategory ? 'Update' : 'Create'} Category
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCategoryModal(false)
                    setEditingCategory(null)
                    setCategoryFormData({ category_name: '', description: '' })
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

