const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://mythos-energy-frontend.vercel.app';
const NAV_TIMEOUT = 30000;

const pages = [
  { name: 'About',   path: '/about' },
  { name: 'Shop',    path: '/shop' },
  { name: 'Contact', path: '/contact' },
];

// The site is heavy (animations, smooth scroll), so give tests more time
test.setTimeout(90000);
test.describe.configure({ retries: 2 });

// Click a visible nav link by href and wait for the URL to change
async function clickNavLink(page, path) {
  const link = page.locator(`a[href="${path}"]:visible`).first();
  await expect(link).toBeVisible();
  await Promise.all([
    page.waitForURL(`**${path}`, { timeout: NAV_TIMEOUT, waitUntil: 'commit' }),
    link.click(),
  ]);
}

test.describe('Desktop navigation', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  for (const { name, path } of pages) {
    test(`header link "${name}" navigates to ${path}`, async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await clickNavLink(page, path);
      await expect(page).toHaveURL(`${BASE_URL}${path}`, { timeout: NAV_TIMEOUT });
    });
  }
});

test.describe('Direct URL access', () => {
  for (const { name, path } of pages) {
    test(`${name} page loads (${path})`, async ({ page }) => {
      const response = await page.goto(`${BASE_URL}${path}`);
      expect(response.status()).toBeLessThan(400);
      await expect(page).toHaveURL(`${BASE_URL}${path}`, { timeout: NAV_TIMEOUT });
      await expect(page.locator('body')).toBeVisible();
    });
  }
});

test.describe('Mobile drawer navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const { name, path } of pages) {
    test(`drawer link "${name}" navigates to ${path}`, async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

      // Open the mobile menu (adjust this selector to your hamburger button)
      await page
        .getByRole('button', { name: /menu|open|navigation/i })
        .first()
        .click();

      const drawerLink = page.locator(`a.site-header__drawer-link[href="${path}"]`);
      await expect(drawerLink).toBeVisible();

      await Promise.all([
        page.waitForURL(`**${path}`, { timeout: NAV_TIMEOUT, waitUntil: 'commit' }),
        drawerLink.click(),
      ]);

      await expect(page).toHaveURL(`${BASE_URL}${path}`, { timeout: NAV_TIMEOUT });
    });
  }
});

test('Logo returns to home page', async ({ page }) => {
  await page.goto(`${BASE_URL}/about`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await Promise.all([
    page.waitForURL(`${BASE_URL}/`, { timeout: NAV_TIMEOUT, waitUntil: 'commit' }),
    page.locator('header a[href="/"]:visible').first().click(),
  ]);
  await expect(page).toHaveURL(`${BASE_URL}/`);
});