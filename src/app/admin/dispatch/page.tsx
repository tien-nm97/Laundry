'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
import { useRealtimeSync } from '@/lib/useRealtimeSync'
import { hasPermission } from '@/lib/permissions'

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

interface Ward {
  id: string
  name: string
}

interface Ticket {
  id: string
  status: 'PENDING' | 'PREPARED' | 'DELIVERED' | 'INCOMPLETE'
  requesterName: string
  createdAt: string
  deliveryDate: string
  ward: Ward
  items: TicketItem[]
}

interface Batch {
  id: string
  code: string
  linenTypeId: string
  linenType?: LinenType
  totalQuantity: number
  remainingQuantity: number
  importedAt: string
}

interface Staff {
  id_nhanvien: string
  nhanvien: string
  hientrang: string
}

const formatDateStr = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function AdminDispatch() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)

  // Tabs: MONITOR (Giám sát cấp phát) vs SHORTAGES (Cảnh báo thiếu hụt)
  const [activeTab, setActiveTab] = useState<'MONITOR' | 'SHORTAGES'>('MONITOR')

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PREPARED' | 'DELIVERED' | 'INCOMPLETE'>('ALL')
  const [wardFilter, setWardFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Accordion open/close state for ticket items
  const [expandedTickets, setExpandedTickets] = useState<Record<string, boolean>>({})

  const [userRole, setUserRole] = useState('')
  const [userPermissions, setUserPermissions] = useState<string[]>([])

  // Feedback states
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Circulate modal states (for quick inventory extraction)
  const [showCirculateModal, setShowCirculateModal] = useState(false)
  const [circulateLinenTypeId, setCirculateLinenTypeId] = useState('')
  const [selectedLinenTypeName, setSelectedLinenTypeName] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [circulateQty, setCirculateQty] = useState<number | ''>('')

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const data = await res.json()
          setUserRole(data.role || '')
          setUserPermissions(data.permissions || [])
        }
      } catch (err) {
        console.error('Lỗi khi tải thông tin tài khoản:', err)
      }
    }
    fetchProfile()
    fetchTickets()
    fetchStaff()
    fetchInventoryData()
  }, [])

  // Supabase Realtime sync to auto-refresh database ticket updates
  useRealtimeSync(
    ['Ticket', 'TicketItem', 'Batch', 'Staff'],
    () => {
      fetchTickets()
      fetchInventoryData()
      fetchStaff()
    },
    'admin-dispatch-sync'
  )

  const fetchTickets = async () => {
    try {
      const res = await fetch('/api/admin/tickets')
      if (res.ok) {
        setTickets(await res.json())
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchStaff = async () => {
    try {
      const res = await fetch('/api/admin/orderlies')
      if (res.ok) {
        setStaff(await res.json())
      }
    } catch (err) {
      console.error('Error fetching staff:', err)
    }
  }

  const fetchInventoryData = async () => {
    try {
      const res = await fetch('/api/admin/inventory')
      if (res.ok) {
        const data = await res.json()
        setBatches(data.batches || [])
      }
    } catch (err) {
      console.error('Error fetching inventory:', err)
    }
  }

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleUpdateStatus = async (ticketId: string) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/dispatch/tickets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
      })
      if (res.ok) {
        showFeedback('success', 'Đã cập nhật trạng thái phiếu thành công!')
        fetchTickets()
      } else {
        showFeedback('error', 'Lỗi khi cập nhật trạng thái phiếu')
      }
    } catch (err) {
      showFeedback('error', 'Lỗi kết nối')
    } finally {
      setSubmitting(false)
    }
  }

  const handleQuickCirculate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBatchId || !circulateQty || Number(circulateQty) <= 0) {
      showFeedback('error', 'Vui lòng điền đầy đủ các thông tin cấp phát')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/inventory/circulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatchId,
          quantity: Number(circulateQty)
        })
      })

      const data = await res.json()
      if (res.ok) {
        showFeedback('success', 'Rút kho sạch và đưa vào lưu hành sử dụng thành công!')
        setShowCirculateModal(false)
        setSelectedBatchId('')
        setCirculateQty('')
        fetchInventoryData()
        fetchTickets()
      } else {
        showFeedback('error', data.error || 'Lỗi khi thực hiện cấp phát nhanh')
      }
    } catch {
      showFeedback('error', 'Lỗi kết nối')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleExpandTicket = (id: string) => {
    setExpandedTickets(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  // Unique wards list for filtering
  const wards = useMemo(() => {
    const list = Array.from(new Set(tickets.map(t => JSON.stringify(t.ward))))
    return list.map(wStr => JSON.parse(wStr) as Ward)
  }, [tickets])

  // Today's Date representation
  const todayDateStr = formatDateStr(new Date())

  // Tickets for today's supervisor view:
  // - Show active tickets (PENDING or PREPARED) created within the last 24 hours (matching the laundry worker view).
  // - Show DELIVERED tickets whose delivery date is today.
  const todayTickets = useMemo(() => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    return tickets.filter(t => {
      if (t.status === 'PENDING' || t.status === 'PREPARED') {
        return new Date(t.createdAt) >= cutoff
      }
      if (t.status === 'DELIVERED') {
        return t.deliveryDate ? formatDateStr(new Date(t.deliveryDate)) === todayDateStr : false
      }
      return false
    })
  }, [tickets, todayDateStr])

  // Overall today's fulfillment progress percentage
  const todayTotal = todayTickets.length
  const todayDelivered = todayTickets.filter(t => t.status === 'DELIVERED').length
  const progressPercent = todayTotal > 0 ? Math.round((todayDelivered / todayTotal) * 100) : 0

  // Filtered Today Tickets (Search query + status filter + ward filter)
  const filteredTodayTickets = useMemo(() => {
    return todayTickets.filter((t) => {
      const matchStatus = statusFilter === 'ALL' || t.status === statusFilter
      const matchWard = wardFilter === 'ALL' || t.ward.id === wardFilter
      
      const q = searchQuery.toLowerCase().trim()
      const matchSearch = !q || (
        t.ward.name.toLowerCase().includes(q) ||
        t.requesterName.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      )
      
      return matchStatus && matchWard && matchSearch
    })
  }, [todayTickets, searchQuery, statusFilter, wardFilter])

  // Today's total requested quantities per linenType
  const todayRequestTotals = useMemo(() => {
    const totals: Record<string, { quantity: number; unit: string; name: string }> = {}
    todayTickets
      .filter(t => t.status === 'PENDING' || t.status === 'PREPARED')
      .forEach((t) => {
        t.items.forEach((item) => {
          const typeId = item.linenType.id
          if (!totals[typeId]) {
            totals[typeId] = { quantity: 0, unit: item.linenType.unit, name: item.linenType.name }
          }
          totals[typeId].quantity += item.quantity
        })
      })
    return totals
  }, [todayTickets])

  // Clean stock quantities from batches list
  const cleanStockTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    batches.forEach((b) => {
      const typeId = b.linenTypeId
      if (totals[typeId] === undefined) {
        totals[typeId] = 0
      }
      totals[typeId] += b.remainingQuantity
    })
    return totals
  }, [batches])

  // Calculate stock shortages compared to today's active requests
  const stockShortages = useMemo(() => {
    const shortages: Array<{ linenTypeId: string; name: string; reqQty: number; stockQty: number; shortageQty: number; unit: string }> = []
    Object.entries(todayRequestTotals).forEach(([typeId, data]) => {
      const stockQty = cleanStockTotals[typeId] || 0
      if (stockQty < data.quantity) {
        shortages.push({
          linenTypeId: typeId,
          name: data.name,
          reqQty: data.quantity,
          stockQty,
          shortageQty: data.quantity - stockQty,
          unit: data.unit
        })
      }
    })
    return shortages
  }, [todayRequestTotals, cleanStockTotals])

  return (
    <div className="space-y-8 animate-fade-in text-slate-800">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-extrabold text-[#0066b2]">
          {userRole === 'ADMIN' ? 'Quản lý Cấp phát Đồ vải' : 'Giám sát Cấp phát Đồ vải'}
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Bảng giám sát tổng quan tình trạng chuẩn bị và phân phối đồ vải sạch đến các khoa phòng bệnh viện.
        </p>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border text-sm font-semibold shadow-sm ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
          {message.text}
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('MONITOR')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'MONITOR'
              ? 'border-[#0066b2] text-[#0066b2]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          📊 Giám sát cấp phát
        </button>
        <button
          onClick={() => setActiveTab('SHORTAGES')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'SHORTAGES'
              ? 'border-[#0066b2] text-[#0066b2]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          ⚠️ Cảnh báo thiếu hụt
          {stockShortages.length > 0 && (
            <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[9px] font-black rounded-full leading-none">
              {stockShortages.length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 bg-white border border-slate-200/80 rounded-2xl">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-[#0066b2] rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-xs mt-3 font-semibold">Đang tải dữ liệu cấp phát...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* TAB 1: TODAY SUPERVISOR MONITOR */}
          {activeTab === 'MONITOR' && (
            <div className="space-y-6">
              {/* Fulfillment Progress Header Bar */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5">📈 Tiến độ cấp phát hôm nay ({new Date().toLocaleDateString('vi-VN')})</span>
                  <span className="text-[#0066b2] font-black">{todayDelivered}/{todayTotal} Khoa phòng ({progressPercent}%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden border border-slate-200/60">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-[#0066b2] h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Filters & Actions Panel */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    Theo dõi trạng thái các Khoa phòng hôm nay
                  </h2>

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <select
                      value={wardFilter}
                      onChange={(e) => setWardFilter(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xxs font-bold text-slate-600 focus:outline-none focus:border-[#0066b2]"
                    >
                      <option value="ALL">Tất cả khoa phòng</option>
                      {wards.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>

                    <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/50">
                      {['ALL', 'PENDING', 'PREPARED', 'DELIVERED'].map((st) => (
                        <button
                          key={st}
                          onClick={() => setStatusFilter(st as any)}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition-all cursor-pointer ${
                            statusFilter === st
                              ? 'bg-white text-[#0066b2] shadow-sm'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {st === 'ALL' ? 'Tất cả' : st === 'PENDING' ? 'Chờ soạn' : st === 'PREPARED' ? 'Sẵn sàng' : 'Đã giao'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                  <span className="text-slate-400 text-xs">🔍</span>
                  <input
                    type="text"
                    placeholder="Tìm nhanh theo tên khoa phòng, hộ lý yêu cầu..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-xs text-slate-800 bg-transparent focus:outline-none placeholder-slate-400"
                  />
                </div>

                {/* Minimalist Wards Table with Accordions */}
                {filteredTodayTickets.length === 0 ? (
                  <p className="text-center py-10 text-slate-400 text-xs font-semibold">Không có yêu cầu cấp phát nào khớp bộ lọc.</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 font-bold text-slate-500 w-12 text-center">STT</th>
                          <th className="px-4 py-3 font-bold text-slate-500">Khoa phòng bệnh viện</th>
                          <th className="px-4 py-3 font-bold text-slate-500">Hộ lý yêu cầu</th>
                          <th className="px-4 py-3 font-bold text-slate-500">Thời gian tạo</th>
                          <th className="px-4 py-3 font-bold text-slate-500 text-center w-32">Trạng thái</th>
                          <th className="px-4 py-3 font-bold text-slate-500 text-center w-28">Đồ vải</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredTodayTickets.map((t, index) => {
                          const isExpanded = !!expandedTickets[t.id]
                          return (
                            <Fragment key={t.id}>
                              <tr className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-4 text-center text-slate-400 font-bold">{index + 1}</td>
                                <td className="px-4 py-4 text-slate-700 font-bold">{t.ward.name}</td>
                                <td className="px-4 py-4 text-slate-600 font-medium">{t.requesterName}</td>
                                <td className="px-4 py-4 text-slate-400 font-medium">
                                  {new Date(t.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="px-4 py-4 text-center">
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                    t.status === 'DELIVERED'
                                      ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                                      : t.status === 'PENDING'
                                      ? 'bg-indigo-50 border-indigo-100 text-indigo-600'
                                      : t.status === 'PREPARED'
                                      ? 'bg-amber-50 border-amber-100 text-amber-600'
                                      : 'bg-rose-50 border-rose-100 text-rose-600'
                                  }`}>
                                    {t.status === 'DELIVERED'
                                      ? 'Đã bàn giao'
                                      : t.status === 'PENDING'
                                      ? 'Chờ chuẩn bị'
                                      : t.status === 'PREPARED'
                                      ? 'Sẵn sàng giao'
                                      : 'Chưa thực hiện'}
                                  </span>
                                </td>
                                <td className="px-4 py-4 text-center">
                                  <button
                                    type="button"
                                    onClick={() => toggleExpandTicket(t.id)}
                                    className="px-2.5 py-1 bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 font-bold text-xxs rounded-lg cursor-pointer transition-all"
                                  >
                                    {isExpanded ? 'Ẩn ❮' : 'Xem chi tiết ❯'}
                                  </button>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-slate-50/50">
                                  <td colSpan={6} className="px-6 py-4 border-b border-slate-100">
                                    <div className="max-w-xl bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                                      <h4 className="text-xxs font-bold text-slate-400 uppercase tracking-wider">Đồ vải yêu cầu cấp phát:</h4>
                                      <div className="divide-y divide-slate-100">
                                        {t.items.map(item => (
                                          <div key={item.id} className="flex justify-between py-2 text-xs">
                                            <span className="text-slate-600 font-semibold">{item.linenType.name}</span>
                                            <span className="text-slate-800 font-extrabold">{item.quantity} {item.linenType.unit}</span>
                                          </div>
                                        ))}
                                      </div>

                                      {/* Emergency Override Option */}
                                      {(userRole === 'ADMIN' || hasPermission(userPermissions, 'admin:ticket') || hasPermission(userPermissions, 'dispatch:all')) && t.status !== 'DELIVERED' && (
                                        <div className="border-t border-slate-100 pt-3 mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50 p-2.5 rounded-lg border border-dashed border-slate-200">
                                          <div>
                                            <p className="text-[10px] font-bold text-slate-800">Cập nhật nhanh khẩn cấp (Dành cho Quản trị viên)</p>
                                            <p className="text-[9px] text-slate-400">Cho phép giám sát duyệt thay đổi trạng thái nếu xưởng gặp sự cố.</p>
                                          </div>
                                          <div className="flex gap-2">
                                            {t.status === 'PREPARED' && (
                                              <select
                                                id={`admin-orderly-select-${t.id}`}
                                                className="bg-white border border-slate-200 rounded px-2 py-1 text-xxs font-bold text-slate-600 focus:outline-none"
                                              >
                                                <option value="">Chọn hộ lý giao</option>
                                                {staff.map(s => (
                                                  <option key={s.id_nhanvien} value={s.nhanvien}>{s.nhanvien}</option>
                                                ))}
                                              </select>
                                            )}
                                            <button
                                              onClick={() => {
                                                if (t.status === 'PREPARED') {
                                                  const sel = document.getElementById(`admin-orderly-select-${t.id}`) as HTMLSelectElement
                                                  const val = sel?.value || 'Hộ lý'
                                                  handleUpdateStatus(t.id).then(() => {
                                                    showFeedback('success', `Đã cập nhật trạng thái & bàn giao cho hộ lý ${val}!`)
                                                  })
                                                } else {
                                                  handleUpdateStatus(t.id)
                                                }
                                              }}
                                              disabled={submitting}
                                              className="bg-[#0066b2] hover:bg-blue-700 text-white font-extrabold text-xxs px-3 py-1 rounded cursor-pointer"
                                            >
                                              {t.status === 'PENDING' ? '✓ Xác nhận soạn xong' : '🚚 Xác nhận bàn giao'}
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: STOCK SHORTAGES LIST */}
          {activeTab === 'SHORTAGES' && (
            <div className="space-y-6 animate-fade-in">
              <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Danh sách Cảnh báo Thiếu hụt đồ vải hôm nay
              </h2>

              {stockShortages.length === 0 ? (
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-8 text-center space-y-3">
                  <span className="text-4xl">✅</span>
                  <h3 className="text-sm font-extrabold text-emerald-950">Đầy đủ tồn kho sạch dự phòng!</h3>
                  <p className="text-xs text-emerald-800 max-w-md mx-auto leading-relaxed">
                    Tất cả các loại đồ vải sạch đều đáp ứng trữ lượng dự phòng đầy đủ cho nhu cầu tổng hợp của ngày hôm nay. Không phát hiện thiếu hụt.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {stockShortages.map((s) => (
                    <div key={s.linenTypeId} className="bg-amber-50 border border-amber-200/80 rounded-2xl p-5 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <span className="text-xl">⚠️</span>
                        <div>
                          <p className="font-extrabold text-amber-950 text-sm">Cảnh báo thiếu hụt: {s.name}</p>
                          <p className="text-amber-800 text-xxs mt-1 font-semibold leading-relaxed">
                            Tổng nhu cầu hôm nay của các khoa phòng là <strong className="text-amber-950">{s.reqQty} {s.unit}</strong>, 
                            nhưng tồn kho sạch dự phòng hiện chỉ còn <strong className="text-amber-950">{s.stockQty} {s.unit}</strong>.
                          </p>
                          <p className="text-amber-700 text-[10px] mt-0.5">
                            Cần cấp phát thêm ít nhất <strong className="text-rose-600">{s.shortageQty} {s.unit}</strong> vào sử dụng để đáp ứng đủ nhu cầu.
                          </p>
                        </div>
                      </div>
                      {(userRole === 'ADMIN' || hasPermission(userPermissions, 'admin:batch') || hasPermission(userPermissions, 'inventory:all')) && (
                        <button
                          type="button"
                          onClick={() => {
                            setCirculateLinenTypeId(s.linenTypeId)
                            setSelectedLinenTypeName(s.name)
                            setCirculateQty(s.shortageQty)
                            setSelectedBatchId('')
                            setShowCirculateModal(true)
                          }}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-extrabold rounded-xl text-xxs transition-all cursor-pointer whitespace-nowrap"
                        >
                          Cấp phát nhanh từ kho sạch
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal Cấp phát nhanh đồ vải sạch (Circulate) */}
      {showCirculateModal && circulateLinenTypeId && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-scale-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 text-[#0066b2]">Cấp phát nhanh đồ vải</h3>
              <button
                type="button"
                onClick={() => {
                  setShowCirculateModal(false)
                  setSelectedBatchId('')
                  setCirculateQty('')
                }}
                className="text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickCirculate} className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/60 text-xxs text-slate-500 space-y-1">
                <p>• Mặt hàng thiếu hụt: <strong className="text-slate-700">{selectedLinenTypeName}</strong></p>
                <p>• Số lượng đề xuất bù: <strong className="text-amber-600 font-bold">{circulateQty} cái</strong></p>
              </div>

              <div>
                <label className="block text-xxs text-slate-500 mb-1 font-bold">Chọn lô hàng sạch để rút</label>
                <select
                  value={selectedBatchId}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                  required
                >
                  <option value="">-- Chọn lô hàng sạch còn dự phòng --</option>
                  {batches
                    .filter(b => b.linenTypeId === circulateLinenTypeId && b.remainingQuantity > 0)
                    .map(b => (
                      <option key={b.id} value={b.id}>
                        Lô: {b.code} (Còn sạch dự phòng: {b.remainingQuantity})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xxs text-slate-500 mb-1 font-bold">Số lượng rút cấp phát</label>
                <input
                  type="number"
                  min="1"
                  max={selectedBatchId ? batches.find(b => b.id === selectedBatchId)?.remainingQuantity : undefined}
                  value={circulateQty}
                  onChange={(e) => setCirculateQty(e.target.value !== '' ? Number(e.target.value) : '')}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                  placeholder="SL đưa vào sử dụng"
                  required
                />
              </div>

              <div className="border-t border-slate-100 pt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCirculateModal(false)
                    setSelectedBatchId('')
                    setCirculateQty('')
                  }}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#0066b2] hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  {submitting ? 'Đang xử lý...' : 'Xác nhận cấp phát'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
