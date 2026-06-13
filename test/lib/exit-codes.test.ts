import { describe, expect, it } from 'vitest'
import { EXIT_OK, EXIT_USAGE, EXIT_VIOLATIONS } from '../../src/lib/exit-codes.js'

describe('exit codes', () => {
  it('has the documented numeric values', () => {
    expect(EXIT_OK).toBe(0)
    expect(EXIT_VIOLATIONS).toBe(1)
    expect(EXIT_USAGE).toBe(2)
  })
})
