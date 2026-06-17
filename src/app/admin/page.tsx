'use client'

import { useState, useEffect } from 'react'
import { useRealtimeSync } from '@/lib/useRealtimeSync'

interface LinenType {
  id: string
  name: string
  unit: string
  createdAt: string
}

interface Ward {
  id: string
  name: string
  qrToken: string
  createdAt: string
}

interface Orderly {
  id_nhanvien: string
  nhanvien: string
  hientrang: string
  imageUrl?: string | null
  createdAt: string
}

export default function AdminDashboard() {
  const [linenTypes, setLinenTypes] = useState<LinenType[]>([])
  const [wards, setWards] = useState<Ward[]>([])
  const [orderlies, setOrderlies] = useState<Orderly[]>([])

  // Form states
  const [ltName, setLtName] = useState('')
  const [ltUnit, setLtUnit] = useState('Cái')
  const [wardName, setWardName] = useState('')
  const [orderlyName, setOrderlyName] = useState('')
  const [orderlyImage, setOrderlyImage] = useState<string | null>(null)

  // Edit Orderly states
  const [editingOrderly, setEditingOrderly] = useState<Orderly | null>(null)
  const [editName, setEditName] = useState('')
  const [editImage, setEditImage] = useState<string | null>(null)
  const [submittingEdit, setSubmittingEdit] = useState(false)

  // Loading & feedback states
  const [loadingTypes, setLoadingTypes] = useState(true)
  const [loadingWards, setLoadingWards] = useState(true)
  const [loadingOrderlies, setLoadingOrderlies] = useState(true)
  const [submittingType, setSubmittingType] = useState(false)
  const [submittingWard, setSubmittingWard] = useState(false)
  const [submittingOrderly, setSubmittingOrderly] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')

  // Fetch initial data
  useEffect(() => {
    fetchLinenTypes()
    fetchWards()
    fetchOrderlies()
    setOrigin(window.location.origin)
  }, [])

  // Supabase Realtime: auto-refresh when DB changes
  useRealtimeSync(
    ['LinenType', 'Khoa', 'Staff'],
    () => {
      fetchLinenTypes()
      fetchWards()
      fetchOrderlies()
    },
    'admin-dashboard-sync'
  )

  const fetchLinenTypes = async () => {
    setLoadingTypes(true)
    try {
      const res = await fetch('/api/admin/linen-types')
      if (res.ok) {
        const data = await res.json()
        setLinenTypes(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingTypes(false)
    }
  }

  const fetchWards = async () => {
    setLoadingWards(true)
    try {
      const res = await fetch('/api/admin/wards')
      if (res.ok) {
        const data = await res.json()
        setWards(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingWards(false)
    }
  }

  const fetchOrderlies = async () => {
    setLoadingOrderlies(true)
    try {
      const res = await fetch('/api/admin/orderlies')
      if (res.ok) {
        const data = await res.json()
        setOrderlies(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingOrderlies(false)
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const MAX_WIDTH = 120
          const MAX_HEIGHT = 120
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width
              width = MAX_WIDTH
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height
              height = MAX_HEIGHT
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height)
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7)
            setOrderlyImage(compressedBase64)
          }
        }
        img.src = event.target?.result as string
      }
      reader.readAsDataURL(file)
    }
  }

  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const MAX_WIDTH = 120
          const MAX_HEIGHT = 120
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width
              width = MAX_WIDTH
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height
              height = MAX_HEIGHT
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height)
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7)
            setEditImage(compressedBase64)
          }
        }
        img.src = event.target?.result as string
      }
      reader.readAsDataURL(file)
    }
  }

  const handleStartEdit = (o: Orderly) => {
    setEditingOrderly(o)
    setEditName(o.nhanvien)
    setEditImage(o.imageUrl || null)
  }

  const handleUpdateOrderly = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingOrderly || !editName.trim()) return

    setSubmittingEdit(true)
    try {
      const res = await fetch('/api/admin/orderlies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingOrderly.id_nhanvien,
          nhanvien: editName.trim(),
          imageUrl: editImage,
        }),
      })
      const data = await res.json()

      if (res.ok) {
        setEditingOrderly(null)
        showFeedback('success', `Đã cập nhật hộ lý: ${data.nhanvien}`)
        fetchOrderlies()
      } else {
        showFeedback('error', data.error || 'Lỗi khi cập nhật hộ lý')
      }
    } catch (err) {
      showFeedback('error', 'Lỗi kết nối hệ thống')
    } finally {
      setSubmittingEdit(false)
    }
  }

  const handleDeleteFromEdit = async () => {
    if (!editingOrderly) return
    const id = editingOrderly.id_nhanvien
    if (!confirm(`Bạn có chắc chắn muốn xóa nhân viên "${editingOrderly.nhanvien}" không?`)) return

    setSubmittingEdit(true)
    try {
      const res = await fetch(`/api/admin/orderlies?id=${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setEditingOrderly(null)
        showFeedback('success', 'Đã xóa hộ lý thành công')
        fetchOrderlies()
      } else {
        const data = await res.json()
        showFeedback('error', data.error || 'Lỗi khi xóa hộ lý')
      }
    } catch (err) {
      showFeedback('error', 'Lỗi kết nối hệ thống')
    } finally {
      setSubmittingEdit(false)
    }
  }

  const handleCreateOrderly = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderlyName.trim()) return

    setSubmittingOrderly(true)
    try {
      const res = await fetch('/api/admin/orderlies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nhanvien: orderlyName.trim(),
          hientrang: 'Đang làm',
          imageUrl: orderlyImage,
        }),
      })
      const data = await res.json()

      if (res.ok) {
        setOrderlyName('')
        setOrderlyImage(null)
        showFeedback('success', `Đã thêm hộ lý: ${data.nhanvien}`)
        fetchOrderlies()
      } else {
        showFeedback('error', data.error || 'Lỗi khi thêm hộ lý')
      }
    } catch (err) {
      showFeedback('error', 'Lỗi kết nối hệ thống')
    } finally {
      setSubmittingOrderly(false)
    }
  }

  const handleDeleteOrderly = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa nhân viên này không?')) return
    try {
      const res = await fetch(`/api/admin/orderlies?id=${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (res.ok) {
        showFeedback('success', 'Đã xóa hộ lý thành công')
        fetchOrderlies()
      } else {
        showFeedback('error', data.error || 'Lỗi khi xóa hộ lý')
      }
    } catch (err) {
      showFeedback('error', 'Lỗi kết nối hệ thống')
    }
  }

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleCreateLinenType = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ltName.trim() || !ltUnit.trim()) return

    setSubmittingType(true)
    try {
      const res = await fetch('/api/admin/linen-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ltName.trim(), unit: ltUnit.trim() }),
      })
      const data = await res.json()

      if (res.ok) {
        setLtName('')
        showFeedback('success', `Đã tạo thành công loại vải: ${data.name}`)
        fetchLinenTypes()
      } else {
        showFeedback('error', data.error || 'Lỗi khi tạo loại vải mới')
      }
    } catch (err) {
      showFeedback('error', 'Lỗi kết nối hệ thống')
    } finally {
      setSubmittingType(false)
    }
  }

  const handleCreateWard = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!wardName.trim()) return

    setSubmittingWard(true)
    try {
      const res = await fetch('/api/admin/wards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wardName.trim() }),
      })
      const data = await res.json()

      if (res.ok) {
        setWardName('')
        showFeedback('success', `Đã tạo thành công khoa phòng: ${data.name}`)
        fetchWards()
      } else {
        showFeedback('error', data.error || 'Lỗi khi tạo khoa phòng mới')
      }
    } catch (err) {
      showFeedback('error', 'Lỗi kết nối hệ thống')
    } finally {
      setSubmittingWard(false)
    }
  }

  const handleCopyQRLink = (ward: Ward) => {
    const origin = window.location.origin
    const qrLink = `${origin}/request/order?wardId=${ward.id}&token=${ward.qrToken}`
    
    navigator.clipboard.writeText(qrLink).then(
      () => {
        setCopiedId(ward.id)
        setTimeout(() => setCopiedId(null), 2000)
      },
      () => {
        alert('Không thể sao chép liên kết vào clipboard. Vui lòng sao chép thủ công.')
      }
    )
  }

  return (
    <div className="space-y-8 animate-fade-in text-slate-800">
      {/* Title section */}
      <div>
        <h1 className="text-2xl font-extrabold text-[#0066b2]">
          Danh mục Đồ vải & Khoa phòng
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Quản lý định nghĩa danh mục các loại đồ vải của bệnh viện và cấu hình mã QR truy cập cho từng khoa phòng.
        </p>
      </div>

      {/* Global feedback message */}
      {message && (
        <div className={`p-4 rounded-xl border text-sm font-semibold shadow-sm ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
          {message.text}
        </div>
      )}

      {/* Grid panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Panel 1: Linen Types */}
        <section className="bg-white border border-slate-200/85 rounded-2xl p-6 flex flex-col shadow-sm">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
            Quản lý Loại đồ vải
          </h2>

          {/* Form */}
          <form onSubmit={handleCreateLinenType} className="space-y-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
            <h3 className="text-xxs font-extrabold text-slate-500 uppercase tracking-wider">Thêm loại đồ vải mới</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xxs text-slate-500 mb-1 font-semibold">Tên loại đồ vải</label>
                <input
                  type="text"
                  value={ltName}
                  onChange={(e) => setLtName(e.target.value)}
                  placeholder="Ga trải giường, vỏ gối..."
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-xxs text-slate-500 mb-1 font-semibold">Đơn vị</label>
                <select
                  value={ltUnit}
                  onChange={(e) => setLtUnit(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2] transition-all"
                >
                  <option value="Cái">Cái</option>
                  <option value="Bộ">Bộ</option>
                  <option value="Chiếc">Chiếc</option>
                  <option value="Đôi">Đôi</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={submittingType}
              className="w-full bg-[#0066b2] hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-xs transition-all cursor-pointer"
            >
              Thêm loại đồ vải
            </button>
          </form>

          {/* List */}
          <div className="flex-1 overflow-auto max-h-[350px]">
            {loadingTypes ? (
              <div className="text-center py-8 text-slate-400 text-xs font-semibold">Đang tải...</div>
            ) : linenTypes.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs font-semibold">Chưa có loại đồ vải.</div>
            ) : (
              <div className="overflow-hidden border border-slate-200/80 rounded-xl">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 font-bold text-slate-500">Tên loại đồ vải</th>
                      <th className="px-4 py-3 font-bold text-slate-500 w-24">Đơn vị</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {linenTypes.map((lt) => (
                      <tr key={lt.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-700">{lt.name}</td>
                        <td className="px-4 py-3">
                          <span className="px-2.5 py-0.5 rounded-full text-xxs font-extrabold bg-slate-100 text-slate-600 border border-slate-200/40">
                            {lt.unit}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Panel 2: Wards */}
        <section className="bg-white border border-slate-200/85 rounded-2xl p-6 flex flex-col shadow-sm">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
            Quản lý Khoa phòng & QR Link
          </h2>

          {/* Form */}
          <form onSubmit={handleCreateWard} className="space-y-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
            <h3 className="text-xxs font-extrabold text-slate-500 uppercase tracking-wider">Thêm khoa phòng mới</h3>
            <div>
              <label className="block text-xxs text-slate-500 mb-1 font-semibold">Tên khoa phòng</label>
              <input
                type="text"
                value={wardName}
                onChange={(e) => setWardName(e.target.value)}
                placeholder="Ví dụ: Khoa Cấp Cứu, Khoa Nhi..."
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submittingWard}
              className="w-full bg-[#0066b2] hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-xs transition-all cursor-pointer"
            >
              Tạo khoa phòng
            </button>
          </form>

          {/* List */}
          <div className="flex-1 overflow-auto max-h-[350px]">
            {loadingWards ? (
              <div className="text-center py-8 text-slate-400 text-xs font-semibold">Đang tải...</div>
            ) : wards.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs font-semibold">Chưa có khoa phòng.</div>
            ) : (
              <div className="space-y-2">
                {wards.map((ward) => {
                  const qrLink = origin ? `${origin}/request/order?wardId=${ward.id}&token=${ward.qrToken}` : '';
                  return (
                    <div
                      key={ward.id}
                      className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-all duration-150"
                    >
                      <div className="flex items-center gap-3">
                        {/* Thumbnail QR Code */}
                        {origin && (
                          <a
                            href={`/admin/print-qr?wardId=${ward.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 block bg-white p-1 rounded-lg border border-slate-200 hover:border-[#0066b2] transition-colors cursor-zoom-in"
                            title="Bấm để in mã QR có tên khoa"
                          >
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrLink)}`}
                              alt={`QR ${ward.name}`}
                              className="w-12 h-12 block"
                            />
                          </a>
                        )}
                        <div>
                          <h4 className="font-bold text-sm text-slate-800">{ward.name}</h4>
                          <p className="text-xxs text-slate-400 font-semibold mt-0.5">
                            Ngày tạo: {new Date(ward.createdAt).toLocaleDateString('vi-VN')}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCopyQRLink(ward)}
                        className={`px-3 py-1.5 rounded-lg text-xxs font-extrabold border transition-all duration-150 flex items-center gap-1 cursor-pointer ${
                          copiedId === ward.id
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-[#0066b2]/50 hover:text-[#0066b2]'
                        }`}
                      >
                        {copiedId === ward.id ? 'Đã sao chép!' : 'Sao chép link QR'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Panel 3: Orderlies */}
        <section className="bg-white border border-slate-200/85 rounded-2xl p-6 flex flex-col shadow-sm">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
            Quản lý Nhân viên Hộ lý
          </h2>

          {/* Form */}
          <form onSubmit={handleCreateOrderly} className="space-y-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
            <h3 className="text-xxs font-extrabold text-slate-500 uppercase tracking-wider">Thêm hộ lý mới</h3>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* Image Upload Area */}
              <label className="relative flex flex-col items-center justify-center w-16 h-16 rounded-full border-2 border-dashed border-slate-300 hover:border-[#0066b2] bg-white cursor-pointer overflow-hidden transition-all shrink-0 shadow-inner group">
                {orderlyImage ? (
                  <img src={orderlyImage} alt="Avatar Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400 gap-0.5">
                    <span className="text-sm font-bold">＋</span>
                    <span className="text-[8px] font-bold uppercase tracking-wider">Ảnh</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>

              {/* Name and Button input */}
              <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div className="sm:col-span-3">
                  <label className="block text-xxs text-slate-500 mb-1 font-semibold">Họ và tên nhân viên</label>
                  <input
                    type="text"
                    value={orderlyName}
                    onChange={(e) => setOrderlyName(e.target.value)}
                    placeholder="Ví dụ: Nguyễn Văn A..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all"
                    required
                  />
                </div>
                <div className="sm:col-span-1">
                  <button
                    type="submit"
                    disabled={submittingOrderly}
                    className="w-full bg-[#0066b2] hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-xs transition-all cursor-pointer h-[34px]"
                  >
                    Thêm
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* List */}
          <div className="flex-1 overflow-auto max-h-[350px]">
            {loadingOrderlies ? (
              <div className="text-center py-8 text-slate-400 text-xs font-semibold">Đang tải...</div>
            ) : orderlies.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs font-semibold">Chưa có hộ lý.</div>
            ) : (
              <div className="overflow-hidden border border-slate-200/80 rounded-xl">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 font-bold text-slate-500 w-16 text-center">Hình ảnh</th>
                      <th className="px-4 py-3 font-bold text-slate-500">Họ tên nhân viên</th>
                      <th className="px-4 py-3 font-bold text-slate-500 w-20 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {orderlies.map((o) => {
                      const initials = o.nhanvien.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                      const bgColors = ['bg-blue-50 text-blue-600 border-blue-100', 'bg-indigo-50 text-indigo-600 border-indigo-100', 'bg-emerald-50 text-emerald-600 border-emerald-100', 'bg-violet-50 text-violet-600 border-violet-100']
                      const colorIndex = o.nhanvien.charCodeAt(0) % bgColors.length
                      const placeholderClass = `w-10 h-10 rounded-full border flex items-center justify-center text-xs font-extrabold ${bgColors[colorIndex]}`

                      return (
                        <tr key={o.id_nhanvien} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 text-center flex justify-center">
                            {o.imageUrl ? (
                              <img src={o.imageUrl} alt={o.nhanvien} className="w-10 h-10 rounded-full object-cover border border-slate-200/80 shadow-sm" />
                            ) : (
                              <div className={placeholderClass}>{initials}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-700">{o.nhanvien}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleStartEdit(o)}
                              className="text-[#0066b2] hover:text-blue-700 font-bold transition-colors cursor-pointer text-xs"
                            >
                              Sửa
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
 
      {/* Edit Orderly Modal */}
      {editingOrderly && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">Chỉnh sửa thông tin hộ lý</h3>
              <button
                type="button"
                onClick={() => setEditingOrderly(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1"
              >
                ✕
              </button>
            </div>
 
            <form onSubmit={handleUpdateOrderly} className="space-y-4">
              <div className="flex flex-col items-center gap-2">
                <label className="relative flex flex-col items-center justify-center w-20 h-20 rounded-full border-2 border-dashed border-slate-300 hover:border-[#0066b2] bg-white cursor-pointer overflow-hidden transition-all shadow-inner group">
                  {editImage ? (
                    <img src={editImage} alt="Edit Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 gap-0.5">
                      <span className="text-lg font-bold">＋</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider">Chọn ảnh</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleEditImageChange}
                    className="hidden"
                  />
                </label>
                <span className="text-[10px] text-slate-400 font-medium">(Nhấp vào ảnh để thay đổi)</span>
              </div>
 
              <div className="space-y-1">
                <label className="block text-xxs text-slate-500 font-semibold">Họ và tên nhân viên</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all"
                  required
                />
              </div>
 
              <div className="pt-2 space-y-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingOrderly(null)}
                    className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-2 rounded-lg text-xs transition-all cursor-pointer text-center"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submittingEdit}
                    className="flex-1 bg-[#0066b2] hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-xs transition-all cursor-pointer text-center"
                  >
                    {submittingEdit ? 'Đang lưu...' : 'Lưu'}
                  </button>
                </div>
                
                <button
                  type="button"
                  onClick={handleDeleteFromEdit}
                  disabled={submittingEdit}
                  className="w-full border border-rose-200 hover:bg-rose-50 text-rose-600 font-bold py-2 rounded-lg text-xs transition-all cursor-pointer text-center mt-2"
                >
                  Xóa nhân viên
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
