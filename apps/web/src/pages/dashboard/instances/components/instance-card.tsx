import { useQuery } from '@tanstack/react-query'
import { Smartphone, RefreshCw, Wifi, WifiOff, Trash2, QrCode } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface WhatsAppInstance {
  id: string
  tenantSlug: string
  displayName: string | null
  instanceName: string
  status: string
  phone: string | null
  createdAt: string
}

interface InstanceStatusResponse {
  status: 'CONNECTED' | 'QR_CODE' | 'DISCONNECTED'
  phone?: string
  qrCode?: string
  pairingCode?: string | null
  instanceConfigured: boolean
  instanceId?: string
}

export function InstanceCard({
  instance,
  onConnect,
  onDisconnect,
  onDelete,
  isConnecting,
  isDeleting,
}: {
  instance: WhatsAppInstance
  onConnect: (id: string) => void
  onDisconnect: (id: string) => void
  onDelete: (id: string) => void
  isConnecting: boolean
  isDeleting: boolean
}) {
  const { data: liveStatus, refetch } = useQuery({
    queryKey: ['whatsapp', 'status', instance.id],
    queryFn: () => api.get<InstanceStatusResponse>(`/whatsapp/status?instanceId=${instance.id}`),
    refetchInterval: false,
  })

  const isConnected = liveStatus?.status === 'CONNECTED'
  const hasQr = liveStatus?.status === 'QR_CODE'
  const displayName = instance.displayName ?? instance.instanceName

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`
            w-10 h-10 rounded-lg flex items-center justify-center
            ${isConnected ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}
          `}>
            {isConnected ? <Smartphone className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground text-sm">{displayName}</span>
              <Badge
                variant={isConnected ? 'success' : hasQr ? 'warning' : 'secondary'}
                dot
              >
                {isConnected ? 'Ativo' : hasQr ? 'Aguardando QR' : 'Desconectado'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isConnected && liveStatus?.phone
                ? liveStatus.phone
                : `Instância: ${instance.instanceName}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => refetch()} aria-label="Atualizar status">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>

          {isConnected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDisconnect(instance.id)}
            >
              <WifiOff className="w-3.5 h-3.5 mr-1" />
              Desconectar
            </Button>
          )}

          {!isConnected && (
            <Button
              size="sm"
              onClick={() => onConnect(instance.id)}
              loading={isConnecting}
            >
              <QrCode className="w-3.5 h-3.5 mr-1" />
              Conectar
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive border-destructive/30"
            onClick={() => onDelete(instance.id)}
            loading={isDeleting}
            aria-label="Excluir instância"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {isConnected && (
        <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
          <Wifi className="w-3.5 h-3.5 text-green-500" />
          <span>WhatsApp Web conectado e ativo</span>
        </div>
      )}
    </Card>
  )
}
