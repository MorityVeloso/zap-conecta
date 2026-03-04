import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, Download, Loader2, ArrowDownRight, ArrowUpRight, Image, FileText, Users, WifiOff, Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatRelativeTime, formatPhone } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────

interface ConversationSummary {
  phone: string
  lastMessage: string
  lastDirection: 'INBOUND' | 'OUTBOUND'
  lastAt: string
  lastStatus: string
}

interface Message {
  id: string
  phone: string
  type: string
  direction: 'INBOUND' | 'OUTBOUND'
  content: { text?: string; url?: string; caption?: string; fileName?: string }
  createdAt: string
  status?: string
}

// ── Export CSV ─────────────────────────────────────────────────────────────

function exportConversationsCSV(conversations: ConversationSummary[]) {
  const header = 'phone,direction,message,at'
  const rows = conversations.map(
    (c) =>
      `${c.phone},${c.lastDirection},"${c.lastMessage.replace(/"/g, '""')}",${c.lastAt}`,
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'conversas.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Conversation thread ────────────────────────────────────────────────────

type SendType = 'text' | 'image' | 'document'

function ConversationThread({ phone }: { phone: string }) {
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [sendType, setSendType] = useState<SendType>('text')
  const [text, setText] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [fileName, setFileName] = useState('')

  const { data: connectionStatus } = useQuery({
    queryKey: ['whatsapp', 'status'],
    queryFn: () => api.get<{ status: string }>('/whatsapp/status'),
    refetchInterval: 30_000,
  })

  // Only disable when we have a confirmed non-CONNECTED status (not while loading)
  const isDisconnected = connectionStatus !== undefined && connectionStatus.status !== 'CONNECTED'

  const { data, isLoading } = useQuery({
    queryKey: ['messages', 'thread', phone],
    queryFn: () =>
      api.get<{ data: Message[] }>(`/messages?phone=${encodeURIComponent(phone)}&limit=50`),
    refetchInterval: 10_000,
  })

  const messages = data?.data ?? []

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (sendType === 'text') {
        if (!text.trim()) return
        await api.post('/whatsapp/send/text', { phone, message: text.trim() })
      } else if (sendType === 'image') {
        if (!mediaUrl) return
        await api.post('/whatsapp/send/image', { phone, image: mediaUrl, caption: caption || undefined })
      } else {
        if (!mediaUrl || !fileName) return
        await api.post('/whatsapp/send/document', { phone, document: mediaUrl, fileName, caption: caption || undefined })
      }
    },
    onSuccess: () => {
      setText('')
      setMediaUrl('')
      setCaption('')
      setFileName('')
      queryClient.invalidateQueries({ queryKey: ['messages', 'thread', phone] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar mensagem'
      toast.error(msg)
    },
  })

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    sendMutation.mutate()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
          {formatPhone(phone).slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium">{formatPhone(phone)}</p>
          <p className="text-xs text-muted-foreground font-mono">{phone}</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-12">
            <MessageSquare className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOut = msg.direction === 'OUTBOUND'
            const text = msg.content?.text ?? msg.content?.caption ?? `[${msg.type}]`
            return (
              <div key={msg.id} className={cn('flex gap-2 max-w-[80%]', isOut ? 'ml-auto flex-row-reverse' : '')}>
                <div
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-white text-[10px] mt-1',
                    isOut ? 'bg-primary' : 'bg-emerald-500',
                  )}
                  aria-hidden="true"
                >
                  {isOut ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                </div>
                <div
                  className={cn(
                    'rounded-2xl px-3 py-2 text-sm',
                    isOut
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-muted text-foreground rounded-tl-sm',
                  )}
                >
                  <p>{text}</p>
                  <p className={cn('text-[10px] mt-0.5', isOut ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                    {formatRelativeTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Disconnected banner */}
      {isDisconnected && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>WhatsApp desconectado — <a href="/dashboard/instances" className="underline font-medium">reconecte na página de Instâncias</a></span>
        </div>
      )}

      {/* Send form */}
      <div className="border-t border-border bg-card p-3">
        {/* Type tabs */}
        <div className="flex gap-1 mb-2">
          {(['text', 'image', 'document'] as SendType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSendType(t)}
              className={cn(
                'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                sendType === t
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t === 'text' && <MessageSquare className="size-3" />}
              {t === 'image' && <Image className="size-3" />}
              {t === 'document' && <FileText className="size-3" />}
              {t === 'text' ? 'Texto' : t === 'image' ? 'Imagem' : 'Documento'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSend} className="space-y-2">
          {sendType === 'text' && (
            <div className="flex gap-2">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={isDisconnected ? 'WhatsApp desconectado' : 'Digite uma mensagem…'}
                disabled={isDisconnected}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMutation.mutate()
                  }
                }}
              />
              <Button type="submit" size="sm" disabled={!text.trim() || sendMutation.isPending || isDisconnected}>
                <Send className="size-4" />
              </Button>
            </div>
          )}
          {(sendType === 'image' || sendType === 'document') && (
            <>
              <div>
                <Label className="text-xs">URL da {sendType === 'image' ? 'imagem' : 'arquivo'}</Label>
                <Input
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder={sendType === 'image' ? 'https://…/imagem.jpg' : 'https://…/arquivo.pdf'}
                  className="mt-1"
                />
              </div>
              {sendType === 'document' && (
                <div>
                  <Label className="text-xs">Nome do arquivo</Label>
                  <Input
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    placeholder="documento.pdf"
                    className="mt-1"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs">Legenda (opcional)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Adicione uma legenda…"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={
                      !mediaUrl ||
                      (sendType === 'document' && !fileName) ||
                      sendMutation.isPending ||
                      isDisconnected
                    }
                  >
                    <Send className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

function InitialsAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
      {initials || '?'}
    </div>
  )
}

// ── Bulk send tracking ──────────────────────────────────────────────────────

interface BulkBatchStatus {
  id: string
  total: number
  sent: number
  failed: number
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
  progress: number
  createdAt: string
}

function BulkSendTracker({ batchId, onDone }: { batchId: string; onDone: () => void }) {
  const { data: batch } = useQuery({
    queryKey: ['bulk-batch', batchId],
    queryFn: () => api.get<BulkBatchStatus>(`/whatsapp/send/bulk/${batchId}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'PROCESSING' ? 2000 : false
    },
  })

  useEffect(() => {
    if (batch?.status === 'COMPLETED' || batch?.status === 'FAILED') {
      const timer = setTimeout(onDone, 5000) // auto-dismiss after 5s
      return () => clearTimeout(timer)
    }
  }, [batch?.status, onDone])

  if (!batch) return null

  const isDone = batch.status !== 'PROCESSING'

  return (
    <div className="px-4 py-2.5 border-b border-border bg-muted/30">
      <div className="flex items-center gap-2 mb-1.5">
        <Users className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium text-foreground">
          Envio em massa
        </span>
        <Badge
          variant={batch.status === 'COMPLETED' ? 'success' : batch.status === 'FAILED' ? 'destructive' : 'default'}
          className="text-[9px] ml-auto"
        >
          {batch.status === 'PROCESSING' ? `${batch.progress}%` : batch.status === 'COMPLETED' ? 'Concluído' : 'Falhou'}
        </Badge>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isDone && batch.failed === batch.total ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${batch.progress}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">
        {batch.sent} enviados · {batch.failed} falharam · {batch.total} total
      </p>
    </div>
  )
}

export function MessagesPage() {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [activeBatchIds, setActiveBatchIds] = useState<string[]>([])
  const [newConvPhone, setNewConvPhone] = useState('')
  const [showNewConv, setShowNewConv] = useState(false)

  const removeBatch = (id: string) => setActiveBatchIds((prev) => prev.filter((b) => b !== id))

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['messages', 'conversations'],
    queryFn: () => api.get<ConversationSummary[]>('/messages/conversations'),
    refetchInterval: 15_000,
  })

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left: conversation list */}
      <div className="w-[320px] shrink-0 flex flex-col border-r border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h1 className="text-base font-semibold">Mensagens</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportConversationsCSV(conversations)}
              disabled={conversations.length === 0}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              title="Exportar CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setShowNewConv(true)}
              className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
              title="Nova conversa"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova
            </button>
          </div>
        </div>

        {/* New conversation input */}
        {showNewConv && (
          <form
            className="flex gap-2 px-3 py-2 border-b border-border bg-muted/30"
            onSubmit={(e) => {
              e.preventDefault()
              const clean = newConvPhone.replace(/\D/g, '')
              if (clean.length >= 10) {
                setSelectedPhone(clean)
                setShowNewConv(false)
                setNewConvPhone('')
              } else {
                toast.error('Número inválido — use DDI+DDD+número (ex: 5511999998888)')
              }
            }}
          >
            <Input
              autoFocus
              value={newConvPhone}
              onChange={(e) => setNewConvPhone(e.target.value)}
              placeholder="5511999998888"
              className="h-7 text-xs"
            />
            <Button type="submit" size="sm" className="h-7 text-xs px-2">Abrir</Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => { setShowNewConv(false); setNewConvPhone('') }}>✕</Button>
          </form>
        )}

        {/* Active bulk sends */}
        {activeBatchIds.map((id) => (
          <BulkSendTracker key={id} batchId={id} onDone={() => removeBatch(id)} />
        ))}

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center text-center px-6 py-12 gap-2">
              <MessageSquare className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm font-medium">Nenhuma conversa ainda</p>
              <p className="text-xs text-muted-foreground">As conversas aparecem aqui após enviar ou receber mensagens</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.phone}
                type="button"
                onClick={() => setSelectedPhone(conv.phone)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left',
                  selectedPhone === conv.phone
                    ? 'bg-primary/10 border-r-2 border-primary'
                    : 'hover:bg-muted/30',
                )}
              >
                <InitialsAvatar name={formatPhone(conv.phone)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-foreground truncate">
                      {formatPhone(conv.phone)}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatRelativeTime(new Date(conv.lastAt))}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                </div>
                <Badge
                  variant={conv.lastDirection === 'INBOUND' ? 'success' : 'outline'}
                  className="shrink-0 text-[10px] h-4 px-1"
                >
                  {conv.lastDirection === 'INBOUND' ? '↓' : '↑'}
                </Badge>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: thread or empty state */}
      <div className="flex-1 overflow-hidden">
        {selectedPhone ? (
          <ConversationThread key={selectedPhone} phone={selectedPhone} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Card className="p-8 flex flex-col items-center gap-3">
              <MessageSquare className="w-10 h-10 text-muted-foreground/30" />
              <p className="font-medium text-foreground">Selecione uma conversa</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Escolha uma conversa na lista para visualizar as mensagens e enviar respostas
              </p>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
