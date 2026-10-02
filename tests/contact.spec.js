const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://mythos-energy-frontend.vercel.app';
const CONTACT_URL = `${BASE_URL}/contact`;
const NAV_TIMEOUT = 30000;

// Valid data used by the happy-path tests.
// NOTE: tests in "Valid submission" send REAL submissions to the live Klaviyo form.
// These are the same values as the working manual submission.
const VALID = {
  name: 'meenu',
  email: 'meenu67@gmail.com',
  phone: '98767-89890',
  inquiry: 'Retailer Inquiry',
  message: 'messsage',
};

const INQUIRY_OPTIONS = ['General Inquiry', 'Retailer Inquiry', 'Product Questions', 'Order Support'];

const COUNTRIES = [
  { search: 'India',          pattern: /^\s*India\b/,          title: 'India' },
  { search: 'United Kingdom', pattern: /^\s*United Kingdom\b/, title: 'United Kingdom' },
  { search: 'Australia',      pattern: /^\s*Australia\b/,      title: 'Australia' },
];

// The site is heavy (animations, smooth scroll, third-party form), so be generous
test.setTimeout(90000);
test.describe.configure({ retries: 1 });

// ----------------------------- helpers -------------------------------------

async function gotoContact(page) {
  await page.goto(CONTACT_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  const f = form(page);
  await f.name.scrollIntoViewIfNeeded({ timeout: NAV_TIMEOUT });
  await expect(f.name).toBeVisible({ timeout: NAV_TIMEOUT }); // Klaviyo form loads async
  return f;
}

function form(page) {
  return {
    name: page.getByPlaceholder('Enter your name'),
    email: page.getByPlaceholder('Enter your email'),
    phone: page.getByTestId('phoneNumberInput'),
    countryButton: page.locator('button[aria-label="Search Countries"]'),
    countrySearch: page.getByPlaceholder('Search countries'),
    inquiry: page.getByPlaceholder('Select an option...'),
    message: page.getByPlaceholder('Your text here'),
    submit: page.locator('button.klaviyo-form-button', { hasText: /^\s*submit\s*$/i }),
    required: page.getByText('This field is required'),
    emailInvalid: page.getByText('This email is invalid'),
    thankYou: page.getByText('Thank you!', { exact: true }),
    successText: page.getByText(/your message has been submitted successfully/i),
    followUp: page.getByText(/get back to you soon/i),
  };
}

async function chooseInquiry(page, f, option) {
  await f.inquiry.click();
  await page.getByRole('option', { name: option }).click();
  await expect(f.inquiry).toHaveValue(option);
}

async function chooseCountry(page, f, country) {
  await f.countryButton.click();
  await expect(f.countrySearch).toBeVisible();
  await f.countrySearch.fill(country.search);
  await page.getByRole('option').filter({ hasText: country.pattern }).first().click();
}

// Fill the whole form; pass `skip: ['name', ...]` to leave fields empty
async function fillForm(page, f, overrides = {}, skip = []) {
  const data = { ...VALID, ...overrides };
  if (!skip.includes('name')) await f.name.fill(data.name);
  if (!skip.includes('email')) await f.email.fill(data.email);
  if (!skip.includes('phone')) await f.phone.fill(data.phone);
  if (!skip.includes('inquiry')) await chooseInquiry(page, f, data.inquiry);
  if (!skip.includes('message')) await f.message.fill(data.message);
}

async function submitForm(f) {
  await f.submit.scrollIntoViewIfNeeded();
  await f.submit.click();
}

// Prints the status of the form's POST requests, to debug a failed submission
function logSubmitTraffic(page) {
  page.on('response', (res) => {
    if (res.request().method() === 'POST' && /klaviyo/i.test(res.url())) {
      console.log(`[form submit] ${res.status()} ${res.url()}`);
    }
  });
}

async function expectNotSubmitted(page, f) {
  await page.waitForTimeout(1500);
  await expect(f.thankYou).toHaveCount(0);
  await expect(f.name).toBeVisible(); // form is still on screen
  await expect(page).toHaveURL(CONTACT_URL);
}

// ----------------------------- page / fields -------------------------------

test.describe('Contact page - form fields', () => {
  test('shows all fields and the SUBMIT button', async ({ page }) => {
    const f = await gotoContact(page);

    await expect(page.getByText('Name', { exact: true })).toBeVisible();
    await expect(page.getByText('Email', { exact: true })).toBeVisible();
    await expect(page.getByText('Phone Number', { exact: true })).toBeVisible();
    await expect(page.getByText('Inquiry Type', { exact: true })).toBeVisible();
    await expect(page.getByText('Message', { exact: true })).toBeVisible();

    await expect(f.name).toBeVisible();
    await expect(f.email).toBeVisible();
    await expect(f.phone).toBeVisible();
    await expect(f.countryButton).toBeVisible();
    await expect(f.inquiry).toBeVisible();
    await expect(f.message).toBeVisible();
    await expect(f.submit).toBeVisible();
  });

  test('inquiry dropdown lists all 4 options', async ({ page }) => {
    const f = await gotoContact(page);
    await f.inquiry.click();

    for (const option of INQUIRY_OPTIONS) {
      await expect(page.getByRole('option', { name: option })).toBeVisible();
    }
  });

  for (const option of INQUIRY_OPTIONS) {
    test(`inquiry type "${option}" can be selected`, async ({ page }) => {
      const f = await gotoContact(page);
      await chooseInquiry(page, f, option);
    });
  }
});

// ----------------------------- country search ------------------------------

test.describe('Contact page - phone country search', () => {
  test('default country is United States', async ({ page }) => {
    const f = await gotoContact(page);
    await expect(f.countryButton.locator('img')).toHaveAttribute('title', /united states/i);
  });

  test('opening the country list shows a search box and countries', async ({ page }) => {
    const f = await gotoContact(page);
    await f.countryButton.click();

    await expect(f.countrySearch).toBeVisible();
    await expect(page.getByRole('option').filter({ hasText: /^\s*Afghanistan\b/ })).toBeVisible();
    expect(await page.getByRole('option').count()).toBeGreaterThan(10);
  });

  test('searching narrows the list down to matching countries', async ({ page }) => {
    const f = await gotoContact(page);
    await f.countryButton.click();
    await f.countrySearch.fill('India');

    await expect(page.getByRole('option').filter({ hasText: /^\s*India\b/ })).toBeVisible();
    await expect(page.getByRole('option').filter({ hasText: /^\s*Afghanistan\b/ })).toHaveCount(0);
  });

  for (const country of COUNTRIES) {
    test(`search "${country.search}" and select it`, async ({ page }) => {
      const f = await gotoContact(page);
      await chooseCountry(page, f, country);

      await expect(f.countryButton.locator('img')).toHaveAttribute('title', new RegExp(country.title, 'i'));
      await f.phone.fill(VALID.phone);
      await expect(f.phone).not.toHaveValue('');
    });
  }
});

// ----------------------------- VALID flow ----------------------------------

// SKIPPED: the site shows a bot-protection captcha during automated runs,
// so real submissions can't be tested reliably.
test.describe('Contact page - valid submission', () => {
  test.skip('all fields valid + country search -> Thank you message appears', async ({ page }) => {
    const f = await gotoContact(page);
    logSubmitTraffic(page);

    await f.name.fill(VALID.name);
    await f.email.fill(VALID.email);
    await chooseCountry(page, f, COUNTRIES[0]); // India
    await f.phone.fill(VALID.phone);
    await chooseInquiry(page, f, VALID.inquiry);
    await f.message.fill(VALID.message);

    await submitForm(f);

    await expect(f.thankYou).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(f.successText).toBeVisible();
    await expect(f.followUp).toBeVisible();

    // Form is replaced by the thank-you state
    await expect(f.name).toBeHidden();
    await expect(f.submit).toBeHidden();
    await expect(page).toHaveURL(CONTACT_URL);
  });

  test.skip('phone number is optional - form submits without it', async ({ page }) => {
    const f = await gotoContact(page);
    logSubmitTraffic(page);
    await fillForm(page, f, {}, ['phone']);

    await submitForm(f);

    await expect(f.thankYou).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(f.successText).toBeVisible();
  });
});

// ----------------------------- INVALID flows -------------------------------

test.describe('Contact page - invalid submission', () => {
  test('empty form shows "This field is required" on all required fields', async ({ page }) => {
    const f = await gotoContact(page);

    await submitForm(f);

    // Name, Email, Inquiry Type and Message (Phone is optional)
    await expect(f.required).toHaveCount(4, { timeout: 10000 });
    await expectNotSubmitted(page, f);
  });

  for (const bad of ['shalini2424tech@', 'plainaddress', '@gmail.com', 'two@@gmail.com']) {
    test(`invalid email "${bad}" shows "This email is invalid"`, async ({ page }) => {
      const f = await gotoContact(page);
      await fillForm(page, f, { email: bad });

      await submitForm(f);

      await expect(f.emailInvalid).toBeVisible({ timeout: 10000 });
      await expectNotSubmitted(page, f);
    });
  }

  // Leave exactly one required field empty -> exactly one "required" error
  const REQUIRED_FIELDS = ['name', 'email', 'inquiry', 'message'];
  for (const field of REQUIRED_FIELDS) {
    test(`only "${field}" missing -> required error and no submission`, async ({ page }) => {
      const f = await gotoContact(page);
      await fillForm(page, f, {}, [field]);

      await submitForm(f);

      await expect(f.required).toHaveCount(1, { timeout: 10000 });
      await expectNotSubmitted(page, f);
    });
  }

  test('whitespace-only name and message are not accepted', async ({ page }) => {
    // Known issue: the form does NOT reject whitespace-only values. This test
    // passes while the bug exists and fails once it is fixed (then remove this line).
    test.fail(true, 'Known bug: whitespace-only name/message pass validation');

    const f = await gotoContact(page);
    await fillForm(page, f, { name: '   ', message: '   ' });

    await submitForm(f);

    await expect(f.required.first()).toBeVisible({ timeout: 10000 });
    await expectNotSubmitted(page, f);
  });

  test('error disappears after the email is corrected', async ({ page }) => {
    const f = await gotoContact(page);
    await fillForm(page, f, { email: 'shalini2424tech@' });

    await submitForm(f);
    await expect(f.emailInvalid).toBeVisible({ timeout: 10000 });

    await f.email.fill(VALID.email);
    await expect(f.emailInvalid).toBeHidden({ timeout: 10000 });
  });
});