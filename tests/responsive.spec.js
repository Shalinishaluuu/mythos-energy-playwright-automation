const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://mythos-energy-frontend.vercel.app';
const NAV_TIMEOUT = 30000;

const VIEWPORTS = [
  { name: 'Mobile',  width: 390,  height: 844 },
  { name: 'Tablet',  width: 768,  height: 1024 },
  { name: 'Laptop',  width: 1366, height: 768 },
  { name: 'Desktop', width: 1920, height: 1080 },
];

const PRODUCT_SLUG = 'thunderbird-citrus-charge-4-pack';

// The site is heavy (animations, smooth scroll), so be generous with time.
// retries are off to keep the number of page loads low (the site has bot protection).
test.setTimeout(90000);
test.describe.configure({ retries: 0 });

// ----------------------------- helpers -------------------------------------

async function gotoPath(page, path) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await expect(page.locator('header.site-header')).toBeVisible({ timeout: NAV_TIMEOUT });
}

// The page must never scroll sideways
async function expectNoHorizontalScroll(page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `page is wider (${scrollWidth}px) than the screen (${innerWidth}px)`)
    .toBeLessThanOrEqual(innerWidth + 1);
}

// Element must be visible and fully inside the screen width (not cut off)
async function expectFitsScreen(page, locator, label) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator, `${label} should be visible`).toBeVisible();
  const box = await locator.boundingBox();
  const width = page.viewportSize().width;
  expect(box, `${label} has no size`).not.toBeNull();
  expect(box.x, `${label} is cut off on the left`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${label} is cut off on the right (screen ${width}px)`)
    .toBeLessThanOrEqual(width + 1);
}

// Header link: a direct link on wide screens, or inside the hamburger drawer on small ones
async function getNavLink(page, path) {
  const direct = page.locator(`header a[href="${path}"]:visible`).first();
  if (await direct.count()) return direct;

  await page.getByRole('button', { name: /menu|open|navigation/i }).first().click();
  const drawerLink = page.locator(`a.site-header__drawer-link[href="${path}"]`);
  await expect(drawerLink).toBeVisible();
  return drawerLink;
}

// ----------------------------- tests ---------------------------------------

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    // ---------- every page: no sideways scroll, header + logo visible ----------
    for (const path of ['/', '/about', '/shop', '/contact', '/cart']) {
      test(`page ${path} - no horizontal scroll, header and logo visible`, async ({ page }) => {
        await gotoPath(page, path);
        await expectNoHorizontalScroll(page);
        await expectFitsScreen(page, page.locator('header a[href="/"]').first(), 'logo');
      });
    }

    // ---------- header navigation ----------
    test('header navigation works (links or hamburger menu)', async ({ page }) => {
      await gotoPath(page, '/');

      if (vp.width <= 480) {
        // phone: links are hidden behind the hamburger menu
        await expect(page.locator('header a[href="/about"]:visible')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /menu|open|navigation/i }).first()).toBeVisible();
      }
      if (vp.width >= 1280) {
        // wide screens: ABOUT / SHOP / CONTACT shown directly in the header
        for (const p of ['/about', '/shop', '/contact']) {
          await expect(page.locator(`header a[href="${p}"]:visible`).first()).toBeVisible();
        }
      }

      const link = await getNavLink(page, '/shop');
      await Promise.all([
        page.waitForURL('**/shop', { timeout: NAV_TIMEOUT, waitUntil: 'commit' }),
        link.click(),
      ]);
      await expect(page).toHaveURL(`${BASE_URL}/shop`, { timeout: NAV_TIMEOUT });
    });

    // ---------- About page ----------
    test('About - SHOP NOW button and launch list form fit the screen', async ({ page }) => {
      await gotoPath(page, '/about');

      const shopNow = page
        .locator('a:visible, button:visible')
        .filter({ hasText: /^\s*shop\s*now\s*$/i })
        .last();
      await expectFitsScreen(page, shopNow, 'SHOP NOW button');

      const form = page.locator('section.commonLaunchList form.commonLaunchListForm');
      await expectFitsScreen(page, form.locator('input').first(), 'email field');
      await expectFitsScreen(page, form.locator('button.commonLaunchListSubmit'), 'Subscribe button');
    });

    // ---------- Shop page ----------
    test('Shop - product cards fit the screen and use the right columns', async ({ page }) => {
      await gotoPath(page, '/shop');
      const cards = page.locator('article.productCard');
      await expect(cards.first()).toBeVisible({ timeout: NAV_TIMEOUT });
      expect(await cards.count()).toBeGreaterThanOrEqual(2);

      await expectFitsScreen(page, cards.first(), 'first product card');
      await expectFitsScreen(page, cards.first().locator('button.productCardCta'), 'ADD TO CART button');

      const a = await cards.nth(0).boundingBox();
      const b = await cards.nth(1).boundingBox();
      const sideBySide = Math.abs(a.y - b.y) < 20;

      if (vp.width <= 480) expect(sideBySide, 'phone should show 1 card per row').toBe(false);
      if (vp.width >= 1280) expect(sideBySide, 'desktop should show 2 cards per row').toBe(true);
    });

    // ---------- Product page + side cart ----------
    test('Product page and side cart fit the screen', async ({ page }) => {
      await gotoPath(page, `/shop/${PRODUCT_SLUG}`);
      await expect(page.locator('h1.productHeroTitle')).toBeVisible({ timeout: NAV_TIMEOUT });
      await expectNoHorizontalScroll(page);

      const actions = page.locator('.productHeroActions');
      const addBtn = actions.getByRole('button', { name: /add to cart/i });
      await expectFitsScreen(page, addBtn, 'ADD TO CART button');
      await expectFitsScreen(page, actions.getByRole('button', { name: /buy it now/i }), 'BUY IT NOW button');

      await addBtn.click();
      const drawer = page.locator('#cart-drawer');
      await expect(drawer).toHaveClass(/cart-drawer--open/, { timeout: 10000 });

      await expectFitsScreen(page, drawer, 'side cart');
      await expectFitsScreen(page, drawer.locator('button[aria-label="Close cart"]'), 'close (X) button');
      await expectFitsScreen(page, drawer.locator('button[aria-label="Increase quantity"]').first(), '"+" button');
      await expectFitsScreen(page, drawer.locator('button[aria-label="Decrease quantity"]').first(), '"-" button');
      await expectFitsScreen(page, drawer.locator('a[href="/cart"]'), 'VIEW CART button');
    });

    // ---------- Contact page ----------
    test('Contact - all form fields and SUBMIT fit the screen', async ({ page }) => {
      await gotoPath(page, '/contact');
      const name = page.getByPlaceholder('Enter your name');
      await expect(name).toBeVisible({ timeout: NAV_TIMEOUT }); // Klaviyo form loads async

      await expectFitsScreen(page, name, 'Name field');
      await expectFitsScreen(page, page.getByPlaceholder('Enter your email'), 'Email field');
      await expectFitsScreen(page, page.getByTestId('phoneNumberInput'), 'Phone field');
      await expectFitsScreen(page, page.getByPlaceholder('Select an option...'), 'Inquiry Type field');
      await expectFitsScreen(page, page.getByPlaceholder('Your text here'), 'Message field');
      await expectFitsScreen(
        page,
        page.locator('button.klaviyo-form-button', { hasText: /^\s*submit\s*$/i }),
        'SUBMIT button'
      );
      await expectNoHorizontalScroll(page);
    });

    // ---------- Cart page (empty state) ----------
    test('Cart - empty cart message and SHOP NOW fit the screen', async ({ page }) => {
      await gotoPath(page, '/cart');
      await expectFitsScreen(page, page.locator('.cartContentsEmptyTitle'), 'empty cart title');
      await expectFitsScreen(page, page.locator('.cartContentsEmpty a[href="/shop"]'), 'SHOP NOW button');
    });
  });
}