import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Smartphone, Plus, RefreshCw, Wifi, WifiOff, Loader2, Trash2, QrCode, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'

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

// ── SSE hook for real-time status ───────────────────────────────────────────

function useStatusSSE(onStatusChange: (data: { status: string; instanceId: string; phone?: string }) => void) {
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    let cancelled = false

    const connect = async () => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token || cancelled) return

      const apiUrl = import.meta.env.VITE_API_URL ?? '/api'
      const url = `${apiUrl}/whatsapp/status/stream`

      // EventSource doesn't support custom headers — use query param for auth
      // NestJS will pick up Bearer from query if we add a custom approach,
      // but simplest: use fetch-based SSE via ReadableStream
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
      })

      if (!response.ok || !response.body || cancelled) return

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (!cancelled) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.type === 'ping') continue
            onStatusChange(parsed)
          } catch {
            // ignore parse errors
          }
        }
      }

      reader.releaseLock()
    }

    connect().catch(() => {
      // SSE connection failed — polling will handle it
    })

    return () => {
      cancelled = true
      eventSourceRef.current?.close()
    }
  }, [onStatusChange])
}

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
  const [pollingEnabled, setPollingEnabled] = useState(false)

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ['whatsapp', 'instances'],
    queryFn: () => api.get<WhatsAppInstance[]>('/whatsapp/instances'),
  })

  // SSE: real-time status updates (instant detection, no polling delay)
  const handleSSEStatus = useCallback((data: { status: string; instanceId: string; phone?: string }) => {
    // Update the cached status query for this instance
    queryClient.setQueryData(['whatsapp', 'status', data.instanceId], (old: InstanceStatusResponse | undefined) => ({
      ...old,
      status: data.status as ConnectionStatus,
      phone: data.phone,
      instanceConfigured: true,
      instanceId: data.instanceId,
    }))
    // Also invalidate instances list to refresh cards
    void queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] })
  }, [queryClient])

  useStatusSSE(handleSSEStatus)

  // Poll QR status when modal is open (fallback for SSE + QR code refresh)
  const { data: qrStatus } = useQuery({
    queryKey: ['whatsapp', 'status', qrModal.instanceId],
    queryFn: () => api.get<InstanceStatusResponse>(
      `/whatsapp/status?instanceId=${qrModal.instanceId}`,
    ),
    enabled: pollingEnabled && !!qrModal.instanceId,
    refetchInterval: pollingEnabled ? 2000 : false,
  })

  const connectMutation = useMutation({
    mutationFn: (instanceId: string) =>
      api.post<ConnectResponse>(
        `/whatsapp/connect?instanceId=${instanceId}`,
      ),
    onSuccess: (data, instanceId) => {
      if (data.status === 'QR_CODE') {
        setQrModal({ open: true, instanceId, pairingCode: data.pairingCode ?? null })
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
    mutationFn: (instanceId: string) =>
      api.post<void>(`/whatsapp/disconnect?instanceId=${instanceId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['whatsapp'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (instanceId: string) =>
      api.delete<void>(`/whatsapp/instance/${instanceId}`),
    onSuccess: () => {
      toast.success('Instância removida')
      void queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir')
    },
  })

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
              onDelete={(id) => deleteMutation.mutate(id)}
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
              <QrCodeDisplay data={qrStatus.qrCode} />
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
    </div>
  )
}
