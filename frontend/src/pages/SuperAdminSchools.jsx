import { useEffect, useMemo, useState } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { PlusIcon } from '@heroicons/react/24/outline'
import { resolveApiAssetUrl } from '../utils/url'

const INCLUDED_FEATURES = [
  'Students Management',
  'Fee Collection',
  'Invoices & Receipts',
  'Monthly Setup',
  'Reports & Exports (PDF/Excel)',
  'Users & Roles (School Admin / Staff)',
  'Teachers & Salaries',
  'Expenses',
  'School Branding',
  'User Monitoring',
]

const COMING_SOON = [
  'SMS Notifications',
  'Online Payments',
  'Parent Portal / Mobile App',
]

export default function SuperAdminSchools() {
  const [schools, setSchools] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    logo: null,
    admin_username: '',
    admin_email: '',
    admin_password: ''
  })

  const canSubmit = useMemo(() => {
    return (
      form.name.trim() &&
      form.admin_username.trim() &&
      form.admin_email.trim() &&
      form.admin_password.trim()
    )
  }, [form])

  const fetchSchools = async () => {
    try {
      setLoading(true)
      const res = await api.get('/schools/overview')
      setSchools(res.data.schools || [])
      setSummary(res.data.summary || null)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load schools')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSchools()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!canSubmit) return

    try {
      setSubmitting(true)
      const fd = new FormData()
      fd.append('name', form.name)
      if (form.email) fd.append('email', form.email)
      if (form.phone) fd.append('phone', form.phone)
      if (form.logo) fd.append('logo', form.logo)
      fd.append('admin_username', form.admin_username)
      fd.append('admin_email', form.admin_email)
      fd.append('admin_password', form.admin_password)

      await api.post('/schools', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      toast.success('School created')
      setShowCreate(false)
      setForm({
        name: '',
        email: '',
        phone: '',
        logo: null,
        admin_username: '',
        admin_email: '',
        admin_password: ''
      })
      fetchSchools()
    } catch (e2) {
      toast.error(e2.response?.data?.error || 'Failed to create school')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleSchoolStatus = async (school) => {
    const nextActive = !school.is_active
    const ok = window.confirm(
      nextActive
        ? `Activate "${school.name}"? Users will be able to login again.`
        : `Stop "${school.name}"? Users will not be able to login or use the system.`
    )
    if (!ok) return

    try {
      await api.put(`/schools/${school.id}`, { is_active: nextActive })
      toast.success(nextActive ? 'School activated' : 'School stopped')
      fetchSchools()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update school status')
    }
  }

  const deleteSchool = async (school) => {
    const ok = window.confirm(
      `Delete "${school.name}" permanently?\n\nThis will remove all students, fees, users, teachers, salaries and expenses for this school.\nThis cannot be undone.`
    )
    if (!ok) return

    try {
      await api.delete(`/schools/${school.id}`)
      toast.success('School deleted')
      fetchSchools()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to delete school')
    }
  }

  const formatMoney = (n) => {
    const num = Number(n || 0)
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6">
      <div className={`card overflow-hidden p-0 ${mounted ? 'animate-fade-slide-up' : ''}`}>
        <div className="px-5 sm:px-6 py-5 bg-gradient-to-r from-primary-600 to-secondary-600 text-white">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold">Super Admin Dashboard</h1>
              <p className="text-sm text-white/90 mt-1">
                Manage schools, view totals, stop/activate, and control the platform.
              </p>
            </div>
            <button onClick={() => setShowCreate(true)} className="btn bg-white text-primary-700 hover:bg-white/90">
              <PlusIcon className="h-5 w-5 mr-2" />
              Create School
            </button>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-5 bg-white">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              {summary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className={`card p-4 ${mounted ? 'animate-fade-slide-up' : ''}`} style={{ animationDelay: '60ms' }}>
                    <div className="text-xs text-gray-500">Total Schools</div>
                    <div className="text-2xl font-bold text-gray-900 mt-1">{summary.total_schools || 0}</div>
                  </div>
                  <div className={`card p-4 ${mounted ? 'animate-fade-slide-up' : ''}`} style={{ animationDelay: '120ms' }}>
                    <div className="text-xs text-gray-500">Total Students</div>
                    <div className="text-2xl font-bold text-gray-900 mt-1">{summary.total_students || 0}</div>
                  </div>
                  <div className={`card p-4 ${mounted ? 'animate-fade-slide-up' : ''}`} style={{ animationDelay: '180ms' }}>
                    <div className="text-xs text-gray-500">Fees Collected (Active Month)</div>
                    <div className="text-2xl font-bold text-gray-900 mt-1">${formatMoney(summary.total_collected_this_month || 0)}</div>
                  </div>
                </div>
              )}
            </div>

            <div className={`card p-4 ${mounted ? 'animate-fade-slide-up' : ''}`} style={{ animationDelay: '240ms' }}>
              <div className="font-bold text-gray-900">Features (per school)</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {INCLUDED_FEATURES.slice(0, 8).map((f) => (
                  <span key={f} className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-800 border border-green-100">
                    {f}
                  </span>
                ))}
              </div>
              <div className="mt-3 text-xs text-gray-500">
                + {Math.max(0, INCLUDED_FEATURES.length - 8)} more included modules
              </div>
              <div className="mt-4">
                <div className="text-xs font-semibold text-gray-700">Coming soon</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COMING_SOON.map((f) => (
                    <span key={f} className="text-xs px-2 py-1 rounded-full bg-gray-50 text-gray-700 border border-gray-100">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
          </div>
        ) : schools.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No schools yet. Create the first one.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">School</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Students</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Collected (Active Month)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {schools.map((s) => (
                  <tr key={s.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <img
                          src={resolveApiAssetUrl(s.logo_path) || '/systemlogo.png'}
                          alt={s.name}
                          className="h-9 w-9 rounded-full object-cover border"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 truncate">{s.name}</div>
                          <div className="text-xs text-gray-500">ID: {s.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {s.total_students ?? 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      ${formatMoney(s.total_collected_this_month || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{s.email || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{s.phone || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${s.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className={`btn btn-sm ${s.is_active ? 'btn-outline' : 'btn-primary'}`}
                          onClick={() => toggleSchoolStatus(s)}
                          title={s.is_active ? 'Stop school' : 'Activate school'}
                        >
                          {s.is_active ? 'Stop' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline text-red-600"
                          onClick={() => deleteSchool(s)}
                          title="Delete school"
                        >
                          Delete
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

      {showCreate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Create School</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="form-label mb-1">School Name</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="form-label mb-1">School Email</label>
                  <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <label className="form-label mb-1">School Phone</label>
                  <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="form-label mb-1">School Logo</label>
                <input type="file" accept="image/*" onChange={(e) => setForm({ ...form, logo: e.target.files?.[0] || null })} />
              </div>

              <div className="pt-2 border-t">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">First School Admin</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="form-label mb-1">Username</label>
                    <input className="input" value={form.admin_username} onChange={(e) => setForm({ ...form, admin_username: e.target.value })} required />
                  </div>
                  <div>
                    <label className="form-label mb-1">Email</label>
                    <input type="email" className="input" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} required />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="form-label mb-1">Password</label>
                  <input type="password" className="input" value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} required />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" className="btn btn-outline flex-1" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={!canSubmit || submitting}>
                  {submitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


