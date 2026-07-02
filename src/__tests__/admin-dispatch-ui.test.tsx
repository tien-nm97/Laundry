import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import AdminDispatch from '../app/admin/dispatch/page'

// Mock useRealtimeSync
jest.mock('@/lib/useRealtimeSync', () => ({
  useRealtimeSync: jest.fn(),
}))

// Mock global fetch
beforeEach(() => {
  global.fetch = jest.fn((url) => {
    if (url.includes('/api/auth/me')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ username: 'test_admin', role: 'ADMIN', permissions: [] }),
      } as Response)
    }
    if (url.includes('/api/admin/tickets')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([
          {
            id: 'ticket-1',
            status: 'PENDING',
            requesterName: 'Ho ly A',
            createdAt: new Date().toISOString(),
            deliveryDate: '',
            ward: { id: 'ward-1', name: 'Ngoai Tong Hop' },
            items: [
              { id: 'item-1', quantity: 10, linenType: { id: 'lt-1', name: 'Mền xanh', unit: 'Cái' } }
            ]
          }
        ]),
      } as Response)
    }
    if (url.includes('/api/admin/orderlies')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)
    }
    if (url.includes('/api/admin/inventory')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ batches: [] }),
      } as Response)
    }
    return Promise.resolve({ ok: false } as Response)
  }) as jest.Mock
})

describe('Admin Dispatch Monitor UI Page', () => {
  it('renders the supervisor dashboard tabs and can expand ticket details', async () => {
    render(<AdminDispatch />)
    
    // Wait for tickets loading and header rendering
    expect(await screen.findByText(/📊 Giám sát cấp phát/i)).toBeInTheDocument()
    expect(screen.getByText(/⚠️ Cảnh báo thiếu hụt/i)).toBeInTheDocument()
    
    // Verify ward name is present in monitor tab by default
    expect((await screen.findAllByText(/Ngoai Tong Hop/i)).length).toBeGreaterThan(0)
    
    // Toggle expand button
    const expandBtn = screen.getByRole('button', { name: /Xem chi tiết ❯/i })
    fireEvent.click(expandBtn)
    
    // Check that inside expanded panel we see items details
    expect(await screen.findByText(/Đồ vải yêu cầu cấp phát:/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Mền xanh/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/10 Cái/i).length).toBeGreaterThan(0)
  })

  it('can switch to shortage tab and see message', async () => {
    render(<AdminDispatch />)
    
    // Switch to shortages tab
    const tabBtn = await screen.findByText(/⚠️ Cảnh báo thiếu hụt/i)
    fireEvent.click(tabBtn)

    // Check header
    expect(await screen.findByText(/Danh sách Cảnh báo Thiếu hụt đồ vải hôm nay/i)).toBeInTheDocument()
  })
})
