'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    if (confirm('Bạn có chắc chắn muốn đăng xuất?')) {
      setLoggingOut(true)
      try {
        const res = await fetch('/api/auth/logout', { method: 'POST' })
        if (res.ok) {
          router.push('/login')
        }
      } catch (err) {
        console.error('Logout error:', err)
      } finally {
        setLoggingOut(false)
      }
    }
  }

  const navItems = [
    { name: 'Đồ vải & Khoa phòng', href: '/admin' },
    { name: 'Lô nhập hàng', href: '/admin/batches' },
  ]

  return (
    <div className="min-h-screen bg-[#f3f6f9] text-slate-900 flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0066b2] to-blue-400 flex items-center justify-center font-bold text-white text-xl">
                A
              </div>
              <div>
                <span className="font-extrabold text-xl tracking-tight text-[#0066b2]">BECAMEX HOSPITAL</span>
                <span className="text-xxs block text-slate-500 font-bold tracking-widest -mt-1 uppercase">Admin Portal</span>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-150 ${
                      isActive
                        ? 'bg-[#1e293b] text-white shadow'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/40'
                    }`}
                  >
                    {item.name}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-sm font-bold text-slate-800">Quản trị viên</span>
              <span className="text-xxs text-slate-500 font-semibold uppercase">Phòng Quản trị</span>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="px-3.5 py-1.5 border border-slate-200 hover:border-red-500/40 text-slate-600 hover:text-red-500 hover:bg-red-50 rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        {/* Mobile Navigation */}
        <div className="md:hidden flex gap-2 mb-6 bg-slate-200/60 p-1 rounded-xl border border-slate-200">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 text-center py-2 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-[#1e293b] text-white shadow'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/20'
                }`}
              >
                {item.name}
              </Link>
            )
          })}
        </div>

        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400 bg-white mt-auto">
        <p>© {new Date().getFullYear()} Hospital Linen Management & Distribution System. All rights reserved.</p>
      </footer>
    </div>
  )
}
