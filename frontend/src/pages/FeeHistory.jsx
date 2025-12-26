import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { ArrowLeftIcon, DocumentArrowDownIcon, ClipboardIcon } from '@heroicons/react/24/outline'
import jsPDF from 'jspdf'
import { useAuth } from '../contexts/AuthContext'
import { resolveApiAssetUrl } from '../utils/url'

export default function FeeHistory() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [parent, setParent] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const { branding } = useAuth()

  useEffect(() => {
    fetchData()
  }, [id])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [parentRes, historyRes] = await Promise.all([
        api.get(`/students/${id}`),
        api.get(`/students/${id}/history`)
      ])
      setParent(parentRes.data)
      setHistory(historyRes.data)
    } catch (error) {
      toast.error('Failed to fetch history')
    } finally {
      setLoading(false)
    }
  }

  const generatePDF = async (payment) => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    
    // Try to add logo
    try {
      const logoUrl = resolveApiAssetUrl(branding?.school?.logo_path) || '/systemlogo.png'
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
      `Student: ${String(payment.student_name || 'N/A')}`,
      `Guardian: ${String(payment.guardian_name || 'N/A')}`,
      `Phone: ${String(payment.guardian_phone_number || 'N/A')}`
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
      ['Receipt Number', `#${payment.id}`],
      ['Payment Date', new Date(payment.payment_date).toLocaleString()],
      ['Billing Month', `${payment.month}/${payment.year}`],
      ['Amount Paid', `$${parseFloat(payment.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ['Payment Type', (payment.payment_type?.charAt(0).toUpperCase() + payment.payment_type?.slice(1)) || 'Normal'],
      ['Collected By', payment.collected_by_username || 'N/A']
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
    
    // SMS Text Section - Compact
    if (payment.sms_text) {
      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.text('SMS Notification Text', 20, yPos)
      
      yPos += 7
      doc.setDrawColor(200, 200, 200)
      doc.setFillColor(255, 255, 240)
      
      const splitText = doc.splitTextToSize(payment.sms_text, pageWidth - 50)
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
    
    doc.save(`receipt-${payment.id}.pdf`)
    toast.success('Receipt downloaded')
  }

  const copySMSText = (smsText) => {
    navigator.clipboard.writeText(smsText)
    toast.success('SMS text copied to clipboard')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <button onClick={() => navigate('/students')} className="btn btn-outline">
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Back
        </button>
        <h1 className="text-3xl font-bold text-gray-900">
          Fee History - {parent?.student_name || parent?.parent_name}
        </h1>
      </div>

      {parent && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Student Information</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Guardian Phone</p>
              <p className="font-semibold">{parent.guardian_phone_number || parent.phone_number}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Class / Section</p>
              <p className="font-semibold">{parent.class_section || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Monthly Fee</p>
              <p className="font-semibold">${parseFloat(parent.monthly_fee_amount).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Outstanding</p>
              <p className="font-semibold text-red-600">
                ${parseFloat(parent.total_outstanding || 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Collected By</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {history.map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(payment.payment_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {payment.month}/{payment.year}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                    ${parseFloat(payment.amount).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                      {payment.payment_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {payment.collected_by_username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      {payment.sms_text && (
                        <button
                          onClick={() => copySMSText(payment.sms_text)}
                          className="text-gray-600 hover:text-gray-900"
                          title="Copy SMS Text"
                        >
                          <ClipboardIcon className="h-5 w-5" />
                        </button>
                      )}
                      <button
                        onClick={() => generatePDF(payment)}
                        className="text-primary-600 hover:text-primary-900"
                        title="Download Receipt"
                      >
                        <DocumentArrowDownIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

