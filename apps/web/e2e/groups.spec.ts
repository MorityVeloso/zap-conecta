import { test, expect, mockDashboardStats, mockUsage } from './fixtures';

function mockGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group-1',
    subject: 'Marketing Team',
    size: 15,
    creation: Math.floor(Date.now() / 1000),
    owner: '5511999998888@s.whatsapp.net',
    desc: 'Grupo de marketing da empresa',
    ...overrides,
  };
}

test.describe('Groups', () => {
  test.beforeEach(async ({ mockApi }) => {
    await mockApi.onGet('/tenants/me', mockDashboardStats());
    await mockApi.onGet('/tenants/usage', mockUsage());
  });

  test('shows empty state when no groups', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/whatsapp/groups', []);
    await authedPage.goto('/dashboard/groups');

    await expect(authedPage.getByText('Nenhum grupo encontrado')).toBeVisible();
  });

  test('lists groups with member count', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/whatsapp/groups', [
      mockGroup(),
      mockGroup({ id: 'group-2', subject: 'Dev Team', size: 8 }),
    ]);

    await authedPage.goto('/dashboard/groups');
    await expect(authedPage.getByText('Marketing Team')).toBeVisible();
    await expect(authedPage.getByText('Dev Team')).toBeVisible();
    await expect(authedPage.getByText(/15 membros/)).toBeVisible();
  });

  test('creates a new group', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/whatsapp/groups', []);
    await mockApi.onPost('/whatsapp/groups', mockGroup({ subject: 'New Group' }));

    await authedPage.goto('/dashboard/groups');
    await authedPage.getByRole('button', { name: /novo grupo/i }).click();

    // Fill form
    await authedPage.locator('#group-subject').fill('New Group');
    await authedPage.locator('#group-participants').fill('5511999998888, 5511888887777');
    await authedPage.getByRole('button', { name: /criar grupo/i }).click();
  });
});
