import { WifiOff } from 'lucide-react'
import { useNetworkStatus } from '@/hooks/use-network-status'

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus()

  if (isOnline) return null

  return (
    <div className="flex items-center justify-center gap-2 bg-yellow-500 text-yellow-950 text-xs font-medium py-1.5 px-4" role="alert">
      <WifiOff className="size-3.5" aria-hidden="true" />
      <span>Sem conexão com a internet</span>
    </div>
  )
}
