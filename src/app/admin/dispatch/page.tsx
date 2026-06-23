'use client'

import { useState, useEffect } from 'react'
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

export default function AdminDispatch() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PREPARED' | 'DELIVERED' | 'INCOMPLETE'>('ALL')
  const [wardFilter, setWardFilter] = useState<string>('ALL')

  const [userRole, setUserRole] = useState('')

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

  // Filtered tickets list
  const filteredTickets = tickets.filter((t) => {
    const matchStatus = statusFilter === 'ALL' || t.status === statusFilter
    const matchWard = wardFilter === 'ALL' || t.ward.id === wardFilter
    return matchStatus && matchWard
  })

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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Prep summary */}
          <div className="lg:col-span-1 bg-white border border-slate-200/85 rounded-2xl p-5 shadow-sm h-fit">
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

          {/* Right Column: Tickets List */}
          <div className="lg:col-span-2 bg-white border border-slate-200/85 rounded-2xl p-5 shadow-sm flex flex-col space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 gap-4">
              <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                Nhật ký yêu cầu cấp phát
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
    </div>
  )
}
