import { useState } from 'react'
import { Outlet } from '@tanstack/react-router'
import { Bell, MessageSquare, ArrowDownRight, ArrowUpRight, Sun, Moon, Menu } from 'lucide-react'
import { Sidebar } from './sidebar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useTenant } from '@/hooks/use-tenant'
import { useAuth } from '@/hooks/use-auth'
import { useTheme } from '@/contexts/theme-context'
import { useDashboardStats } from '@/hooks/use-dashboard-stats'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

const SEEN_KEY = 'zc_notifications_seen_at'

function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [seenAt, setSeenAt] = useState<number>(() => {
    return parseInt(localStorage.getItem(SEEN_KEY) ?? '0', 10)
  })

  const { data } = useDashboardStats()

  const messages = data?.recentMessages ?? []
  const unseenCount = messages.filter((m) => new Date(m.createdAt).getTime() > seenAt).length

  const handleOpen = (v: boolean) => {
    setOpen(v)
    if (v) {
      const now = Date.now()
      localStorage.setItem(SEEN_KEY, String(now))
      setSeenAt(now)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label="Notificações">
          <Bell className="size-4" aria-hidden="true" />
          {unseenCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {unseenCount > 9 ? '9+' : unseenCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Notificações</p>
          <p className="text-xs text-muted-foreground mt-0.5">Mensagens recentes</p>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2 text-center">
              <MessageSquare className="w-7 h-7 text-muted-foreground/30" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">Nenhuma mensagem recente</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOut = msg.direction === 'OUTBOUND'
              const preview = msg.content?.text ?? msg.content?.caption ?? `[${msg.type}]`
              const isNew = new Date(msg.createdAt).getTime() > seenAt
              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 transition-colors',
                    isNew ? 'bg-primary/5' : 'hover:bg-muted/30',
                  )}
                >
                  <div
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full text-white mt-0.5',
                      isOut ? 'bg-primary' : 'bg-emerald-500',
                    )}
                    aria-hidden="true"
                  >
                    {isOut ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-foreground truncate">{msg.phone}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{preview}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatRelativeTime(msg.createdAt)}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function DashboardLayout() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const { theme, toggleTheme } = useTheme()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        tenantName={tenant?.name}
        planName={tenant?.plan?.displayName}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          {/* Hamburger on mobile */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            >
              {theme === 'dark' ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
            </Button>
            <NotificationsBell />
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2.5">
              <div
                className="flex size-8 items-center justify-center rounded-full gradient-brand text-xs font-semibold text-white select-none"
                aria-hidden="true"
              >
                {user?.email?.slice(0, 1).toUpperCase() ?? '?'}
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-medium leading-none">{user?.email}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
