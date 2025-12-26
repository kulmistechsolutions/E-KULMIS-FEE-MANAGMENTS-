import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

const SCHOOL_FEATURES = [
  'Students Management',
  'Fee Collection',
  'Invoices & Receipts',
  'Monthly Setup',
  'Reports & Exports (PDF/Excel)',
  'Users & Roles',
  'Teachers & Salaries',
  'Expenses',
  'School Branding',
  'User Monitoring'
]

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const canSubmit = useMemo(() => username.trim() && password, [username, password])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!username || !password) {
      toast.error('Please enter username and password')
      return
    }

    setLoading(true)

    try {
      const u = await login(username, password)
      toast.success('Login successful!')
      if (u?.role === 'super_admin') {
        navigate('/platform/schools')
      } else {
        navigate('/')
      }
    } catch (error) {
      console.error('Login error:', error)
      if (error.response?.status === 401) {
        toast.error('Invalid username or password')
      } else if (error.response?.status === 405) {
        toast.error('Server configuration error. Please contact administrator.')
      } else if (!error.response) {
        toast.error('Cannot connect to server. Please check your connection or contact administrator.')
      } else if (error.response?.data?.error) {
        toast.error(error.response.data.error)
      } else {
        toast.error('Login failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="min-h-screen flex items-center justify-center py-10 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          {/* Left: brand/intro */}
          <div className="hidden lg:flex flex-col justify-center">
            <div className="flex items-center gap-4">
              <img
                src="/systemlogo.png"
                alt="FEE-KULMIS"
                className="h-16 w-16 rounded-2xl shadow-md object-cover bg-white"
              />
              <div>
                <div className="text-3xl font-extrabold text-gray-900">FEE-KULMIS</div>
                <div className="text-sm text-gray-600 mt-1">School fee management system</div>
              </div>
            </div>

            <div className="mt-8">
              <div className="font-semibold text-gray-900">What your school gets</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {SCHOOL_FEATURES.map((f) => (
                  <div key={f} className="bg-white/70 border border-gray-100 rounded-xl px-3 py-2 text-sm text-gray-700">
                    {f}
                  </div>
                ))}
              </div>
              <div className="mt-6 text-xs text-gray-500">
                Tip: Use your <span className="font-semibold">username or email</span> to login.
              </div>
            </div>
          </div>

          {/* Right: login form */}
          <div className="flex items-center justify-center">
            <div className="w-full max-w-md space-y-6 sm:space-y-8">
              <div className="text-center lg:hidden">
                <div className="flex justify-center mb-4 sm:mb-6">
                  <img
                    src="/systemlogo.png"
                    alt="FEE-KULMIS"
                    className="h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-white shadow-xl object-cover"
                  />
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">FEE-KULMIS</h2>
                <p className="mt-2 text-sm sm:text-base text-gray-600">School Fee Management System</p>
              </div>

              <form className="space-y-5 sm:space-y-6 bg-white p-6 sm:p-8 rounded-xl shadow-xl border border-gray-100" onSubmit={handleSubmit}>
                <div className="space-y-4 sm:space-y-5">
                  <div>
                    <label htmlFor="username" className="form-label">
                      Username / Email
                    </label>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      required
                      autoComplete="username"
                      className="input"
                      placeholder="Enter your username or email"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="form-label">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        className="input pr-12"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-2 inline-flex items-center justify-center w-10 text-gray-500 hover:text-gray-700"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        disabled={loading}
                      >
                        {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !canSubmit}
                  className="w-full btn btn-primary py-3 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-shadow"
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Signing in...
                    </span>
                  ) : (
                    'Sign in'
                  )}
                </button>

                <div className="text-xs text-gray-500 text-center">
                  © {new Date().getFullYear()} FEE-KULMIS
                </div>
              </form>

              {/* Mobile features */}
              <div className="lg:hidden card p-4">
                <div className="font-semibold text-gray-900">What your school gets</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SCHOOL_FEATURES.map((f) => (
                    <span key={f} className="text-xs px-2 py-1 rounded-full bg-primary-50 text-primary-800 border border-primary-100">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

