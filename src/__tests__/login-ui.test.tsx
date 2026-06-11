import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import LoginPage from '../app/login/page'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
    }
  },
}))

describe('Login Page Component', () => {
  it('should render username and password fields and submit button', () => {
    render(<LoginPage />)
    
    // Check that title exists
    expect(screen.getByText(/Đăng nhập Hệ thống/i)).toBeInTheDocument()

    // Check input fields
    expect(screen.getByLabelText(/Tên đăng nhập/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Mật khẩu/i)).toBeInTheDocument()

    // Check submit button
    expect(screen.getByRole('button', { name: /Đăng nhập/i })).toBeInTheDocument()
  })
})
