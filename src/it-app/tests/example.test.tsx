import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

// Example component for testing
function ExampleButton({ label }: { label: string }) {
  return <button>{label}</button>
}

describe('Example Test Suite', () => {
  it('renders a button with correct label', () => {
    render(<ExampleButton label="Click me" />)
    const button = screen.getByRole('button', { name: /click me/i })
    expect(button).toBeInTheDocument()
  })

  it('performs basic math', () => {
    expect(1 + 1).toBe(2)
  })
})
