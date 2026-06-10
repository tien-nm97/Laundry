'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return

    setSubmitting(true)
    setErrorMsg(null)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      })
      const data = await res.json()

      if (res.ok) {
        if (data.role === 'ADMIN') {
          router.push('/admin')
        } else if (data.role === 'LAUNDRY') {
          router.push('/laundry')
        } else {
          setErrorMsg('Tài khoản không được phân quyền.')
        }
      } else {
        setErrorMsg(data.error || 'Đăng nhập thất bại.')
      }
    } catch (err) {
      setErrorMsg('Lỗi kết nối máy chủ.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-center items-center px-4 relative font-sans">
      <div className="w-full max-w-sm bg-white border border-slate-200/80 rounded-2xl p-7 shadow-lg space-y-5">
        <div className="text-center">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#0066b2] to-blue-400 flex items-center justify-center font-bold text-white text-xl mx-auto mb-2 shadow-sm">
            H
          </div>
          <h1 className="text-lg font-extrabold text-[#0066b2]">Đăng nhập Hệ thống</h1>
          <p className="text-xxs text-slate-400 font-bold tracking-wider uppercase mt-0.5">Becamex Hospital Linen</p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold flex items-center gap-1.5">
            <span>⚠️ {errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username-input" className="block text-xxs font-bold text-slate-500 mb-1.5 uppercase">
              Tên đăng nhập
            </label>
            <input
              id="username-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập tài khoản..."
              className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all font-semibold"
              required
            />
          </div>

          <div>
            <label htmlFor="password-input" className="block text-xxs font-bold text-slate-500 mb-1.5 uppercase">
              Mật khẩu
            </label>
            <input
              id="password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all font-semibold"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#0066b2] hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-xs transition-all cursor-pointer mt-1 shadow-sm shadow-blue-500/10"
          >
            {submitting ? 'Đang xác thực...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  )
}
