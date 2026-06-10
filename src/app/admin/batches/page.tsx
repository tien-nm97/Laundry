'use client'

import { useState, useEffect } from 'react'

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
  createdAt: string
}

export default function AdminBatches() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [linenTypes, setLinenTypes] = useState<LinenType[]>([])

  // Form states
  const [code, setCode] = useState('')
  const [linenTypeId, setLinenTypeId] = useState('')
  const [totalQuantity, setTotalQuantity] = useState<number | ''>('')
  const [importedAt, setImportedAt] = useState(new Date().toISOString().split('T')[0])

  // Loading & feedback states
  const [loadingBatches, setLoadingBatches] = useState(true)
  const [loadingTypes, setLoadingTypes] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchBatches()
    fetchLinenTypes()
  }, [])

  const fetchBatches = async () => {
    setLoadingBatches(true)
    try {
      const res = await fetch('/api/admin/batches')
      if (res.ok) {
        setBatches(await res.json())
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingBatches(false)
    }
  }

  const fetchLinenTypes = async () => {
    setLoadingTypes(true)
    try {
      const res = await fetch('/api/admin/linen-types')
      if (res.ok) {
        const data = await res.json()
        setLinenTypes(data)
        if (data.length > 0) {
          setLinenTypeId(data[0].id)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingTypes(false)
    }
  }

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || !linenTypeId || !totalQuantity || !importedAt) {
      showFeedback('error', 'Vui lòng điền đầy đủ thông tin')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          linenTypeId,
          totalQuantity: Number(totalQuantity),
          importedAt: new Date(importedAt).toISOString(),
        }),
      })
      const data = await res.json()

      if (res.ok) {
        setCode('')
        setTotalQuantity('')
        showFeedback('success', `Đã nhập thành công lô hàng: ${data.code}`)
        fetchBatches()
      } else {
        showFeedback('error', data.error || 'Lỗi khi nhập lô hàng')
      }
    } catch (err) {
      showFeedback('error', 'Lỗi kết nối')
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusBadge = (batch: Batch) => {
    if (batch.remainingQuantity === batch.totalQuantity) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xxs font-extrabold bg-slate-100 text-slate-600 border border-slate-200/50">
          Chưa khai thác
        </span>
      )
    }
    if (batch.remainingQuantity === 0) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xxs font-extrabold bg-red-50 text-red-600 border border-red-100/30">
          Khai thác hết
        </span>
      )
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xxs font-extrabold bg-blue-50 text-[#0066b2] border border-blue-100/30">
        Đang khai thác
      </span>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in text-slate-800">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-extrabold text-[#0066b2]">
          Quản lý Lô nhập hàng
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Khai báo các lô hàng dệt may y tế mới nhập kho trước khi đưa vào lưu thông.
        </p>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border text-sm font-semibold shadow-sm ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left form */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm sticky top-24">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
              Nhập lô hàng mới
            </h2>

            <form onSubmit={handleCreateBatch} className="space-y-4">
              <div>
                <label className="block text-xxs text-slate-500 mb-1 font-semibold">Mã lô nhập</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="BATCH-2026-001"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xxs text-slate-500 mb-1 font-semibold">Loại đồ vải</label>
                {loadingTypes ? (
                  <div className="text-xs text-slate-400 font-semibold py-2">Đang tải...</div>
                ) : (
                  <select
                    value={linenTypeId}
                    onChange={(e) => setLinenTypeId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2] transition-all"
                    required
                  >
                    {linenTypes.map((lt) => (
                      <option key={lt.id} value={lt.id}>
                        {lt.name} ({lt.unit})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xxs text-slate-500 mb-1 font-semibold">Tổng số lượng</label>
                <input
                  type="number"
                  min="1"
                  value={totalQuantity}
                  onChange={(e) => setTotalQuantity(e.target.value !== '' ? Number(e.target.value) : '')}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xxs text-slate-500 mb-1 font-semibold">Ngày nhập kho</label>
                <input
                  type="date"
                  value={importedAt}
                  onChange={(e) => setImportedAt(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2] transition-all"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#0066b2] hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-xs transition-all cursor-pointer"
              >
                Nhập kho lô hàng
              </button>
            </form>
          </div>
        </div>

        {/* Right list */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm flex flex-col h-full">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
              Lịch sử các lô hàng nhập
            </h2>

            {loadingBatches ? (
              <div className="text-center py-12 text-slate-400 text-xs font-semibold">Đang tải...</div>
            ) : batches.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs font-semibold">Chưa có lô hàng.</div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 font-bold text-slate-500">Mã lô</th>
                      <th className="px-4 py-3 font-bold text-slate-500">Loại vải</th>
                      <th className="px-4 py-3 font-bold text-slate-500 text-center">Trữ lượng (Còn/Tổng)</th>
                      <th className="px-4 py-3 font-bold text-slate-500">Ngày nhập</th>
                      <th className="px-4 py-3 font-bold text-slate-500">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {batches.map((batch) => {
                      const percentRemaining = (batch.remainingQuantity / batch.totalQuantity) * 100
                      return (
                        <tr key={batch.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-4 font-bold text-slate-700">{batch.code}</td>
                          <td className="px-4 py-4 text-slate-600">{batch.linenType?.name}</td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex flex-col items-center gap-1 w-28 mx-auto">
                              <span className="font-bold text-slate-700 text-xxs">
                                {batch.remainingQuantity} / {batch.totalQuantity}
                              </span>
                              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                                <div
                                  style={{ width: `${percentRemaining}%` }}
                                  className={`h-full rounded-full transition-all ${
                                    percentRemaining === 100
                                      ? 'bg-emerald-500'
                                      : percentRemaining === 0
                                      ? 'bg-slate-300'
                                      : 'bg-[#0066b2]'
                                  }`}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-slate-500">
                            {new Date(batch.importedAt).toLocaleDateString('vi-VN')}
                          </td>
                          <td className="px-4 py-4">{getStatusBadge(batch)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
