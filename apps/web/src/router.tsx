import React from 'react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'

// Layouts
import { DashboardLayout } from '@/components/layout/dashboard-layout'

// Pages
import { LoginPage } from '@/pages/auth/login'
import { SignupPage } from '@/pages/auth/signup'
import { ResetPasswordPage } from '@/pages/auth/reset-password'
import { DashboardPage } from '@/pages/dashboard'

// ─── Root ─────────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({
  component: () => <React.Suspense fallback={null}><Outlet /></React.Suspense>,
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center p-6">
      <p className="text-6xl font-bold text-muted-foreground/30">404</p>
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-muted-foreground text-sm max-w-xs">
        A rota que você acessou não existe ou foi movida.
      </p>
      <a href="/dashboard" className="text-primary text-sm font-medium hover:underline">
        Voltar ao Dashboard
      </a>
    </div>
  ),
})

// ─── Auth guard helper ────────────────────────────────────────────────────

async function requireAuth() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    throw redirect({ to: '/auth/login' })
  }
}

async function redirectIfAuthed() {
  // Don't redirect if this is a password recovery callback
  const hash = window.location.hash
  if (hash.includes('type=recovery')) {
    throw redirect({ to: '/auth/reset-password', hash })
  }
  const { data } = await supabase.auth.getSession()
  if (data.session) {
    throw redirect({ to: '/dashboard' })
  }
}

// ─── Auth routes ──────────────────────────────────────────────────────────

const authLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/login',
  beforeLoad: redirectIfAuthed,
  component: LoginPage,
})

const authSignupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/signup',
  beforeLoad: redirectIfAuthed,
  component: SignupPage,
})

const authResetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/reset-password',
  component: ResetPasswordPage,
})

// ─── Dashboard routes ─────────────────────────────────────────────────────

const dashboardLayout = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  beforeLoad: requireAuth,
  component: DashboardLayout,
})

const dashboardIndexRoute = createRoute({
  getParentRoute: () => dashboardLayout,
  path: '/',
  component: DashboardPage,
})

// Lazy loaded routes (carregadas sob demanda)
const instancesRoute = createRoute({
  getParentRoute: () => dashboardLayout,
  path: '/instances',
  component: React.lazy(() =>
    import('@/pages/dashboard/instances').then((m) => ({ default: m.InstancesPage })),
  ),
})

const instancesNewRoute = createRoute({
  getParentRoute: () => dashboardLayout,
  path: '/instances/new',
  component: React.lazy(() =>
    import('@/pages/dashboard/instances/new').then((m) => ({ default: m.NewInstancePage })),
  ),
})

const apiKeysRoute = createRoute({
  getParentRoute: () => dashboardLayout,
  path: '/api-keys',
  component: React.lazy(() =>
    import('@/pages/dashboard/api-keys').then((m) => ({ default: m.ApiKeysPage })),
  ),
})

const messagesRoute = createRoute({
  getParentRoute: () => dashboardLayout,
  path: '/messages',
  component: React.lazy(() =>
    import('@/pages/dashboard/messages').then((m) => ({ default: m.MessagesPage })),
  ),
})

const billingRoute = createRoute({
  getParentRoute: () => dashboardLayout,
  path: '/billing',
  component: React.lazy(() =>
    import('@/pages/dashboard/billing').then((m) => ({ default: m.BillingPage })),
  ),
})

const settingsRoute = createRoute({
  getParentRoute: () => dashboardLayout,
  path: '/settings',
  component: React.lazy(() =>
    import('@/pages/dashboard/settings').then((m) => ({ default: m.SettingsPage })),
  ),
})

const webhooksRoute = createRoute({
  getParentRoute: () => dashboardLayout,
  path: '/webhooks',
  component: React.lazy(() =>
    import('@/pages/dashboard/webhooks').then((m) => ({ default: m.WebhooksPage })),
  ),
})

const groupsRoute = createRoute({
  getParentRoute: () => dashboardLayout,
  path: '/groups',
  component: React.lazy(() =>
    import('@/pages/dashboard/groups').then((m) => ({ default: m.GroupsPage })),
  ),
})

const scheduledRoute = createRoute({
  getParentRoute: () => dashboardLayout,
  path: '/scheduled',
  component: React.lazy(() =>
    import('@/pages/dashboard/scheduled').then((m) => ({ default: m.ScheduledPage })),
  ),
})

// ─── Redirects ───────────────────────────────────────────────────────────

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => { throw redirect({ to: '/dashboard' }) },
})

const loginShortcut = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: () => { throw redirect({ to: '/auth/login' }) },
})

const signupShortcut = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signup',
  beforeLoad: () => { throw redirect({ to: '/auth/signup' }) },
})

// ─── Route tree ───────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginShortcut,
  signupShortcut,
  authLoginRoute,
  authSignupRoute,
  authResetPasswordRoute,
  dashboardLayout.addChildren([
    dashboardIndexRoute,
    instancesRoute,
    instancesNewRoute,
    apiKeysRoute,
    messagesRoute,
    webhooksRoute,
    groupsRoute,
    scheduledRoute,
    billingRoute,
    settingsRoute,
  ]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
