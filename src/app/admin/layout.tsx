'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const [userRole, setUserRole] = useState('')

  useEffect(() => {
    try {
      const tokenCookie = document.cookie.split(';').find(c => c.trim().startsWith('token='))
      if (tokenCookie) {
        const token = tokenCookie.split('=')[1]
        const base64Url = token.split('.')[1]
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const payload = JSON.parse(jsonPayload)
        setUserRole(payload.role || '')
      }
    } catch (err) {
      console.error('Lỗi khi đọc token từ cookie:', err)
    }
  }, [])

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
    { 
      name: 'Danh mục hệ thống', 
      href: '/admin', 
      roles: ['ADMIN'],
      icon: (active: boolean) => (
        <svg className={`w-4 h-4 mr-2.5 transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-[#0066b2]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      )
    },
    { 
      name: 'Lô nhập hàng', 
      href: '/admin/batches', 
      roles: ['ADMIN'],
      icon: (active: boolean) => (
        <svg className={`w-4 h-4 mr-2.5 transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-[#0066b2]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      )
    },
    { 
      name: 'Yêu cầu cấp phát', 
      href: '/admin/dispatch', 
      roles: ['ADMIN', 'SUPERVISOR'],
      icon: (active: boolean) => (
        <svg className={`w-4 h-4 mr-2.5 transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-[#0066b2]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      )
    },
  ].filter(item => !item.roles || item.roles.includes(userRole))

  return (
    <div className="min-h-screen bg-[#f3f6f9] text-slate-900 flex flex-col md:flex-row font-sans">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:left-0 md:z-50 bg-white border-r border-slate-200/80 shadow-sm print:hidden">
        {/* Sidebar Header */}
        <div className="h-16 px-6 border-b border-slate-200/80 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0066b2] to-blue-400 flex items-center justify-center font-bold text-white text-lg shadow-sm">
            A
          </div>
          <div>
            <span className="font-extrabold text-lg tracking-tight text-[#0066b2] block">BECAMEX</span>
            <span className="text-[9px] block text-slate-400 font-bold tracking-widest -mt-1.5 uppercase">Admin Portal</span>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 ${
                  isActive
                    ? 'bg-[#1e293b] text-white shadow-md shadow-slate-900/10'
                    : 'text-slate-600 hover:text-[#0066b2] hover:bg-slate-50'
                }`}
              >
                {item.icon(isActive)}
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* Sidebar Footer (User Info & Logout) */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600 text-xs">
              {userRole === 'ADMIN' ? 'AD' : 'SP'}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-slate-800 truncate">
                {userRole === 'ADMIN' ? 'Quản trị viên' : 'Giám sát'}
              </span>
              <span className="text-[9px] text-slate-400 font-semibold uppercase truncate">
                {userRole === 'ADMIN' ? 'Phòng Quản trị' : 'Phân khu Giám sát'}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-slate-200 hover:border-red-500/40 text-slate-600 hover:text-red-500 hover:bg-red-50 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Header for Mobile */}
      <header className="md:hidden w-full sticky top-0 z-50 bg-white border-b border-slate-200/80 shadow-sm print:hidden flex items-center justify-between px-4 h-16">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0066b2] to-blue-400 flex items-center justify-center font-bold text-white text-lg">
            A
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight text-[#0066b2] block">BECAMEX</span>
            <span className="text-[9px] block text-slate-400 font-bold tracking-widest -mt-1.5 uppercase">Admin Portal</span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="px-3 py-1.5 border border-slate-200 hover:border-red-500/40 text-slate-600 hover:text-red-500 hover:bg-red-50 rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
        >
          Đăng xuất
        </button>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:pl-64 min-h-screen">
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative print:p-0 print:max-w-none print:w-auto">
          {/* Mobile Navigation Tabs */}
          <div className="md:hidden flex gap-2 mb-6 bg-slate-200/60 p-1 rounded-xl border border-slate-200 print:hidden">
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
        <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400 bg-white mt-auto print:hidden">
          <p>© {new Date().getFullYear()} Hospital Linen Management & Distribution System. All rights reserved.</p>
        </footer>
      </div>
    </div>
  )
}
