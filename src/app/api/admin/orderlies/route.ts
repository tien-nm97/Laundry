import { prisma } from '@/lib/db'
import { verifyPermission } from '@/lib/jwt'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyPermission(request, 'admin:view')
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const orderlies = await prisma.staff.findMany({
      orderBy: { nhanvien: 'asc' },
    })
    return NextResponse.json(orderlies)
  } catch (error: any) {
    console.error('GET orderlies error:', error)
    return NextResponse.json({ error: 'Lỗi khi tải danh sách hộ lý' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await verifyPermission(request, 'admin:staff')
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const { nhanvien, hientrang, imageUrl } = body

    if (!nhanvien || !nhanvien.trim()) {
      return NextResponse.json(
        { error: 'Tên hộ lý là bắt buộc' },
        { status: 400 }
      )
    }

    const existing = await prisma.staff.findUnique({
      where: { nhanvien: nhanvien.trim() },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Hộ lý này đã tồn tại trong danh sách' },
        { status: 400 }
      )
    }

    const newOrderly = await prisma.staff.create({
      data: {
        nhanvien: nhanvien.trim(),
        hientrang: hientrang || 'Đang làm',
        imageUrl: imageUrl || null,
      },
    })

    return NextResponse.json(newOrderly, { status: 201 })
  } catch (error: any) {
    console.error('POST orderlies error:', error)
    return NextResponse.json({ error: 'Lỗi khi tạo hộ lý mới' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyPermission(request, 'admin:staff')
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID hộ lý cần xóa' }, { status: 400 })
    }

    await prisma.staff.delete({
      where: { id_nhanvien: id },
    })

    return NextResponse.json({ message: 'Xóa hộ lý thành công' })
  } catch (error: any) {
    console.error('DELETE orderly error:', error)
    return NextResponse.json({ error: 'Lỗi khi xóa hộ lý' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const auth = await verifyPermission(request, 'admin:staff')
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const { id, nhanvien, imageUrl } = body

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID nhân viên cần cập nhật' }, { status: 400 })
    }

    if (!nhanvien || !nhanvien.trim()) {
      return NextResponse.json({ error: 'Tên hộ lý không được để trống' }, { status: 400 })
    }

    const existing = await prisma.staff.findFirst({
      where: {
        nhanvien: nhanvien.trim(),
        id_nhanvien: { not: id }
      }
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Hộ lý có tên này đã tồn tại' },
        { status: 400 }
      )
    }

    const updatedOrderly = await prisma.staff.update({
      where: { id_nhanvien: id },
      data: {
        nhanvien: nhanvien.trim(),
        imageUrl: imageUrl !== undefined ? imageUrl : undefined
      }
    })

    return NextResponse.json(updatedOrderly)
  } catch (error: any) {
    console.error('PUT orderly error:', error)
    return NextResponse.json({ error: 'Lỗi khi cập nhật thông tin hộ lý' }, { status: 500 })
  }
}
