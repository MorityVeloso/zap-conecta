import { useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'

interface StatusResponse {
  status: 'CONNECTED' | 'QR_CODE' | 'DISCONNECTED'
  phone?: string
  instanceConfigured?: boolean
  instanceId?: string
  qrCode?: string
}

const STATUS_QUERY_KEY = ['whatsapp', 'connection-status'] as const

/**
 * Centralized WhatsApp connection status hook.
 * SSE for real-time updates + React Query polling as fallback.
 * Shows toast on disconnect with reconnect action.
 */
export function useWhatsAppStatus() {
  const queryClient = useQueryClient()
  const sseAlive = useRef(false)
  const prevStatus = useRef<string | null>(null)
  const toastId = useRef<string | number | undefined>(undefined)

  // Polling fallback — slower interval when SSE is alive
  const query = useQuery({
    queryKey: STATUS_QUERY_KEY,
    queryFn: () => api.get<StatusResponse>('/whatsapp/status'),
    staleTime: 10_000,
    refetchInterval: sseAlive.current ? 30_000 : 10_000,
  })

  const status = query.data?.status ?? 'DISCONNECTED'
  const isConnected = status === 'CONNECTED'
  const isLoading = query.isLoading

  // Show/dismiss disconnect toast
  useEffect(() => {
    if (isLoading) return

    if (prevStatus.current === 'CONNECTED' && status !== 'CONNECTED') {
      toastId.current = toast.warning('WhatsApp desconectado', {
        duration: Infinity,
        action: {
          label: 'Reconectar',
          onClick: () => {
            window.location.href = '/dashboard/instances'
          },
        },
      })
    }

    if (status === 'CONNECTED' && toastId.current) {
      toast.dismiss(toastId.current)
      toastId.current = undefined
    }

    prevStatus.current = status
  }, [status, isLoading])

  // SSE connection with exponential backoff reconnect
  const connectSSE = useCallback(() => {
    let cancelled = false
    let retryCount = 0
    const MAX_RETRIES = 10

    const connect = async () => {
      if (cancelled) return

      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token || cancelled) return

        const apiUrl = import.meta.env.VITE_API_URL ?? '/api'
        const response = await fetch(`${apiUrl}/whatsapp/status/stream`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        })

        if (!response.ok || !response.body || cancelled) return

        sseAlive.current = true
        retryCount = 0
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let lastData = Date.now()

        // Stale stream detection: if no data for 45s (backend pings every 30s)
        const staleCheck = setInterval(() => {
          if (Date.now() - lastData > 45_000) {
            sseAlive.current = false
            reader.cancel()
            clearInterval(staleCheck)
          }
        }, 10_000)

        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) break

          lastData = Date.now()
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const parsed = JSON.parse(line.slice(6))
              if (parsed.type === 'ping') continue

              // Write SSE data into React Query cache
              if (parsed.status) {
                queryClient.setQueryData(STATUS_QUERY_KEY, (old: StatusResponse | undefined) => ({
                  ...old,
                  status: parsed.status,
                  phone: parsed.phone ?? old?.phone,
                  instanceId: parsed.instanceId ?? old?.instanceId,
                  instanceConfigured: true,
                  qrCode: parsed.qrCode,
                }))
              }

              // Also update per-instance status queries
              if (parsed.instanceId) {
                queryClient.setQueryData(
                  ['whatsapp', 'status', parsed.instanceId],
                  (old: StatusResponse | undefined) => ({
                    ...old,
                    status: parsed.status,
                    phone: parsed.phone,
                    instanceConfigured: true,
                    instanceId: parsed.instanceId,
                    qrCode: parsed.qrCode,
                  }),
                )
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        clearInterval(staleCheck)
        reader.releaseLock()
      } catch {
        // connection failed
      }

      sseAlive.current = false

      // Reconnect with exponential backoff
      if (!cancelled && retryCount < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30_000)
        retryCount++
        await new Promise((r) => setTimeout(r, delay))
        if (!cancelled) connect()
      }
    }

    connect()

    return () => {
      cancelled = true
      sseAlive.current = false
    }
  }, [queryClient])

  useEffect(() => {
    return connectSSE()
  }, [connectSSE])

  return {
    status,
    isConnected,
    isLoading,
    phone: query.data?.phone,
    instanceId: query.data?.instanceId,
    instanceConfigured: query.data?.instanceConfigured,
    refetch: query.refetch,
  }
}
