import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock environment variables
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000'
process.env.NEXT_PUBLIC_API_BASE_PATH = '/api/v1'
process.env.NEXT_PUBLIC_SIGNALR_URL = 'http://localhost:5000/hubs'
