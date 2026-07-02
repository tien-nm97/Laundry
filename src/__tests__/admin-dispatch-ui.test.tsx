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
    return Promise.resolve({ ok: false } as Response)
  }) as jest.Mock
})

describe('Admin Dispatch Tabs UI Page', () => {
  it('renders the tabs and shows calendar and tickets list in default tab', async () => {
    render(<AdminDispatch />)
    
    // Wait for tickets loading
    expect(await screen.findByText(/📊 Giám sát hôm nay/i)).toBeInTheDocument()
    expect(screen.getByText(/📈 Tổng hợp số lượng/i)).toBeInTheDocument()
    
    // Wait for tickets data to load
    expect((await screen.findAllByText(/Ngoai Tong Hop/i)).length).toBeGreaterThan(0)
  })

  it('switches to aggregated tab and calculates quantities correctly', async () => {
    render(<AdminDispatch />)
    
    // Wait for component to load tickets
    const tabButton = await screen.findByText(/📈 Tổng hợp số lượng/i)
    fireEvent.click(tabButton)

    // Verification of Tab 2
    expect(screen.getByText(/Tổng hợp số lượng yêu cầu đồ vải hằng ngày/i)).toBeInTheDocument()
    expect(screen.getByText(/Mền xanh:/i)).toBeInTheDocument()
    expect(screen.getByText(/10/i)).toBeInTheDocument()
    expect(screen.getByText(/Chỉ số So sánh Tương quan/i)).toBeInTheDocument()
  })
})
