import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Copy, Trash2, Webhook, CheckCircle, Loader2, Pencil, Zap, ChevronDown, ChevronUp, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/alert'
import { Pagination } from '@/components/ui/pagination'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

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

interface DeliveryLog {
  id: string
  event: string
  success: boolean
  statusCode: number | null
  durationMs: number
  attempt: number
  error: string | null
  createdAt: string
}

// ── Delivery logs accordion ────────────────────────────────────────────────

function DeliveryLogsAccordion({ webhookId }: { webhookId: string }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['webhook-logs', webhookId],
    queryFn: () => api.get<DeliveryLog[]>(`/webhooks/${webhookId}/logs?limit=20`),
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Carregando logs…
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <p className="py-3 px-4 text-xs text-muted-foreground">
        Nenhuma entrega registrada ainda.
      </p>
    )
  }

  return (
    <div className="divide-y divide-border">
      {logs.map((log) => (
        <div key={log.id} className="flex items-center gap-3 px-4 py-2 text-xs">
          {log.success ? (
            <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" aria-hidden="true" />
          ) : (
            <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" aria-hidden="true" />
          )}
          <code className="font-mono text-muted-foreground w-32 shrink-0">{log.event}</code>
          <span className={cn('w-16 shrink-0', log.success ? 'text-green-600' : 'text-destructive')}>
            {log.statusCode ? `HTTP ${log.statusCode}` : log.error ?? 'err'}
          </span>
          <span className="text-muted-foreground w-16 shrink-0">{log.durationMs}ms</span>
          <span className="text-muted-foreground ml-auto">{formatRelativeTime(log.createdAt)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Webhook form modal (create & edit) ────────────────────────────────────

function WebhookFormModal({
  open,
  onClose,
  existing,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  existing?: WebhookItem
  onCreated?: (wh: WebhookCreated) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = !!existing
  const [url, setUrl] = useState(existing?.url ?? '')
  const [events, setEvents] = useState<WebhookEvent[]>(existing?.events ?? ['message.received'])

  const toggleEvent = (event: WebhookEvent) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    )
  }

  const isValidUrl = (u: string) => {
    try { return ['http:', 'https:'].includes(new URL(u).protocol) } catch { return false }
  }

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? api.patch<WebhookItem>(`/webhooks/${existing!.id}`, { url, events })
        : api.post<WebhookCreated>('/webhooks', { url, events }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['webhooks'] })
      if (!isEdit) onCreated?.(data as WebhookCreated)
      toast.success(isEdit ? 'Webhook atualizado' : 'Webhook criado')
      onClose()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar webhook')
    },
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar webhook' : 'Criar webhook'}</DialogTitle>
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
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-1.5 font-mono text-sm"
              autoFocus
            />
          </div>

          <div>
            <Label>Eventos</Label>
            <div className="mt-2 space-y-2">
              {ALL_EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={events.includes(event)}
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
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            variant="gradient"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!isValidUrl(url) || events.length === 0}
          >
            {isEdit ? 'Salvar alterações' : 'Criar webhook'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export function WebhooksPage() {
  const queryClient = useQueryClient()
  const [modalState, setModalState] = useState<{ open: boolean; existing?: WebhookItem }>({ open: false })
  const [createdWebhook, setCreatedWebhook] = useState<WebhookCreated | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const toggleExpanded = (id: string) => setExpandedId((prev) => (prev === id ? null : id))

  const { data: result, isLoading } = useQuery({
    queryKey: ['webhooks', page],
    queryFn: () => api.get<PaginatedResponse<WebhookItem>>(`/webhooks?page=${page}&limit=20`),
  })

  const webhooks = result?.data ?? []

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch<WebhookItem>(`/webhooks/${id}`),
    onSuccess: (data) => {
      toast.success(data.isActive ? 'Webhook ativado' : 'Webhook desativado')
      void queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
  })

  const testMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<{ success: boolean; statusCode?: number; durationMs: number; error?: string }>(
        `/webhooks/${id}/test`,
      ),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Ping enviado! Status ${data.statusCode} em ${data.durationMs}ms`)
      } else {
        toast.error(`Ping falhou: ${data.error ?? `HTTP ${data.statusCode}`} (${data.durationMs}ms)`)
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao testar webhook')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/webhooks/${id}`),
    onSuccess: () => {
      toast.success('Webhook removido')
      void queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copiado!'))
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
        <Button variant="gradient" onClick={() => setModalState({ open: true })}>
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
              <Button variant="ghost" size="sm" onClick={() => setCreatedWebhook(null)}>✕</Button>
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
          <Button variant="gradient" className="mt-4" onClick={() => setModalState({ open: true })}>
            <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
            Criar primeiro webhook
          </Button>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            <div className="grid grid-cols-[1fr_200px_100px_120px] gap-4 px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>URL</span>
              <span>Eventos</span>
              <span>Status</span>
              <span />
            </div>

            {webhooks.map((wh) => (
              <div key={wh.id}>
                <div className="grid grid-cols-[1fr_200px_100px_120px] gap-4 items-center px-4 py-3.5 hover:bg-muted/30 transition-colors">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(wh.id)}
                      className="flex items-center gap-1.5 group"
                      aria-expanded={expandedId === wh.id}
                      aria-label={`${expandedId === wh.id ? 'Ocultar' : 'Ver'} logs de entrega`}
                    >
                      <p className="font-mono text-sm text-foreground truncate group-hover:text-primary transition-colors">{wh.url}</p>
                      {expandedId === wh.id
                        ? <ChevronUp className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
                        : <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
                      }
                    </button>
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

                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-primary"
                      onClick={() => testMutation.mutate(wh.id)}
                      loading={testMutation.isPending}
                      title="Testar webhook"
                      aria-label={`Testar webhook ${wh.url}`}
                    >
                      <Zap className="w-4 h-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setModalState({ open: true, existing: wh })}
                      title="Editar webhook"
                      aria-label={`Editar webhook ${wh.url}`}
                    >
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    </Button>
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

                {/* Delivery logs accordion */}
                {expandedId === wh.id && (
                  <div className="bg-muted/20 border-t border-border">
                    <p className="px-4 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Logs de entrega (últimas 20)
                    </p>
                    <DeliveryLogsAccordion webhookId={wh.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
          {result && (
            <Pagination page={result.page} limit={result.limit} total={result.total} onPageChange={setPage} />
          )}
        </Card>
      )}

      <WebhookFormModal
        open={modalState.open}
        onClose={() => setModalState({ open: false })}
        existing={modalState.existing}
        onCreated={(wh) => setCreatedWebhook(wh)}
      />
    </div>
  )
}
