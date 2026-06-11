'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtimeSync } from '@/lib/useRealtimeSync'

interface LinenType {
  id: string
  name: string
  unit: string
}

interface Batch {
  id: string
  code: string
  linenTypeId: string
  linenType: LinenType
  totalQuantity: number
  remainingQuantity: number
  importedAt: string
}

interface TicketItem {
  id: string
  quantity: number
  linenType: LinenType
}

interface Ticket {
  id: string
  wardId: string
  ward: { name: string }
  status: string
  createdAt: string
  items: TicketItem[]
}

interface Circulation {
  id: string
  batchId: string
  batch: { code: string }
  linenType: LinenType
  startUseDate: string
  originalQuantity: number
  activeQuantity: number
  discardedQuantity: number
  createdAt: string
}

interface ReportItem {
  id: string
  code: string
  linenType: { name: string; unit: string }
  totalQuantity: number
  remainingQuantity: number
  originalCirculationCount: number
  activeCirculationCount: number
  totalDiscarded: number
  averageLifespanDays: number
}

export default function LaundryDashboard() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'delivery' | 'circulation' | 'discard' | 'report'>('delivery')

  // Lists state
  const [pendingTickets, setPendingTickets] = useState<Ticket[]>([])
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)

  const [batches, setBatches] = useState<Batch[]>([])
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
  const [extractionQty, setExtractionQty] = useState<number | ''>('')
  const [startUseDate, setStartUseDate] = useState(new Date().toISOString().split('T')[0])

  const [circulations, setCirculations] = useState<Circulation[]>([])
  const [selectedCirculation, setSelectedCirculation] = useState<Circulation | null>(null)
  const [discardQty, setDiscardQty] = useState<number | ''>('')
  const [discardReason, setDiscardReason] = useState('')

  const [reports, setReports] = useState<ReportItem[]>([])
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null)

  // Loading & feedback
  const [loading, setLoading] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadTabData()
    setSelectedTicket(null)
    setSelectedBatch(null)
    setSelectedCirculation(null)
    setSelectedReport(null)
  }, [activeTab])

  const loadTabData = () => {
    if (activeTab === 'delivery') fetchPendingTickets()
    if (activeTab === 'circulation') {
      fetchBatches()
      fetchCirculations()
    }
    if (activeTab === 'discard') fetchCirculations()
    if (activeTab === 'report') fetchReports()
  }

  // Supabase Realtime: auto-refresh current tab when DB changes
  useRealtimeSync(
    ['Ticket', 'TicketItem', 'Batch', 'LinenCirculation', 'LinenDiscardLog'],
    () => loadTabData(),
    `laundry-${activeTab}-sync`
  )

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const fetchPendingTickets = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/laundry/tickets')
      if (res.ok) {
        const data = await res.json()
        setPendingTickets(data)
        if (data.length > 0) setSelectedTicket(data[0])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchBatches = async () => {
    try {
      const res = await fetch('/api/admin/batches')
      if (res.ok) {
        const data = await res.json()
        setBatches(data)
        if (data.length > 0) setSelectedBatch(data[0])
      }
    } catch (err) {
      console.error(err)
    }
  }

  const fetchCirculations = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/laundry/circulations')
      if (res.ok) {
        const data = await res.json()
        setCirculations(data)
        if (data.length > 0) setSelectedCirculation(data[0])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchReports = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/laundry/reports')
      if (res.ok) {
        const data = await res.json()
        setReports(data)
        if (data.length > 0) setSelectedReport(data[0])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleDeliverTicket = async (ticketId: string) => {
    try {
      const res = await fetch('/api/laundry/tickets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
      })
      if (res.ok) {
        showFeedback('success', 'Đã bàn giao đồ vải thành công!')
        fetchPendingTickets()
      } else {
        const data = await res.json()
        showFeedback('error', data.error || 'Bàn giao thất bại')
      }
    } catch (err) {
      showFeedback('error', 'Lỗi kết nối')
    }
  }

  const handleExtractCirculation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBatch || !extractionQty || !startUseDate) return

    try {
      const res = await fetch('/api/laundry/circulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatch.id,
          startUseDate: new Date(startUseDate).toISOString(),
          quantity: Number(extractionQty),
        }),
      })
      const data = await res.json()

      if (res.ok) {
        showFeedback('success', `Khai thác thành công ${extractionQty} đồ vải từ lô ${selectedBatch.code}!`)
        setExtractionQty('')
        fetchBatches()
        fetchCirculations()
      } else {
        showFeedback('error', data.error || 'Khai thác thất bại')
      }
    } catch (err) {
      showFeedback('error', 'Lỗi kết nối')
    }
  }

  const handleDiscardCirculation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCirculation || !discardQty) return

    try {
      const res = await fetch('/api/laundry/discards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linenCirculationId: selectedCirculation.id,
          quantity: Number(discardQty),
          reason: discardReason.trim(),
        }),
      })
      const data = await res.json()

      if (res.ok) {
        showFeedback('success', `Đã báo hỏng ${discardQty} đồ vải thành công!`)
        setDiscardQty('')
        setDiscardReason('')
        fetchCirculations()
      } else {
        showFeedback('error', data.error || 'Báo hỏng thất bại')
      }
    } catch (err) {
      showFeedback('error', 'Lỗi kết nối')
    }
  }

  const handleLogout = async () => {
    if (confirm('Bạn có chắc chắn muốn đăng xuất?')) {
      setLoggingOut(true)
      try {
        const res = await fetch('/api/auth/logout', { method: 'POST' })
        if (res.ok) {
          router.push('/login')
        }
      } catch (err) {
        console.error('Logout error:', err)
      } finally {
        setLoggingOut(false)
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6f9] text-slate-900 flex flex-col font-sans">
      {/* Header Becamex */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0066b2] to-blue-400 flex items-center justify-center font-bold text-white text-xl">
              L
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight text-[#0066b2]">BECAMEX HOSPITALS</span>
              <span className="text-xxs block text-slate-500 font-bold tracking-widest -mt-1 uppercase">Linen Operations</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-sm font-bold text-slate-800">Nguyễn Minh Tiến</span>
              <span className="text-xxs text-slate-400 font-semibold uppercase">Bộ phận Giặt là</span>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="px-3.5 py-1.5 border border-slate-200 hover:border-red-500/40 text-slate-600 hover:text-red-500 hover:bg-red-50 rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Tab & Main Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-blue-50 text-[#0066b2] rounded flex items-center justify-center font-bold">🩺</div>
          <h1 className="text-xl font-extrabold text-slate-900">Nghiệp vụ Hộ lý - Đồ vải</h1>
        </div>

        {/* Capsule navigation tabs */}
        <div className="flex flex-wrap gap-1 bg-slate-200/50 p-1 rounded-xl border border-slate-200 max-w-4xl">
          {[
            { id: 'delivery', name: 'Bàn giao đồ vải' },
            { id: 'circulation', name: 'Khai thác đồ vải' },
            { id: 'discard', name: 'Báo hỏng / Thanh lý' },
            { id: 'report', name: 'Báo cáo tuổi thọ' },
          ].map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-[#1e293b] text-white shadow'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/40'
                }`}
              >
                {tab.name}
              </button>
            )
          })}
        </div>

        {/* Feedback banner */}
        {message && (
          <div className={`p-4 rounded-xl border font-semibold text-sm ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
            {message.text}
          </div>
        )}

        {/* Main Tab Render Grid (Split Screen Layouts) */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-[#0066b2] rounded-full animate-spin" />
            <p className="text-slate-400 text-xs mt-3 font-medium">Đang tải...</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm min-h-[500px]">
            {/* Delivery View */}
            {activeTab === 'delivery' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left list: 30% */}
                <div className="lg:col-span-1 border-r border-slate-100 pr-0 lg:pr-6 space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Phiếu chờ giao</h3>
                  {pendingTickets.length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center">Không có phiếu yêu cầu nào.</p>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-auto">
                      {pendingTickets.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => setSelectedTicket(t)}
                          className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                            selectedTicket?.id === t.id
                              ? 'bg-blue-50/50 border-[#0066b2]/30'
                              : 'bg-slate-50 border-slate-100 hover:border-slate-300'
                          }`}
                        >
                          <h4 className="font-bold text-sm text-slate-800">{t.ward?.name}</h4>
                          <div className="flex justify-between text-xxs text-slate-500 font-semibold mt-1">
                            <span>#{t.id.split('-')[0].toUpperCase()}</span>
                            <span>{new Date(t.createdAt).toLocaleTimeString('vi-VN')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right panel: 70% */}
                <div className="lg:col-span-2 space-y-5 pl-0 lg:pl-6">
                  {selectedTicket ? (
                    <div className="space-y-4">
                      <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                        <h3 className="font-extrabold text-base text-slate-900">{selectedTicket.ward?.name}</h3>
                        <span className="font-mono text-xs font-semibold text-slate-400">#{selectedTicket.id.split('-')[0].toUpperCase()}</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {selectedTicket.items.map((item) => (
                          <div key={item.id} className="flex justify-between py-3 text-sm font-semibold">
                            <span className="text-slate-600">{item.linenType.name}</span>
                            <span className="text-slate-800">{item.quantity} {item.linenType.unit}</span>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => handleDeliverTicket(selectedTicket.id)}
                        className="w-full bg-[#0066b2] hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-sm transition-all cursor-pointer shadow-md shadow-blue-500/10"
                      >
                        Xác nhận Bàn giao (Giao đủ)
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-20 text-slate-400 text-sm">Vui lòng chọn một phiếu yêu cầu bên trái.</div>
                  )}
                </div>
              </div>
            )}

            {/* Extraction View */}
            {activeTab === 'circulation' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left list: 30% */}
                <div className="lg:col-span-1 border-r border-slate-100 pr-0 lg:pr-6 space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lô gốc nhập kho</h3>
                  <div className="space-y-2 max-h-[400px] overflow-auto">
                    {batches.filter((b) => b.remainingQuantity > 0).length === 0 ? (
                      <p className="text-sm text-slate-400 py-6 text-center">Không có lô hàng trống.</p>
                    ) : (
                      batches
                        .filter((b) => b.remainingQuantity > 0)
                        .map((batch) => (
                          <div
                            key={batch.id}
                            onClick={() => setSelectedBatch(batch)}
                            className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                              selectedBatch?.id === batch.id
                                ? 'bg-blue-50/50 border-[#0066b2]/30'
                                : 'bg-slate-50 border-slate-100 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex justify-between items-center mb-1">
                              <h4 className="font-bold text-sm text-slate-800">{batch.code}</h4>
                              <span className="text-xxs font-extrabold text-[#0066b2] bg-blue-50 px-2 py-0.5 rounded border border-blue-100/30">
                                Còn: {batch.remainingQuantity}
                              </span>
                            </div>
                            <p className="text-xxs text-slate-500 font-semibold">{batch.linenType?.name}</p>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* Right panel: 70% */}
                <div className="lg:col-span-2 space-y-5 pl-0 lg:pl-6">
                  {selectedBatch ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Extract form */}
                      <form onSubmit={handleExtractCirculation} className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                        <h3 className="font-bold text-sm text-slate-800 border-b border-slate-200 pb-2">Khai thác Lô {selectedBatch.code}</h3>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1 font-semibold">Số lượng đưa vào dùng</label>
                          <input
                            type="number"
                            min="1"
                            max={selectedBatch.remainingQuantity}
                            value={extractionQty}
                            onChange={(e) => setExtractionQty(e.target.value !== '' ? Number(e.target.value) : '')}
                            placeholder={`Tối đa ${selectedBatch.remainingQuantity}`}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1 font-semibold">Ngày bắt đầu sử dụng</label>
                          <input
                            type="date"
                            value={startUseDate}
                            onChange={(e) => setStartUseDate(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#0066b2] transition-all"
                            required
                          />
                        </div>
                        <button
                          type="submit"
                          className="w-full bg-[#0066b2] hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-xs transition-all cursor-pointer"
                        >
                          Đóng dấu bàn giao lưu thông
                        </button>
                      </form>

                      {/* Extraction history for this batch */}
                      <div className="space-y-3">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Đợt đã giao lưu thông</h3>
                        <div className="space-y-2 max-h-[250px] overflow-auto">
                          {circulations.filter((c) => c.batchId === selectedBatch.id).length === 0 ? (
                            <p className="text-xxs text-slate-400 py-4 text-center">Chưa có đợt khai thác nào.</p>
                          ) : (
                            circulations
                              .filter((c) => c.batchId === selectedBatch.id)
                              .map((c) => (
                                <div key={c.id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center text-xs">
                                  <div>
                                    <span className="font-bold text-slate-700">{c.activeQuantity} / {c.originalQuantity} {c.linenType?.unit}</span>
                                    <p className="text-xxs text-slate-400 font-semibold mt-0.5">Ngày: {new Date(c.startUseDate).toLocaleDateString('vi-VN')}</p>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-20 text-slate-400 text-sm">Vui lòng chọn một lô nhập gốc bên trái.</div>
                  )}
                </div>
              </div>
            )}

            {/* Discard View */}
            {activeTab === 'discard' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left list: 30% */}
                <div className="lg:col-span-1 border-r border-slate-100 pr-0 lg:pr-6 space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Đợt đang lưu thông</h3>
                  <div className="space-y-2 max-h-[400px] overflow-auto">
                    {circulations.filter((c) => c.activeQuantity > 0).length === 0 ? (
                      <p className="text-sm text-slate-400 py-6 text-center">Không có đồ vải lưu thông.</p>
                    ) : (
                      circulations
                        .filter((c) => c.activeQuantity > 0)
                        .map((c) => (
                          <div
                            key={c.id}
                            onClick={() => setSelectedCirculation(c)}
                            className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                              selectedCirculation?.id === c.id
                                ? 'bg-rose-50/30 border-rose-400/30'
                                : 'bg-slate-50 border-slate-100 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex justify-between items-center mb-1">
                              <h4 className="font-bold text-sm text-slate-800">Lô: {c.batch?.code}</h4>
                              <span className="text-xxs font-extrabold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100/30">
                                Dùng: {c.activeQuantity}
                              </span>
                            </div>
                            <p className="text-xxs text-slate-500 font-semibold">{c.linenType?.name}</p>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* Right panel: 70% */}
                <div className="lg:col-span-2 space-y-5 pl-0 lg:pl-6">
                  {selectedCirculation ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Discard form */}
                      <form onSubmit={handleDiscardCirculation} className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                        <h3 className="font-bold text-sm text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                          Báo hỏng đợt Lô {selectedCirculation.batch?.code}
                        </h3>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1 font-semibold">Số lượng báo hỏng</label>
                          <input
                            type="number"
                            min="1"
                            max={selectedCirculation.activeQuantity}
                            value={discardQty}
                            onChange={(e) => setDiscardQty(e.target.value !== '' ? Number(e.target.value) : '')}
                            placeholder={`Tối đa ${selectedCirculation.activeQuantity}`}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1 font-semibold">Lý do thanh lý</label>
                          <textarea
                            value={discardReason}
                            onChange={(e) => setDiscardReason(e.target.value)}
                            placeholder="Nhập lý do hỏng..."
                            rows={3}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-rose-500 transition-all resize-none"
                          />
                        </div>
                        <button
                          type="submit"
                          className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 rounded-lg text-xs transition-all cursor-pointer"
                        >
                          Xác nhận Thanh lý
                        </button>
                      </form>

                      {/* Summary details */}
                      <div className="space-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col justify-center text-xs space-y-2">
                        <h4 className="font-bold text-slate-700">Thông tin đợt lưu thông:</h4>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Mã đợt dùng:</span>
                          <span className="font-mono text-slate-800 font-bold">{selectedCirculation.id.split('-')[0].toUpperCase()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Loại đồ vải:</span>
                          <span className="text-slate-800 font-semibold">{selectedCirculation.linenType?.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Bắt đầu dùng:</span>
                          <span className="text-slate-800 font-medium">{new Date(selectedCirculation.startUseDate).toLocaleDateString('vi-VN')}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-200/50 pt-2 font-semibold text-slate-700">
                          <span>Đang hoạt động:</span>
                          <span>{selectedCirculation.activeQuantity} {selectedCirculation.linenType?.unit}</span>
                        </div>
                        <div className="flex justify-between text-rose-600 font-semibold">
                          <span>Đã thanh lý:</span>
                          <span>{selectedCirculation.discardedQuantity} {selectedCirculation.linenType?.unit}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-20 text-slate-400 text-sm">Vui lòng chọn một đợt đang lưu thông bên trái.</div>
                  )}
                </div>
              </div>
            )}

            {/* Analytics Report View */}
            {activeTab === 'report' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left list: 30% */}
                <div className="lg:col-span-1 border-r border-slate-100 pr-0 lg:pr-6 space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Chọn lô thống kê</h3>
                  <div className="space-y-2 max-h-[400px] overflow-auto">
                    {reports.length === 0 ? (
                      <p className="text-sm text-slate-400 py-6 text-center">Chưa có dữ liệu.</p>
                    ) : (
                      reports.map((r) => (
                        <div
                          key={r.id}
                          onClick={() => setSelectedReport(r)}
                          className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                            selectedReport?.id === r.id
                              ? 'bg-blue-50/50 border-[#0066b2]/30'
                              : 'bg-slate-50 border-slate-100 hover:border-slate-300'
                          }`}
                        >
                          <h4 className="font-bold text-sm text-slate-800">{r.code}</h4>
                          <p className="text-xxs text-slate-500 font-semibold mt-1">{r.linenType.name}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right panel: 70% */}
                <div className="lg:col-span-2 space-y-5 pl-0 lg:pl-6 flex flex-col justify-center">
                  {selectedReport ? (
                    <div className="space-y-6">
                      <div className="border-b border-slate-100 pb-3">
                        <h3 className="font-extrabold text-base text-slate-900">Thống kê chi tiết hao mòn Lô {selectedReport.code}</h3>
                        <span className="text-xxs text-slate-400 font-semibold">{selectedReport.linenType.name}</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <span className="text-xxs text-slate-400 font-bold uppercase tracking-wider">Tổng nhập kho</span>
                          <p className="text-lg font-extrabold text-slate-800 mt-1">{selectedReport.totalQuantity} {selectedReport.linenType.unit}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <span className="text-xxs text-slate-400 font-bold uppercase tracking-wider">Đang sử dụng</span>
                          <p className="text-lg font-extrabold text-teal-600 mt-1">{selectedReport.activeCirculationCount} {selectedReport.linenType.unit}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 col-span-2 sm:col-span-1">
                          <span className="text-xxs text-slate-400 font-bold uppercase tracking-wider">Đã báo hỏng</span>
                          <p className="text-lg font-extrabold text-rose-600 mt-1">{selectedReport.totalDiscarded} {selectedReport.linenType.unit}</p>
                        </div>
                      </div>

                      <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div>
                          <h4 className="font-extrabold text-sm text-slate-800">Tuổi thọ trung bình của lô</h4>
                          <p className="text-xxs text-slate-400 font-semibold mt-0.5">Thời gian sử dụng thực tế trước khi rách/hỏng.</p>
                        </div>
                        <div className="bg-white px-5 py-2.5 rounded-xl border border-blue-100 shadow-sm text-center">
                          {selectedReport.totalDiscarded > 0 ? (
                            <span className="text-lg font-extrabold text-[#0066b2]">
                              {selectedReport.averageLifespanDays.toFixed(1)} ngày
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-slate-400">Chưa có dữ liệu hao mòn</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-20 text-slate-400 text-sm">Vui lòng chọn một lô thống kê bên trái.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400 bg-white mt-auto">
        <p>© {new Date().getFullYear()} Hospital Linen Management & Distribution System. All rights reserved.</p>
      </footer>
    </div>
  )
}
