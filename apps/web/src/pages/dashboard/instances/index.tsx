import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Smartphone, Plus, RefreshCw, Wifi, WifiOff, Loader2, Trash2, QrCode, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { getErrorMessage } from '@/lib/error-messages'
import { useWhatsAppStatus } from '@/hooks/use-whatsapp-status'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

type ConnectionStatus = 'CONNECTED' | 'QR_CODE' | 'DISCONNECTED'

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
  status: ConnectionStatus
  phone?: string
  qrCode?: string
  pairingCode?: string | null
  instanceConfigured: boolean
  instanceId?: string
}

interface ConnectResponse extends InstanceStatusResponse {
  error?: string
}

const QR_EXPIRY_SECONDS = 45

function QrCodeDisplay({ data, generatedAt }: { data: string; generatedAt: number }) {
  const [remaining, setRemaining] = useState(QR_EXPIRY_SECONDS)

  useEffect(() => {
    const elapsed = Math.floor((Date.now() - generatedAt) / 1000)
    setRemaining(Math.max(0, QR_EXPIRY_SECONDS - elapsed))

    const timer = setInterval(() => {
      const now = Math.floor((Date.now() - generatedAt) / 1000)
      const left = Math.max(0, QR_EXPIRY_SECONDS - now)
      setRemaining(left)
      if (left <= 0) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [generatedAt])

  const expired = remaining <= 0

  const isBase64Image = data.startsWith('data:image') || data.length > 100
  if (isBase64Image) {
    const src = data.startsWith('data:') ? data : `data:image/png;base64,${data}`
    return (
      <div className="flex flex-col items-center gap-3">
        <div className={`bg-white p-4 rounded-xl shadow-inner relative ${expired ? 'opacity-30' : ''}`}>
          <img src={src} alt="QR Code WhatsApp" className="w-56 h-56 object-contain" />
          {expired && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-background/90 text-foreground font-semibold text-sm px-3 py-1.5 rounded-lg">
                QR expirado
              </span>
            </div>
          )}
        </div>
        {!expired && (
          <p className="text-xs text-muted-foreground text-center">
            Expira em <span className="font-mono font-medium text-foreground">{remaining}s</span>
          </p>
        )}
        <p className="text-xs text-muted-foreground text-center max-w-[220px]">
          Abra o WhatsApp &rarr; Dispositivos vinculados &rarr; Adicionar dispositivo
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

function PairingCodeDisplay({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const formatted = code.replace(/(.{4})(.{4})/, '$1-$2')

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <div className="flex items-center gap-2 bg-muted rounded-lg px-4 py-2.5 mt-3">
      <span className="text-xs text-muted-foreground">Código:</span>
      <span className="font-mono font-bold text-lg tracking-widest text-foreground">{formatted}</span>
      <button
        onClick={copy}
        className="ml-1 p-1 rounded hover:bg-background transition-colors"
        aria-label="Copiar código"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
    </div>
  )
}

// SSE is now handled centrally by useWhatsAppStatus hook

// ── Instance Card ────────────────────────────────────────────────────────────

function InstanceCard({
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

// ── Create instance modal ────────────────────────────────────────────────────

function CreateInstanceModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState('')

  const createMutation = useMutation({
    mutationFn: () => api.post('/whatsapp/instance/create', { displayName: displayName.trim() || undefined }),
    onSuccess: () => {
      toast.success('Instância criada!')
      setDisplayName('')
      onClose()
      void queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar instância')
    },
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setDisplayName(''); onClose() } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova instância WhatsApp</DialogTitle>
          <DialogDescription>
            Adicione um novo número ao seu painel
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <Label htmlFor="inst-name">Nome da instância (opcional)</Label>
          <Input
            id="inst-name"
            placeholder="Ex: Vendas, Suporte, Marketing..."
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createMutation.mutate()
            }}
            className="mt-1.5"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setDisplayName(''); onClose() }}>
            Cancelar
          </Button>
          <Button
            variant="gradient"
            onClick={() => createMutation.mutate()}
            loading={createMutation.isPending}
          >
            Criar instância
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export function InstancesPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [qrModal, setQrModal] = useState<{ open: boolean; instanceId: string | null; pairingCode: string | null }>({ open: false, instanceId: null, pairingCode: null })
  const [qrGeneratedAt, setQrGeneratedAt] = useState(Date.now())
  const [pollingEnabled, setPollingEnabled] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ['whatsapp', 'instances'],
    queryFn: () => api.get<WhatsAppInstance[]>('/whatsapp/instances'),
  })

  // SSE is handled centrally by useWhatsAppStatus (in layout)
  useWhatsAppStatus()

  // Poll QR status when modal is open (fallback for SSE + QR code refresh)
  // 1.5s interval during QR display for fast scan detection
  const { data: qrStatus } = useQuery({
    queryKey: ['whatsapp', 'status', qrModal.instanceId],
    queryFn: () => api.get<InstanceStatusResponse>(
      `/whatsapp/status?instanceId=${qrModal.instanceId}`,
    ),
    enabled: pollingEnabled && !!qrModal.instanceId,
    refetchInterval: pollingEnabled ? 1500 : false,
  })

  const connectMutation = useMutation({
    mutationFn: (instanceId: string) =>
      api.post<ConnectResponse>(
        `/whatsapp/connect?instanceId=${instanceId}`,
      ),
    onSuccess: (data, instanceId) => {
      if (data.status === 'QR_CODE') {
        setQrModal({ open: true, instanceId, pairingCode: data.pairingCode ?? null })
        setQrGeneratedAt(Date.now())
        setPollingEnabled(true)
      } else if (data.error) {
        toast.error(data.error)
      } else {
        toast.error('Não foi possível gerar o QR code. Tente novamente.')
      }
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: (instanceId: string) =>
      api.post<void>(`/whatsapp/disconnect?instanceId=${instanceId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['whatsapp'] })
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (instanceId: string) =>
      api.delete<void>(`/whatsapp/instance/${instanceId}`),
    onSuccess: () => {
      toast.success('Instância removida')
      setConfirmDelete(null)
      void queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] })
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  // Reset QR timer when new QR code arrives from backend
  useEffect(() => {
    if (qrStatus?.qrCode) {
      setQrGeneratedAt(Date.now())
    }
  }, [qrStatus?.qrCode])

  // Close QR modal when connected (via polling or SSE)
  useEffect(() => {
    if (qrStatus?.status === 'CONNECTED') {
      setQrModal({ open: false, instanceId: null, pairingCode: null })
      setPollingEnabled(false)
      toast.success('WhatsApp conectado!')
      void queryClient.invalidateQueries({ queryKey: ['whatsapp'] })
    }
  }, [qrStatus?.status, queryClient])

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Instâncias WhatsApp</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Gerencie seus números conectados à plataforma
          </p>
        </div>
        <Button
          variant="gradient"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova instância
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Carregando...</span>
        </div>
      )}

      {!isLoading && instances.length === 0 && (
        <Card className="p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <Smartphone className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground">Nenhuma instância</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Crie uma instância para conectar um número de WhatsApp à plataforma.
          </p>
          <Button variant="gradient" className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Criar primeira instância
          </Button>
        </Card>
      )}

      {!isLoading && instances.length > 0 && (
        <div className="space-y-3">
          {instances.map((inst) => (
            <InstanceCard
              key={inst.id}
              instance={inst}
              onConnect={(id) => connectMutation.mutate(id)}
              onDisconnect={(id) => disconnectMutation.mutate(id)}
              onDelete={(id) => setConfirmDelete(id)}
              isConnecting={connectMutation.isPending}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}

      {connectMutation.isError && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>
            Erro ao conectar. Verifique se a Evolution API está rodando.
          </AlertDescription>
        </Alert>
      )}

      {/* QR Code modal */}
      <Dialog
        open={qrModal.open}
        onOpenChange={(o) => {
          setQrModal({ open: o, instanceId: o ? qrModal.instanceId : null, pairingCode: o ? qrModal.pairingCode : null })
          if (!o) setPollingEnabled(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              Escaneie o QR code ou use o código de vinculação
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center py-4">
            {qrStatus?.qrCode ? (
              <QrCodeDisplay data={qrStatus.qrCode} generatedAt={qrGeneratedAt} />
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Gerando QR code...</span>
              </div>
            )}

            {(qrModal.pairingCode ?? qrStatus?.pairingCode) && (
              <PairingCodeDisplay code={(qrModal.pairingCode ?? qrStatus?.pairingCode)!} />
            )}

            {pollingEnabled && qrStatus?.status !== 'CONNECTED' && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-3">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Aguardando conexão...</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQrModal({ open: false, instanceId: null, pairingCode: null })}>
              Fechar
            </Button>
            {qrModal.instanceId && (
              <Button
                variant="outline"
                onClick={() => connectMutation.mutate(qrModal.instanceId!)}
                loading={connectMutation.isPending}
              >
                <RefreshCw className="w-4 h-4 mr-1.5" />
                Atualizar QR
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateInstanceModal open={showCreate} onClose={() => setShowCreate(false)} />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null) }}
        title="Excluir instância"
        description="Tem certeza que deseja excluir esta instância? Esta ação não pode ser desfeita."
        variant="destructive"
        confirmLabel="Excluir"
        onConfirm={() => { if (confirmDelete) deleteMutation.mutate(confirmDelete) }}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
