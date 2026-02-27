/**
 * Playwright fixtures for Zap-Conecta E2E tests.
 *
 * - `authedPage`: a Page with Supabase auth injected into localStorage
 * - `mockApi`:    route interceptor to mock API calls via the /api proxy
 * - Mock data factories for common entities
 */
import { test as base, type Page, type Route } from '@playwright/test';

// ── Supabase auth mock ──────────────────────────────────────────────────

/**
 * Builds a fake Supabase localStorage entry.
 * The app checks `supabase.auth.getSession()` which reads from localStorage.
 * Key format: `sb-<ref>-auth-token` where ref comes from VITE_SUPABASE_URL.
 *
 * Since we don't know the exact ref at test time, we inject a well-known key
 * and also mock the Supabase auth endpoint to return this session.
 */
function fakeSupabaseSession() {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'fake-jwt-for-e2e-testing',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'fake-refresh-token',
    user: {
      id: 'user-e2e-001',
      email: 'test@example.com',
      role: 'authenticated',
      aud: 'authenticated',
      app_metadata: { provider: 'email' },
      user_metadata: { full_name: 'Test User' },
      created_at: new Date().toISOString(),
    },
  };
}

async function injectAuth(page: Page) {
  const session = fakeSupabaseSession();

  // Intercept Supabase auth/session endpoint to return our fake session
  await page.route('**/auth/v1/token?grant_type=refresh_token', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    });
  });

  // Intercept Supabase auth/user endpoint
  await page.route('**/auth/v1/user', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session.user),
    });
  });

  // Inject the session into all possible localStorage key patterns
  // Supabase uses `sb-{ref}-auth-token`
  await page.addInitScript((sessionData) => {
    const storageValue = JSON.stringify(sessionData);
    // Set for any key matching the Supabase pattern
    const originalSetItem = Storage.prototype.setItem;
    const originalGetItem = Storage.prototype.getItem;

    // Override getItem to return our session for any sb-*-auth-token key
    Storage.prototype.getItem = function (key: string) {
      if (key.match(/^sb-.*-auth-token$/)) {
        return storageValue;
      }
      return originalGetItem.call(this, key);
    };

    // Also set it directly for common patterns
    try {
      // Find any existing sb key or set a generic one
      originalSetItem.call(localStorage, 'sb-localhost-auth-token', storageValue);
    } catch {
      // localStorage might not be available in addInitScript context
    }
  }, session);
}

// ── Mock API helper ─────────────────────────────────────────────────────

type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface MockApiHelper {
  on(method: ApiMethod, path: string, response: unknown, status?: number): Promise<void>;
  onGet(path: string, response: unknown): Promise<void>;
  onPost(path: string, response: unknown, status?: number): Promise<void>;
  onPatch(path: string, response: unknown): Promise<void>;
  onDelete(path: string, status?: number): Promise<void>;
}

function createMockApi(page: Page): MockApiHelper {
  return {
    async on(method, path, response, status = 200) {
      // Match both: direct API URL (http://localhost:3001/path) and proxy (/api/path)
      const patterns = [
        `**/localhost:3001${path}`,
        `**/api${path}`,
      ];
      for (const pattern of patterns) {
        await page.route(pattern, async (route: Route) => {
          if (route.request().method() === method) {
            await route.fulfill({
              status,
              contentType: 'application/json',
              body: typeof response === 'string' ? response : JSON.stringify(response),
            });
          } else {
            await route.fallback();
          }
        });
      }
    },
    async onGet(path, response) {
      await this.on('GET', path, response);
    },
    async onPost(path, response, status = 201) {
      await this.on('POST', path, response, status);
    },
    async onPatch(path, response) {
      await this.on('PATCH', path, response);
    },
    async onDelete(path, status = 204) {
      await this.on('DELETE', path, '', status);
    },
  };
}

// ── Mock data factories ─────────────────────────────────────────────────

export function mockWebhook(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wh-1',
    url: 'https://example.com/hook',
    events: ['message.received'],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function mockApiKey(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key-1',
    name: 'Minha API Key',
    prefix: 'zc_live_abc1',
    lastUsedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function mockScheduledItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched-1',
    phone: '5511999998888',
    type: 'TEXT',
    payload: { text: 'Hello' },
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function mockDashboardStats() {
  return {
    id: 'tenant-1',
    slug: 'acme',
    name: 'Acme Corp',
    status: 'ACTIVE',
    plan: {
      id: 'plan-free',
      name: 'free',
      displayName: 'Free',
      priceBrlCents: 0,
      messagesPerMonth: 300,
      instancesLimit: 1,
      apiKeysLimit: 2,
      features: [],
    },
    subscription: null,
    stats: { instances: 1, activeApiKeys: 1 },
  };
}

export function mockUsage() {
  return {
    period: new Date().toISOString().slice(0, 7),
    messagesSent: 42,
    messagesReceived: 100,
    limit: 300,
    planName: 'Free',
  };
}

// ── Extended test fixture ───────────────────────────────────────────────

type Fixtures = {
  authedPage: Page;
  mockApi: MockApiHelper;
};

export const test = base.extend<Fixtures>({
  authedPage: async ({ page }, use) => {
    await injectAuth(page);
    await use(page);
  },
  mockApi: async ({ page }, use) => {
    await use(createMockApi(page));
  },
});

export { expect } from '@playwright/test';
