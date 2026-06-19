'use client'

import { useState, useEffect } from 'react'

interface LinenType {
  id: string
  name: string
  unit: string
}

interface TicketItem {
  id: string
  quantity: number
  linenType: LinenType
}

interface Ticket {
  id: string
  ward: { name: string }
  createdAt: string
  deliveryDate: string
  items: TicketItem[]
}

export default function DispatchPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchTickets()
  }, [])

  const fetchTickets = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dispatch/tickets')
      if (res.ok) {
        setTickets(await res.json())
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleDeliver = async (ticketId: string) => {
    try {
      const res = await fetch('/api/dispatch/tickets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
      })
      if (res.ok) {
        showFeedback('success', 'Đã chuẩn bị xong!')
        fetchTickets()
      } else {
        showFeedback('error', 'Lỗi xác nhận bàn giao')
      }
    } catch (err) {
      showFeedback('error', 'Lỗi kết nối')
    }
  }

  // Aggregate preparation totals
  const preparationSummary: Record<string, { quantity: number; unit: string }> = {}
  tickets.forEach((t) => {
    t.items.forEach((item) => {
      const key = item.linenType.name
      if (!preparationSummary[key]) {
        preparationSummary[key] = { quantity: 0, unit: item.linenType.unit }
      }
      preparationSummary[key].quantity += item.quantity
    })
  })

  return (
    <div className="min-h-screen bg-[#f3f6f9] text-slate-900 flex flex-col font-sans">
      {/* Header Becamex */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0066b2] to-blue-400 flex items-center justify-center font-bold text-white text-xl">
              L
            </div>
            <div>
              <span className="font-extrabold text-lg text-[#0066b2] tracking-tight">BECAMEX HOSPITAL</span>
              <span className="text-xxs block text-slate-500 font-bold tracking-widest uppercase -mt-1">Laundry Dispatch</span>
            </div>
          </div>
          <div className="px-4 py-1.5 bg-slate-100 rounded-full text-xs font-semibold text-slate-600 border border-slate-200/50">
            Chế độ vận hành nhanh
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl w-full mx-auto px-4 py-8 flex-1 flex flex-col space-y-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-50 text-[#0066b2] rounded flex items-center justify-center font-bold">🩺</div>
          <h1 className="text-2xl font-extrabold text-slate-900">Chuẩn bị & Bàn giao nhanh đồ vải</h1>
        </div>

        {message && (
          <div className={`p-4 rounded-xl border font-bold text-sm ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-[#0066b2] rounded-full animate-spin" />
            <p className="text-slate-400 text-xs mt-3 font-semibold">Đang tải phiếu yêu cầu...</p>
          </div>
        ) : (
          <div className="w-full bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-5">
            <h2 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              Danh sách phiếu chờ giao ngày {new Date().toLocaleDateString('vi-VN')}
            </h2>

            {tickets.length === 0 ? (
              <p className="text-xs text-slate-400 py-12 text-center">Tất cả các khoa phòng đã bàn giao xong.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tickets.map((t) => (
                  <div key={t.id} className="bg-slate-50/50 border border-slate-200/80 hover:border-slate-300 p-4 rounded-2xl flex flex-col justify-between transition-all">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="font-extrabold text-xs text-[#0066b2] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100/40">
                          {t.ward?.name}
                        </span>
                        <span className="font-mono text-xxs font-bold text-slate-400">
                          #{t.id.split('-')[0].toUpperCase()}
                        </span>
                      </div>

                      <div className="divide-y divide-slate-100 text-xs py-1 border-t border-b border-slate-100">
                        {t.items.map((item) => (
                          <div key={item.id} className="flex justify-between py-2">
                            <span className="text-slate-600 font-medium">{item.linenType.name}</span>
                            <span className="font-bold text-slate-800">{item.quantity} {item.linenType.unit}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeliver(t.id)}
                      className="w-full bg-[#0066b2] hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer mt-4"
                    >
                      Đã chuẩn bị xong
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
