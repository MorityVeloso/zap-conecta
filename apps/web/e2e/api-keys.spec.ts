import { test, expect, mockApiKey, mockDashboardStats, mockUsage } from './fixtures';

test.describe('API Keys', () => {
  test.beforeEach(async ({ mockApi }) => {
    await mockApi.onGet('/tenants/me', mockDashboardStats());
    await mockApi.onGet('/tenants/usage', mockUsage());
  });

  test('shows empty state when no keys', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/api-keys', []);
    await authedPage.goto('/dashboard/api-keys');

    await expect(authedPage.getByText('Nenhuma chave criada')).toBeVisible();
    await expect(authedPage.getByRole('button', { name: /criar primeira chave/i })).toBeVisible();
  });

  test('lists existing API keys', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/api-keys', [
      mockApiKey(),
      mockApiKey({ id: 'key-2', name: 'Staging Key', prefix: 'zc_live_xyz9' }),
    ]);

    await authedPage.goto('/dashboard/api-keys');
    await expect(authedPage.getByText('Minha API Key')).toBeVisible();
    await expect(authedPage.getByText('Staging Key')).toBeVisible();
  });

  test('creates an API key and shows plainKey', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/api-keys', []);
    await mockApi.onPost('/api-keys', {
      ...mockApiKey(),
      plainKey: 'zc_live_abc123def456ghi789',
    });

    await authedPage.goto('/dashboard/api-keys');
    await authedPage.getByRole('button', { name: /nova chave|criar primeira chave/i }).click();

    // Fill form
    await authedPage.locator('#key-name').fill('Production Key');
    await authedPage.getByRole('button', { name: /criar chave/i }).click();

    // Should show success alert with key
    await expect(authedPage.getByText('Chave criada com sucesso!')).toBeVisible();
  });

  test('deletes an API key', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/api-keys', [mockApiKey()]);
    await mockApi.onDelete('/api-keys/key-1');

    await authedPage.goto('/dashboard/api-keys');
    // Wait for the key to appear, then click the trash icon button in the row
    await expect(authedPage.getByText('Minha API Key')).toBeVisible();
    const row = authedPage.getByText('Minha API Key').locator('..').locator('..');
    await row.locator('button').last().click();
  });
});
