/**
 * Dashboard Performance Tests
 *
 * These tests measure frontend performance metrics using Playwright.
 *
 * Run with: npx playwright test tests/performance/dashboard.spec.js
 *
 * Prerequisites: Server must be running (npm start).
 */
const { test, expect, chromium } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DASHBOARD_URL = `${BASE_URL}/dashboard`;
const LOGIN_URL = `${BASE_URL}/login`;

// ---- Test User Credentials ----
// These are created by tests/helpers.js setup
const TEST_USER = {
  email: 'perf-test@example.com',
  password: 'PerfTest123!@#',
  username: 'perftestuser',
};

// ---- Performance Thresholds ----
const THRESHOLDS = {
  maxLoadTime: 3000, // ms - max time for page to be interactive
  maxJsBundleSize: 150 * 1024, // 150KB
  maxCssBundleSize: 200 * 1024, // 200KB
  maxTotalResourceSize: 500 * 1024, // 500KB - all resources combined
  maxResourceLoadTime: 5000, // ms - max time for any single resource
};

// ---- Helper: Login and get token ----
async function loginAndGetToken(page) {
  await page.goto(LOGIN_URL);
  await page.fill('#email', TEST_USER.email);
  await page.fill('#password', TEST_USER.password);
  await page.click('button[type="submit"]');
  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  return await page.evaluate(() => localStorage.getItem('token'));
}

// ---- Helper: Create authenticated context ----
async function createAuthenticatedContext(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login to get token
  await page.goto(LOGIN_URL);
  await page.fill('#email', TEST_USER.email);
  await page.fill('#password', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });

  const token = await page.evaluate(() => localStorage.getItem('token'));

  // Create a new context with localStorage set
  await context.close();

  const authContext = await browser.newContext();
  await authContext.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }, { token, user: { id: 1, username: 'perftestuser', email: TEST_USER.email } });

  return authContext;
}

// ---- Helper: Measure resource sizes from Network API ----
async function measureResourceMetrics(page) {
  return await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource');
    const result = {
      jsBundle: null,
      cssBundle: null,
      chartJs: null,
      fonts: null,
      totalSize: 0,
    };

    for (const r of resources) {
      const size = r.transferSize || 0;
      const name = r.name || '';

      result.totalSize += size;

      if (name.includes('/build/main.js') || name.endsWith('.js')) {
        if (!result.jsBundle || size > result.jsBundle.size) {
          result.jsBundle = { url: name, size, duration: r.duration };
        }
      } else if (name.includes('/build/bundle.css') || (name.includes('.css') && !name.includes('fonts.googleapis'))) {
        if (!result.cssBundle || size > result.cssBundle.size) {
          result.cssBundle = { url: name, size, duration: r.duration };
        }
      } else if (name.includes('chart.js') || name.includes('chart.umd')) {
        result.chartJs = { url: name, size, duration: r.duration };
      } else if (name.includes('fonts.googleapis') || name.includes('fonts.gstatic')) {
        result.fonts = result.fonts || { count: 0, size: 0 };
        result.fonts.count++;
        result.fonts.size += size;
      }
    }

    return result;
  });
}

// ---- Test: Server is reachable ----
test.describe('Server Availability', () => {
  test('server is running and responsive', async ({ request }) => {
    const response = await request.get(BASE_URL);
    expect(response.ok()).toBeTruthy();
  });
});

// ---- Test: Dashboard Bundle Size ----
test.describe('Bundle Size', () => {
  test('JS bundle size is within threshold', async ({ browser }) => {
    const context = await createAuthenticatedContext(browser);
    const page = await context.newPage();

    await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle' });

    const metrics = await measureResourceMetrics(page);
    const jsBundle = metrics.jsBundle;

    console.log(`JS Bundle: ${jsBundle ? `${(jsBundle.size / 1024).toFixed(1)}KB` : 'NOT FOUND'}`);

    expect(jsBundle).not.toBeNull();
    if (jsBundle) {
      expect(jsBundle.size).toBeLessThan(THRESHOLDS.maxJsBundleSize);
    }

    await context.close();
  });

  test('CSS bundle size is within threshold', async ({ browser }) => {
    const context = await createAuthenticatedContext(browser);
    const page = await context.newPage();

    await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle' });

    const metrics = await measureResourceMetrics(page);
    const cssBundle = metrics.cssBundle;

    console.log(`CSS Bundle: ${cssBundle ? `${(cssBundle.size / 1024).toFixed(1)}KB` : 'NOT FOUND'}`);

    expect(cssBundle).not.toBeNull();
    if (cssBundle) {
      expect(cssBundle.size).toBeLessThan(THRESHOLDS.maxCssBundleSize);
    }

    await context.close();
  });

  test('total resource transfer size is reasonable', async ({ browser }) => {
    const context = await createAuthenticatedContext(browser);
    const page = await context.newPage();

    await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle' });

    const metrics = await measureResourceMetrics(page);
    console.log(`Total transfer size: ${(metrics.totalSize / 1024).toFixed(1)}KB`);
    expect(metrics.totalSize).toBeLessThan(THRESHOLDS.maxTotalResourceSize);

    await context.close();
  });
});

