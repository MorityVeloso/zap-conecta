import { test, expect, mockScheduledItem, mockDashboardStats, mockUsage } from './fixtures';

test.describe('Scheduled Messages', () => {
  test.beforeEach(async ({ mockApi }) => {
    await mockApi.onGet('/tenants/me', mockDashboardStats());
    await mockApi.onGet('/tenants/usage', mockUsage());
  });

  test('shows empty state when no schedules', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/whatsapp/scheduled', []);
    await authedPage.goto('/dashboard/scheduled');

    await expect(authedPage.getByText('Nenhum agendamento')).toBeVisible();
  });

  test('lists scheduled messages with status badges', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/whatsapp/scheduled', [
      mockScheduledItem(),
      mockScheduledItem({ id: 'sched-2', status: 'SENT', phone: '5511888887777' }),
    ]);

    await authedPage.goto('/dashboard/scheduled');
    await expect(authedPage.getByText('5511999998888')).toBeVisible();
    await expect(authedPage.getByText('Pendente')).toBeVisible();
    await expect(authedPage.getByText('Enviado')).toBeVisible();
  });

  test('creates a scheduled message', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/whatsapp/scheduled', []);
    await mockApi.onPost('/whatsapp/scheduled', mockScheduledItem());

    await authedPage.goto('/dashboard/scheduled');
    await authedPage.getByRole('button', { name: /agendar mensagem/i }).click();

    // Fill form
    await authedPage.locator('#sched-phone').fill('5511999998888');
    await authedPage.locator('#sched-text').fill('Hello scheduled!');

    // Set future date (1 hour from now)
    const future = new Date(Date.now() + 3600000);
    const dateStr = future.toISOString().slice(0, 16);
    await authedPage.locator('#sched-date').fill(dateStr);

    await authedPage.getByRole('button', { name: /^agendar$/i }).click();
  });

  test('cancels a pending scheduled message', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/whatsapp/scheduled', [mockScheduledItem()]);
    await mockApi.onDelete('/whatsapp/scheduled/sched-1', 200);

    await authedPage.goto('/dashboard/scheduled');
    await authedPage.getByLabel(/cancelar agendamento/i).click();
  });
});
