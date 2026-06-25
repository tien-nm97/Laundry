# Giới hạn 1 Phiếu Yêu cầu/Ngày và Chỉnh sửa qua mã QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giới hạn mỗi khoa phòng chỉ gửi tối đa 1 phiếu yêu cầu đồ vải mỗi ngày. Nếu quét mã QR và phiếu hôm nay ở trạng thái PENDING, hệ thống hiển thị phiếu cũ kèm cảnh báo và tự động chuyển sang chế độ cập nhật ghi đè phiếu khi gửi. Nếu đã xử lý, báo lỗi và không cho chỉnh sửa.

**Architecture:** Cập nhật API GET/POST để kiểm tra sự tồn tại của phiếu trong ngày hiện tại (múi giờ UTC+7). Thiết kế component `SearchableSelect` trên Client để hỗ trợ hộ lý gõ tìm kiếm theo chữ cái bắt đầu.

**Tech Stack:** Next.js (App Router), React, Prisma, Tailwind CSS, Jest

---

### Task 1: Bổ sung Unit Tests cho API GET/POST

**Files:**
- Modify: [request.test.ts](file:///d:/OneDrive/desktop/Laundry/src/__tests__/request.test.ts)

- [ ] **Step 1: Thêm các bài kiểm thử tự động (tests) cho các hành vi mới của API**
  Thêm các test case vào trong block `describe('Ward QR Request Portal API')` của [request.test.ts](file:///d:/OneDrive/desktop/Laundry/src/__tests__/request.test.ts):
  
  ```typescript
  describe('One ticket per day & QR editing limitations', () => {
    it('should return existingTicket if a PENDING ticket exists today', async () => {
      // 1. Create a pending ticket for today
      const body = {
        wardId: testWard.id,
        token: testWard.qrToken,
        requesterName: 'ORIGINAL_REQUESTER',
        items: [{ linenTypeId: testLinenType.id, quantity: 5 }]
      }
      const postReq = createRequest('POST', undefined, body)
      const postRes = await POST(postReq)
      expect(postRes.status).toBe(201)
      const createdTicket = await postRes.json()

      try {
        // 2. Perform GET request to verify existingTicket is returned
        const params = new URLSearchParams({
          wardId: testWard.id,
          token: testWard.qrToken,
        })
        const getReq = createRequest('GET', params)
        const getRes = await GET(getReq)
        expect(getRes.status).toBe(200)

        const data = await getRes.json()
        expect(data.existingTicket).toBeDefined()
        expect(data.existingTicket.id).toBe(createdTicket.id)
        expect(data.existingTicket.requesterName).toBe('ORIGINAL_REQUESTER')
        expect(data.existingTicket.items[0].linenTypeId).toBe(testLinenType.id)
        expect(data.existingTicket.items[0].quantity).toBe(5)
      } finally {
        await prisma.ticket.delete({ where: { id: createdTicket.id } })
      }
    })

    it('should return 400 error if today ticket is already processed', async () => {
      // 1. Create a ticket and update status to PREPARED
      const ticket = await prisma.ticket.create({
        data: {
          wardId: testWard.id,
          status: 'PREPARED',
          requesterName: 'TEST_PREPARED',
          deliveryDate: new Date(),
          items: {
            create: [{ linenTypeId: testLinenType.id, quantity: 10 }]
          }
        }
      })

      try {
        // 2. Perform GET and expect 400 error
        const params = new URLSearchParams({
          wardId: testWard.id,
          token: testWard.qrToken,
        })
        const getReq = createRequest('GET', params)
        const getRes = await GET(getReq)
        expect(getRes.status).toBe(400)
        const data = await getRes.json()
        expect(data.error).toBe('Phiếu hôm nay đã được xử lý, không thể sửa.')
      } finally {
        await prisma.ticket.delete({ where: { id: ticket.id } })
      }
    })

    it('should update existing pending ticket instead of creating a new one on POST', async () => {
      // 1. Create a pending ticket
      const body = {
        wardId: testWard.id,
        token: testWard.qrToken,
        requesterName: 'NURSE_1',
        items: [{ linenTypeId: testLinenType.id, quantity: 5 }]
      }
      const postReq1 = createRequest('POST', undefined, body)
      const postRes1 = await POST(postReq1)
      expect(postRes1.status).toBe(201)
      const ticket1 = await postRes1.json()

      try {
        // 2. Submit another request (update)
        const updateBody = {
          wardId: testWard.id,
          token: testWard.qrToken,
          requesterName: 'NURSE_2',
          items: [{ linenTypeId: testLinenType.id, quantity: 12 }]
        }
        const postReq2 = createRequest('POST', undefined, updateBody)
        const postRes2 = await POST(postReq2)
        expect(postRes2.status).toBe(201)
        const ticket2 = await postRes2.json()

        // 3. Verify it updated the same ticket
        expect(ticket2.id).toBe(ticket1.id)
        expect(ticket2.requesterName).toBe('NURSE_2')
        expect(ticket2.items.length).toBe(1)
        expect(ticket2.items[0].quantity).toBe(12)

        // Verify database counts
        const dbTicket = await prisma.ticket.findUnique({
          where: { id: ticket1.id },
          include: { items: true }
        })
        expect(dbTicket?.requesterName).toBe('NURSE_2')
        expect(dbTicket?.items.length).toBe(1)
        expect(dbTicket?.items[0].quantity).toBe(12)
      } finally {
        await prisma.ticket.delete({ where: { id: ticket1.id } })
      }
    })

    it('should reject POST with 400 if today ticket is already processed', async () => {
      // 1. Create a PREPARED ticket
      const ticket = await prisma.ticket.create({
        data: {
          wardId: testWard.id,
          status: 'PREPARED',
          requesterName: 'TEST_PREPARED',
          deliveryDate: new Date(),
          items: {
            create: [{ linenTypeId: testLinenType.id, quantity: 10 }]
          }
        }
      })

      try {
        // 2. Perform POST and expect 400 error
        const body = {
          wardId: testWard.id,
          token: testWard.qrToken,
          requesterName: 'NURSE_3',
          items: [{ linenTypeId: testLinenType.id, quantity: 15 }]
        }
        const postReq = createRequest('POST', undefined, body)
        const postRes = await POST(postReq)
        expect(postRes.status).toBe(400)
        const data = await postRes.json()
        expect(data.error).toBe('Phiếu hôm nay đã được xử lý, không thể sửa.')
      } finally {
        await prisma.ticket.delete({ where: { id: ticket.id } })
      }
    })
  })
  ```

- [ ] **Step 2: Chạy kiểm thử để xác nhận các test case mới thất bại**
  Run: `npx.cmd jest src/__tests__/request.test.ts`
  Expected: Các bài test mới thất bại (FAIL).

- [ ] **Step 3: Commit các test case mới**
  ```bash
  git add src/__tests__/request.test.ts
  git commit -m "test: add test cases for one ticket per day limits and QR edit"
  ```

---

### Task 2: Cập nhật API GET và POST

**Files:**
- Modify: [route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/request/order/route.ts)

- [ ] **Step 1: Cập nhật logic API GET để phát hiện phiếu hôm nay**
  Thêm logic tìm kiếm phiếu trong ngày (theo giờ Việt Nam UTC+7) vào hàm `GET` của [route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/request/order/route.ts):
  
  ```typescript
  // ... (after fetching ward)
  const now = new Date()
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const vnYear = vnTime.getUTCFullYear()
  const vnMonth = vnTime.getUTCMonth()
  const vnDay = vnTime.getUTCDate()
  const vnTodayStart = new Date(Date.UTC(vnYear, vnMonth, vnDay, 0, 0, 0, 0) - 7 * 60 * 60 * 1000)

  const existingTicket = await prisma.ticket.findFirst({
    where: {
      wardId: ward.id,
      createdAt: {
        gte: vnTodayStart,
      },
    },
    include: {
      items: {
        include: {
          linenType: true,
        },
      },
    },
  })

  if (existingTicket) {
    if (existingTicket.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Phiếu hôm nay đã được xử lý, không thể sửa.' },
        { status: 400 }
      )
    }
  }
  ```
  
  Trả kèm `existingTicket` trong response nếu có:
  
  ```typescript
  return NextResponse.json({
    ward: {
      id: ward.id,
      name: ward.name,
    },
    linenTypes,
    orderlies,
    existingTicket: existingTicket ? {
      id: existingTicket.id,
      requesterName: existingTicket.requesterName,
      items: existingTicket.items.map(item => ({
        linenTypeId: item.linenTypeId,
        quantity: item.quantity,
        linenType: item.linenType
      }))
    } : null
  })
  ```

- [ ] **Step 2: Cập nhật logic API POST để cập nhật phiếu cũ**
  Thêm logic kiểm tra và cập nhật phiếu cũ trong hàm `POST` của [route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/request/order/route.ts):
  
  ```typescript
  // ... (after validating ward & items)
  const now = new Date()
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const vnYear = vnTime.getUTCFullYear()
  const vnMonth = vnTime.getUTCMonth()
  const vnDay = vnTime.getUTCDate()
  const vnTodayStart = new Date(Date.UTC(vnYear, vnMonth, vnDay, 0, 0, 0, 0) - 7 * 60 * 60 * 1000)

  const existingTicket = await prisma.ticket.findFirst({
    where: {
      wardId: ward.id,
      createdAt: {
        gte: vnTodayStart,
      },
    },
  })

  if (existingTicket) {
    if (existingTicket.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Phiếu hôm nay đã được xử lý, không thể sửa.' },
        { status: 400 }
      )
    }

    // Update in transaction
    const updatedTicket = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({
        where: { id: existingTicket.id },
        data: {
          requesterName: requesterName.trim(),
          items: {
            deleteMany: {},
            create: items.map((item: any) => ({
              linenTypeId: item.linenTypeId,
              quantity: Number(item.quantity)
            }))
          }
        },
        include: {
          items: {
            include: {
              linenType: true
            }
          }
        }
      })
      return ticket
    })

    return NextResponse.json(updatedTicket, { status: 201 })
  }
  ```

- [ ] **Step 3: Chạy lại tests để xác nhận mọi thứ đã pass**
  Run: `npx.cmd jest src/__tests__/request.test.ts`
  Expected: Toàn bộ 12 test cases đều PASS.

- [ ] **Step 4: Commit thay đổi API**
  ```bash
  git add src/app/api/request/order/route.ts
  git commit -m "feat: implement one ticket per day API constraints & QR update"
  ```

---

### Task 3: Phát triển Giao diện Hộ lý trên Client

**Files:**
- Modify: [page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/request/order/page.tsx)

- [ ] **Step 1: Tạo linh kiện `SearchableSelect`**
  Thêm component `SearchableSelect` vào trước component `RequestOrderForm` trong file [page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/request/order/page.tsx):
  
  ```tsx
  interface SearchableSelectProps {
    value: string
    onChange: (value: string) => void
    options: LinenType[]
    placeholder: string
    required?: boolean
  }

  function SearchableSelect({ value, onChange, options, placeholder, required }: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')

    const selectedOption = options.find(opt => opt.id === value)

    useEffect(() => {
      if (selectedOption) {
        setSearchTerm(selectedOption.name)
      } else {
        setSearchTerm('')
      }
    }, [value, selectedOption])

    const filteredOptions = options.filter(opt => {
      if (!searchTerm || selectedOption?.name === searchTerm) return true
      const query = searchTerm.toLowerCase().trim()
      const nameLower = opt.name.toLowerCase()

      // Khớp ký tự đầu tiên của chuỗi hoặc ký tự đầu của từng từ (Telex)
      if (nameLower.startsWith(query)) return true
      const words = nameLower.split(/\s+/)
      if (words.some(w => w.startsWith(query))) return true

      return nameLower.includes(query)
    })

    useEffect(() => {
      if (!isOpen) return
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        if (!target.closest('.searchable-select-container')) {
          setIsOpen(false)
          setSearchTerm(selectedOption ? selectedOption.name : '')
        }
      }
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }, [isOpen, selectedOption])

    return (
      <div className="relative searchable-select-container flex-1 min-w-0">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            setIsOpen(true)
            if (!e.target.value) {
              onChange('')
            }
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-3 pr-10 text-sm text-slate-800 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all cursor-pointer"
          required={required}
        />
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {isOpen && (
          <div className="absolute z-50 left-0 right-0 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg mt-1 divide-y divide-slate-50">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChange(opt.id)
                    setSearchTerm(opt.name)
                    setIsOpen(false)
                  }}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-slate-50 cursor-pointer ${
                    opt.id === value ? 'font-bold text-[#0066b2] bg-blue-50/50' : 'text-slate-700'
                  }`}
                >
                  {opt.name}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-slate-400 text-center">
                Không tìm thấy loại đồ vải phù hợp
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 2: Khai báo các biến state lưu trữ thông tin phiếu cũ**
  Thêm state `hasExistingTicket` trong component `RequestOrderForm`:
  
  ```typescript
  const [hasExistingTicket, setHasExistingTicket] = useState(false)
  ```

- [ ] **Step 3: Cập nhật hàm `validateAndFetch` để nạp dữ liệu phiếu cũ**
  Cập nhật logic `validateAndFetch` để xử lý khi `existingTicket` tồn tại:
  
  ```typescript
  const validateAndFetch = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/request/order?wardId=${wardId}&token=${token}`)
      const data = await res.json()

      if (res.ok) {
        setWard(data.ward)
        setLinenTypes(data.linenTypes)
        setOrderlies(data.orderlies || [])
        
        if (data.existingTicket) {
          setRequesterName(data.existingTicket.requesterName)
          setRows(data.existingTicket.items.map((item: any) => ({
            linenTypeId: item.linenTypeId,
            quantity: item.quantity
          })))
          setHasExistingTicket(true)
        }
      } else {
        setErrorMsg(data.error || 'Mã truy cập QR không hợp lệ hoặc đã hết hạn.')
      }
    } catch (err) {
      setErrorMsg('Lỗi kết nối máy chủ. Vui lòng thử lại sau.')
    } finally {
      setLoading(false)
    }
  }
  ```

- [ ] **Step 4: Hiển thị Banner Cảnh Báo màu vàng nhạt**
  Chèn cảnh báo ở đầu form (ngay dưới nút submit hoặc đầu form dưới header):
  
  ```tsx
  {/* Form */}
  <form onSubmit={handleSubmit} className="space-y-6">
    {hasExistingTicket && (
      <div className="bg-amber-50 border border-amber-100 text-amber-800 text-xs font-semibold px-3 py-2.5 rounded-xl flex items-center gap-2 animate-fade-in">
        <svg className="w-4 h-4 shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>Khoa đã gửi yêu cầu đồ vải, bạn muốn điều chỉnh?</span>
      </div>
    )}
    
    {formError && (
      // ... existing code
    )}
  ```

- [ ] **Step 5: Tích hợp component `SearchableSelect` vào danh sách hàng của form**
  Thay thế thẻ `<select>` cũ ở danh sách đồ vải yêu cầu bằng `SearchableSelect`:
  
  ```tsx
  {/* Thay thế đoạn select cũ: */}
  <SearchableSelect
    value={row.linenTypeId}
    onChange={(val) => {
      const newRows = [...rows]
      newRows[index].linenTypeId = val
      setRows(newRows)
    }}
    options={availableLinenTypes}
    placeholder="-- Chọn loại đồ vải --"
    required
  />
  ```

- [ ] **Step 6: Xác nhận nút gửi hiển thị chữ động phù hợp**
  Chỉnh sửa nút gửi để hiển thị `"Cập nhật phiếu yêu cầu"` nếu đang ở chế độ chỉnh sửa:
  
  ```tsx
  <button
    type="submit"
    disabled={submitting}
    className="w-full bg-[#0066b2] hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold py-3.5 rounded-xl text-sm transition-all shadow-md shadow-blue-600/10 cursor-pointer"
  >
    {submitting ? 'Đang gửi yêu cầu...' : hasExistingTicket ? 'Cập nhật phiếu yêu cầu' : 'Gửi phiếu yêu cầu'}
  </button>
  ```

- [ ] **Step 7: Reset trạng thái `hasExistingTicket` sau khi submit thành công**
  Trong hàm `handleSubmit`, khi gửi thành công:
  
  ```typescript
  if (res.ok) {
    setSuccessTicket(data)
    setFormError(null)
    setRequesterName('')
    setRows([{ linenTypeId: '', quantity: 1 }])
    setHasExistingTicket(false) // Reset về false sau khi submit thành công
  }
  ```

- [ ] **Step 8: Commit các thay đổi Frontend**
  ```bash
  git add src/app/request/order/page.tsx
  git commit -m "feat: design custom SearchableSelect dropdown and integrate with ward ticket form"
  ```
