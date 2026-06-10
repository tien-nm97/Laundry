import { prisma } from '@/lib/db'
import { verifyAdminRequest } from '@/lib/jwt'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const orderlies = await prisma.orderly.findMany({
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(orderlies)
  } catch (error: any) {
    console.error('GET orderlies error:', error)
    return NextResponse.json({ error: 'Lỗi khi tải danh sách hộ lý' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const { name } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Tên hộ lý là bắt buộc' },
        { status: 400 }
      )
    }

    const existing = await prisma.orderly.findUnique({
      where: { name: name.trim() },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Hộ lý này đã tồn tại trong danh sách' },
        { status: 400 }
      )
    }

    const newOrderly = await prisma.orderly.create({
      data: { name: name.trim() },
    })

    return NextResponse.json(newOrderly, { status: 201 })
  } catch (error: any) {
    console.error('POST orderlies error:', error)
    return NextResponse.json({ error: 'Lỗi khi tạo hộ lý mới' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID hộ lý cần xóa' }, { status: 400 })
    }

    await prisma.orderly.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Xóa hộ lý thành công' })
  } catch (error: any) {
    console.error('DELETE orderly error:', error)
    return NextResponse.json({ error: 'Lỗi khi xóa hộ lý' }, { status: 500 })
  }
}
