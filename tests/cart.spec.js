const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://mythos-energy-frontend.vercel.app';
const CART_URL = `${BASE_URL}/cart`;
const SHOP_URL = `${BASE_URL}/shop`;
const NAV_TIMEOUT = 30000;

const PRODUCT = {
  name: 'Thunderbird Citrus Charge',
  slug: 'thunderbird-citrus-charge-4-pack',
};

// The site is heavy (animations, smooth scroll), so be generous with time
test.setTimeout(90000);
test.describe.configure({ retries: 1 });

// ----------------------------- helpers -------------------------------------

const money = (text) => parseFloat(text.replace(/[^0-9.]/g, ''));
const firstMoney = (text) => {
  const m = text.match(/\$\s?[\d,]+\.\d{2}/);
  return m ? money(m[0]) : NaN;
};

// Product page -> ADD TO CART -> side cart opens -> returns the unit price
async function addProductToCart(page) {
  await page.goto(`${SHOP_URL}/${PRODUCT.slug}`, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT,
  });
  await expect(page.locator('h1.productHeroTitle')).toBeVisible({ timeout: NAV_TIMEOUT });

  const unitPrice = firstMoney(await page.locator('.productHeroPrice').first().innerText());
  expect(unitPrice, 'could not read product price').toBeGreaterThan(0);

  const addBtn = page.locator('.productHeroActions').getByRole('button', { name: /add to cart/i });
  await addBtn.scrollIntoViewIfNeeded();
  await addBtn.click();
  await expect(page.locator('#cart-drawer')).toHaveClass(/cart-drawer--open/, { timeout: 10000 });
  return unitPrice;
}

// Side cart -> VIEW CART link -> /cart page
async function openCartPageFromDrawer(page) {
  const viewCart = page.locator('#cart-drawer a[href="/cart"]');
  await expect(viewCart).toBeVisible();
  await Promise.all([
    page.waitForURL('**/cart', { timeout: NAV_TIMEOUT, waitUntil: 'commit' }),
    viewCart.click(),
  ]);
  await expect(page).toHaveURL(CART_URL, { timeout: NAV_TIMEOUT });
  await expect(page.locator('section.cartContents')).toBeVisible({ timeout: NAV_TIMEOUT });
}

// Cart page locators
function cartPage(page) {
  return {
    section: page.locator('section.cartContents'),
    lines: page.locator('li.cartContentsLine'),
    details: page.locator('.cartContentsDetails').first(),
    qty: page.locator('.cartContentsQty output').first(),
    lineTotal: page.locator('p.cartContentsTotal').first(),
    remove: page.locator('button.cartContentsRemove').first(),
    empty: page.locator('.cartContentsEmpty'),
    emptyTitle: page.locator('.cartContentsEmptyTitle'),
    emptyBody: page.locator('.cartContentsEmptyBody'),
    emptyShopNow: page.locator('.cartContentsEmpty a[href="/shop"]'),
  };
}

// ------------------------- VIEW CART (from side cart) ----------------------

test.describe('View cart page', () => {
  test('VIEW CART in the side cart opens the /cart page', async ({ page }) => {
    await addProductToCart(page);
    await openCartPageFromDrawer(page);
    await expect(page).toHaveTitle(/your cart/i);
  });

  test('cart page lists the product with name, unit price, quantity and total', async ({ page }) => {
    const unitPrice = await addProductToCart(page);
    await openCartPageFromDrawer(page);

    const c = cartPage(page);
    await expect(c.lines).toHaveCount(1);
    await expect(c.details).toContainText(new RegExp(PRODUCT.name, 'i'));
    expect(firstMoney(await c.details.innerText())).toBeCloseTo(unitPrice, 2); // "$3.99" under the name
    await expect(c.qty).toHaveText('1');
    await expect.poll(async () => money(await c.lineTotal.innerText())).toBeCloseTo(unitPrice, 2);

    // Order summary buttons
    await expect(page.getByRole('link', { name: /check ?out/i }).or(page.getByRole('button', { name: /check ?out/i })).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /continue shopping/i }).or(page.getByRole('button', { name: /continue shopping/i })).first()).toBeVisible();
  });
});

// ------------------------- REMOVE ITEM (trash icon) ------------------------

test.describe('Remove item from cart page', () => {
  test('trash icon is available for the product and has an accessible name', async ({ page }) => {
    await addProductToCart(page);
    await openCartPageFromDrawer(page);

    const { remove } = cartPage(page);
    await expect(remove).toBeVisible();
    await expect(remove).toHaveAttribute('aria-label', new RegExp(`Remove ${PRODUCT.name}`, 'i'));
  });

  test('clicking the trash icon removes the product and shows the empty cart', async ({ page }) => {
    await addProductToCart(page);
    await openCartPageFromDrawer(page);

    const c = cartPage(page);
    await expect(c.lines).toHaveCount(1);

    await c.remove.click();

    await expect(c.lines).toHaveCount(0, { timeout: 10000 });
    await expect(c.empty).toBeVisible();
    await expect(c.emptyTitle).toHaveText(/your cart is empty/i);
    await expect(c.emptyBody).toContainText(/nothing here yet/i);
    await expect(c.emptyShopNow).toBeVisible();
    await expect(c.emptyShopNow).toHaveText(/shop now/i);
  });
});

// ------------------------- EMPTY CART -> SHOP NOW --------------------------

test.describe('Empty cart - SHOP NOW', () => {
  test('SHOP NOW after removing the product redirects to /shop', async ({ page }) => {
    await addProductToCart(page);
    await openCartPageFromDrawer(page);

    const c = cartPage(page);
    await c.remove.click();
    await expect(c.empty).toBeVisible({ timeout: 10000 });

    await Promise.all([
      page.waitForURL('**/shop', { timeout: NAV_TIMEOUT, waitUntil: 'commit' }),
      c.emptyShopNow.click(),
    ]);
    await expect(page).toHaveURL(SHOP_URL, { timeout: NAV_TIMEOUT });
    await expect(page.locator('article.productCard').first()).toBeVisible({ timeout: NAV_TIMEOUT });
  });

  test('opening /cart directly with nothing added shows the empty cart', async ({ page }) => {
    await page.goto(CART_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

    const c = cartPage(page);
    await expect(c.empty).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(c.emptyTitle).toHaveText(/your cart is empty/i);
    await expect(c.lines).toHaveCount(0);
  });

  test('SHOP NOW on a directly opened empty cart redirects to /shop', async ({ page }) => {
    await page.goto(CART_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

    const c = cartPage(page);
    await expect(c.emptyShopNow).toBeVisible({ timeout: NAV_TIMEOUT });
    await Promise.all([
      page.waitForURL('**/shop', { timeout: NAV_TIMEOUT, waitUntil: 'commit' }),
      c.emptyShopNow.click(),
    ]);
    await expect(page).toHaveURL(SHOP_URL, { timeout: NAV_TIMEOUT });
  });
});