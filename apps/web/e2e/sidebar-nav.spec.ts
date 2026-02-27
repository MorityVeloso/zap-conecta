import { test, expect, mockDashboardStats, mockUsage } from './fixtures';

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ mockApi }) => {
    await mockApi.onGet('/tenants/me', mockDashboardStats());
    await mockApi.onGet('/tenants/usage', mockUsage());
    await mockApi.onGet('/tenants/stats', {
      messagesSentThisMonth: 0,
      messagesReceivedThisMonth: 0,
      activeInstances: 0,
      totalInstances: 0,
      messagesLimit: 300,
      usagePercent: 0,
      recentMessages: [],
    });
    // Mocks for lazy-loaded pages
    await mockApi.onGet('/webhooks', []);
    await mockApi.onGet('/api-keys', []);
    await mockApi.onGet('/whatsapp/scheduled', []);
    await mockApi.onGet('/whatsapp/groups', []);
  });

  test('sidebar shows all navigation links', async ({ authedPage }) => {
    await authedPage.goto('/dashboard');

    const nav = authedPage.getByLabel('Menu principal');
    await expect(nav.getByText('Dashboard')).toBeVisible();
    await expect(nav.getByText('Instâncias')).toBeVisible();
    await expect(nav.getByText('API Keys')).toBeVisible();
    await expect(nav.getByText('Mensagens')).toBeVisible();
    await expect(nav.getByText('Webhooks')).toBeVisible();
    await expect(nav.getByText('Grupos')).toBeVisible();
    await expect(nav.getByText('Agendamentos')).toBeVisible();
  });

  test('active link has aria-current="page"', async ({ authedPage }) => {
    await authedPage.goto('/dashboard');
    const dashLink = authedPage.getByRole('link', { name: /^Dashboard$/ });
    await expect(dashLink).toHaveAttribute('aria-current', 'page');
  });

  test('navigates to webhooks page', async ({ authedPage }) => {
    await authedPage.goto('/dashboard');
    await authedPage.getByRole('link', { name: /webhooks/i }).click();
    await authedPage.waitForURL('**/dashboard/webhooks');
    await expect(authedPage.getByRole('heading', { name: /webhooks/i })).toBeVisible();
  });

  test('navigates to API Keys page', async ({ authedPage }) => {
    await authedPage.goto('/dashboard');
    await authedPage.getByRole('link', { name: /api keys/i }).click();
    await authedPage.waitForURL('**/dashboard/api-keys');
    await expect(authedPage.getByRole('heading', { name: /api keys/i })).toBeVisible();
  });

  test('navigates to scheduled page', async ({ authedPage }) => {
    await authedPage.goto('/dashboard');
    await authedPage.getByRole('link', { name: /agendamentos/i }).click();
    await authedPage.waitForURL('**/dashboard/scheduled');
    await expect(authedPage.getByRole('heading', { name: /agendamentos/i })).toBeVisible();
  });
});
