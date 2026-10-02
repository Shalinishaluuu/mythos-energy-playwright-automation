const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://mythos-energy-frontend.vercel.app';
const ABOUT_URL = `${BASE_URL}/about`;
const SHOP_URL = `${BASE_URL}/shop`;
const NAV_TIMEOUT = 30000;

// The site is heavy (animations, smooth scroll), so be generous with time
test.setTimeout(90000);
test.describe.configure({ retries: 2 });

async function gotoAbout(page) {
  await page.goto(ABOUT_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
}

// Every VISIBLE element whose text is exactly "Shop Now"
// (":visible" skips hidden duplicates such as the mobile drawer's button)
function shopNowButtons(page) {
  return page
    .locator('a:visible, button:visible')
    .filter({ hasText: /^\s*shop\s*now\s*$/i });
}

// ---------------------------------------------------------------------------
// 1. SHOP NOW buttons
// ---------------------------------------------------------------------------
test.describe('About page - SHOP NOW buttons', () => {
  test('page has the header + content SHOP NOW buttons', async ({ page }) => {
    await gotoAbout(page);
    await expect(shopNowButtons(page).first()).toBeVisible();
    // header button + "Our Pillars" button + "From Legend to Lifestyle" button
    expect(await shopNowButtons(page).count()).toBeGreaterThanOrEqual(3);
  });

  test('every SHOP NOW button redirects to /shop', async ({ page }) => {
    await gotoAbout(page);
    const total = await shopNowButtons(page).count();
    expect(total).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < total; i++) {
      await gotoAbout(page);
      const button = shopNowButtons(page).nth(i);
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeVisible();

      await Promise.all([
        page.waitForURL(`**/shop`, { timeout: NAV_TIMEOUT, waitUntil: 'commit' }),
        button.click(),
      ]);
      await expect(page, `SHOP NOW button #${i + 1} should go to /shop`).toHaveURL(SHOP_URL, {
        timeout: NAV_TIMEOUT,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// 2. EXPLORE FLAVOURS button
// ---------------------------------------------------------------------------
test.describe('About page - EXPLORE FLAVOURS button', () => {
  test('EXPLORE FLAVOURS redirects to /shop', async ({ page }) => {
    await gotoAbout(page);

    // Accepts "Explore Flavours" or "Explore Flavors"
    const explore = page
      .locator('a, button')
      .filter({ hasText: /explore\s*flavou?rs/i })
      .first();

    await explore.scrollIntoViewIfNeeded();
    await expect(explore).toBeVisible();

    await Promise.all([
      page.waitForURL(`**/shop`, { timeout: NAV_TIMEOUT, waitUntil: 'commit' }),
      explore.click(),
    ]);
    await expect(page).toHaveURL(SHOP_URL, { timeout: NAV_TIMEOUT });
  });
});

// ---------------------------------------------------------------------------
// 3. LAUNCH LIST / SUBSCRIBE form
// ---------------------------------------------------------------------------
test.describe('About page - Launch list subscribe form', () => {
  async function getForm(page) {
    await gotoAbout(page);
    const form = page.locator('section.commonLaunchList form.commonLaunchListForm');
    await form.scrollIntoViewIfNeeded();
    return {
      form,
      input: form.locator('input').first(),
      submit: form.locator('button.commonLaunchListSubmit'),
    };
  }

  test('launch list section renders heading, email field and Subscribe button', async ({ page }) => {
    const { input, submit } = await getForm(page);

    await expect(
      page.getByRole('heading', { name: /join the mythos launch list/i })
    ).toBeVisible();
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('type', 'email');
    await expect(submit).toBeVisible();
    await expect(submit).toHaveText(/subscribe/i);
  });

  test('empty email is blocked by validation', async ({ page }) => {
    const { input, submit } = await getForm(page);

    await submit.click();

    const state = await input.evaluate((el) => ({
      valid: el.validity.valid,
      valueMissing: el.validity.valueMissing,
      message: el.validationMessage,
    }));
    expect(state.valid, 'empty email should be invalid').toBe(false);
    expect(state.valueMissing).toBe(true);
    expect(state.message).not.toBe('');
  });

  test('incomplete email "shalini2424t@" shows the browser validation message', async ({ page }) => {
    const { input, submit } = await getForm(page);

    await input.fill('shalini2424t@');
    await submit.click();

    const state = await input.evaluate((el) => ({
      valid: el.validity.valid,
      typeMismatch: el.validity.typeMismatch,
      message: el.validationMessage,
    }));
    expect(state.valid).toBe(false);
    expect(state.typeMismatch).toBe(true);
    // e.g. "Please enter a part following '@'. 'shalini2424t@' is incomplete."
    expect(state.message).toMatch(/following '@'|incomplete/i);
  });

  for (const bad of ['plainaddress', 'missing-at.com', '@nodomain.com', 'two@@at.com', 'spaces in@mail.com']) {
    test(`invalid email "${bad}" is rejected`, async ({ page }) => {
      const { input, submit } = await getForm(page);

      await input.fill(bad);
      await submit.click();

      expect(await input.evaluate((el) => el.validity.valid)).toBe(false);
    });
  }

  test('a valid email passes browser validation', async ({ page }) => {
    const { input } = await getForm(page);

    await input.fill('shalini2424t@gmail.com');
    expect(await input.evaluate((el) => el.validity.valid)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // KNOWN ISSUE: Subscribe looks static - nothing happens after a valid email.
  // This test describes the EXPECTED behaviour, so it will FAIL until the
  // feature is wired up (success message, request to a backend, or cleared
  // input). Once the bug is fixed this test should start passing.
  // -------------------------------------------------------------------------
  test('valid email + Subscribe gives some feedback (message, request or reset)', async ({ page }) => {
    // Marked as an expected failure: the test PASSES while the bug exists and
    // starts FAILING once Subscribe is fixed. Then delete the next line.
    test.fail(true, 'Known bug: Subscribe form is static, nothing happens on submit');

    const { input, submit } = await getForm(page);

    const apiCalls = [];
    page.on('request', (req) => {
      if (['POST', 'PUT', 'PATCH'].includes(req.method())) apiCalls.push(req.url());
    });

    await input.fill('shalini2424t@gmail.com');
    await submit.click();
    await page.waitForTimeout(3000);

    const successText = await page
      .getByText(/thank|success|subscribed|welcome|you'?re (in|on the list)|check your/i)
      .first()
      .isVisible()
      .catch(() => false);
    const inputCleared = (await input.inputValue()) === '';
    const requestSent = apiCalls.length > 0;

    expect(
      successText || inputCleared || requestSent,
      'Subscribe did nothing: no success message, no request sent, input not cleared'
    ).toBe(true);
  });

  test('clicking Subscribe with a valid email does not navigate away', async ({ page }) => {
    const { input, submit } = await getForm(page);

    await input.fill('shalini2424t@gmail.com');
    await submit.click();
    await page.waitForTimeout(1000);

    await expect(page).toHaveURL(/\/about\/?(\?.*)?$/);
  });
});