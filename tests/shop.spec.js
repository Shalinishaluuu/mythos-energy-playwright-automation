const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://mythos-energy-frontend.vercel.app';
const SHOP_URL = `${BASE_URL}/shop`;
const NAV_TIMEOUT = 30000;

// Product pages seen on the site (slug from the product card links)
const PRODUCTS = [
  { name: 'Sasquatch Northwest Apple', slug: 'sasquatch-northwest-apple-4-pack' },
  { name: 'Thunderbird Citrus Charge', slug: 'thunderbird-citrus-charge-4-pack' },
];

// The site is heavy (animations, smooth scroll), so be generous with time
test.setTimeout(90000);
test.describe.configure({ retries: 1 });

// ----------------------------- helpers -------------------------------------

const money = (text) => parseFloat(text.replace(/[^0-9.]/g, ''));
const firstMoney = (text) => {
  const m = text.match(/\$\s?[\d,]+\.\d{2}/);
  return m ? money(m[0]) : NaN;
};
const normalize = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

async function gotoShop(page) {
  await page.goto(SHOP_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await expect(page.locator('article.productCard').first()).toBeVisible({ timeout: NAV_TIMEOUT });
}

async function gotoProduct(page, slug) {
  await page.goto(`${SHOP_URL}/${slug}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await expect(page.locator('h1.productHeroTitle')).toBeVisible({ timeout: NAV_TIMEOUT });
}

// Everything inside the side cart (aside#cart-drawer)
function cart(page) {
  const drawer = page.locator('#cart-drawer');
  return {
    drawer,
    count: drawer.locator('.cart-drawer__title-count'),
    lines: drawer.locator('li.cart-drawer__line'),
    name: drawer.locator('.cart-drawer__name').first(),
    qty: drawer.locator('output.qty-stepper__value').first(),
    plus: drawer.locator('button[aria-label="Increase quantity"]').first(),
    minus: drawer.locator('button[aria-label="Decrease quantity"]').first(),
    linePrice: drawer.locator('.cart-drawer__price').first(),
    foot: drawer.locator('.cart-drawer__foot'),
    close: drawer.locator('button[aria-label="Close cart"]'),
  };
}

async function expectCartOpen(page) {
  await expect(page.locator('#cart-drawer')).toHaveClass(/cart-drawer--open/, { timeout: 10000 });
}

async function readSubtotal(c) {
  return firstMoney(await c.foot.innerText()); // first $ amount in the footer = subtotal
}

// Checks quantity, line price, subtotal and "N Product(s)" title all agree
async function expectCartTotals(c, unitPrice, qty) {
  await expect(c.qty).toHaveText(String(qty));
  await expect
    .poll(async () => money(await c.linePrice.innerText()), { message: `line price for qty ${qty}` })
    .toBeCloseTo(unitPrice * qty, 2);
  await expect
    .poll(async () => readSubtotal(c), { message: `subtotal for qty ${qty}` })
    .toBeCloseTo(unitPrice * qty, 2);
  await expect(c.count).toHaveText(new RegExp(`\\b${qty} Products?\\b`, 'i'));
}

// Add the product from its details page and return the unit price
async function addFromProductPage(page) {
  const unitPrice = firstMoney(await page.locator('.productHeroPrice').first().innerText());
  expect(unitPrice, 'could not read product price').toBeGreaterThan(0);

  const addBtn = page.locator('.productHeroActions').getByRole('button', { name: /add to cart/i });
  await addBtn.scrollIntoViewIfNeeded();
  await addBtn.click();
  await expectCartOpen(page);
  return unitPrice;
}

// ----------------------------- SHOP PAGE -----------------------------------

test.describe('Shop page', () => {
  test('lists product cards with name, price and ADD TO CART', async ({ page }) => {
    await gotoShop(page);
    const cards = page.locator('article.productCard');
    expect(await cards.count()).toBeGreaterThanOrEqual(2);

    const first = cards.first();
    await expect(first.locator('a.productCardLink')).toBeVisible();
    expect(firstMoney(await first.innerText())).toBeGreaterThan(0);
    await expect(first.locator('button.productCardCta')).toHaveText(/add to cart/i);
  });

  test('clicking a product opens its details page', async ({ page }) => {
    await gotoShop(page);
    const link = page.locator('article.productCard a.productCardLink').first();
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^\/shop\/.+/);

    await Promise.all([
      page.waitForURL(`**${href}`, { timeout: NAV_TIMEOUT, waitUntil: 'commit' }),
      link.click(),
    ]);
    await expect(page).toHaveURL(`${BASE_URL}${href}`, { timeout: NAV_TIMEOUT });
    await expect(page.locator('h1.productHeroTitle')).toBeVisible({ timeout: NAV_TIMEOUT });
  });

  test('ADD TO CART on a product card opens the side cart with that product', async ({ page }) => {
    await gotoShop(page);
    const card = page.locator('article.productCard').first();
    const cardText = await card.innerText();
    const unitPrice = firstMoney(cardText);

    await card.locator('button.productCardCta').scrollIntoViewIfNeeded();
    await card.locator('button.productCardCta').click();
    await expectCartOpen(page);

    const c = cart(page);
    await expect(c.lines).toHaveCount(1);
    expect(normalize(cardText)).toContain(normalize(await c.name.innerText()));
    await expectCartTotals(c, unitPrice, 1);
  });
});

// ------------------- PRODUCT DETAILS PAGE + SIDE CART ----------------------

for (const product of PRODUCTS) {
  test.describe(`Product page - ${product.name}`, () => {
    test('shows title, price, ADD TO CART and BUY IT NOW', async ({ page }) => {
      await gotoProduct(page, product.slug);
      await expect(page.locator('h1.productHeroTitle')).toContainText(new RegExp(product.name, 'i'));
      expect(firstMoney(await page.locator('.productHeroPrice').first().innerText())).toBeGreaterThan(0);

      const actions = page.locator('.productHeroActions');
      await expect(actions.getByRole('button', { name: /add to cart/i })).toBeVisible();
      await expect(actions.getByRole('button', { name: /buy it now/i })).toBeVisible();
    });

    test('ADD TO CART opens the side cart with 1 product at the correct price', async ({ page }) => {
      await gotoProduct(page, product.slug);
      const unitPrice = await addFromProductPage(page);

      const c = cart(page);
      await expect(c.lines).toHaveCount(1);
      await expect(c.name).toContainText(new RegExp(product.name, 'i'));
      await expectCartTotals(c, unitPrice, 1);
      await expect(c.drawer.getByRole('link', { name: /view cart/i })
        .or(c.drawer.getByRole('button', { name: /view cart/i }))).toBeVisible();
      await expect(c.drawer.getByRole('link', { name: /check ?out/i })
        .or(c.drawer.getByRole('button', { name: /check ?out/i }))).toBeVisible();
    });

    test('"-" is disabled when quantity is 1', async ({ page }) => {
      await gotoProduct(page, product.slug);
      await addFromProductPage(page);

      const c = cart(page);
      await expect(c.qty).toHaveText('1');
      await expect(c.minus).toBeDisabled();
    });

    test('"+" increases quantity and the price/subtotal are calculated correctly', async ({ page }) => {
      await gotoProduct(page, product.slug);
      const unitPrice = await addFromProductPage(page);
      const c = cart(page);

      await expectCartTotals(c, unitPrice, 1);

      await c.plus.click();
      await expectCartTotals(c, unitPrice, 2); // e.g. 2 x $3.99 = $7.98

      await c.plus.click();
      await expectCartTotals(c, unitPrice, 3); // 3 x $3.99 = $11.97
    });

    test('"-" decreases quantity and the price/subtotal go down correctly', async ({ page }) => {
      await gotoProduct(page, product.slug);
      const unitPrice = await addFromProductPage(page);
      const c = cart(page);

      await c.plus.click();
      await c.plus.click();
      await expectCartTotals(c, unitPrice, 3);

      await c.minus.click();
      await expectCartTotals(c, unitPrice, 2);

      await c.minus.click();
      await expectCartTotals(c, unitPrice, 1);
      await expect(c.minus).toBeDisabled(); // cannot go below 1
    });

    test('close button closes the side cart', async ({ page }) => {
      await gotoProduct(page, product.slug);
      await addFromProductPage(page);
      const c = cart(page);

      await c.close.click();
      await expect(c.drawer).not.toHaveClass(/cart-drawer--open/, { timeout: 10000 });
    });
  });
}