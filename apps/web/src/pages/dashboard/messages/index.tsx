import { MessageSquare, Send, Download } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatRelativeTime, formatPhone } from '@/lib/utils'

// Placeholder data — will be replaced with real API in Phase 5
const mockConversations = [
  {
    phone: '5511999990001',
    name: 'João Silva',
    lastMessage: 'Obrigado pelo atendimento!',
    lastAt: new Date(Date.now() - 1000 * 60 * 5),
    unread: 2,
    direction: 'inbound' as const,
  },
  {
    phone: '5511999990002',
    name: 'Maria Santos',
    lastMessage: 'Seu pedido foi confirmado. ✅',
    lastAt: new Date(Date.now() - 1000 * 60 * 32),
    unread: 0,
    direction: 'outbound' as const,
  },
  {
    phone: '5511999990003',
    name: '5511999990003',
    lastMessage: 'Quando chega meu produto?',
    lastAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    unread: 1,
    direction: 'inbound' as const,
  },
]

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
  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mensagens</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Histórico de conversas por número
          </p>
        </div>
      </div>

      {/* Coming soon banner */}
      <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <MessageSquare className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            Persistência de mensagens em desenvolvimento (Fase 5)
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            As mensagens abaixo são uma prévia do layout. Em breve serão dados reais.
          </p>
        </div>
      </div>

      <Card>
        <div className="divide-y divide-border">
          {/* Header */}
          <div className="px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Conversas recentes
            </span>
            <button className="text-xs text-primary hover:underline flex items-center gap-1">
              <Download className="w-3 h-3" />
              Exportar
            </button>
          </div>

          {mockConversations.map((conv) => (
            <div
              key={conv.phone}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <InitialsAvatar name={conv.name} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground truncate">{conv.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatRelativeTime(conv.lastAt)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {conv.direction === 'outbound' && (
                    <Send className="w-3 h-3 text-muted-foreground shrink-0" />
                  )}
                  <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
                </div>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {formatPhone(conv.phone)}
                </p>
              </div>

              {conv.unread > 0 && (
                <Badge variant="default" className="shrink-0 rounded-full min-w-[20px] h-5 text-xs px-1.5">
                  {conv.unread}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
