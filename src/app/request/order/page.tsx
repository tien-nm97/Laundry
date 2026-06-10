'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

interface LinenType {
  id: string
  name: string
  unit: string
}

interface Ward {
  id: string
  name: string
}

interface TicketItemResult {
  id: string
  quantity: number
  linenType: LinenType
}

interface TicketResult {
  id: string
  status: string
  requesterName: string
  createdAt: string
  items: TicketItemResult[]
}

function RequestOrderForm() {
  const searchParams = useSearchParams()
  const wardId = searchParams.get('wardId')
  const token = searchParams.get('token')

  const [ward, setWard] = useState<Ward | null>(null)
  const [linenTypes, setLinenTypes] = useState<LinenType[]>([])
  const [orderlies, setOrderlies] = useState<any[]>([])
  
  // Requester name selection state
  const [requesterName, setRequesterName] = useState('')

  // Dynamic rows of inputs
  const [rows, setRows] = useState<{ linenTypeId: string; quantity: number }[]>([
    { linenTypeId: '', quantity: 1 }
  ])

  // UI state
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successTicket, setSuccessTicket] = useState<TicketResult | null>(null)

  useEffect(() => {
    if (!wardId || !token) {
      setErrorMsg('Không tìm thấy thông tin khoa phòng. Vui lòng quét mã QR hợp lệ.')
      setLoading(false)
      return
    }

    validateAndFetch()
  }, [wardId, token])

  const validateAndFetch = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/request/order?wardId=${wardId}&token=${token}`)
      const data = await res.json()

      if (res.ok) {
        setWard(data.ward)
        setLinenTypes(data.linenTypes)
        setOrderlies(data.orderlies || [])
      } else {
        setErrorMsg(data.error || 'Mã truy cập QR không hợp lệ hoặc đã hết hạn.')
      }
    } catch (err) {
      setErrorMsg('Lỗi kết nối máy chủ. Vui lòng thử lại sau.')
    } finally {
      setLoading(false)
    }
  }

  const getAvailableLinenTypes = (currentRowId: string) => {
    const selectedIds = rows
      .map(r => r.linenTypeId)
      .filter(id => id !== '' && id !== currentRowId)
    return linenTypes.filter(lt => !selectedIds.includes(lt.id))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!requesterName) {
      alert('Vui lòng chọn nhân viên yêu cầu (Hộ lý).')
      return
    }

    const validRows = rows.filter(r => r.linenTypeId !== '' && r.quantity > 0)
    if (validRows.length === 0) {
      alert('Vui lòng chọn ít nhất một loại đồ vải và nhập số lượng hợp lệ.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/request/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wardId,
          token,
          requesterName,
          items: validRows,
        }),
      })
      const data = await res.json()

      if (res.ok) {
        setSuccessTicket(data)
        // Reset form
        setRequesterName('')
        setRows([{ linenTypeId: '', quantity: 1 }])
      } else {
        alert(data.error || 'Gửi yêu cầu thất bại.')
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ khi gửi yêu cầu.')
    } finally {
      setSubmitting(false)
    }
  }

  // Display Loader
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-[#0066b2] animate-spin" />
        <p className="text-slate-500 font-semibold text-sm mt-4">Đang xác thực mã QR khoa phòng...</p>
      </div>
    )
  }

  // Display Error State
  if (errorMsg) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-500 mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800">Không thể truy cập</h2>
        <p className="text-slate-600 mt-2 text-sm leading-relaxed">{errorMsg}</p>
        <div className="mt-6">
          <p className="text-xs text-slate-400">Vui lòng liên hệ Phòng Quản trị để được cấp lại mã QR mới.</p>
        </div>
      </div>
    )
  }

  // Display Success Page after ticket is submitted
  if (successTicket) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 animate-fade-in text-slate-800">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xl p-6 text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-500 mx-auto">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">Gửi yêu cầu thành công!</h2>
            <p className="text-slate-500 text-sm mt-1">Yêu cầu đồ vải của khoa phòng đã được ghi nhận.</p>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 text-left border border-slate-100 space-y-2">
            <div className="flex justify-between text-xs text-slate-500 border-b border-slate-200/60 pb-2">
              <span>Khoa phòng:</span>
              <span className="font-bold text-slate-800">{ward?.name}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500 border-b border-slate-200/60 pb-2">
              <span>Người yêu cầu:</span>
              <span className="font-bold text-slate-800">{successTicket.requesterName}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500 border-b border-slate-200/60 pb-2">
              <span>Mã phiếu:</span>
              <span className="font-mono font-bold text-slate-800">{successTicket.id.split('-')[0].toUpperCase()}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500 border-b border-slate-200/60 pb-2">
              <span>Trạng thái:</span>
              <span className="font-semibold text-amber-600">Đang chờ xử lý</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500 pb-1">
              <span>Thời gian gửi:</span>
              <span className="font-medium text-slate-700">
                {new Date(successTicket.createdAt).toLocaleTimeString('vi-VN')} - {new Date(successTicket.createdAt).toLocaleDateString('vi-VN')}
              </span>
            </div>
          </div>

          <div className="text-left space-y-3">
            <h3 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider">Danh sách yêu cầu:</h3>
            <div className="divide-y divide-slate-100">
              {successTicket.items.map((item) => (
                <div key={item.id} className="flex justify-between py-2.5 text-sm">
                  <span className="font-semibold text-slate-700">{item.linenType.name}</span>
                  <span className="font-bold text-[#0066b2] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100/50">
                    {item.quantity} {item.linenType.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setSuccessTicket(null)}
            className="w-full bg-[#0066b2] hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-md shadow-blue-600/10 cursor-pointer"
          >
            Tạo yêu cầu mới
          </button>
        </div>
      </div>
    )
  }

  // Display Request Form
  return (
    <div className="max-w-md mx-auto px-4 py-6 text-slate-800 animate-fade-in">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xl p-6 space-y-6">
        {/* Header */}
        <div className="text-center pb-4 border-b border-slate-100">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-[#0066b2] mx-auto mb-2 shadow-inner animate-pulse">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900">Yêu cầu Đồ vải Hàng ngày</h2>
          <p className="text-xs text-[#0066b2] font-bold bg-blue-50 px-3 py-1 rounded-full w-fit mx-auto mt-2 border border-blue-100/30">
            {ward?.name}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Requester orderly selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
              Nhân viên yêu cầu (Hộ lý) <span className="text-rose-500">*</span>
            </label>
            <select
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-800 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all cursor-pointer"
              required
            >
              <option value="">-- Chọn nhân viên yêu cầu --</option>
              {orderlies.map((o) => (
                <option key={o.id} value={o.name}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          {/* Dynamic rows */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Danh sách đồ vải yêu cầu:</h3>
            
            <div className="space-y-3">
              {rows.map((row, index) => {
                const availableLinenTypes = getAvailableLinenTypes(row.linenTypeId)
                return (
                  <div key={index} className="flex gap-2 items-center animate-fade-in">
                    <div className="flex-1 min-w-0">
                      <select
                        value={row.linenTypeId}
                        onChange={(e) => {
                          const newRows = [...rows]
                          newRows[index].linenTypeId = e.target.value
                          setRows(newRows)
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-800 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all cursor-pointer"
                      >
                        <option value="">-- Chọn loại đồ vải --</option>
                        {availableLinenTypes.map((lt) => (
                          <option key={lt.id} value={lt.id}>
                            {lt.name} ({lt.unit})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <input
                        type="number"
                        min="1"
                        value={row.quantity || ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value)
                          const newRows = [...rows]
                          newRows[index].quantity = val as number
                          setRows(newRows)
                        }}
                        placeholder="SL"
                        className="w-full text-center border border-slate-200 rounded-xl py-3 text-sm font-bold text-slate-950 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all"
                        required
                      />
                    </div>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setRows(rows.filter((_, i) => i !== index))}
                        className="w-11 h-11 bg-rose-50 border border-rose-100 hover:bg-rose-100/70 text-rose-600 rounded-xl flex items-center justify-center font-extrabold text-lg transition-colors cursor-pointer"
                        title="Xóa dòng"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => setRows([...rows, { linenTypeId: '', quantity: 1 }])}
              className="w-full border-2 border-dashed border-[#0066b2]/30 hover:border-[#0066b2]/60 hover:bg-[#0066b2]/5 text-[#0066b2] font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span className="text-base font-extrabold">⊕</span> Thêm loại đồ vải khác
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#0066b2] hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold py-3.5 rounded-xl text-sm transition-all shadow-md shadow-blue-600/10 cursor-pointer"
          >
            {submitting ? 'Đang gửi yêu cầu...' : 'Gửi phiếu yêu cầu'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function RequestOrderPage() {
  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col justify-center">
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-[#0066b2] animate-spin" />
          <p className="text-slate-500 font-semibold text-sm mt-4">Đang tải...</p>
        </div>
      }>
        <RequestOrderForm />
      </Suspense>
    </div>
  )
}
