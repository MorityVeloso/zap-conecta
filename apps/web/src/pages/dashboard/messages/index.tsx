import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Download, Loader2, ArrowDownRight, ArrowUpRight, Eye, Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatRelativeTime, formatPhone } from '@/lib/utils'
import { validatePhone } from '@/lib/phone-validation'

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

function ConversationThread({ phone }: { phone: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)

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
            const msgText = msg.content?.text ?? msg.content?.caption ?? `[${msg.type}]`
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
                  <p>{msgText}</p>
                  <div className={cn('text-[10px] mt-0.5', isOut ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                    <span>{formatRelativeTime(msg.createdAt)}</span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Read-only info banner */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-t border-border text-muted-foreground text-xs">
        <Eye className="w-3.5 h-3.5 shrink-0" />
        <span>Visualização somente leitura — envie mensagens via <a href="/dashboard/api-keys" className="underline font-medium text-primary">API</a></span>
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

export function MessagesPage() {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [newConvPhone, setNewConvPhone] = useState('')
  const [showNewConv, setShowNewConv] = useState(false)

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
              const result = validatePhone(newConvPhone)
              if (result.valid) {
                setSelectedPhone(result.phone)
                setShowNewConv(false)
                setNewConvPhone('')
              } else {
                toast.error(result.error)
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

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center text-center px-6 py-12 gap-2">
              <MessageSquare className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm font-medium">Nenhuma conversa ainda</p>
              <p className="text-xs text-muted-foreground">As conversas aparecem aqui conforme mensagens são enviadas e recebidas via API</p>
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
                Escolha uma conversa na lista para visualizar as mensagens trocadas via API
              </p>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
