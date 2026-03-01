import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface DashboardStats {
  messagesSentThisMonth: number
  messagesReceivedThisMonth: number
  activeInstances: number
  totalInstances: number
  messagesLimit: number
  usagePercent: number
  recentMessages: Array<{
    id: string
    phone: string
    type: string
    direction: 'INBOUND' | 'OUTBOUND'
    content: { text?: string; caption?: string }
    createdAt: string
  }>
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.get<DashboardStats>('/tenants/stats'),
    refetchInterval: 30_000,
    staleTime: 10_000,
  })
}
