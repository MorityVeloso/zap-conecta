import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'crypto'
import { TenantApiKeyGuard } from '../tenant-api-key.guard'
import type { ExecutionContext } from '@nestjs/common'

const mockPrisma = {
  apiKey: {
    findFirst: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
}

function makeContext(headers: Record<string, string>) {
  const req = { headers, tenantContext: undefined as unknown }
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext
}

describe('TenantApiKeyGuard', () => {
  let guard: TenantApiKeyGuard

  beforeEach(() => {
    guard = new TenantApiKeyGuard(mockPrisma as unknown as never)
    vi.clearAllMocks()
  })

  it('retorna false se x-api-key não fornecido', async () => {
    const ctx = makeContext({})
    const result = await guard.canActivate(ctx)
    expect(result).toBe(false)
    expect(mockPrisma.apiKey.findFirst).not.toHaveBeenCalled()
  })

  it('retorna false se key não encontrada no banco', async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue(null)
    const ctx = makeContext({ 'x-api-key': 'zc_live_invalidkey123456789012345' })
    const result = await guard.canActivate(ctx)
    expect(result).toBe(false)
  })

  it('injeta tenantContext com dados corretos quando key válida', async () => {
    const rawKey = 'zc_live_validapikey1234567890abc'
    const keyHash = createHash('sha256').update(rawKey).digest('hex')
    const prefix = rawKey.slice(0, 16)

    mockPrisma.apiKey.findFirst.mockResolvedValue({
      id: 'key-id',
      tenantId: 'tenant-id',
      createdById: 'user-id',
      tenant: {
        id: 'tenant-id',
        slug: 'minha-empresa',
        status: 'ACTIVE',
        plan: { id: 'plan-id', name: 'free' },
      },
    })

    const req = { headers: { 'x-api-key': rawKey }, tenantContext: undefined }
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext

    const result = await guard.canActivate(ctx)

    expect(result).toBe(true)
    expect(req.tenantContext).toMatchObject({
      tenantId: 'tenant-id',
      tenantSlug: 'minha-empresa',
    })
    expect(mockPrisma.apiKey.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ keyPrefix: prefix, keyHash }),
      }),
    )
  })

  it('retorna false se tenant está PAUSED', async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({
      id: 'key-id',
      tenantId: 'tenant-id',
      createdById: 'user-id',
      tenant: { id: 'tenant-id', slug: 'minha-empresa', status: 'PAUSED', plan: {} },
    })
    const ctx = makeContext({ 'x-api-key': 'zc_live_validapikey1234567890abc' })
    const result = await guard.canActivate(ctx)
    expect(result).toBe(false)
  })
})
