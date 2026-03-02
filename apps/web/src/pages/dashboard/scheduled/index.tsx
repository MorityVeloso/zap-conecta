import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Clock, Loader2, X, CheckCircle, XCircle, Ban, MessageSquare, Image, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Pagination } from '@/components/ui/pagination'
import { cn } from '@/lib/utils'

type ScheduledStatus = 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED'
type MessageType = 'TEXT' | 'IMAGE' | 'DOCUMENT'

const STATUS_CONFIG: Record<ScheduledStatus, { label: string; variant: 'default' | 'success' | 'destructive' | 'secondary'; icon: React.ElementType }> = {
  PENDING: { label: 'Pendente', variant: 'default', icon: Clock },
  SENT: { label: 'Enviado', variant: 'success', icon: CheckCircle },
  FAILED: { label: 'Falhou', variant: 'destructive', icon: XCircle },
  CANCELLED: { label: 'Cancelado', variant: 'secondary', icon: Ban },
}

interface ScheduledItem {
  id: string
  phone: string
  type: MessageType
  payload: Record<string, unknown>
  scheduledAt: string
  status: ScheduledStatus
  sentAt: string | null
  error: string | null
  createdAt: string
}

// ── Create modal ───────────────────────────────────────────────────────────

function CreateScheduledModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [phone, setPhone] = useState('')
  const [type, setType] = useState<MessageType>('TEXT')
  const [text, setText] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [fileName, setFileName] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')

  const reset = () => {
    setPhone('')
    setType('TEXT')
    setText('')
    setMediaUrl('')
    setCaption('')
    setFileName('')
    setScheduledAt('')
  }

  const buildPayload = () => {
    if (type === 'TEXT') return { text }
    if (type === 'IMAGE') return { image: mediaUrl, ...(caption ? { caption } : {}) }
    return { document: mediaUrl, fileName, ...(caption ? { caption } : {}) }
  }

  const canSubmit = () => {
    if (!phone.trim() || !scheduledAt) return false
    if (type === 'TEXT') return !!text.trim()
    if (type === 'IMAGE') return !!mediaUrl.trim()
    return !!mediaUrl.trim() && !!fileName.trim()
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/whatsapp/scheduled', {
        phone,
        type,
        payload: buildPayload(),
        scheduledAt: new Date(scheduledAt).toISOString(),
      }),
    onSuccess: () => {
      toast.success('Mensagem agendada!')
      reset()
      onClose()
      void queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao agendar')
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar mensagem</DialogTitle>
          <DialogDescription>
            A mensagem será enviada automaticamente no horário configurado
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Phone */}
          <div>
            <Label htmlFor="sched-phone">Destinatário</Label>
            <Input
              id="sched-phone"
              placeholder="5511999998888"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1.5 font-mono text-sm"
              autoFocus
            />
          </div>

          {/* Type selector */}
          <div>
            <Label>Tipo de mensagem</Label>
            <div className="flex gap-1 mt-1.5">
              {(['TEXT', 'IMAGE', 'DOCUMENT'] as MessageType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors border',
                    type === t
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t === 'TEXT' && <MessageSquare className="size-3" aria-hidden="true" />}
                  {t === 'IMAGE' && <Image className="size-3" aria-hidden="true" />}
                  {t === 'DOCUMENT' && <FileText className="size-3" aria-hidden="true" />}
                  {t === 'TEXT' ? 'Texto' : t === 'IMAGE' ? 'Imagem' : 'Documento'}
                </button>
              ))}
            </div>
          </div>

          {/* TEXT fields */}
          {type === 'TEXT' && (
            <div>
              <Label htmlFor="sched-text">Mensagem</Label>
              <Input
                id="sched-text"
                placeholder="Olá! Esta é uma mensagem agendada."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="mt-1.5"
              />
            </div>
          )}

          {/* IMAGE / DOCUMENT fields */}
          {(type === 'IMAGE' || type === 'DOCUMENT') && (
            <>
              <div>
                <Label htmlFor="sched-url">
                  URL {type === 'IMAGE' ? 'da imagem' : 'do arquivo'}
                </Label>
                <Input
                  id="sched-url"
                  placeholder={type === 'IMAGE' ? 'https://…/imagem.jpg' : 'https://…/arquivo.pdf'}
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  className="mt-1.5 font-mono text-sm"
                />
              </div>
              {type === 'DOCUMENT' && (
                <div>
                  <Label htmlFor="sched-filename">Nome do arquivo</Label>
                  <Input
                    id="sched-filename"
                    placeholder="documento.pdf"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              )}
              <div>
                <Label htmlFor="sched-caption">Legenda (opcional)</Label>
                <Input
                  id="sched-caption"
                  placeholder="Adicione uma legenda…"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </>
          )}

          {/* Date/time */}
          <div>
            <Label htmlFor="sched-date">Data e hora</Label>
            <Input
              id="sched-date"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose() }}>
            Cancelar
          </Button>
          <Button
            variant="gradient"
            onClick={() => createMutation.mutate()}
            loading={createMutation.isPending}
            disabled={!canSubmit()}
          >
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Helper: preview text for a scheduled item ──────────────────────────────

