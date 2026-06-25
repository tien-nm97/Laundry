'use client'

import { useState, useEffect } from 'react'
import { useRealtimeSync } from '@/lib/useRealtimeSync'

interface LinenType {
  id: string
  name: string
  unit: string
}

interface AggregatedInventory {
  linenTypeId: string
  name: string
  unit: string
  originalStock: number
  inCirculation: number
  discarded: number
  minStock: number
  totalAccumulated: number
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

interface ActiveCirculation {
  id: string
  batchId: string
  batch: { code: string }
  linenTypeId: string
  linenType: LinenType
  activeQuantity: number
  startUseDate: string
}

export default function AdminInventory() {
  const [inventory, setInventory] = useState<AggregatedInventory[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [activeCirculations, setActiveCirculations] = useState<ActiveCirculation[]>([])
  const [linenTypes, setLinenTypes] = useState<LinenType[]>([])

  // Loadings
  const [loadingData, setLoadingData] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Modals Control
  const [showImportModal, setShowImportModal] = useState(false)
  const [showRecycleModal, setShowRecycleModal] = useState(false)

  // Form 1: Import Batch State
  const [importDate, setImportDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedLinenTypeId, setSelectedLinenTypeId] = useState('')
  const [importQty, setImportQty] = useState<number | ''>('')
  const [importItems, setImportItems] = useState<{ linenTypeId: string; name: string; unit: string; totalQuantity: number }[]>([])

  // Form 2: Discard & Recycle State
  const [selectedCirculationId, setSelectedCirculationId] = useState('')
  const [discardQty, setDiscardQty] = useState<number | ''>('')
  const [recycleAction, setRecycleAction] = useState<'DISCARD' | 'RECYCLE'>('DISCARD')
  const [recycledPillowQty, setRecycledPillowQty] = useState<number | ''>('')

  // Form 3: Minimum Stock State
  const [showMinStockModal, setShowMinStockModal] = useState(false)
  const [minStockInputs, setMinStockInputs] = useState<Record<string, number | ''>>({})

  const generatedBatchCode = `BATCH-${importDate.replace(/-/g, '')}`

  const openMinStockModal = () => {
    const inputs: Record<string, number | ''> = {}
    inventory.forEach((item) => {
      inputs[item.linenTypeId] = item.minStock || 0
    })
    setMinStockInputs(inputs)
    setShowMinStockModal(true)
  }

  const handleMinStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload = Object.entries(minStockInputs).map(([linenTypeId, val]) => ({
        linenTypeId,
        minStock: val === '' ? 0 : Number(val),
      }))

      const res = await fetch('/api/admin/inventory/min-stock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (res.ok) {
        showFeedback('success', 'Cập nhật định mức tồn tối thiểu thành công!')
        setShowMinStockModal(false)
        fetchInventoryData()
      } else {
        showFeedback('error', data.error || 'Lỗi khi cập nhật định mức')
      }
    } catch (err) {
      showFeedback('error', 'Lỗi kết nối')
    } finally {
      setSubmitting(false)
    }
  }

  const fetchInventoryData = async () => {
    try {
      const res = await fetch('/api/admin/inventory')
      if (res.ok) {
        const data = await res.json()
        setInventory(data.inventory || [])
        setBatches(data.batches || [])
        setActiveCirculations(data.activeCirculations || [])
      }
    } catch (err) {
      console.error('Error fetching inventory aggregated:', err)
    } finally {
      setLoadingData(false)
    }
  }

  const fetchLinenTypes = async () => {
    try {
      const res = await fetch('/api/admin/linen-types')
      if (res.ok) {
        const data = await res.json()
        setLinenTypes(data)
        if (data.length > 0) {
          setSelectedLinenTypeId(data[0].id)
        }
      }
    } catch (err) {
      console.error(err)
    }
  }

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchInventoryData()
      fetchLinenTypes()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  useRealtimeSync(
    ['Batch', 'LinenCirculation', 'LinenDiscardLog', 'LinenType'],
    () => {
      fetchInventoryData()
    },
    'admin-inventory-sync'
  )

