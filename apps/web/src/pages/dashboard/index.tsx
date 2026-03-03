import React from 'react'
import {
  MessageSquare,
  Smartphone,
  TrendingUp,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { useTenant } from '@/hooks/use-tenant'
import { useDashboardStats } from '@/hooks/use-dashboard-stats'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatRelativeTime } from '@/lib/utils'
import { Link } from '@tanstack/react-router'

export function DashboardPage() {
  const { tenant } = useTenant()

  const { data: stats, isLoading } = useDashboardStats()

  const usagePercent = stats?.usagePercent ?? 0
  const usageColor =
    usagePercent >= 90
      ? 'bg-destructive'
      : usagePercent >= 70
        ? 'bg-amber-500'
        : 'bg-primary'

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Bem-vindo de volta,{' '}
            <span className="font-medium text-foreground">{tenant?.name}</span>
          </p>
        </div>
        <Link to="/dashboard/instances/new">
          <Button variant="gradient" size="sm">
            <Zap className="size-4" aria-hidden="true" />
            Conectar número
          </Button>
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Mensagens enviadas"
          value={stats?.messagesSentThisMonth ?? 0}
          description="Este mês"
          icon={<TrendingUp className="size-4" aria-hidden="true" />}
          trend={stats?.sentTrend ?? undefined}
          loading={isLoading}
        />
        <StatCard
          title="Mensagens recebidas"
          value={stats?.messagesReceivedThisMonth ?? 0}
          description="Este mês"
          icon={<MessageSquare className="size-4" aria-hidden="true" />}
          trend={stats?.receivedTrend ?? undefined}
          loading={isLoading}
        />
        <StatCard
          title="Instâncias ativas"
          value={stats?.activeInstances ?? 0}
          description={`de ${stats?.totalInstances ?? 0} conectadas`}
          icon={<Smartphone className="size-4" aria-hidden="true" />}
          loading={isLoading}
        />
        <StatCard
          title="Uso do plano"
          value={`${usagePercent}%`}
          description={`${stats?.messagesSentThisMonth ?? 0} / ${stats?.messagesLimit ?? 300} msgs`}
          icon={<Zap className="size-4" aria-hidden="true" />}
          loading={isLoading}
          custom={
            <div className="mt-2">
              <div className="h-1.5 w-full rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full transition-all ${usageColor}`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                  role="progressbar"
                  aria-valuenow={usagePercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${usagePercent}% do limite de mensagens utilizado`}
                />
              </div>
            </div>
          }
        />
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Atividade recente</CardTitle>
            <CardDescription>Últimas mensagens recebidas e enviadas</CardDescription>
          </div>
          <Link to="/dashboard/messages">
            <Button variant="ghost" size="sm" className="text-primary">
              Ver tudo
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="size-8 rounded-full bg-muted" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-24 rounded bg-muted" />
                    <div className="h-2 w-40 rounded bg-muted" />
                  </div>
                  <div className="h-2 w-12 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : stats?.recentMessages?.length ? (
            <div className="space-y-1">
              {stats.recentMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
                >
                  <div
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-semibold ${
                      msg.direction === 'INBOUND' ? 'bg-emerald-500' : 'bg-primary'
                    }`}
                    aria-hidden="true"
                  >
                    {msg.direction === 'INBOUND' ? (
                      <ArrowDownRight className="size-4" />
                    ) : (
                      <ArrowUpRight className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{msg.phone}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {msg.content?.text ?? `[${msg.type}]`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge variant={msg.direction === 'INBOUND' ? 'success' : 'default'} className="mb-1">
                      {msg.direction === 'INBOUND' ? 'Recebida' : 'Enviada'}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <MessageSquare className="size-10 text-muted-foreground/30 mb-3" aria-hidden="true" />
              <p className="text-sm font-medium">Nenhuma mensagem ainda</p>
              <p className="text-xs text-muted-foreground mt-1">
                Conecte um número WhatsApp para começar
              </p>
              <Link to="/dashboard/instances/new">
                <Button variant="outline" size="sm" className="mt-4">
                  Conectar número
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string | number
  description: string
  icon: React.ReactNode
  trend?: number
  loading?: boolean
  custom?: React.ReactNode
}

function StatCard({ title, value, description, icon, trend, loading, custom }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription className="text-xs font-medium">{title}</CardDescription>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-1 animate-pulse">
            <div className="h-7 w-20 rounded bg-muted" />
            <div className="h-3 w-28 rounded bg-muted" />
          </div>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold tracking-tight">{value}</span>
              {trend !== undefined && (
                <span
                  className={`flex items-center text-xs font-medium mb-0.5 ${
                    trend >= 0 ? 'text-emerald-600' : 'text-destructive'
                  }`}
                >
                  {trend >= 0 ? (
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ArrowDownRight className="size-3.5" aria-hidden="true" />
                  )}
                  {Math.abs(trend)}%
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            {custom}
          </>
        )}
      </CardContent>
    </Card>
  )
}
