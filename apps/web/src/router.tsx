import React from 'react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'

// Pages (eager — auth entry points)
import { LoginPage } from '@/pages/auth/login'
import { SignupPage } from '@/pages/auth/signup'
import { ResetPasswordPage } from '@/pages/auth/reset-password'

// Lazy loaded layout + dashboard
const DashboardLayout = React.lazy(() =>
  import('@/components/layout/dashboard-layout').then((m) => ({ default: m.DashboardLayout })),
)
const DashboardPage = React.lazy(() =>
  import('@/pages/dashboard').then((m) => ({ default: m.DashboardPage })),
)

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
  // Don't redirect if this is a password recovery callback —
  // let Supabase JS process the hash first, then redirect cleanly
  const hash = window.location.hash
  if (hash.includes('type=recovery')) {
    // Wait for Supabase to process the hash and create session
    await new Promise((r) => setTimeout(r, 1000))
    throw redirect({ to: '/auth/reset-password' })
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

// ─── Redirects ───────────────────────────────────────────────────────────

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async () => {
    // If URL has Supabase auth hash (email confirmation, magic link), wait for
    // the client to process it before redirecting
    const hash = window.location.hash
    if (hash.includes('access_token') || hash.includes('type=signup') || hash.includes('type=email')) {
      await new Promise((r) => setTimeout(r, 1000))
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        throw redirect({ to: '/dashboard' })
      }
      throw redirect({ to: '/auth/login' })
    }
    throw redirect({ to: '/dashboard' })
  },
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
    webhooksRoute,
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
