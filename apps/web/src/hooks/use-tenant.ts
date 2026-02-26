import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from './use-auth'

interface Plan {
  id: string
  name: string
  displayName: string
  priceBrlCents: number
  messagesPerMonth: number
  instancesLimit: number
  apiKeysLimit: number
}

interface TenantUsage {
  messagesSent: number
  messagesReceived: number
  period: string
}

interface Tenant {
  id: string
  slug: string
  name: string
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED'
  plan: Plan
  usage?: TenantUsage
}

export function useTenant() {
  const { user } = useAuth()

  const { data: tenant, isLoading, error } = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => api.get<Tenant>('/tenants/me'),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 min
  })

  return { tenant, isLoading, error }
}
