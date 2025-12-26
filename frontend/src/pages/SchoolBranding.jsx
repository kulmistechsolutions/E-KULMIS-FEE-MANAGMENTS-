import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { resolveApiAssetUrl } from '../utils/url'

export default function SchoolBranding() {
  const { branding, refreshBranding } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', logo: null })

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true)
        const res = await api.get('/schools/me')
        const s = res.data.school
        setForm({
          name: s?.name || '',
          email: s?.email || '',
          phone: s?.phone || '',
          logo: null
        })
      } catch (e) {
        toast.error(e.response?.data?.error || 'Failed to load school settings')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      const fd = new FormData()
      fd.append('name', form.name)
      if (form.email) fd.append('email', form.email)
      if (form.phone) fd.append('phone', form.phone)
      if (form.logo) fd.append('logo', form.logo)

      await api.put('/schools/me', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      await refreshBranding()
      toast.success('Branding updated')
    } catch (e2) {
      toast.error(e2.response?.data?.error || 'Failed to update branding')
    } finally {
      setSaving(false)
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
    <div className="w-full max-w-xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">School Branding</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">Update your school name and logo</p>
      </div>

      <div className="card p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <img
            src={resolveApiAssetUrl(branding?.school?.logo_path) || '/systemlogo.png'}
            alt={branding?.school?.name || 'School Logo'}
            className="h-12 w-12 rounded-full object-cover border"
          />
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 truncate">{branding?.school?.name || 'School'}</div>
            <div className="text-xs text-gray-500">Shown on dashboard, reports, and receipts</div>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="form-label mb-1">School Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label mb-1">Email</label>
              <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="form-label mb-1">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="form-label mb-1">Logo</label>
            <input type="file" accept="image/*" onChange={(e) => setForm({ ...form, logo: e.target.files?.[0] || null })} />
          </div>

          <button type="submit" className="btn btn-primary w-full" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  )
}


