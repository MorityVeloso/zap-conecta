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
import { DashboardPage } from '@/pages/dashboard'

// ─── Root ─────────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({
  component: () => <React.Suspense fallback={null}><Outlet /></React.Suspense>,
})

// ─── Auth guard helper ────────────────────────────────────────────────────

async function requireAuth() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    throw redirect({ to: '/auth/login' })
  }
}

async function redirectIfAuthed() {
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

// ─── Index redirect ───────────────────────────────────────────────────────

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => { throw redirect({ to: '/dashboard' }) },
})

// ─── Route tree ───────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  indexRoute,
  authLoginRoute,
  authSignupRoute,
  dashboardLayout.addChildren([
    dashboardIndexRoute,
    instancesRoute,
    instancesNewRoute,
    apiKeysRoute,
    messagesRoute,
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