function payloadPreview(item: ScheduledItem): string {
  if (item.type === 'TEXT') return String(item.payload?.text ?? '')
  if (item.type === 'IMAGE') return item.payload?.caption ? String(item.payload.caption) : '[imagem]'
  return item.payload?.fileName ? String(item.payload.fileName) : '[documento]'
}

// ── Main page ──────────────────────────────────────────────────────────────

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export function ScheduledPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(1)

  const { data: result, isLoading } = useQuery({
    queryKey: ['scheduled-messages', page],
    queryFn: () => api.get<PaginatedResponse<ScheduledItem>>(`/whatsapp/scheduled?page=${page}&limit=20`),
  })

  const scheduled = result?.data ?? []

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/whatsapp/scheduled/${id}`),
    onSuccess: () => {
      toast.success('Agendamento cancelado')
      void queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] })
    },
  })

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agendamentos</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Agende mensagens para envio futuro
          </p>
        </div>
        <Button variant="gradient" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
          Agendar mensagem
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          <span>Carregando...</span>
        </div>
      ) : scheduled.length === 0 ? (
        <Card className="p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <Clock className="w-7 h-7 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="font-semibold text-foreground">Nenhum agendamento</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Agende mensagens para serem enviadas automaticamente no horário desejado.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            <div className="grid grid-cols-[1fr_100px_140px_100px_60px] gap-4 px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>Destinatário</span>
              <span>Tipo</span>
              <span>Agendado para</span>
              <span>Status</span>
              <span />
            </div>

            {scheduled.map((item) => {
              const config = STATUS_CONFIG[item.status]
              const StatusIcon = config.icon
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_100px_140px_100px_60px] gap-4 items-center px-4 py-3.5 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-foreground truncate">{item.phone}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {payloadPreview(item)}
                    </p>
                  </div>

                  <Badge variant="secondary" className="text-[10px] font-mono w-fit">
                    {item.type}
                  </Badge>

                  <div>
                    <p className="text-sm text-foreground">
                      {new Date(item.scheduledAt).toLocaleDateString('pt-BR')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  <Badge variant={config.variant} className="text-[10px] w-fit gap-1">
                    <StatusIcon className="w-3 h-3" aria-hidden="true" />
                    {config.label}
                  </Badge>

                  <div className="flex justify-end">
                    {item.status === 'PENDING' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => cancelMutation.mutate(item.id)}
                        loading={cancelMutation.isPending}
                        aria-label="Cancelar agendamento"
                      >
                        <X className="w-4 h-4" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {result && (
            <Pagination page={result.page} limit={result.limit} total={result.total} onPageChange={setPage} />
          )}
        </Card>
      )}

      <CreateScheduledModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
