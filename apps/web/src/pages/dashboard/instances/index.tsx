import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Smartphone, Plus, RefreshCw, Wifi, WifiOff, Loader2, Trash2, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'

type ConnectionStatus = 'CONNECTED' | 'QR_CODE' | 'DISCONNECTED'

interface InstanceStatus {
  status: ConnectionStatus
  phone?: string
  qrCode?: string
  instanceConfigured: boolean
}

function QrCodeDisplay({ data }: { data: string }) {
  const isBase64Image = data.startsWith('data:image') || data.length > 100
  if (isBase64Image) {
    const src = data.startsWith('data:') ? data : `data:image/png;base64,${data}`
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="bg-white p-4 rounded-xl shadow-inner">
          <img src={src} alt="QR Code WhatsApp" className="w-56 h-56 object-contain" />
        </div>
        <p className="text-xs text-muted-foreground text-center max-w-[220px]">
          Abra o WhatsApp → Dispositivos vinculados → Adicionar dispositivo
        </p>
      </div>
    )
  }
  return (
    <div className="font-mono text-xs text-muted-foreground break-all bg-muted p-3 rounded-lg max-h-40 overflow-auto">
      {data}
    </div>
  )
}

export function InstancesPage() {
  const queryClient = useQueryClient()
  const [showQrModal, setShowQrModal] = useState(false)
  const [pollingEnabled, setPollingEnabled] = useState(false)

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['whatsapp', 'status'],
    queryFn: () => api.get<InstanceStatus>('/whatsapp/status'),
    refetchInterval: pollingEnabled ? 3000 : false,
  })

  const connectMutation = useMutation({
    mutationFn: () => api.post<InstanceStatus & { error?: string }>('/whatsapp/connect'),
    onSuccess: (data) => {
      if (data.status === 'QR_CODE') {
        queryClient.setQueryData(['whatsapp', 'status'], data)
        setShowQrModal(true)
        setPollingEnabled(true)
      } else if (data.error) {
        toast.error(data.error)
      } else {
        toast.error('Não foi possível gerar o QR code. Tente novamente.')
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao conectar')
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: () => api.post<void>('/whatsapp/disconnect'),
    onSuccess: () => {
      setPollingEnabled(false)
      void queryClient.invalidateQueries({ queryKey: ['whatsapp', 'status'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete<void>('/whatsapp/instance'),
    onSuccess: () => {
      setPollingEnabled(false)
      void queryClient.invalidateQueries({ queryKey: ['whatsapp', 'status'] })
    },
  })

  useEffect(() => {
    if (status?.status === 'CONNECTED') {
      setShowQrModal(false)
      setPollingEnabled(false)
    }
  }, [status?.status])

  const isConnected = status?.status === 'CONNECTED'
  const hasQr = status?.status === 'QR_CODE'

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Instâncias WhatsApp</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Gerencie seus números conectados à plataforma
          </p>
        </div>
        {!isConnected && !isLoading && (
          <Button
            onClick={() => connectMutation.mutate()}
            loading={connectMutation.isPending}
            variant="gradient"
          >
            <Plus className="w-4 h-4 mr-2" />
            Conectar número
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Carregando...</span>
        </div>
      )}

      {!isLoading && status && (
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className={`
                w-12 h-12 rounded-xl flex items-center justify-center
                ${isConnected ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}
              `}>
                {isConnected ? <Smartphone className="w-6 h-6" /> : <WifiOff className="w-6 h-6" />}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {isConnected ? (status.phone ?? 'Conectado') : 'Não conectado'}
                  </span>
                  <Badge
                    variant={isConnected ? 'success' : hasQr ? 'warning' : 'secondary'}
                    dot
                  >
                    {isConnected ? 'Ativo' : hasQr ? 'Aguardando QR' : 'Desconectado'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {isConnected
                    ? 'Pronto para enviar e receber mensagens'
                    : 'Escaneie o QR Code para conectar'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4" />
              </Button>

              {isConnected && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnectMutation.mutate()}
                    loading={disconnectMutation.isPending}
                  >
                    <WifiOff className="w-4 h-4 mr-1.5" />
                    Desconectar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive border-destructive/30"
                    onClick={() => deleteMutation.mutate()}
                    loading={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}

              {!isConnected && status.instanceConfigured && (
                <Button
                  size="sm"
                  onClick={() => {
                    if (status.qrCode) {
                      setShowQrModal(true)
                    } else {
                      connectMutation.mutate()
                    }
                  }}
                  loading={connectMutation.isPending}
                >
                  <QrCode className="w-4 h-4 mr-1.5" />
                  Ver QR Code
                </Button>
              )}
            </div>
          </div>

          {isConnected && (
            <div className="mt-4 pt-4 border-t border-border flex items-center gap-2 text-sm text-muted-foreground">
              <Wifi className="w-4 h-4 text-green-500" />
              <span>WhatsApp Web conectado e ativo</span>
            </div>
          )}
        </Card>
      )}

      {connectMutation.isError && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>
            Erro ao conectar. Verifique se a Evolution API está rodando.
          </AlertDescription>
        </Alert>
      )}

      <Dialog
        open={showQrModal}
        onOpenChange={(o) => {
          setShowQrModal(o)
          if (!o) setPollingEnabled(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              Escaneie o QR code com seu celular para vincular o número
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center py-4">
            {status?.qrCode ? (
              <QrCodeDisplay data={status.qrCode} />
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Gerando QR code...</span>
              </div>
            )}

            {pollingEnabled && status?.status !== 'CONNECTED' && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-3">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Aguardando conexão...</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQrModal(false)}>
              Fechar
            </Button>
            <Button
              variant="outline"
              onClick={() => connectMutation.mutate()}
              loading={connectMutation.isPending}
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Atualizar QR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