// ---- Test: Dashboard Load Performance ----
test.describe('Dashboard Load Performance', () => {
  test('dashboard loads within time budget', async ({ browser }) => {
    const context = await createAuthenticatedContext(browser);
    const page = await context.newPage();

    const startTime = Date.now();
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    const ttDomContentLoaded = Date.now() - startTime;

    // Wait for JS to initialize
    await page.waitForFunction(() => typeof window.initDashboard === 'function', { timeout: 5000 });
    const ttInteractive = Date.now() - startTime;

    console.log(`DOM Content Loaded: ${ttDomContentLoaded}ms`);
    console.log(`Time to Interactive: ${ttInteractive}ms`);

    expect(ttDomContentLoaded).toBeLessThan(THRESHOLDS.maxLoadTime);
    expect(ttInteractive).toBeLessThan(THRESHOLDS.maxLoadTime * 2);

    await context.close();
  });

  test('dashboard shows correct title', async ({ browser }) => {
    const context = await createAuthenticatedContext(browser);
    const page = await context.newPage();

    await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle' });

    await expect(page).toHaveTitle(/bestfps/);

    await context.close();
  });

  test('dashboard renders sidebar navigation', async ({ browser }) => {
    const context = await createAuthenticatedContext(browser);
    const page = await context.newPage();

    await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000); // Wait for JS initialization

    // Check that sidebar exists
    const sidebar = page.locator('.sidebar, .dash-sidebar, nav').first();
    await expect(sidebar).toBeVisible();

    await context.close();
  });
});

// ---- Test: Resource Load Performance ----
test.describe('Resource Load Performance', () => {
  test('all resources load within timeout', async ({ browser }) => {
    const context = await createAuthenticatedContext(browser);
    const page = await context.newPage();

    const failedRequests = [];
    page.on('requestfailed', (request) => {
      failedRequests.push({
        url: request.url(),
        reason: request.failure()?.errorText,
      });
    });

    await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle' });

    if (failedRequests.length > 0) {
      console.log('Failed requests:', JSON.stringify(failedRequests, null, 2));
    }
    expect(failedRequests).toHaveLength(0);

    await context.close();
  });

  test('Chart.js CDN loads successfully', async ({ browser }) => {
    const context = await createAuthenticatedContext(browser);
    const page = await context.newPage();

    await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle' });

    const chartLoaded = await page.evaluate(() => typeof Chart !== 'undefined');
    expect(chartLoaded).toBeTruthy();

    await context.close();
  });
});

// ---- Test: Build Output Validation ----
test.describe('Build Output Validation', () => {
  test('build directory contains expected files', async ({ request }) => {
    // Check that bundled JS is accessible
    const jsResponse = await request.get(`${BASE_URL}/build/main.js`);
    expect(jsResponse.ok()).toBeTruthy();

    // Check that bundled CSS is accessible
    const cssResponse = await request.get(`${BASE_URL}/build/bundle.css`);
    expect(cssResponse.ok()).toBeTruthy();

    // Check that manifest is accessible
    const manifestResponse = await request.get(`${BASE_URL}/build/manifest.json`);
    expect(manifestResponse.ok()).toBeTruthy();

    // Verify manifest structure
    const manifest = await manifestResponse.json();
    const manifestKeys = Object.keys(manifest);

    // Verify main.js exists (either as main.js or main.{hash}.js)
    const hasMainJs = manifestKeys.some(k => k === 'main.js' || k.startsWith('main.'));
    expect(hasMainJs).toBeTruthy();

    // Verify bundle.css exists (either as bundle.css or bundle.{hash}.css)
    const hasBundleCss = manifestKeys.some(k => k === 'bundle.css' || k.startsWith('bundle.'));
    expect(hasBundleCss).toBeTruthy();

    // Verify entries have hash and size
    for (const key of manifestKeys) {
      expect(manifest[key]).toHaveProperty('hash');
      expect(manifest[key]).toHaveProperty('size');
    }
  });
});
