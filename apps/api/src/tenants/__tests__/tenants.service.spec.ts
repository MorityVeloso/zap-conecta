import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictException, BadRequestException } from '@nestjs/common'
import { SignupDtoSchema } from '../tenants.service'

// Testar só o schema de validação (sem mock de DB)
describe('SignupDtoSchema', () => {
  it('aceita dados válidos', () => {
    const result = SignupDtoSchema.safeParse({
      fullName: 'João Silva',
      companyName: 'Minha Empresa',
      email: 'joao@empresa.com',
      password: 'Senha123',
    })
    expect(result.success).toBe(true)
  })

  it('rejeita email inválido', () => {
    const result = SignupDtoSchema.safeParse({
      fullName: 'João',
      companyName: 'Empresa',
      email: 'invalido',
      password: 'Senha123',
    })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors.email).toBeDefined()
  })

  it('rejeita senha sem maiúscula', () => {
    const result = SignupDtoSchema.safeParse({
      fullName: 'João',
      companyName: 'Empresa',
      email: 'joao@empresa.com',
      password: 'senha123',
    })
    expect(result.success).toBe(false)
  })

  it('rejeita senha sem número', () => {
    const result = SignupDtoSchema.safeParse({
      fullName: 'João',
      companyName: 'Empresa',
      email: 'joao@empresa.com',
      password: 'SenhaSemNumero',
    })
    expect(result.success).toBe(false)
  })

  it('rejeita nome muito curto', () => {
    const result = SignupDtoSchema.safeParse({
      fullName: 'J',
      companyName: 'Empresa',
      email: 'joao@empresa.com',
      password: 'Senha123',
    })
    expect(result.success).toBe(false)
  })

  it('rejeita empresa muito curta', () => {
    const result = SignupDtoSchema.safeParse({
      fullName: 'João',
      companyName: 'X',
      email: 'joao@empresa.com',
      password: 'Senha123',
    })
    expect(result.success).toBe(false)
  })
})
