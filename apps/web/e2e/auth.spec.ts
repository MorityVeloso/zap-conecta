import { test, expect } from './fixtures';

test.describe('Auth', () => {
  test('unauthenticated user is redirected to /auth/login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/auth/login');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('login page shows email and password fields', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('login page has link to signup', async ({ page }) => {
    await page.goto('/auth/login');
    const signupLink = page.getByRole('link', { name: /criar conta|cadastr/i });
    await expect(signupLink).toBeVisible();
  });

  test('authenticated user sees dashboard', async ({ authedPage, mockApi }) => {
    await mockApi.onGet('/tenants/me', {
      id: 'tenant-1',
      slug: 'acme',
      name: 'Acme Corp',
      status: 'ACTIVE',
      plan: { name: 'free', displayName: 'Free', messagesPerMonth: 300, instancesLimit: 1, apiKeysLimit: 2, features: [] },
      subscription: null,
      stats: { instances: 0, activeApiKeys: 0 },
    });
    await mockApi.onGet('/tenants/stats', {
      messagesSentThisMonth: 10,
      messagesReceivedThisMonth: 20,
      activeInstances: 1,
      totalInstances: 1,
      messagesLimit: 300,
      usagePercent: 3,
      recentMessages: [],
    });

    await authedPage.goto('/dashboard');
    await expect(authedPage.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });
});
