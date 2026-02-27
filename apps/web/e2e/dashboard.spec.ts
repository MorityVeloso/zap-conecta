import { test, expect, mockDashboardStats, mockUsage } from './fixtures';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ mockApi }) => {
    await mockApi.onGet('/tenants/me', mockDashboardStats());
    await mockApi.onGet('/tenants/stats', {
      messagesSentThisMonth: 42,
      messagesReceivedThisMonth: 100,
      activeInstances: 1,
      totalInstances: 1,
      messagesLimit: 300,
      usagePercent: 14,
      recentMessages: [
        {
          id: 'msg-1',
          phone: '5511999998888',
          type: 'text',
          direction: 'INBOUND',
          content: { text: 'Hello from WhatsApp' },
          createdAt: new Date().toISOString(),
        },
      ],
    });
    await mockApi.onGet('/tenants/usage', mockUsage());
  });

  test('renders stat cards', async ({ authedPage }) => {
    await authedPage.goto('/dashboard');

    // Wait for data to load (stat value appears after API responds)
    await expect(authedPage.getByText('42').first()).toBeVisible({ timeout: 10_000 });

    await expect(authedPage.getByText('Mensagens enviadas', { exact: true })).toBeVisible();
    await expect(authedPage.getByText('Mensagens recebidas', { exact: true })).toBeVisible();
    await expect(authedPage.getByText('Instâncias ativas', { exact: true })).toBeVisible();
    await expect(authedPage.getByText('Uso do plano', { exact: true })).toBeVisible();
  });

  test('shows usage progress bar', async ({ authedPage }) => {
    await authedPage.goto('/dashboard');

    const progressbar = authedPage.getByRole('progressbar');
    await expect(progressbar).toBeVisible();
  });

  test('shows recent activity section', async ({ authedPage }) => {
    await authedPage.goto('/dashboard');

    await expect(authedPage.getByText('Atividade recente')).toBeVisible();
    await expect(authedPage.getByText(/Hello from WhatsApp/)).toBeVisible();
  });

  test('empty state when no messages', async ({ authedPage, mockApi }) => {
    // Override stats with no messages
    await mockApi.onGet('/tenants/stats', {
      messagesSentThisMonth: 0,
      messagesReceivedThisMonth: 0,
      activeInstances: 0,
      totalInstances: 0,
      messagesLimit: 300,
      usagePercent: 0,
      recentMessages: [],
    });

    await authedPage.goto('/dashboard');
    await expect(authedPage.getByText(/Nenhuma mensagem/i)).toBeVisible();
  });
});