  // Modal 1: Import items helpers
  const handleAddImportItem = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!selectedLinenTypeId || !importQty || Number(importQty) <= 0) {
      showFeedback('error', 'Vui lòng chọn loại đồ vải và nhập số lượng hợp lệ')
      return
    }

    const selectedType = linenTypes.find(lt => lt.id === selectedLinenTypeId)
    if (!selectedType) return

    const existingIndex = importItems.findIndex(item => item.linenTypeId === selectedLinenTypeId)
    if (existingIndex > -1) {
      const updated = [...importItems]
      updated[existingIndex].totalQuantity += Number(importQty)
      setImportItems(updated)
    } else {
      setImportItems([
        ...importItems,
        {
          linenTypeId: selectedLinenTypeId,
          name: selectedType.name,
          unit: selectedType.unit,
          totalQuantity: Number(importQty)
        }
      ])
    }
    setImportQty('')
  }

  const handleRemoveImportItem = (index: number) => {
    setImportItems(importItems.filter((_, i) => i !== index))
  }

  const handleCreateBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (importItems.length === 0) {
      showFeedback('error', 'Vui lòng thêm ít nhất một loại đồ vải vào danh sách')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: generatedBatchCode,
          importedAt: new Date(importDate).toISOString(),
          items: importItems.map(item => ({
            linenTypeId: item.linenTypeId,
            totalQuantity: item.totalQuantity
          }))
        }),
      })
      const data = await res.json()

      if (res.ok) {
        setImportItems([])
        setImportQty('')
        setShowImportModal(false)
        showFeedback('success', `Đã nhập thành công lô hàng: ${generatedBatchCode}`)
        fetchInventoryData()
      } else {
        showFeedback('error', data.error || 'Lỗi khi nhập lô hàng')
      }
    } catch {
      showFeedback('error', 'Lỗi kết nối')
    } finally {
      setSubmitting(false)
    }
  }

  // Modal 2: Recycle helpers
  const selectedCirc = activeCirculations.find(c => c.id === selectedCirculationId)
  const isEligibleForRecycling = selectedCirc
    ? (selectedCirc.linenType.name.toLowerCase().includes('drap') ||
       selectedCirc.linenType.name.toLowerCase().includes('ga trải') ||
       selectedCirc.linenType.name.toLowerCase().includes('ga giường'))
    : false

  const handleRecycleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCirculationId || !discardQty || Number(discardQty) <= 0) {
      showFeedback('error', 'Vui lòng điền đầy đủ các trường bắt buộc')
      return
    }

    if (selectedCirc && selectedCirc.activeQuantity < Number(discardQty)) {
      showFeedback('error', `Số lượng vượt quá lượng lưu hành (${selectedCirc.activeQuantity})`)
      return
    }

    if (recycleAction === 'RECYCLE' && (!recycledPillowQty || Number(recycledPillowQty) <= 0)) {
      showFeedback('error', 'Vui lòng nhập số vỏ gối thu hồi thực tế')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/inventory/recycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linenCirculationId: selectedCirculationId,
          discardQuantity: Number(discardQty),
          action: recycleAction,
          recycledQuantity: recycleAction === 'RECYCLE' ? Number(recycledPillowQty) : undefined
        })
      })

      const data = await res.json()
      if (res.ok) {
        showFeedback('success', recycleAction === 'RECYCLE' 
          ? 'Đã báo hỏng & chuyển sang tái chế thành công!' 
          : 'Đã báo hỏng thanh lý đồ vải thành công!')
        setSelectedCirculationId('')
        setDiscardQty('')
        setRecycledPillowQty('')
        setShowRecycleModal(false)
        fetchInventoryData()
      } else {
        showFeedback('error', data.error || 'Lỗi khi thực hiện báo hỏng/tái chế')
      }
    } catch {
      showFeedback('error', 'Lỗi kết nối')
    } finally {
      setSubmitting(false)
    }
  }

  // KPI Aggregates
  const totalOriginal = inventory.reduce((sum, item) => sum + item.originalStock, 0)
  const totalCirculation = inventory.reduce((sum, item) => sum + item.inCirculation, 0)
  const totalDiscarded = inventory.reduce((sum, item) => sum + item.discarded, 0)

  // Find the oldest active circulation IDs for each linen type (for FIFO recommendation)
  const oldestCirculationIds = new Set<string>()
  const seenTypes = new Set<string>()
  activeCirculations.forEach((c) => {
    if (!seenTypes.has(c.linenTypeId)) {
      seenTypes.add(c.linenTypeId)
      oldestCirculationIds.add(c.id)
    }
  })

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0066b2]">
            Quản lý kho
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Thống kê lượng tồn kho gốc, lượng đang lưu hành và quản lý hao hụt, tái chế đồ vải.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (linenTypes.length > 0) setSelectedLinenTypeId(linenTypes[0].id)
              setShowImportModal(true)
            }}
            className="px-4 py-2 bg-[#0066b2] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/10 cursor-pointer"
          >
            ＋ Nhập lô hàng mới
          </button>
          <button
            onClick={() => setShowRecycleModal(true)}
            className="px-4 py-2 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100/60 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            ⚠ Báo hỏng & Tái chế
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border text-sm font-semibold shadow-sm ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
          {message.text}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-blue-50 text-[#0066b2] rounded-xl flex items-center justify-center font-bold text-lg">📦</div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Tồn kho gốc</span>
            <span className="text-xl font-black text-slate-800">{totalOriginal} cái</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold text-lg">🔄</div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Đang lưu hành</span>
            <span className="text-xl font-black text-slate-800">{totalCirculation} cái</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center font-bold text-lg">🗑️</div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Đã báo hỏng</span>
            <span className="text-xl font-black text-slate-800">{totalDiscarded} cái</span>
          </div>
        </div>
      </div>

      {/* Inventory Summary Table */}
      <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
          Bảng thống kê lượng tồn kho
        </h2>

        {loadingData ? (
          <div className="text-center py-12 text-slate-400 text-xs font-semibold">Đang tải...</div>
        ) : inventory.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs font-semibold">Chưa có dữ liệu đồ vải.</div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-bold text-slate-500">Loại đồ vải</th>
                  <th className="px-4 py-3 font-bold text-slate-500 text-center">Đơn vị</th>
                  <th className="px-4 py-3 font-bold text-slate-700 text-center">Tồn kho gốc</th>
                  <th className="px-4 py-3 font-bold text-blue-600 text-center">Đang lưu hành</th>
                  <th className="px-4 py-3 font-bold text-rose-500 text-center">Đã báo hỏng</th>
                  <th className="px-4 py-3 font-bold text-slate-900 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Tồn tối thiểu</span>
                      <button
                        type="button"
                        onClick={openMinStockModal}
                        title="Chỉnh sửa định mức tồn tối thiểu"
                        className="text-blue-600 hover:text-blue-800 transition-colors cursor-pointer p-0.5 rounded hover:bg-slate-100/80 flex items-center justify-center"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {inventory.map((item) => (
                  <tr key={item.linenTypeId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4 font-bold text-slate-700">{item.name}</td>
                    <td className="px-4 py-4 text-center text-slate-500">{item.unit}</td>
                    <td className="px-4 py-4 text-center font-bold">
                      {item.minStock > 0 && item.originalStock <= item.minStock ? (
                        <span className="text-rose-600 font-extrabold flex items-center justify-center gap-1 w-fit mx-auto" title="Dưới định mức tồn tối thiểu!">
                          <span>{item.originalStock}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100 font-bold">⚠️ Thấp</span>
                        </span>
                      ) : (
                        <span className="text-slate-800">{item.originalStock}</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center font-bold text-[#0066b2]">{item.inCirculation}</td>
                    <td className="px-4 py-4 text-center font-bold text-rose-600">{item.discarded}</td>
                    <td className="px-4 py-4 text-center font-black text-slate-900 bg-slate-50/30">{item.minStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Batch Import History Table */}
      <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
          Lịch sử các lô hàng nhập
        </h2>

        {loadingData ? (
          <div className="text-center py-12 text-slate-400 text-xs font-semibold">Đang tải...</div>
        ) : batches.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs font-semibold">Chưa có lô hàng nào được nhập.</div>
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

      {/* Modal 1: Import Batch */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-scale-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">Nhập lô hàng mới</h3>
              <button
                type="button"
                onClick={() => {
                  setImportItems([])
                  setShowImportModal(false)
                }}
                className="text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBatchSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xxs text-slate-500 mb-1 font-bold">Mã lô (Tự động tạo)</label>
                <input
                  type="text"
                  value={generatedBatchCode}
                  readOnly
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-bold text-slate-500 cursor-not-allowed focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xxs text-slate-500 mb-1 font-bold">Ngày nhập kho</label>
                <input
                  type="date"
                  value={importDate}
                  onChange={(e) => setImportDate(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                  required
                />
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-900">Chi tiết đồ vải nhập</h4>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xxs text-slate-500 mb-1 font-bold">Loại đồ vải</label>
                    <select
                      value={selectedLinenTypeId}
                      onChange={(e) => setSelectedLinenTypeId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                    >
                      {linenTypes.map((lt) => (
                        <option key={lt.id} value={lt.id}>
                          {lt.name} ({lt.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xxs text-slate-500 mb-1 font-bold">Số lượng</label>
                    <input
                      type="number"
                      min="1"
                      value={importQty}
                      onChange={(e) => setImportQty(e.target.value !== '' ? Number(e.target.value) : '')}
                      placeholder="Số lượng"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleAddImportItem}
                      className="w-full h-[34px] border border-dashed border-[#0066b2] hover:bg-blue-50 text-[#0066b2] font-bold rounded-lg text-xs cursor-pointer flex items-center justify-center gap-1"
                    >
                      <span>＋</span> Thêm dòng
                    </button>
                  </div>
                </div>
              </div>

              {importItems.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-32 overflow-y-auto">
                  <table className="w-full text-left text-xxs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-3 py-2 font-bold text-slate-500">Mặt hàng</th>
                        <th className="px-3 py-2 font-bold text-slate-500 text-center">SL</th>
                        <th className="px-3 py-2 font-bold text-slate-500 text-center">Xóa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {importItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-slate-700 font-medium">{item.name}</td>
                          <td className="px-3 py-2 text-slate-600 font-bold text-center">{item.totalQuantity} {item.unit}</td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveImportItem(idx)}
                              className="text-red-500 hover:text-red-700 font-bold cursor-pointer px-1.5"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="border-t border-slate-100 pt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setImportItems([])
                    setShowImportModal(false)
                  }}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting || importItems.length === 0}
                  className="px-4 py-2 bg-[#0066b2] hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  {submitting ? 'Đang xử lý...' : 'Nhập kho lô hàng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Discard & Recycle */}
      {showRecycleModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-scale-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">Báo hỏng & Tái chế đồ vải</h3>
              <button
                type="button"
                onClick={() => setShowRecycleModal(false)}
                className="text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecycleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xxs text-slate-500 mb-1 font-bold">Lô đồ vải đang lưu thông</label>
                <select
                  value={selectedCirculationId}
                  onChange={(e) => {
                    const circId = e.target.value
                    setSelectedCirculationId(circId)
                    const circ = activeCirculations.find(c => c.id === circId)
                    const eligible = circ
                      ? (circ.linenType.name.toLowerCase().includes('drap') ||
                         circ.linenType.name.toLowerCase().includes('ga trải') ||
                         circ.linenType.name.toLowerCase().includes('ga giường'))
                      : false
                    if (!eligible) {
                      setRecycleAction('DISCARD')
                    }
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                  required
                >
                  <option value="">-- Chọn lô đang lưu thông --</option>
                  {activeCirculations.map((c) => {
                    const isOldest = oldestCirculationIds.has(c.id)
                    return (
                      <option key={c.id} value={c.id}>
                        {c.linenType.name} - Lô: {c.batch.code} (Lưu hành: {c.activeQuantity}){isOldest ? ' - [FIFO - Khuyên dùng]' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              {selectedCirc && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/60 text-xxs text-slate-500 space-y-1">
                  <p>• Mặt hàng: <strong className="text-slate-700">{selectedCirc.linenType.name}</strong></p>
                  <p>• Lô gốc: <strong className="text-slate-700">{selectedCirc.batch.code}</strong></p>
                  <p>• Đang hoạt động: <strong className="text-slate-700">{selectedCirc.activeQuantity} {selectedCirc.linenType.unit}</strong></p>
                </div>
              )}

              <div>
                <label className="block text-xxs text-slate-500 mb-1 font-bold">Số lượng báo hỏng</label>
                <input
                  type="number"
                  min="1"
                  max={selectedCirc ? selectedCirc.activeQuantity : undefined}
                  value={discardQty}
                  onChange={(e) => setDiscardQty(e.target.value !== '' ? Number(e.target.value) : '')}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                  placeholder="SL cần báo hỏng"
                  required
                />
              </div>

              {selectedCirc && (
                <div>
                  <label className="block text-xxs text-slate-500 mb-2 font-bold">Phương thức xử lý</label>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="recycleAction"
                        checked={recycleAction === 'DISCARD'}
                        onChange={() => setRecycleAction('DISCARD')}
                      />
                      <span>Thanh lý / Hủy bỏ thông thường</span>
                    </label>
                    
                    {isEligibleForRecycling && (
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="recycleAction"
                          checked={recycleAction === 'RECYCLE'}
                          onChange={() => setRecycleAction('RECYCLE')}
                        />
                        <span className="text-emerald-600 font-bold">Tái chế thành Vỏ gối</span>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {recycleAction === 'RECYCLE' && (
                <div className="space-y-2 border-t border-slate-100 pt-3 animate-fade-in">
                  <label className="block text-xxs text-slate-500 mb-1 font-bold">Số lượng vỏ gối thu hồi thực tế</label>
                  <input
                    type="number"
                    min="1"
                    value={recycledPillowQty}
                    onChange={(e) => setRecycledPillowQty(e.target.value !== '' ? Number(e.target.value) : '')}
                    placeholder="SL vỏ gối nhận được từ nhà cung cấp"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                    required
                  />
                  <p className="text-[10px] text-amber-600 font-semibold leading-relaxed">
                    * Số lượng này sẽ tự động tạo một lô hàng nhập (Batch) mới cho loại đồ vải &quot;Vỏ gối&quot;.
                  </p>
                </div>
              )}

              <div className="border-t border-slate-100 pt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowRecycleModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  {submitting ? 'Đang xử lý...' : 'Xác nhận xử lý'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Configure Minimum Stock */}
      {showMinStockModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-scale-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">Cài đặt định mức tồn tối thiểu</h3>
              <button
                type="button"
                onClick={() => setShowMinStockModal(false)}
                className="text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleMinStockSubmit} className="p-6 space-y-4">
              <p className="text-[10px] text-slate-400 leading-relaxed">
                * Thiết lập định mức tồn tối thiểu dự phòng cho kho gốc. Khi số lượng khả dụng ở kho gốc giảm bằng hoặc dưới định mức, hệ thống sẽ cảnh báo đỏ để tiến hành đặt hàng bổ sung.
              </p>

              <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
                {inventory.map((item) => (
                  <div key={item.linenTypeId} className="flex items-center justify-between gap-4 border-b border-slate-50 pb-2">
                    <span className="text-xs text-slate-700 font-bold">
                      {item.name} <span className="text-xxs text-slate-400 font-normal">({item.unit})</span>
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={minStockInputs[item.linenTypeId] ?? 0}
                      onChange={(e) =>
                        setMinStockInputs({
                          ...minStockInputs,
                          [item.linenTypeId]: e.target.value !== '' ? Number(e.target.value) : '',
                        })
                      }
                      className="w-24 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 text-right focus:outline-none focus:border-[#0066b2]"
                      required
                    />
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowMinStockModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#0066b2] hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  {submitting ? 'Đang xử lý...' : 'Lưu cấu hình'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
