import { describe, it, expect } from 'vitest'
import { validatePhone, brazilianPhoneSchema } from '../phone-validation'

describe('brazilianPhoneSchema', () => {
  it('accepts valid mobile number with DDI 55', () => {
    expect(brazilianPhoneSchema.safeParse('5511999998888').success).toBe(true)
  })

  it('accepts valid landline number (8 digits)', () => {
    expect(brazilianPhoneSchema.safeParse('551133334444').success).toBe(true)
  })

  it('strips formatting before validation', () => {
    const result = brazilianPhoneSchema.safeParse('+55 (11) 99999-8888')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBe('5511999998888')
  })

  it('rejects number without DDI 55', () => {
    expect(brazilianPhoneSchema.safeParse('11999998888').success).toBe(false)
  })

  it('rejects number with invalid DDD (00)', () => {
    expect(brazilianPhoneSchema.safeParse('5500999998888').success).toBe(false)
  })

  it('rejects too short number', () => {
    expect(brazilianPhoneSchema.safeParse('5511').success).toBe(false)
  })

  it('rejects too long number', () => {
    expect(brazilianPhoneSchema.safeParse('551199999888800').success).toBe(false)
  })
})

describe('validatePhone', () => {
  it('returns valid result with cleaned phone', () => {
    const result = validatePhone('+55 (21) 98765-4321')
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.phone).toBe('5521987654321')
  })

  it('returns error for invalid number', () => {
    const result = validatePhone('123')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toBeTruthy()
  })

  it('rejects non-Brazilian number', () => {
    const result = validatePhone('14155552671') // US number
    expect(result.valid).toBe(false)
  })
})
