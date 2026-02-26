import { Outlet } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { Sidebar } from './sidebar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useTenant } from '@/hooks/use-tenant'
import { useAuth } from '@/hooks/use-auth'

export function DashboardLayout() {
  const { user } = useAuth()
  const { tenant } = useTenant()

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar
        tenantName={tenant?.name}
        planName={tenant?.plan?.displayName}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div />
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" className="relative" aria-label="Notificações">
              <Bell className="size-4" aria-hidden="true" />
            </Button>
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

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
