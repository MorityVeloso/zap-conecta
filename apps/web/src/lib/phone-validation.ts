import { z } from 'zod'

/**
 * Brazilian phone number validation.
 * Accepts: DDI 55 + DDD (11-99) + 8-9 digit number
 * Strips non-digits before validation.
 */
const BRAZIL_PHONE_REGEX = /^55([1-9][1-9])(9?\d{8})$/

export const brazilianPhoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .pipe(
    z
      .string()
      .min(12, 'Número muito curto — use DDI+DDD+número (ex: 5511999998888)')
      .max(13, 'Número muito longo')
      .regex(BRAZIL_PHONE_REGEX, 'Número brasileiro inválido — formato: 55 + DDD + número'),
  )

/** Validate a phone number string, returning the cleaned digits or an error message */
export function validatePhone(input: string): { valid: true; phone: string } | { valid: false; error: string } {
  const result = brazilianPhoneSchema.safeParse(input)
  if (result.success) {
    return { valid: true, phone: result.data }
  }
  return { valid: false, error: result.error.issues[0]?.message ?? 'Número inválido' }
}
