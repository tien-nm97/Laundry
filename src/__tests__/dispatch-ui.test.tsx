import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import DispatchPage from '../app/laundry/dispatch/page'

describe('Public Dispatch UI Page', () => {
  it('should render headers and ticket lists', async () => {
    render(<DispatchPage />)
    expect(screen.getByText(/BECAMEX HOSPITAL/i)).toBeInTheDocument()
    expect(await screen.findByText(/Danh sách phiếu chờ giao/i)).toBeInTheDocument()
  })
})
