import { Wifi, WifiOff, Loader2 } from 'lucide-react'
import { useWhatsAppStatus } from '@/hooks/use-whatsapp-status'
import { cn } from '@/lib/utils'

export function ConnectionIndicator() {
  const { isConnected, isLoading } = useWhatsAppStatus()

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs">
        <Loader2 className="size-3 animate-spin" />
        <span className="hidden sm:inline">WhatsApp</span>
      </div>
    )
  }

  return (
    <button
      onClick={() => { window.location.href = '/dashboard/instances' }}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer',
        isConnected
          ? 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20'
          : 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20',
      )}
      aria-label={isConnected ? 'WhatsApp conectado' : 'WhatsApp desconectado'}
    >
      {isConnected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
      <span className="hidden sm:inline">
        {isConnected ? 'WhatsApp' : 'Desconectado'}
      </span>
    </button>
  )
}
