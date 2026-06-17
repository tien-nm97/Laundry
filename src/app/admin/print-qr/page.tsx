'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface Ward {
  id: string
  name: string
  qrToken: string
}

function PrintQRContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const wardId = searchParams.get('wardId')
  const [ward, setWard] = useState<Ward | null>(null)
  const [loading, setLoading] = useState(true)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
    if (!wardId) {
      router.push('/admin')
      return
    }
    fetchWard()
  }, [wardId])

  const fetchWard = async () => {
    try {
      const res = await fetch('/api/admin/wards')
      if (res.ok) {
        const wards: Ward[] = await res.json()
        const found = wards.find(w => w.id === wardId)
        if (found) {
          setWard(found)
        } else {
          router.push('/admin')
        }
      } else {
        router.push('/admin')
      }
    } catch (err) {
      console.error(err)
      router.push('/admin')
    } finally {
      setLoading(false)
    }
  }

  if (loading || !ward) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-[#0066b2] rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-xs font-semibold mt-3">Đang tải cấu hình in...</p>
        </div>
      </div>
    )
  }

  const qrLink = `${origin}/request/order?wardId=${ward.id}&token=${ward.qrToken}`
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrLink)}`

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 font-sans antialiased print:bg-white print:p-0 print:min-h-0">
      {/* Control Panel (Hidden when printing) */}
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-sm flex justify-between items-center print:hidden">
        <button
          onClick={() => router.push('/admin')}
          className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-all cursor-pointer"
        >
          ← Quay lại
        </button>
        <button
          onClick={() => window.print()}
          className="px-5 py-2 bg-[#0066b2] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-500/10"
        >
          🖨️ In mã QR
        </button>
      </div>

      {/* Printable Area */}
      <div className="w-full max-w-md bg-white border-2 border-slate-200 rounded-3xl p-8 shadow-xl text-center flex flex-col items-center space-y-6 print:border-0 print:shadow-none print:w-full print:max-w-none print:my-auto print:p-0">
        
        {/* Hospital Branding */}
        <div className="space-y-1">
          <div className="text-xs font-extrabold tracking-widest text-[#0066b2] uppercase">
            BECAMEX HOSPITALS
          </div>
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            Linen Management System
          </div>
        </div>

        {/* Separator line */}
        <div className="w-16 h-1 bg-[#0066b2] rounded-full" />

        {/* Department/Ward Name */}
        <div className="space-y-1">
          <div className="text-xxs font-extrabold text-slate-400 uppercase tracking-widest">
            MÃ QR TRUY CẬP NHANH
          </div>
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight px-4 py-1.5 bg-slate-100 rounded-2xl border border-slate-200/40 inline-block print:bg-slate-50">
            {ward.name}
          </div>
        </div>

        {/* QR Code Container */}
        <div className="bg-white p-3 rounded-2xl border-2 border-slate-200/80 shadow-inner print:border-0 print:shadow-none">
          <img
            src={qrCodeUrl}
            alt={`Mã QR ${ward.name}`}
            className="w-56 h-56 block print:w-72 print:h-72"
          />
        </div>

        {/* Description/Instruction */}
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-slate-700">
            Quét mã để gửi yêu cầu cấp phát đồ vải hằng ngày
          </p>
          <p className="text-[10px] text-slate-400 font-medium leading-relaxed max-w-xs mx-auto">
            (Dành cho nhân viên Hộ lý trực thuộc khoa phòng. Vui lòng quét mã bằng máy ảnh điện thoại hoặc Zalo)
          </p>
        </div>
      </div>
    </div>
  )
}

export default function PrintQRPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-[#0066b2] rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-xs font-semibold mt-3">Đang tải...</p>
        </div>
      </div>
    }>
      <PrintQRContent />
    </Suspense>
  )
}
