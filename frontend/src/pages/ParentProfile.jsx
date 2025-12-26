import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentArrowDownIcon,
  FunnelIcon
} from '@heroicons/react/24/outline'
import jsPDF from 'jspdf'

export default function ParentProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [parent, setParent] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedMonths, setExpandedMonths] = useState(new Set())
  const [filter, setFilter] = useState('all') // all, unpaid, partial, paid, overdue
  const { socket } = useSocket()
  const { branding } = useAuth()

  useEffect(() => {
    fetchProfile()
  }, [id])

  // Listen for real-time updates
  useEffect(() => {
    if (!socket || !id) return

    const handlePaymentCreated = (data) => {
      if (data.parent_id === parseInt(id)) {
        fetchProfile()
        toast.success('New payment received!', { icon: '💰' })
      }
    }

    const handleParentUpdated = (data) => {
      if (data.parent_id === parseInt(id)) {
        fetchProfile()
      }
    }

    socket.on('payment:created', handlePaymentCreated)
    socket.on('parent:updated', handleParentUpdated)

    return () => {
      socket.off('payment:created', handlePaymentCreated)
      socket.off('parent:updated', handleParentUpdated)
    }
  }, [socket, id])

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/students/${id}/profile`)
      setParent(response.data.student || response.data.parent)
      setTimeline(response.data.timeline)
    } catch (error) {
      toast.error('Failed to fetch parent profile')
    } finally {
      setLoading(false)
    }
  }

  const toggleMonth = (monthKey) => {
    const newExpanded = new Set(expandedMonths)
    if (newExpanded.has(monthKey)) {
      newExpanded.delete(monthKey)
    } else {
      newExpanded.add(monthKey)
    }
    setExpandedMonths(newExpanded)
  }

  const getStatusBadge = (status, isOverdue) => {
    if (isOverdue) {
      return 'bg-red-100 text-red-800 border-red-300'
    }
    const badges = {
      paid: 'bg-green-100 text-green-800 border-green-300',
      unpaid: 'bg-red-100 text-red-800 border-red-300',
      partial: 'bg-orange-100 text-orange-800 border-orange-300',
      advanced: 'bg-blue-100 text-blue-800 border-blue-300'
    }
    return badges[status] || 'bg-gray-100 text-gray-800 border-gray-300'
  }

  const getStatusText = (status, isOverdue, advanceMonths = 0) => {
    if (isOverdue) return 'Overdue'
    if (status === 'advanced' && advanceMonths > 0) {
      return `Advanced (${advanceMonths} month${advanceMonths !== 1 ? 's' : ''})`
    }
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  const getPaymentTypeText = (type) => {
    const types = {
      normal: 'Normal Payment',
      partial: 'Partial Payment',
      advance: 'Advance Payment',
      carry_forward: 'Carry Forward Payment'
    }
    return types[type] || type
  }

  const getItemTypeText = (type) => {
    const types = {
      monthly_fee: 'Monthly Fee',
      carried_forward: 'Carried Forward',
      advance: 'Advance'
    }
    return types[type] || type
  }

  const filteredTimeline = timeline.filter(month => {
    if (filter === 'all') return true
    if (filter === 'unpaid') return month.status === 'unpaid' || month.is_overdue
    if (filter === 'partial') return month.status === 'partial'
    if (filter === 'paid') return month.status === 'paid'
    if (filter === 'overdue') return month.is_overdue
    return true
  })

  const exportToExcel = () => {
    // Create CSV content
    let csv = 'Month,Year,Monthly Fee,Carried Forward,Total Due,Amount Paid,Outstanding,Status\n'
    
    filteredTimeline.forEach(month => {
      csv += `"${month.month_name} ${month.year}",${month.year},${month.monthly_fee},${month.carried_forward_amount},${month.total_due_this_month},${month.amount_paid_this_month},${month.outstanding_after_payment},"${getStatusText(month.status, month.is_overdue, month.advance_months_remaining)}"\n`
    })

    // Create blob and download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${parent?.student_name || parent?.parent_name || 'student'}_Fee_Timeline.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Timeline exported to CSV')
  }

  const exportToPDF = () => {
    const doc = new jsPDF()
    
    // School Header
    doc.setFontSize(20)
    doc.text(branding?.school?.name || 'FEE-KULMIS', 105, 20, { align: 'center' })
    doc.setFontSize(14)
    doc.text('Student Fee Timeline Report', 105, 30, { align: 'center' })
    
    // Parent Info
    doc.setFontSize(12)
    doc.text(`Student: ${parent?.student_name || parent?.parent_name}`, 20, 45)
    doc.text(`Guardian: ${parent?.guardian_name || parent?.parent_name}`, 20, 52)
    doc.text(`Phone: ${parent?.guardian_phone_number || parent?.phone_number}`, 20, 59)
    doc.text(`Monthly Fee: $${parseFloat(parent?.monthly_fee_amount || 0).toLocaleString()}`, 20, 66)
    
    // Timeline Table
    let yPos = 80
    const pageHeight = doc.internal.pageSize.height
    const rowHeight = 8
    
    // Table Header
    doc.setFontSize(10)
    doc.setFont(undefined, 'bold')
    doc.text('Month', 20, yPos)
    doc.text('Fee', 60, yPos)
    doc.text('Carried', 80, yPos)
    doc.text('Total Due', 100, yPos)
    doc.text('Paid', 130, yPos)
    doc.text('Outstanding', 150, yPos)
    doc.text('Status', 180, yPos)
    
    yPos += 5
    doc.setDrawColor(200, 200, 200)
    doc.line(20, yPos, 190, yPos)
    yPos += 5
    
    doc.setFont(undefined, 'normal')
    filteredTimeline.forEach((month, index) => {
      // Check if we need a new page
      if (yPos > pageHeight - 20) {
        doc.addPage()
        yPos = 20
      }
      
      doc.setFontSize(9)
      doc.text(`${month.month_name.substring(0, 3)} ${month.year}`, 20, yPos)
      doc.text(`$${month.monthly_fee.toLocaleString()}`, 60, yPos)
      doc.text(`$${month.carried_forward_amount.toLocaleString()}`, 80, yPos)
      doc.text(`$${month.total_due_this_month.toLocaleString()}`, 100, yPos)
      doc.text(`$${month.amount_paid_this_month.toLocaleString()}`, 130, yPos)
      doc.text(`$${month.outstanding_after_payment.toLocaleString()}`, 150, yPos)
      doc.text(getStatusText(month.status, month.is_overdue, month.advance_months_remaining), 180, yPos)
      
      yPos += rowHeight
    })
    
    doc.save(`${parent?.student_name || parent?.parent_name || 'student'}_Fee_Timeline.pdf`)
    toast.success('Timeline exported to PDF')
  }

  const generateReceiptPDF = async (transaction) => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    
    // Try to add logo
    try {
      const logoUrl = branding?.school?.logo_path || '/systemlogo.png'
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = logoUrl
      
      await new Promise((resolve, reject) => {
        img.onload = () => {
          try {
            const logoSize = 30
            const logoX = (pageWidth - logoSize) / 2
            doc.addImage(img, 'JPEG', logoX, 15, logoSize, logoSize)
            resolve()
          } catch (e) {
            console.log('Could not add logo image, using text instead')
            resolve()
          }
        }
        img.onerror = () => resolve()
        setTimeout(() => resolve(), 1000) // Timeout after 1 second
      })
    } catch (e) {
      console.log('Logo loading failed, continuing without logo')
    }
    
    // School Header (centered) - Compact design
    let yPos = 50  // Start below logo area
    
    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(30, 58, 138) // Blue color
    doc.text(branding?.school?.name || 'FEE-KULMIS', pageWidth / 2, yPos, { align: 'center' })
    
    yPos += 7
    doc.setFontSize(12)
    doc.setFont(undefined, 'normal')
    doc.setTextColor(0, 0, 0)
    doc.text('Fee Payment Receipt', pageWidth / 2, yPos, { align: 'center' })
    
    // Decorative line
    yPos += 8
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.5)
    doc.line(20, yPos, pageWidth - 20, yPos)
    
    yPos += 10
    
    // Parent Information Section - Compact inline layout
    doc.setFontSize(10)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(0, 0, 0)
    
    const parentInfo = [
      `Student: ${String(parent?.student_name || parent?.parent_name || 'N/A')}`,
      `Guardian: ${String(parent?.guardian_name || parent?.parent_name || 'N/A')}`,
      `Phone: ${String(parent?.guardian_phone_number || parent?.phone_number || 'N/A')}`
    ]
    
    parentInfo.forEach((info, idx) => {
      doc.setFont(undefined, idx === 0 ? 'bold' : 'normal')
      doc.text(info, 20, yPos)
      yPos += 5
    })
    
    yPos += 8
    
    // Payment Details Table Header - Compact
    doc.setDrawColor(30, 58, 138)
    doc.setFillColor(30, 58, 138)
    doc.rect(20, yPos, pageWidth - 40, 6, 'F')
    
    doc.setFontSize(10)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('Payment Details', 22, yPos + 4.5)
    
    yPos += 9
    
    // Table headers - Compact
    doc.setFillColor(245, 247, 250)
    doc.rect(20, yPos, pageWidth - 40, 6, 'F')
    doc.setDrawColor(200, 200, 200)
    doc.rect(20, yPos, pageWidth - 40, 6, 'S')
    
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('Field', 22, yPos + 4.5)
    doc.text('Value', 100, yPos + 4.5)
    
    yPos += 8
    
    // Table rows - Compact
    const paymentData = [
      ['Receipt Number', `#${transaction.id}`],
      ['Payment Date', new Date(transaction.payment_date).toLocaleString()],
      ['Amount Paid', `$${parseFloat(transaction.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ['Payment Type', getPaymentTypeText(transaction.payment_type)],
      ['Collected By', transaction.collected_by_username || 'N/A']
    ]
    
    doc.setFont(undefined, 'normal')
    paymentData.forEach(([label, value], index) => {
      const isEven = index % 2 === 0
      if (isEven) {
        doc.setFillColor(250, 250, 250)
        doc.rect(20, yPos, pageWidth - 40, 6, 'F')
      }
      doc.setDrawColor(200, 200, 200)
      doc.rect(20, yPos, pageWidth - 40, 6, 'S')
      
      doc.setFontSize(9)
      doc.setFont(undefined, 'bold')
      doc.text(String(label), 22, yPos + 4.5)
      doc.setFont(undefined, 'normal')
      // Truncate long text to fit on one line
      const valueText = String(value)
      const truncatedValue = doc.splitTextToSize(valueText, pageWidth - 110)[0]
      doc.text(truncatedValue, 100, yPos + 4.5)
      yPos += 7
    })
    
    yPos += 8
    
    // Payment Breakdown Table (if items exist) - Compact
    if (transaction.items && transaction.items.length > 0) {
      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.text('Payment Breakdown', 20, yPos)
      
      yPos += 7
      
      // Breakdown table header
      doc.setFillColor(245, 247, 250)
      doc.rect(20, yPos, pageWidth - 40, 6, 'F')
      doc.setDrawColor(200, 200, 200)
      doc.rect(20, yPos, pageWidth - 40, 6, 'S')
      
      doc.setFontSize(9)
      doc.setFont(undefined, 'bold')
      doc.text('Item Type', 22, yPos + 4.5)
      doc.text('Amount', pageWidth - 50, yPos + 4.5, { align: 'right' })
      
      yPos += 8
      
      // Breakdown rows - Compact
      transaction.items.forEach((item, index) => {
        const isEven = index % 2 === 0
        if (isEven) {
          doc.setFillColor(250, 250, 250)
          doc.rect(20, yPos, pageWidth - 40, 6, 'F')
        }
        doc.setDrawColor(200, 200, 200)
        doc.rect(20, yPos, pageWidth - 40, 6, 'S')
        
        doc.setFontSize(9)
        doc.setFont(undefined, 'normal')
        const itemTypeText = getItemTypeText(item.item_type) || 'Unknown'
        const itemAmount = parseFloat(item.amount || 0)
        doc.text(String(itemTypeText), 22, yPos + 4.5)
        doc.text(`$${itemAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - 50, yPos + 4.5, { align: 'right' })
        yPos += 7
      })
      
      yPos += 7
    }
    
    // SMS Text Section - Compact
    if (transaction.sms_text) {
      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.text('SMS Notification Text', 20, yPos)
      
      yPos += 7
      doc.setDrawColor(200, 200, 200)
      doc.setFillColor(255, 255, 240)
      
      const splitText = doc.splitTextToSize(transaction.sms_text, pageWidth - 50)
      const smsHeight = Math.min(splitText.length * 4 + 8, 30) // Limit height
      doc.roundedRect(20, yPos, pageWidth - 40, smsHeight, 2, 2, 'FD')
      
      doc.setFontSize(8)
      doc.setFont(undefined, 'normal')
      doc.setTextColor(60, 60, 60)
      doc.text(splitText.slice(0, 4), 25, yPos + 5) // Limit to 4 lines max
      yPos += smsHeight + 8
    }
    
    // Footer - Always at bottom
    yPos = pageHeight - 25
    doc.setDrawColor(200, 200, 200)
    doc.line(20, yPos, pageWidth - 20, yPos)
    
    yPos += 7
    doc.setFontSize(9)
    doc.setFont(undefined, 'italic')
    doc.setTextColor(100, 100, 100)
    doc.text('Thank you for your payment!', pageWidth / 2, yPos, { align: 'center' })
    
    yPos += 5
    doc.setFontSize(7)
    doc.text('This is a computer-generated receipt.', pageWidth / 2, yPos, { align: 'center' })
    
    doc.save(`receipt-${transaction.id}.pdf`)
    toast.success('Receipt downloaded')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center space-x-2 sm:space-x-4">
          <button onClick={() => navigate('/students')} className="btn btn-outline flex-shrink-0">
            <ArrowLeftIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 truncate">
              {parent?.student_name || parent?.parent_name}
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">Monthly Fee Timeline</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button onClick={exportToExcel} className="btn btn-outline flex-1 sm:flex-none text-sm">
            <DocumentArrowDownIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            <span className="hidden sm:inline">Export Excel</span>
            <span className="sm:hidden">Excel</span>
          </button>
          <button onClick={exportToPDF} className="btn btn-outline flex-1 sm:flex-none text-sm">
            <DocumentArrowDownIcon className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
            <span className="hidden sm:inline">Export PDF</span>
            <span className="sm:hidden">PDF</span>
          </button>
        </div>
      </div>

      {/* Parent Info Card */}
      {parent && (
        <div className="card p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">Parent Information</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div>
              <p className="text-xs sm:text-sm text-gray-600">Phone</p>
              <p className="font-semibold text-sm sm:text-base break-all">{parent.phone_number}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-600">Children</p>
              <p className="font-semibold text-sm sm:text-base">{parent.number_of_children}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-600">Monthly Fee</p>
              <p className="font-semibold text-sm sm:text-base">${parseFloat(parent.monthly_fee_amount).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-600">Total Outstanding</p>
              <p className="font-semibold text-sm sm:text-base text-red-600">
                ${parseFloat(parent.total_outstanding || 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-3 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto mb-2 sm:mb-0">
            <FunnelIcon className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 flex-shrink-0" />
            <span className="font-medium text-gray-700 text-sm sm:text-base">Filter:</span>
          </div>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unpaid')}
            className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              filter === 'unpaid'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Unpaid
          </button>
          <button
            onClick={() => setFilter('partial')}
            className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              filter === 'partial'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Partial
          </button>
          <button
            onClick={() => setFilter('paid')}
            className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              filter === 'paid'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Paid
          </button>
          <button
            onClick={() => setFilter('overdue')}
            className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              filter === 'overdue'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Overdue
          </button>
        </div>
      </div>

      {/* Timeline - Desktop Table View */}
      <div className="hidden lg:block card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12"></th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Month & Year
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monthly Fee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Carried Forward
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Due
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount Paid
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Outstanding
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTimeline.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                    No months found matching the selected filter.
                  </td>
                </tr>
              ) : (
                filteredTimeline.map((month) => {
                  const monthKey = `${month.year}-${month.month}`
                  const isExpanded = expandedMonths.has(monthKey)
                  
                  return (
                    <React.Fragment key={monthKey}>
                      <tr className={`hover:bg-gray-50 ${isExpanded ? 'bg-blue-50' : ''}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => toggleMonth(monthKey)}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            {isExpanded ? (
                              <ChevronDownIcon className="h-5 w-5" />
                            ) : (
                              <ChevronRightIcon className="h-5 w-5" />
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {month.month_name} {month.year}
                          </div>
                          {month.is_active && (
                            <div className="text-xs text-primary-600">Active Month</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          ${month.monthly_fee.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          ${month.carried_forward_amount.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                          ${month.total_due_this_month.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          ${month.amount_paid_this_month.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600">
                          ${month.outstanding_after_payment.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getStatusBadge(month.status, month.is_overdue)}`}>
                            {getStatusText(month.status, month.is_overdue, month.advance_months_remaining)}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan="8" className="px-6 py-4 bg-gray-50">
                            <div className="space-y-4">
                              <h4 className="font-semibold text-gray-900">Transactions for {month.month_name} {month.year}</h4>
                              {month.transactions.length === 0 ? (
                                <p className="text-sm text-gray-500">No transactions for this month.</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-100">
                                      <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Date & Time</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Amount</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Type</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Collected By</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                      {month.transactions.map((transaction) => (
                                        <tr key={transaction.id} className="hover:bg-gray-50">
                                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                            {new Date(transaction.payment_date).toLocaleString()}
                                          </td>
                                          <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                                            ${parseFloat(transaction.amount).toLocaleString()}
                                          </td>
                                          <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">
                                              {getPaymentTypeText(transaction.payment_type)}
                                              {transaction.payment_type === 'advance' && transaction.items && transaction.items.length > 0 && (
                                                <span className="ml-2 text-xs font-semibold text-blue-600">
                                                  ({transaction.items[0].months_covered || 0} month{transaction.items[0].months_covered !== 1 ? 's' : ''} paid)
                                                </span>
                                              )}
                                            </div>
                                            {transaction.items && transaction.items.length > 0 && (
                                              <div className="text-xs text-gray-500 mt-1">
                                                {transaction.items.map((item, idx) => (
                                                  <span key={idx}>
                                                    {getItemTypeText(item.item_type)}: ${parseFloat(item.amount).toLocaleString()}
                                                    {item.months_covered && item.months_covered > 1 && (
                                                      <span className="text-blue-600 font-semibold"> ({item.months_covered} months)</span>
                                                    )}
                                                    {idx < transaction.items.length - 1 && ', '}
                                                  </span>
                                                ))}
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                            {transaction.collected_by_username}
                                          </td>
                                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                                            <button
                                              onClick={() => generateReceiptPDF(transaction)}
                                              className="text-primary-600 hover:text-primary-900"
                                              title="View Receipt"
                                            >
                                              <DocumentArrowDownIcon className="h-5 w-5" />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Timeline - Mobile Card View */}
      <div className="lg:hidden space-y-4">
        {filteredTimeline.length === 0 ? (
          <div className="card p-6 text-center text-gray-500">
            No months found matching the selected filter.
          </div>
        ) : (
          filteredTimeline.map((month) => {
            const monthKey = `${month.year}-${month.month}`
            const isExpanded = expandedMonths.has(monthKey)
            
            return (
              <div key={monthKey} className={`card p-4 ${isExpanded ? 'bg-blue-50' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        onClick={() => toggleMonth(monthKey)}
                        className="text-gray-600 hover:text-gray-900 flex-shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronDownIcon className="h-5 w-5" />
                        ) : (
                          <ChevronRightIcon className="h-5 w-5" />
                        )}
                      </button>
                      <h3 className="text-base font-bold text-gray-900 truncate">
                        {month.month_name} {month.year}
                      </h3>
                    </div>
                    {month.is_active && (
                      <div className="text-xs text-primary-600 ml-7">Active Month</div>
                    )}
                  </div>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full border flex-shrink-0 ${getStatusBadge(month.status, month.is_overdue)}`}>
                    {getStatusText(month.status, month.is_overdue, month.advance_months_remaining)}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm ml-7">
                  <div>
                    <p className="text-xs text-gray-600">Monthly Fee</p>
                    <p className="font-semibold">${month.monthly_fee.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Carried Forward</p>
                    <p className="font-semibold text-orange-600">${month.carried_forward_amount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Total Due</p>
                    <p className="font-semibold text-gray-900">${month.total_due_this_month.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Amount Paid</p>
                    <p className="font-semibold text-green-600">${month.amount_paid_this_month.toLocaleString()}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-600">Outstanding</p>
                    <p className="font-bold text-red-600 text-base">${month.outstanding_after_payment.toLocaleString()}</p>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-200 ml-7">
                    <h4 className="font-semibold text-gray-900 mb-3 text-sm">Transactions</h4>
                    {month.transactions.length === 0 ? (
                      <p className="text-sm text-gray-500">No transactions for this month.</p>
                    ) : (
                      <div className="space-y-3">
                        {month.transactions.map((transaction) => (
                          <div key={transaction.id} className="bg-white rounded-lg p-3 border border-gray-200">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-500 mb-1">
                                  {new Date(transaction.payment_date).toLocaleString()}
                                </p>
                                <p className="font-bold text-base text-gray-900">
                                  ${parseFloat(transaction.amount).toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-600 mt-1">
                                  {getPaymentTypeText(transaction.payment_type)}
                                  {transaction.payment_type === 'advance' && transaction.items && transaction.items.length > 0 && transaction.items[0].months_covered && (
                                    <span className="ml-2 text-xs font-semibold text-blue-600">
                                      ({transaction.items[0].months_covered} month{transaction.items[0].months_covered !== 1 ? 's' : ''} paid)
                                    </span>
                                  )}
                                </p>
                                {transaction.items && transaction.items.length > 0 && (
                                  <div className="text-xs text-gray-500 mt-2 space-y-1">
                                    {transaction.items.map((item, idx) => (
                                      <div key={idx} className="bg-gray-50 px-2 py-1 rounded">
                                        {getItemTypeText(item.item_type)}: ${parseFloat(item.amount).toLocaleString()}
                                        {item.months_covered && item.months_covered > 1 && (
                                          <span className="text-blue-600 font-semibold ml-1">({item.months_covered} months)</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => generateReceiptPDF(transaction)}
                                className="text-primary-600 hover:text-primary-900 flex-shrink-0 ml-2"
                                title="View Receipt"
                              >
                                <DocumentArrowDownIcon className="h-5 w-5" />
                              </button>
                            </div>
                            <p className="text-xs text-gray-500">
                              Collected by: {transaction.collected_by_username}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

