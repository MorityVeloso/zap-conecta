import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Copy, Trash2, Webhook, CheckCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/alert'
import { formatRelativeTime } from '@/lib/utils'

type WebhookEvent = 'message.received' | 'message.sent' | 'message.status' | 'instance.connected' | 'instance.disconnected'

const EVENT_LABELS: Record<WebhookEvent, string> = {
  'message.received': 'Mensagem recebida',
  'message.sent': 'Mensagem enviada',
  'message.status': 'Status da mensagem',
  'instance.connected': 'Instância conectada',
  'instance.disconnected': 'Instância desconectada',
}

const ALL_EVENTS = Object.keys(EVENT_LABELS) as WebhookEvent[]

interface WebhookItem {
  id: string
  url: string
  events: WebhookEvent[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface WebhookCreated extends WebhookItem {
  secret: string
}

export function WebhooksPage() {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newEvents, setNewEvents] = useState<WebhookEvent[]>(['message.received'])
  const [createdWebhook, setCreatedWebhook] = useState<WebhookCreated | null>(null)

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.get<WebhookItem[]>('/webhooks'),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<WebhookCreated>('/webhooks', { url: newUrl, events: newEvents }),
    onSuccess: (data) => {
      setCreatedWebhook(data)
      setNewUrl('')
      setNewEvents(['message.received'])
      setShowCreateModal(false)
      void queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar webhook')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch<WebhookItem>(`/webhooks/${id}`),
    onSuccess: (data) => {
      toast.success(data.isActive ? 'Webhook ativado' : 'Webhook desativado')
      void queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/webhooks/${id}`),
    onSuccess: () => {
      toast.success('Webhook removido')
      void queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
  })

  const toggleEvent = (event: WebhookEvent) => {
    setNewEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    )
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copiado!'))
  }

  const isValidUrl = (url: string) => {
    try {
      return ['http:', 'https:'].includes(new URL(url).protocol)
    } catch {
      return false
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Webhooks</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Receba notificações em tempo real para eventos do WhatsApp
          </p>
        </div>
        <Button variant="gradient" onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
          Novo webhook
        </Button>
      </div>

      {/* Secret shown once after creation */}
      {createdWebhook && (
        <Alert variant="success" className="mb-6">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">Webhook criado com sucesso!</p>
            <p className="text-sm opacity-80 mt-0.5">
              Salve o segredo HMAC abaixo — não será exibido novamente.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Input
                readOnly
                value={createdWebhook.secret}
                className="font-mono text-xs bg-background/50"
                aria-label="HMAC signing secret"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(createdWebhook.secret)}
              >
                <Copy className="w-4 h-4 mr-1.5" aria-hidden="true" />
                Copiar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCreatedWebhook(null)}>
                ✕
              </Button>
            </div>
            <p className="text-xs opacity-60 mt-2">
              Use-o para verificar a assinatura: <code className="font-mono">X-Zap-Signature: sha256=&lt;hmac&gt;</code>
            </p>
          </div>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          <span>Carregando...</span>
        </div>
      ) : webhooks.length === 0 ? (
        <Card className="p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <Webhook className="w-7 h-7 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="font-semibold text-foreground">Nenhum webhook configurado</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Configure webhooks para receber eventos como mensagens recebidas,
            status de entrega e mudanças de conexão no seu sistema.
          </p>
          <Button variant="gradient" className="mt-4" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
            Criar primeiro webhook
          </Button>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            <div className="grid grid-cols-[1fr_200px_100px_80px] gap-4 px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>URL</span>
              <span>Eventos</span>
              <span>Status</span>
              <span />
            </div>

            {webhooks.map((wh) => (
              <div
                key={wh.id}
                className="grid grid-cols-[1fr_200px_100px_80px] gap-4 items-center px-4 py-3.5 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm text-foreground truncate">{wh.url}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatRelativeTime(wh.createdAt)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1">
                  {wh.events.map((ev) => (
                    <Badge key={ev} variant="secondary" className="text-[10px] font-mono">
                      {ev.split('.')[1]}
                    </Badge>
                  ))}
                </div>

                <div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={wh.isActive}
                    onClick={() => toggleMutation.mutate(wh.id)}
                    disabled={toggleMutation.isPending}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${
                      wh.isActive ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`}
                    aria-label={wh.isActive ? 'Desativar webhook' : 'Ativar webhook'}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        wh.isActive ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate(wh.id)}
                    loading={deleteMutation.isPending}
                    aria-label={`Remover webhook ${wh.url}`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Create modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar webhook</DialogTitle>
            <DialogDescription>
              Configure a URL e os eventos que deseja receber
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="webhook-url">URL do endpoint</Label>
              <Input
                id="webhook-url"
                type="url"
                placeholder="https://meu-sistema.com/webhooks/zap"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="mt-1.5 font-mono text-sm"
                autoFocus
              />
            </div>

            <div>
              <Label>Eventos</Label>
              <div className="mt-2 space-y-2">
                {ALL_EVENTS.map((event) => (
                  <label
                    key={event}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={newEvents.includes(event)}
                      onChange={() => toggleEvent(event)}
                      className="h-4 w-4 rounded border-border text-primary accent-primary"
                    />
                    <span className="text-sm text-foreground">{EVENT_LABELS[event]}</span>
                    <code className="ml-auto text-[10px] font-mono text-muted-foreground">
                      {event}
                    </code>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="gradient"
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={!isValidUrl(newUrl) || newEvents.length === 0}
            >
              Criar webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
