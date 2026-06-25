'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRealtimeSync } from '@/lib/useRealtimeSync'

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

const formatDateStr = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function AdminDispatch() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PREPARED' | 'DELIVERED' | 'INCOMPLETE'>('ALL')
  const [wardFilter, setWardFilter] = useState<string>('ALL')

  const [userRole, setUserRole] = useState('')
  const [activeTab, setActiveTab] = useState<'TICKETS' | 'AGGREGATE'>('TICKETS')
  const [selectedDate, setSelectedDate] = useState<string>(formatDateStr(new Date()))
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const data = await res.json()
          setUserRole(data.role || '')
        }
      } catch (err) {
        console.error('Lỗi khi tải thông tin tài khoản:', err)
      }
    }
    fetchProfile()
    fetchTickets()
  }, [])

  // Supabase Realtime sync to auto-refresh database ticket updates
  useRealtimeSync(
    ['Ticket', 'TicketItem'],
    () => {
      fetchTickets()
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

  // Calculate stats
  const totalCount = tickets.length
  const pendingCount = tickets.filter(t => t.status === 'PENDING').length
  const preparedCount = tickets.filter(t => t.status === 'PREPARED').length
  const deliveredCount = tickets.filter(t => t.status === 'DELIVERED').length
  const incompleteCount = tickets.filter(t => t.status === 'INCOMPLETE').length
  const fulfillmentRate = totalCount > 0 ? Math.round((deliveredCount / totalCount) * 100) : 0

  // Unique wards list for filtering
  const wards = Array.from(new Set(tickets.map(t => JSON.stringify(t.ward)))).map(wStr => JSON.parse(wStr) as Ward)

  // Aggregate preparation totals for PENDING tickets
  const preparationSummary: Record<string, { quantity: number; unit: string }> = {}
  tickets
    .filter(t => t.status === 'PENDING')
    .forEach((t) => {
      t.items.forEach((item) => {
        const key = item.linenType.name
        if (!preparationSummary[key]) {
          preparationSummary[key] = { quantity: 0, unit: item.linenType.unit }
        }
        preparationSummary[key].quantity += item.quantity
      })
    })

  // 1. Dấu chấm trạng thái của các ngày trên Lịch
  const dateStatusMap = useMemo(() => {
    const statusMap: Record<string, 'DELIVERED' | 'PENDING' | 'INCOMPLETE'> = {}
    tickets.forEach((t) => {
      const dateStr = formatDateStr(new Date(t.createdAt))
      const currentStatus = t.status

      if (!statusMap[dateStr]) {
        statusMap[dateStr] = currentStatus === 'DELIVERED' ? 'DELIVERED' : (currentStatus === 'INCOMPLETE' ? 'INCOMPLETE' : 'PENDING')
      } else {
        const prev = statusMap[dateStr]
        if (currentStatus === 'INCOMPLETE' || prev === 'INCOMPLETE') {
          statusMap[dateStr] = 'INCOMPLETE'
        } else if (currentStatus !== 'DELIVERED' || prev !== 'DELIVERED') {
          statusMap[dateStr] = 'PENDING'
        }
      }
    })
    return statusMap
  }, [tickets])

  // 2. Gom nhóm tổng hợp đồ vải hàng ngày (Tab 2)
  const dailyAggregates = useMemo(() => {
    const aggregatesMap: Record<string, { date: string; ticketCount: number; items: Record<string, { qty: number; unit: string }> }> = {}
    
    tickets.forEach((t) => {
      const dateStr = formatDateStr(new Date(t.createdAt))
      if (!aggregatesMap[dateStr]) {
        aggregatesMap[dateStr] = { date: dateStr, ticketCount: 0, items: {} }
      }
      aggregatesMap[dateStr].ticketCount += 1
      t.items.forEach((item) => {
        const typeName = item.linenType.name
        if (!aggregatesMap[dateStr].items[typeName]) {
          aggregatesMap[dateStr].items[typeName] = { qty: 0, unit: item.linenType.unit }
        }
        aggregatesMap[dateStr].items[typeName].qty += item.quantity
      })
    })

    return Object.values(aggregatesMap).sort((a, b) => b.date.localeCompare(a.date))
  }, [tickets])

  // 3. Lọc phiếu theo ngày được chọn (Tab 1)
  const filteredByDateTickets = useMemo(() => {
    return tickets.filter((t) => {
      const dateStr = formatDateStr(new Date(t.createdAt))
      return dateStr === selectedDate
    })
  }, [tickets, selectedDate])

  // 4. Lọc chi tiết theo bộ lọc và khoa phòng
  const filteredTickets = useMemo(() => {
    return filteredByDateTickets.filter((t) => {
      const matchStatus = statusFilter === 'ALL' || t.status === statusFilter
      const matchWard = wardFilter === 'ALL' || t.ward.id === wardFilter
      return matchStatus && matchWard
    })
  }, [filteredByDateTickets, statusFilter, wardFilter])

  const renderCalendar = () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()

    const firstDayOfMonth = new Date(year, month, 1)
    const lastDayOfMonth = new Date(year, month + 1, 0)
    
    // Ngày đầu tiên của tháng rơi vào thứ mấy (0: Chủ nhật, 1: Thứ 2...)
    let startDayOfWeek = firstDayOfMonth.getDay()
    // Đổi sang định dạng T2 - CN (T2 là 0, CN là 6)
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1

    const totalDays = lastDayOfMonth.getDate()
    const daysArray = []

    // Đệm các ô trống của tháng trước
    for (let i = 0; i < startDayOfWeek; i++) {
      daysArray.push(null)
    }

    // Đổ các ngày trong tháng
    for (let d = 1; d <= totalDays; d++) {
      daysArray.push(new Date(year, month, d))
    }

    const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1))
    const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1))

    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs font-black text-slate-800">
            Tháng {month + 1}, {year}
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={prevMonth}
              className="px-2.5 py-1 border border-slate-200 rounded-lg text-xxs font-bold hover:bg-slate-50 cursor-pointer"
            >
              ❮
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="px-2.5 py-1 border border-slate-200 rounded-lg text-xxs font-bold hover:bg-slate-50 cursor-pointer"
            >
              ❯
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
          {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day) => (
            <div key={day} className="font-extrabold text-slate-400 py-1">{day}</div>
          ))}

          {daysArray.map((dateObj, idx) => {
            if (!dateObj) {
              return <div key={`empty-${idx}`} className="p-2"></div>
            }

            const dateStr = formatDateStr(dateObj)
            const isSelected = dateStr === selectedDate
            const status = dateStatusMap[dateStr]

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => setSelectedDate(dateStr)}
                className={`p-2 rounded-lg font-bold transition-all relative flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 ${
                  isSelected
                    ? 'bg-[#0066b2] text-white hover:bg-blue-700'
                    : 'text-slate-700'
                }`}
              >
                <span>{dateObj.getDate()}</span>
                {status && (
                  <span
                    className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${
                      status === 'DELIVERED'
                        ? 'bg-emerald-400'
                        : status === 'INCOMPLETE'
                        ? 'bg-rose-400'
                        : 'bg-amber-400'
                    }`}
                  />
                )}
              </button>
            )
          })}
        </div>
        
        {/* Chú thích màu sắc lịch */}
        <div className="flex justify-around border-t border-slate-100 pt-3 mt-3 text-[9px] text-slate-400 font-semibold">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Đã giao</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Chờ soạn</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Chưa xong</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in text-slate-800">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-extrabold text-[#0066b2]">
          {userRole === 'ADMIN' ? 'Quản lý Cấp phát Đồ vải' : 'Giám sát Cấp phát Đồ vải'}
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          {userRole === 'ADMIN'
            ? 'Theo dõi và xử lý trạng thái yêu cầu cấp phát đồ vải hằng ngày từ các khoa phòng.'
            : 'Theo dõi trực tiếp trạng thái yêu cầu cấp phát đồ vải hằng ngày từ các khoa phòng.'}
        </p>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('TICKETS')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'TICKETS'
              ? 'border-[#0066b2] text-[#0066b2]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          📅 Phiếu theo Ngày
        </button>
        <button
          onClick={() => setActiveTab('AGGREGATE')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'AGGREGATE'
              ? 'border-[#0066b2] text-[#0066b2]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          📊 Tổng hợp Đồ vải hằng ngày
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-slate-400 text-xxs font-bold uppercase tracking-wider">Tổng số yêu cầu</span>
          <span className="text-2xl font-extrabold text-slate-900 mt-2">{totalCount}</span>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-indigo-600 text-xxs font-bold uppercase tracking-wider">Chờ chuẩn bị</span>
          <span className="text-2xl font-extrabold text-indigo-600 mt-2">{pendingCount}</span>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-amber-600 text-xxs font-bold uppercase tracking-wider">Sẵn sàng giao</span>
          <span className="text-2xl font-extrabold text-amber-600 mt-2">{preparedCount}</span>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-emerald-600 text-xxs font-bold uppercase tracking-wider">Đã bàn giao</span>
          <span className="text-2xl font-extrabold text-emerald-600 mt-2">{deliveredCount}</span>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-rose-600 text-xxs font-bold uppercase tracking-wider">Chưa thực hiện</span>
          <span className="text-2xl font-extrabold text-rose-600 mt-2">{incompleteCount}</span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 bg-white border border-slate-200/80 rounded-2xl">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-[#0066b2] rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-xs mt-3 font-semibold">Đang tải dữ liệu giám sát...</p>
        </div>
      ) : (
        <>
          {activeTab === 'TICKETS' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Calendar & Prep summary */}
              <div className="lg:col-span-1 space-y-6">
                {renderCalendar()}

                <div className="bg-white border border-slate-200/85 rounded-2xl p-5 shadow-sm h-fit">
                  <h2 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2 mb-4">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
                    Tổng hợp đang chuẩn bị soạn
                  </h2>
                  {Object.keys(preparationSummary).length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center">Không có đồ vải nào đang chờ soạn.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {Object.entries(preparationSummary).map(([name, data]) => (
                        <div key={name} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-200/50">
                          <span className="text-xs font-semibold text-slate-700">{name}</span>
                          <span className="text-xs font-extrabold text-[#0066b2] bg-blue-50/50 border border-blue-100 px-3 py-1 rounded-lg">
                            {data.quantity} {data.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Tickets List */}
              <div className="lg:col-span-2 bg-white border border-slate-200/85 rounded-2xl p-5 shadow-sm flex flex-col space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 gap-4">
                  <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                    Nhật ký yêu cầu cấp phát ngày {new Date(selectedDate).toLocaleDateString('vi-VN')}
                  </h2>

                  {/* Filters */}
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
                      <button
                        onClick={() => setStatusFilter('ALL')}
                        className={`px-3 py-1 rounded-md text-xxs font-extrabold transition-all cursor-pointer ${
                          statusFilter === 'ALL'
                            ? 'bg-white text-[#0066b2] shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Tất cả
                      </button>
                      <button
                        onClick={() => setStatusFilter('PENDING')}
                        className={`px-3 py-1 rounded-md text-xxs font-extrabold transition-all cursor-pointer ${
                          statusFilter === 'PENDING'
                            ? 'bg-white text-[#0066b2] shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Chờ chuẩn bị
                      </button>
                      <button
                        onClick={() => setStatusFilter('PREPARED')}
                        className={`px-3 py-1 rounded-md text-xxs font-extrabold transition-all cursor-pointer ${
                          statusFilter === 'PREPARED'
                            ? 'bg-white text-[#0066b2] shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Sẵn sàng
                      </button>
                      <button
                        onClick={() => setStatusFilter('DELIVERED')}
                        className={`px-3 py-1 rounded-md text-xxs font-extrabold transition-all cursor-pointer ${
                          statusFilter === 'DELIVERED'
                            ? 'bg-white text-[#0066b2] shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Đã giao
                      </button>
                      <button
                        onClick={() => setStatusFilter('INCOMPLETE')}
                        className={`px-3 py-1 rounded-md text-xxs font-extrabold transition-all cursor-pointer ${
                          statusFilter === 'INCOMPLETE'
                            ? 'bg-white text-[#0066b2] shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Chưa thực hiện
                      </button>
                    </div>
                  </div>
                </div>

                {filteredTickets.length === 0 ? (
                  <p className="text-center py-12 text-slate-400 text-xs font-semibold">Chưa có phiếu yêu cầu nào khớp bộ lọc.</p>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 font-bold text-slate-500 w-24">Mã phiếu</th>
                          <th className="px-4 py-3 font-bold text-slate-500">Khoa phòng</th>
                          <th className="px-4 py-3 font-bold text-slate-500">Hộ lý yêu cầu</th>
                          <th className="px-4 py-3 font-bold text-slate-500">Chi tiết đồ vải</th>
                          <th className="px-4 py-3 font-bold text-slate-500">Thời gian tạo</th>
                          <th className="px-4 py-3 font-bold text-slate-500">Thời gian giao</th>
                          <th className="px-4 py-3 font-bold text-slate-500 text-center">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredTickets.map((t) => (
                          <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-4 font-mono font-bold text-[#0066b2] text-xxs">
                              #{t.id.split('-')[0].toUpperCase()}
                            </td>
                            <td className="px-4 py-4 text-slate-700 font-bold">{t.ward.name}</td>
                            <td className="px-4 py-4 text-slate-600 font-medium">{t.requesterName}</td>
                            <td className="px-4 py-4 text-slate-600 max-w-[200px]">
                              <div className="space-y-1">
                                {t.items.map(item => (
                                  <div key={item.id} className="flex justify-between gap-4 text-xxs font-medium">
                                    <span>{item.linenType.name}:</span>
                                    <span className="font-extrabold text-slate-800">{item.quantity} {item.linenType.unit}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-slate-500 text-xxs font-medium">
                              {new Date(t.createdAt).toLocaleString('vi-VN')}
                            </td>
                            <td className="px-4 py-4 text-slate-500 text-xxs font-medium">
                              {t.status === 'DELIVERED' ? new Date(t.deliveryDate).toLocaleString('vi-VN') : '-'}
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
                                  ? 'Đã giao'
                                  : t.status === 'PENDING'
                                  ? 'Chờ chuẩn bị'
                                  : t.status === 'PREPARED'
                                  ? 'Sẵn sàng giao'
                                  : 'Chưa thực hiện'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'AGGREGATE' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-4 mb-6 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                  Tổng hợp số lượng yêu cầu đồ vải hằng ngày
                </h2>

                {dailyAggregates.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs font-semibold">Chưa có dữ liệu cấp phát.</div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 font-bold text-slate-500 w-32">Ngày yêu cầu</th>
                          <th className="px-4 py-3 font-bold text-slate-500 text-center w-24">Tổng số phiếu</th>
                          <th className="px-4 py-3 font-bold text-slate-500">Chi tiết số lượng cấp phát</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {dailyAggregates.map((row) => (
                          <tr key={row.date} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-4 text-slate-700 font-extrabold">
                              {new Date(row.date).toLocaleDateString('vi-VN')}
                            </td>
                            <td className="px-4 py-4 text-center font-bold text-slate-900">
                              {row.ticketCount} phiếu
                            </td>
                            <td className="px-4 py-4 text-slate-600">
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(row.items).map(([name, data]) => (
                                  <span key={name} className="px-2.5 py-1 bg-slate-50 border border-slate-200/60 rounded-lg text-xxs font-bold text-slate-700">
                                    {name}: <strong className="text-[#0066b2]">{data.qty}</strong> {data.unit}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Placeholder tương quan số bệnh nhân */}
              <div className="bg-blue-50/50 border border-dashed border-blue-200 rounded-2xl p-5 text-slate-700 flex gap-4 items-start">
                <span className="text-xl">📊</span>
                <div>
                  <h4 className="text-xs font-bold text-blue-900 mb-1">
                    Chỉ số So sánh Tương quan với Số lượng Bệnh nhân (Kế hoạch Phát triển Tiếp theo)
                  </h4>
                  <p className="text-[11px] text-blue-800/80 leading-relaxed">
                    Mục tiêu tiếp theo sẽ tích hợp dữ liệu số lượng bệnh nhân thực tế tại mỗi khoa phòng từ hệ thống quản lý bệnh viện.
                    Từ đó, hệ thống sẽ tự động vẽ biểu đồ phân tích tương quan giữa số lượng đồ vải cấp phát thực tế so với mật độ giường bệnh,
                    hỗ trợ tối đa việc giám sát định mức cấp phát, phát hiện sớm các hiện tượng hao hụt bất thường tại các khoa phòng.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
