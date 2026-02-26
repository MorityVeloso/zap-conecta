import React from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard,
  Smartphone,
  Key,
  MessageSquare,
  Webhook,
  CreditCard,
  Settings,
  Zap,
  ChevronRight,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: string | number
  badgeVariant?: 'default' | 'success' | 'warning' | 'destructive' | 'info'
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Instâncias', href: '/dashboard/instances', icon: Smartphone },
  { label: 'API Keys', href: '/dashboard/api-keys', icon: Key },
  { label: 'Mensagens', href: '/dashboard/messages', icon: MessageSquare },
  { label: 'Webhooks', href: '/dashboard/webhooks', icon: Webhook },
]

const bottomItems: NavItem[] = [
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { label: 'Configurações', href: '/dashboard/settings', icon: Settings },
]

interface SidebarProps {
  tenantName?: string
  planName?: string
}

export function Sidebar({ tenantName = 'Minha Empresa', planName = 'Free' }: SidebarProps) {
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  return (
    <aside
      className="flex h-screen w-[var(--sidebar-width)] flex-col border-r border-sidebar-border bg-[hsl(var(--sidebar-bg))] text-[hsl(var(--sidebar-fg))]"
      aria-label="Navegação principal"
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-[hsl(var(--sidebar-border))]">
        <div className="flex size-8 items-center justify-center rounded-lg gradient-brand shadow-lg shadow-primary/30">
          <Zap className="size-4 text-white" aria-hidden="true" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight">Zap-Conecta</span>
          <span className="text-[10px] text-[hsl(var(--sidebar-muted))] font-medium uppercase tracking-wider">
            API WhatsApp
          </span>
        </div>
      </div>

      {/* Tenant info */}
      <div className="mx-3 mt-3 rounded-lg bg-[hsl(var(--sidebar-accent))] px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{tenantName}</p>
            <p className="text-xs text-[hsl(var(--sidebar-muted))] mt-0.5">Plano {planName}</p>
          </div>
          <ChevronRight className="size-3.5 text-[hsl(var(--sidebar-muted))] shrink-0" aria-hidden="true" />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-3 overflow-y-auto" aria-label="Menu principal">
        <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--sidebar-muted))]">
          Geral
        </p>
        {navItems.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>

      {/* Bottom items */}
      <div className="border-t border-[hsl(var(--sidebar-border))] px-3 py-3 space-y-0.5">
        {bottomItems.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[hsl(var(--sidebar-muted))] transition-colors hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-fg))]"
          type="button"
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  )
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      to={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all',
        active
          ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-fg))] font-medium shadow-sm'
          : 'text-[hsl(var(--sidebar-muted))] hover:bg-[hsl(var(--sidebar-accent))]/60 hover:text-[hsl(var(--sidebar-fg))]',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{item.label}</span>
      {item.badge !== undefined && (
        <Badge variant={item.badgeVariant ?? 'default'} className="ml-auto h-5 px-1.5 text-[10px]">
          {item.badge}
        </Badge>
      )}
      {active && (
        <span
          className="absolute left-0 h-6 w-1 rounded-r-full bg-primary"
          aria-hidden="true"
        />
      )}
    </Link>
  )
}
