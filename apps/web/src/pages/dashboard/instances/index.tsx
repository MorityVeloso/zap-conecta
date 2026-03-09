import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Smartphone, Plus, RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { getErrorMessage } from '@/lib/error-messages'
import { useWhatsAppStatus } from '@/hooks/use-whatsapp-status'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { QrCodeDisplay, PairingCodeDisplay } from './components/qr-code-display'
import { InstanceCard } from './components/instance-card'

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

interface ConnectResponse extends InstanceStatusResponse {
  error?: string
}

function CreateInstanceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
          <DialogDescription>Adicione um novo número ao seu painel</DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="inst-name">Nome da instância (opcional)</Label>
          <Input
            id="inst-name"
            placeholder="Ex: Vendas, Suporte, Marketing..."
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createMutation.mutate() }}
            className="mt-1.5"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setDisplayName(''); onClose() }}>Cancelar</Button>
          <Button variant="gradient" onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
            Criar instância
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function InstancesPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [qrModal, setQrModal] = useState<{ open: boolean; instanceId: string | null; pairingCode: string | null }>({ open: false, instanceId: null, pairingCode: null })
  const [qrGeneratedAt, setQrGeneratedAt] = useState(Date.now())
  const [pollingEnabled, setPollingEnabled] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null)

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ['whatsapp', 'instances'],
    queryFn: () => api.get<WhatsAppInstance[]>('/whatsapp/instances'),
  })

  useWhatsAppStatus()

  const { data: qrStatus } = useQuery({
    queryKey: ['whatsapp', 'status', qrModal.instanceId],
    queryFn: () => api.get<InstanceStatusResponse>(`/whatsapp/status?instanceId=${qrModal.instanceId}`),
    enabled: pollingEnabled && !!qrModal.instanceId,
    refetchInterval: pollingEnabled ? 1500 : false,
  })

  const connectMutation = useMutation({
    mutationFn: (instanceId: string) => api.post<ConnectResponse>(`/whatsapp/connect?instanceId=${instanceId}`),
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
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const disconnectMutation = useMutation({
    mutationFn: (instanceId: string) => api.post<void>(`/whatsapp/disconnect?instanceId=${instanceId}`),
    onSuccess: () => {
      setConfirmDisconnect(null)
      void queryClient.invalidateQueries({ queryKey: ['whatsapp'] })
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (instanceId: string) => api.delete<void>(`/whatsapp/instance/${instanceId}`),
    onSuccess: () => {
      toast.success('Instância removida')
      setConfirmDelete(null)
      void queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] })
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  useEffect(() => {
    if (qrStatus?.qrCode) setQrGeneratedAt(Date.now())
  }, [qrStatus?.qrCode])

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
          <p className="text-muted-foreground mt-0.5 text-sm">Gerencie seus números conectados à plataforma</p>
        </div>
        <Button variant="gradient" onClick={() => setShowCreate(true)}>
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
              onDisconnect={(id) => setConfirmDisconnect(id)}
              onDelete={(id) => setConfirmDelete(id)}
              isConnecting={connectMutation.isPending}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}

      {connectMutation.isError && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>Erro ao conectar. Verifique se a Evolution API está rodando.</AlertDescription>
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
            <DialogDescription>Escaneie o QR code ou use o código de vinculação</DialogDescription>
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
            <Button variant="outline" onClick={() => setQrModal({ open: false, instanceId: null, pairingCode: null })}>Fechar</Button>
            {qrModal.instanceId && (
              <Button variant="outline" onClick={() => connectMutation.mutate(qrModal.instanceId!)} loading={connectMutation.isPending}>
                <RefreshCw className="w-4 h-4 mr-1.5" />
                Atualizar QR
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateInstanceModal open={showCreate} onClose={() => setShowCreate(false)} />

      <ConfirmDialog
        open={!!confirmDisconnect}
        onOpenChange={(o) => { if (!o) setConfirmDisconnect(null) }}
        title="Desconectar instância"
        description="Tem certeza? O WhatsApp será desvinculado e você precisará escanear o QR code novamente para reconectar."
        confirmLabel="Desconectar"
        onConfirm={() => { if (confirmDisconnect) disconnectMutation.mutate(confirmDisconnect) }}
        loading={disconnectMutation.isPending}
      />

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
