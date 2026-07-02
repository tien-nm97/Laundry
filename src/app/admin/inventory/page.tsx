'use client'

import { useState, useEffect } from 'react'
import { useRealtimeSync } from '@/lib/useRealtimeSync'
import { hasPermission } from '@/lib/permissions'

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

interface RecycleProposal {
  id: string
  linenCirculationId: string
  quantity: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  recycledQuantity?: number | null
  proposerName: string
  approverName?: string | null
  proposedAt: string
  approvedAt?: string | null
  circulation: {
    linenType: LinenType
    batch: {
      code: string
    }
  }
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

  // Recycle Proposals & Roles States
  const [recycleProposals, setRecycleProposals] = useState<RecycleProposal[]>([])
  const [userRole, setUserRole] = useState('')
  const [userPermissions, setUserPermissions] = useState<string[]>([])

  const canViewStockNumbers = userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:view')
  const canManageInventory = userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:manage')

  // Modal Approve Control
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [selectedProposal, setSelectedProposal] = useState<RecycleProposal | null>(null)
  const [adminRecycledQty, setAdminRecycledQty] = useState<number | ''>('')

  // Circulate & Transaction logs
  const [showCirculateModal, setShowCirculateModal] = useState(false)
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
  const [circulateQty, setCirculateQty] = useState<number | ''>('')
  const [transactions, setTransactions] = useState<any[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(true)

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
        setRecycleProposals(data.recycleProposals || [])
      }
      await fetchTransactionsData()
    } catch (err) {
      console.error('Error fetching inventory aggregated:', err)
    } finally {
      setLoadingData(false)
    }
  }

  const fetchTransactionsData = async () => {
    try {
      const res = await fetch('/api/admin/inventory/transactions')
      if (res.ok) {
        const data = await res.json()
        setTransactions(data || [])
      }
    } catch (err) {
      console.error('Error fetching transactions:', err)
    } finally {
      setLoadingTransactions(false)
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

  const fetchUserProfile = async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        setUserRole(data.role || '')
        setUserPermissions(data.permissions || [])
      }
    } catch (err) {
      console.error('Error fetching user profile:', err)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchInventoryData()
      fetchLinenTypes()
      fetchUserProfile()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  useRealtimeSync(
    ['Batch', 'LinenCirculation', 'LinenDiscardLog', 'LinenType', 'LinenRecycleProposal'],
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
  const selectedLinenType = linenTypes.find(t => t.id === selectedLinenTypeId)
  const isEligibleForRecycling = selectedLinenType
    ? (selectedLinenType.name.toLowerCase().includes('drap') ||
       selectedLinenType.name.toLowerCase().includes('ga trải') ||
       selectedLinenType.name.toLowerCase().includes('ga giường'))
    : false

  const handleRecycleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedLinenTypeId || !discardQty || Number(discardQty) <= 0) {
      showFeedback('error', 'Vui lòng điền đầy đủ các trường bắt buộc')
      return
    }

    const totalActive = activeCirculations
      .filter(c => c.linenTypeId === selectedLinenTypeId)
      .reduce((sum, c) => sum + c.activeQuantity, 0)

    if (totalActive < Number(discardQty)) {
      showFeedback('error', `Số lượng vượt quá tổng lượng lưu hành hiện tại (${totalActive})`)
      return
    }

    setSubmitting(true)
    try {
      let res
      if (recycleAction === 'RECYCLE') {
        res = await fetch('/api/admin/inventory/recycle/propose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linenTypeId: selectedLinenTypeId,
            quantity: Number(discardQty)
          })
        })
      } else {
        res = await fetch('/api/admin/inventory/recycle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linenTypeId: selectedLinenTypeId,
            discardQuantity: Number(discardQty),
            action: 'DISCARD'
          })
        })
      }

      const data = await res.json()
      if (res.ok) {
        showFeedback('success', recycleAction === 'RECYCLE' 
          ? 'Đã gửi đề xuất tái chế đồ vải thành công, chờ Admin phê duyệt!' 
          : 'Đã báo hỏng thanh lý đồ vải thành công!')
        if (linenTypes.length > 0) setSelectedLinenTypeId(linenTypes[0].id)
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

  const handleCirculateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBatch || !circulateQty || Number(circulateQty) <= 0) {
      showFeedback('error', 'Vui lòng nhập số lượng hợp lệ')
      return
    }

    if (Number(circulateQty) > selectedBatch.remainingQuantity) {
      showFeedback('error', 'Số lượng vượt quá trữ lượng sạch còn lại trong lô')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/inventory/circulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatch.id,
          quantity: Number(circulateQty)
        })
      })

      const data = await res.json()
      if (res.ok) {
        showFeedback('success', 'Đã đưa đồ vải vào lưu thông sử dụng thành công!')
        setShowCirculateModal(false)
        setSelectedBatch(null)
        setCirculateQty('')
        fetchInventoryData()
      } else {
        showFeedback('error', data.error || 'Lỗi khi thực hiện đưa vào sử dụng')
      }
    } catch {
      showFeedback('error', 'Lỗi kết nối')
    } finally {
      setSubmitting(false)
    }
  }


  const handleApproveProposal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProposal || !adminRecycledQty || Number(adminRecycledQty) <= 0) {
      showFeedback('error', 'Vui lòng nhập số lượng vỏ gối thu hồi hợp lệ')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/inventory/recycle/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: selectedProposal.id,
          action: 'APPROVED',
          recycledQuantity: Number(adminRecycledQty),
        })
      })

      const data = await res.json()
      if (res.ok) {
        showFeedback('success', 'Phê duyệt và hòa nhập kho thành công!')
        setShowApproveModal(false)
        setSelectedProposal(null)
        setAdminRecycledQty('')
        fetchInventoryData()
      } else {
        showFeedback('error', data.error || 'Lỗi khi phê duyệt đề xuất')
      }
    } catch {
      showFeedback('error', 'Lỗi kết nối')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRejectProposal = async (proposalId: string) => {
    if (!confirm('Bạn có chắc chắn muốn từ chối đề xuất tái chế này không?')) {
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/inventory/recycle/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId,
          action: 'REJECTED'
        })
      })

      const data = await res.json()
      if (res.ok) {
        showFeedback('success', 'Đã từ chối đề xuất tái chế!')
        fetchInventoryData()
      } else {
        showFeedback('error', data.error || 'Lỗi khi từ chối đề xuất')
      }
    } catch {
      showFeedback('error', 'Lỗi kết nối')
    } finally {
      setSubmitting(false)
    }
  }

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
          {(userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:manage')) && (
            <button
              onClick={() => {
                if (linenTypes.length > 0) setSelectedLinenTypeId(linenTypes[0].id)
                setShowImportModal(true)
              }}
              className="px-4 py-2 bg-[#0066b2] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/10 cursor-pointer"
            >
              ＋ Nhập lô hàng mới
            </button>
          )}
          {(userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:manage')) && (
            <button
              onClick={() => setShowRecycleModal(true)}
              className="px-4 py-2 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100/60 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              ⚠ Báo hỏng & Tái chế
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border text-sm font-semibold shadow-sm ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
          {message.text}
        </div>
      )}


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
                      {(userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:manage')) && (
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
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {inventory.map((item) => {
                  const showStock = canViewStockNumbers
                  const originalVal = showStock ? item.originalStock : '***'
                  const circulationVal = showStock ? item.inCirculation : '***'
                  const discardedVal = showStock ? item.discarded : '***'
                  const minStockVal = showStock ? item.minStock : '***'
                  const isLow = showStock && item.minStock > 0 && item.originalStock <= item.minStock

                  return (
                    <tr key={item.linenTypeId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-4 font-bold text-slate-700">{item.name}</td>
                      <td className="px-4 py-4 text-center text-slate-500">{item.unit}</td>
                      <td className="px-4 py-4 text-center font-bold">
                        {isLow ? (
                          <span className="text-rose-600 font-extrabold flex items-center justify-center gap-1 w-fit mx-auto" title="Dưới định mức tồn tối thiểu!">
                            <span>{originalVal}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100 font-bold">⚠️ Thấp</span>
                          </span>
                        ) : (
                          <span className="text-slate-800">{originalVal}</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-[#0066b2]">{circulationVal}</td>
                      <td className="px-4 py-4 text-center font-bold text-rose-600">{discardedVal}</td>
                      <td className="px-4 py-4 text-center font-black text-slate-900 bg-slate-50/30">{minStockVal}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recycle Proposals Table */}
      <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          Yêu cầu tái chế đồ vải (Drap sang Vỏ gối)
        </h2>

        {recycleProposals.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs font-semibold">Chưa có đề xuất tái chế nào.</div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-bold text-slate-500">Lô đồ vải đề xuất</th>
                  <th className="px-4 py-3 font-bold text-slate-500 text-center">SL ga giường hỏng</th>
                  <th className="px-4 py-3 font-bold text-slate-500">Người đề xuất</th>
                  <th className="px-4 py-3 font-bold text-slate-500">Ngày đề xuất</th>
                  <th className="px-4 py-3 font-bold text-slate-500 text-center">Trạng thái</th>
                  <th className="px-4 py-3 font-bold text-slate-500 text-center">SL vỏ gối thu hồi</th>
                  <th className="px-4 py-3 font-bold text-slate-500">Người duyệt</th>
                  <th className="px-4 py-3 font-bold text-slate-500 text-center">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {recycleProposals.map((proposal) => {
                  const circulationName = proposal.circulation?.linenType?.name || 'Đồ vải'
                  const batchCode = proposal.circulation?.batch?.code || 'Không rõ'
                  const showStock = canViewStockNumbers
                  return (
                    <tr key={proposal.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-4 font-bold text-slate-700">
                        <div>{circulationName}</div>
                        <div className="text-xxs font-normal text-slate-400">Lô gốc: {batchCode}</div>
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-rose-600">{showStock ? proposal.quantity : '***'}</td>
                      <td className="px-4 py-4 text-slate-600 font-medium">{proposal.proposerName}</td>
                      <td className="px-4 py-4 text-slate-500">
                        {new Date(proposal.proposedAt).toLocaleDateString('vi-VN')} {new Date(proposal.proposedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {proposal.status === 'PENDING' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xxs font-extrabold bg-amber-50 text-amber-600 border border-amber-100/30">
                            Chờ duyệt
                          </span>
                        )}
                        {proposal.status === 'APPROVED' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xxs font-extrabold bg-emerald-50 text-emerald-600 border border-emerald-100/30">
                            Đã duyệt
                          </span>
                        )}
                        {proposal.status === 'REJECTED' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xxs font-extrabold bg-red-50 text-red-600 border border-red-100/30">
                            Từ chối
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-emerald-600">
                        {proposal.recycledQuantity !== null && proposal.recycledQuantity !== undefined ? (showStock ? `${proposal.recycledQuantity} cái` : '***') : '-'}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {proposal.approverName || '-'}
                        {proposal.approvedAt && (
                          <div className="text-[10px] text-slate-400 font-normal">
                            {new Date(proposal.approvedAt).toLocaleDateString('vi-VN')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {proposal.status === 'PENDING' && userRole === 'ADMIN' ? (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedProposal(proposal)
                                setShowApproveModal(true)
                              }}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-lg text-xxs font-bold transition-all cursor-pointer"
                            >
                              Duyệt
                            </button>
                            <button
                              onClick={() => handleRejectProposal(proposal.id)}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xxs font-bold transition-all cursor-pointer"
                            >
                              Từ chối
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
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
                  <th className="px-4 py-3 font-bold text-slate-500 text-center w-36">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {batches.map((batch) => {
                  const showStock = canViewStockNumbers
                  const percentRemaining = showStock ? (batch.remainingQuantity / batch.totalQuantity) * 100 : 0
                  const canCirculate = batch.remainingQuantity !== null && batch.remainingQuantity !== undefined && batch.remainingQuantity > 0 && (userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:manage'))
                  return (
                    <tr key={batch.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-4 font-bold text-slate-700">{batch.code}</td>
                      <td className="px-4 py-4 text-slate-600">{batch.linenType?.name}</td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center gap-1 w-28 mx-auto">
                          <span className="font-bold text-slate-700 text-xxs">
                            {showStock ? `${batch.remainingQuantity} / ${batch.totalQuantity}` : '***'}
                          </span>
                          {showStock && (
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
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-500">
                        {new Date(batch.importedAt).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-4 py-4">{getStatusBadge(batch)}</td>
                      <td className="px-4 py-4 text-center">
                        {canCirculate ? (
                          <button
                            onClick={() => {
                              setSelectedBatch(batch)
                              setCirculateQty(batch.remainingQuantity)
                              setShowCirculateModal(true)
                            }}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#0066b2] border border-blue-200 rounded-lg text-xxs font-bold transition-all cursor-pointer"
                          >
                            Đưa vào sử dụng
                          </button>
                        ) : (
                          <span className="text-slate-400 font-bold">-</span>
                        )}
                      </td>
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
                <label className="block text-xxs text-slate-500 mb-1 font-bold">Loại đồ vải</label>
                <select
                  value={selectedLinenTypeId}
                  onChange={(e) => {
                    const typeId = e.target.value
                    setSelectedLinenTypeId(typeId)
                    const lt = linenTypes.find(t => t.id === typeId)
                    const eligible = lt
                      ? (lt.name.toLowerCase().includes('drap') ||
                         lt.name.toLowerCase().includes('ga trải') ||
                         lt.name.toLowerCase().includes('ga giường'))
                      : false
                    if (!eligible) {
                      setRecycleAction('DISCARD')
                    }
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                  required
                >
                  <option value="">-- Chọn loại đồ vải --</option>
                  {linenTypes.map((t) => {
                    const activeQty = activeCirculations
                      .filter(c => c.linenTypeId === t.id)
                      .reduce((sum, c) => sum + c.activeQuantity, 0)
                    return (
                      <option key={t.id} value={t.id}>
                        {t.name} {canViewStockNumbers ? `(Lưu hành: ${activeQty} ${t.unit})` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              {selectedLinenTypeId && (() => {
                const lt = linenTypes.find(t => t.id === selectedLinenTypeId)
                const activeQty = activeCirculations
                  .filter(c => c.linenTypeId === selectedLinenTypeId)
                  .reduce((sum, c) => sum + c.activeQuantity, 0)
                return (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/60 text-xxs text-slate-500 space-y-1">
                    <p>• Mặt hàng: <strong className="text-slate-700">{lt?.name}</strong></p>
                    <p>• Tổng lưu hành: <strong className="text-slate-700">{canViewStockNumbers ? `${activeQty} ${lt?.unit}` : '***'}</strong></p>
                    <p className="text-amber-600 font-medium">• Hệ thống tự động trừ kho từ lô cũ nhất đến lô mới nhất (FIFO).</p>
                  </div>
                )
              })()}

              <div>
                <label className="block text-xxs text-slate-500 mb-1 font-bold">Số lượng báo hỏng</label>
                <input
                  type="number"
                  min="1"
                  max={selectedLinenTypeId ? activeCirculations.filter(c => c.linenTypeId === selectedLinenTypeId).reduce((sum, c) => sum + c.activeQuantity, 0) : undefined}
                  value={discardQty}
                  onChange={(e) => setDiscardQty(e.target.value !== '' ? Number(e.target.value) : '')}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                  placeholder="SL cần báo hỏng"
                  required
                />
              </div>

              {selectedLinenTypeId && (
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
                    
                    {isEligibleForRecycling && (userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:manage')) && (
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
                  <p className="text-[11px] text-emerald-600 font-bold leading-relaxed">
                    * Yêu cầu này sẽ được gửi tới Quản trị viên (Admin) dưới dạng đề xuất chờ duyệt. Admin sẽ nhập số lượng vỏ gối thu hồi thực tế khi phê duyệt để tự động cập nhật kho.
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
                  {submitting ? 'Đang xử lý...' : (recycleAction === 'RECYCLE' ? 'Gửi đề xuất tái chế' : 'Xác nhận xử lý')}
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

      {/* Modal 4: Admin Approve Proposal */}
      {showApproveModal && selectedProposal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-scale-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">Phê duyệt tái chế đồ vải</h3>
              <button
                type="button"
                onClick={() => {
                  setShowApproveModal(false)
                  setSelectedProposal(null)
                  setAdminRecycledQty('')
                }}
                className="text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleApproveProposal} className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60 text-xs text-slate-600 space-y-2">
                <h4 className="font-bold text-slate-700">Thông tin đề xuất:</h4>
                <p>• Loại đồ vải: <strong>{selectedProposal.circulation?.linenType?.name || 'Đồ vải'}</strong></p>
                <p>• Mã lô: <strong>{selectedProposal.circulation?.batch?.code || 'Không rõ'}</strong></p>
                <p>• Số lượng drap báo hỏng để tái chế: <strong className="text-rose-600">{selectedProposal.quantity} tấm</strong></p>
                <p>• Người đề xuất: <strong>{selectedProposal.proposerName}</strong></p>
                <p>• Ngày đề xuất: <strong>{new Date(selectedProposal.proposedAt).toLocaleDateString('vi-VN')}</strong></p>
              </div>

              <div>
                <label className="block text-xs text-slate-700 mb-1 font-bold">Số lượng vỏ gối thu hồi thực tế</label>
                <input
                  type="number"
                  min="1"
                  value={adminRecycledQty}
                  onChange={(e) => setAdminRecycledQty(e.target.value !== '' ? Number(e.target.value) : '')}
                  placeholder="Nhập số lượng vỏ gối nhận từ nhà may"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  * Khi xác nhận, hệ thống sẽ tự động trừ {selectedProposal.quantity} tấm ga giường khỏi lượng lưu thông của lô tương ứng, đồng thời tạo một lô hàng nhập &quot;Vỏ gối&quot; mới với trữ lượng trên.
                </p>
              </div>

              <div className="border-t border-slate-100 pt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowApproveModal(false)
                    setSelectedProposal(null)
                    setAdminRecycledQty('')
                  }}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  {submitting ? 'Đang xử lý...' : 'Xác nhận duyệt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Put Batch into Use (Circulate) */}
      {showCirculateModal && selectedBatch && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-scale-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">Đưa đồ vải vào sử dụng</h3>
              <button
                type="button"
                onClick={() => {
                  setShowCirculateModal(false)
                  setSelectedBatch(null)
                  setCirculateQty('')
                }}
                className="text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCirculateSubmit} className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/60 text-xxs text-slate-500 space-y-1">
                <p>• Loại đồ vải: <strong className="text-slate-700">{selectedBatch.linenType?.name}</strong></p>
                <p>• Mã lô hàng: <strong className="text-slate-700">{selectedBatch.code}</strong></p>
                <p>• Trữ lượng sạch dự phòng: <strong className="text-slate-700">{selectedBatch.remainingQuantity} {selectedBatch.linenType?.unit}</strong></p>
              </div>

              <div>
                <label className="block text-xxs text-slate-500 mb-1 font-bold">Số lượng đưa vào sử dụng</label>
                <input
                  type="number"
                  min="1"
                  max={selectedBatch.remainingQuantity}
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
                    setSelectedBatch(null)
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

      {/* Inventory Transaction Logs Table */}
      <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
          Nhật ký biến động kho
        </h2>

        {loadingTransactions ? (
          <div className="text-center py-12 text-slate-400 text-xs font-semibold">Đang tải...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs font-semibold">Chưa ghi nhận biến động kho nào.</div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[300px] overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-bold text-slate-500">Thời gian</th>
                  <th className="px-4 py-3 font-bold text-slate-500">Loại giao dịch</th>
                  <th className="px-4 py-3 font-bold text-slate-500">Mặt hàng</th>
                  <th className="px-4 py-3 font-bold text-slate-500 text-center">Số lượng</th>
                  <th className="px-4 py-3 font-bold text-slate-500">Người thực hiện</th>
                  <th className="px-4 py-3 font-bold text-slate-500">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {transactions.map((t: any) => {
                  let typeLabel = t.type
                  let typeClass = 'bg-slate-100 text-slate-600'
                  if (t.type === 'IMPORT') {
                    typeLabel = 'Nhập kho'
                    typeClass = 'bg-emerald-50 text-emerald-600 border-emerald-100/30'
                  } else if (t.type === 'CIRCULATE') {
                    typeLabel = 'Đưa vào SD'
                    typeClass = 'bg-blue-50 text-blue-600 border-blue-100/30'
                  } else if (t.type === 'DISCARD') {
                    typeLabel = 'Báo hỏng'
                    typeClass = 'bg-rose-50 text-rose-600 border-rose-100/30'
                  } else if (t.type === 'RECYCLE_PROPOSE') {
                    typeLabel = 'Đề xuất tái chế'
                    typeClass = 'bg-amber-50 text-amber-600 border-amber-100/30'
                  } else if (t.type === 'RECYCLE_APPROVE') {
                    typeLabel = 'Duyệt tái chế'
                    typeClass = 'bg-teal-50 text-teal-600 border-teal-100/30'
                  } else if (t.type === 'RECYCLE_REJECT') {
                    typeLabel = 'Từ chối tái chế'
                    typeClass = 'bg-red-50 text-red-600 border-red-100/30'
                  } else if (t.type === 'MIN_STOCK_EDIT') {
                    typeLabel = 'Đổi ĐM tối thiểu'
                    typeClass = 'bg-violet-50 text-violet-600 border-violet-100/30'
                  }

                  const showStock = canViewStockNumbers

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {new Date(t.createdAt).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${typeClass}`}>
                          {typeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{t.linenType?.name}</td>
                      <td className="px-4 py-3 text-center font-bold text-slate-600">{showStock ? t.quantity : '***'}</td>
                      <td className="px-4 py-3 text-slate-600">{t.user}</td>
                      <td className="px-4 py-3 text-slate-500">{showStock ? (t.details || '-') : '***'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
