import { test, expect, mockWebhook, mockDashboardStats, mockUsage } from './fixtures';

test.describe('Webhooks', () => {
  test.beforeEach(async ({ mockApi }) => {
    await mockApi.onGet('/tenants/me', mockDashboardStats());
    await mockApi.onGet('/tenants/usage', mockUsage());
  });

  test('shows empty state when no webhooks', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/webhooks', []);
    await authedPage.goto('/dashboard/webhooks');

    await expect(authedPage.getByText('Nenhum webhook configurado')).toBeVisible();
    await expect(authedPage.getByRole('button', { name: /criar primeiro webhook/i })).toBeVisible();
  });

  test('lists existing webhooks', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/webhooks', [
      mockWebhook(),
      mockWebhook({ id: 'wh-2', url: 'https://other.com/hook', events: ['message.sent'] }),
    ]);

    await authedPage.goto('/dashboard/webhooks');
    await expect(authedPage.getByText('https://example.com/hook')).toBeVisible();
    await expect(authedPage.getByText('https://other.com/hook')).toBeVisible();
  });

  test('creates a webhook and shows HMAC secret', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/webhooks', []);
    await mockApi.onPost('/webhooks', {
      ...mockWebhook(),
      secret: 'a'.repeat(64),
    });

    await authedPage.goto('/dashboard/webhooks');
    // Empty state shows "Criar primeiro webhook" — use it
    await authedPage.getByRole('button', { name: /criar primeiro webhook/i }).click();

    // Fill form
    await authedPage.locator('#webhook-url').fill('https://example.com/hook');
    // Check the first event checkbox directly
    await authedPage.locator('input[type="checkbox"]').first().check();
    await authedPage.getByRole('button', { name: /criar webhook/i }).click();

    // Should show success alert with secret
    await expect(authedPage.getByText(/webhook criado/i)).toBeVisible();
    await expect(authedPage.getByLabel(/HMAC signing secret/i)).toBeVisible();
  });

  test('toggle webhook switch', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/webhooks', [mockWebhook({ isActive: true })]);
    await mockApi.onPatch('/webhooks/wh-1', mockWebhook({ isActive: false }));

    await authedPage.goto('/dashboard/webhooks');

    const toggle = authedPage.getByRole('switch');
    await expect(toggle).toBeVisible();
    await toggle.click();
  });

  test('deletes a webhook', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/webhooks', [mockWebhook()]);
    await mockApi.onDelete('/webhooks/wh-1');

    await authedPage.goto('/dashboard/webhooks');
    await authedPage.getByLabel(/remover webhook/i).click();
  });
});
