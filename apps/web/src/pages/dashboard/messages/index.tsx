import { MessageSquare, Send, Download, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatRelativeTime, formatPhone } from '@/lib/utils'

interface ConversationSummary {
  phone: string
  lastMessage: string
  lastDirection: 'INBOUND' | 'OUTBOUND'
  lastAt: string
  lastStatus: string
}

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
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['messages', 'conversations'],
    queryFn: () => api.get<ConversationSummary[]>('/messages/conversations'),
  })

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

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Carregando...</span>
        </div>
      ) : conversations.length === 0 ? (
        <Card className="p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <MessageSquare className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground">Nenhuma conversa ainda</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            As conversas aparecerão aqui quando mensagens forem enviadas ou recebidas
          </p>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            <div className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Conversas recentes · {conversations.length}
              </span>
              <button className="text-xs text-primary hover:underline flex items-center gap-1">
                <Download className="w-3 h-3" />
                Exportar
              </button>
            </div>

            {conversations.map((conv) => (
              <div
                key={conv.phone}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <InitialsAvatar name={formatPhone(conv.phone)} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground truncate">
                      {formatPhone(conv.phone)}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelativeTime(new Date(conv.lastAt))}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {conv.lastDirection === 'OUTBOUND' && (
                      <Send className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                    <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
                  </div>
                  <p className="text-xs text-muted-foreground/60 mt-0.5 font-mono text-[10px]">
                    {conv.phone}
                  </p>
                </div>

                <Badge
                  variant={conv.lastDirection === 'INBOUND' ? 'secondary' : 'outline'}
                  className="shrink-0 text-[10px]"
                >
                  {conv.lastDirection === 'INBOUND' ? 'recebida' : 'enviada'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
