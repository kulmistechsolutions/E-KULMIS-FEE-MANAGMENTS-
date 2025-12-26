import { useState, useEffect } from 'react'
import api from '../utils/api'
import {
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CheckCircleIcon,
  AcademicCapIcon,
  BanknotesIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const COLORS = ['#22c55e', '#f97316', '#ef4444', '#3b82f6']

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [teacherSalarySummary, setTeacherSalarySummary] = useState(null)
  const [expensesSummary, setExpensesSummary] = useState(null)
  const [trend, setTrend] = useState([])
  const [distribution, setDistribution] = useState([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [selectedMonth])

  const fetchData = async () => {
    try {
      setLoading(true)
      const params = selectedMonth ? { month: selectedMonth } : {}
      
      // Fetch parent fees summary
      const summaryResponse = await api.get('/reports/summary', { params })
      setSummary(summaryResponse.data.summary)
      setTrend(summaryResponse.data.trend)
      setDistribution(summaryResponse.data.distribution)
      
      // Fetch teacher salary summary
      try {
        const salaryResponse = await api.get('/teachers/salary/summary', { params })
        setTeacherSalarySummary(salaryResponse.data.summary)
      } catch (error) {
        console.error('Failed to fetch teacher salary summary:', error)
        setTeacherSalarySummary(null)
      }
      
      // Fetch expenses summary
      try {
        const expensesResponse = await api.get('/expenses/summary', { params })
        setExpensesSummary(expensesResponse.data.summary)
      } catch (error) {
        console.error('Failed to fetch expenses summary:', error)
        setExpensesSummary(null)
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const kpiCards = [
    {
      title: 'Total Collected',
      value: `$${parseFloat(summary?.total_collected || 0).toLocaleString()}`,
      icon: CurrencyDollarIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      title: 'Total Outstanding',
      value: `$${parseFloat(summary?.total_outstanding || 0).toLocaleString()}`,
      icon: ExclamationTriangleIcon,
      color: 'text-red-600',
      bgColor: 'bg-red-50'
    },
    {
      title: 'Partial Payments',
      value: summary?.partial_count || 0,
      icon: ClockIcon,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    },
    {
      title: 'Total Advance',
      value: `$${parseFloat(summary?.total_advance_value || 0).toLocaleString()}`,
      icon: CheckCircleIcon,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    }
  ]

  const teacherSalaryCards = [
    {
      title: 'Total Teachers',
      value: teacherSalarySummary?.total_teachers || 0,
      icon: AcademicCapIcon,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      title: 'Total Salary Paid This Month',
      value: `$${parseFloat(teacherSalarySummary?.total_salary_paid || 0).toLocaleString()}`,
      icon: BanknotesIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      title: 'Total Outstanding This Month',
      value: `$${parseFloat(teacherSalarySummary?.total_salary_outstanding || 0).toLocaleString()}`,
      icon: ExclamationTriangleIcon,
      color: 'text-red-600',
      bgColor: 'bg-red-50'
    }
  ]

  const expensesCards = [
    {
      title: 'Total Expenses',
      value: `$${parseFloat(expensesSummary?.total_expenses || 0).toLocaleString()}`,
      icon: DocumentTextIcon,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    }
  ]

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Overview of fee collection and payments</p>
        </div>
        <div className="w-full sm:w-auto flex-shrink-0">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input w-full sm:w-48"
          />
        </div>
      </div>

      {/* Parent Fees KPI Cards */}
      <div>
        <h2 className="dash-section-title">Parent Fees Summary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 w-full">
          {kpiCards.map((card, index) => (
            <div key={index} className="card hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="kpi-label truncate">{card.title}</p>
                  <p className={`kpi-value ${card.color}`}>{card.value}</p>
                </div>
                <div className={`${card.bgColor} p-3 rounded-lg flex-shrink-0 ml-3`}>
                  <card.icon className={`h-6 w-6 sm:h-8 sm:w-8 ${card.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Teacher Salary KPI Cards */}
      {teacherSalarySummary && (
        <div>
          <h2 className="dash-section-title">Teacher Salary Summary</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 w-full">
            {teacherSalaryCards.map((card, index) => (
              <div key={index} className="card hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="kpi-label truncate">{card.title}</p>
                    <p className={`kpi-value ${card.color}`}>{card.value}</p>
                  </div>
                  <div className={`${card.bgColor} p-3 rounded-lg flex-shrink-0 ml-3`}>
                    <card.icon className={`h-6 w-6 sm:h-8 sm:w-8 ${card.color}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expenses KPI Cards */}
      {expensesSummary && (
        <div>
          <h2 className="dash-section-title">Expenses Summary</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 w-full">
            {expensesCards.map((card, index) => (
              <div key={index} className="card hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="kpi-label truncate">{card.title}</p>
                    <p className={`kpi-value ${card.color}`}>{card.value}</p>
                  </div>
                  <div className={`${card.bgColor} p-3 rounded-lg flex-shrink-0 ml-3`}>
                    <card.icon className={`h-6 w-6 sm:h-8 sm:w-8 ${card.color}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 w-full">
        {/* Collection Trend */}
        <div className="card w-full">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Monthly Collection Trend</h3>
          <div className="w-full overflow-x-auto">
            <ResponsiveContainer width="100%" height={280} minHeight={250}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="collected" stroke="#22c55e" strokeWidth={2} name="Collected" />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </div>

        {/* Status Distribution */}
        <div className="card w-full">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Payment Status Distribution</h3>
          <div className="w-full overflow-x-auto">
            <ResponsiveContainer width="100%" height={280} minHeight={250}>
            <PieChart>
              <Pie
                data={distribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="count"
              >
                {distribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="card w-full">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Collection by Month</h3>
        <div className="w-full overflow-x-auto">
          <ResponsiveContainer width="100%" height={300} minHeight={280}>
          <BarChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="collected" fill="#22c55e" name="Collected Amount" />
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

