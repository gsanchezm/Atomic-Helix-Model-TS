/**
 * Generate mock report fixtures into <repoRoot>/reports/. Two runs, five
 * tools per run. Replicates the shape that docs/handsoff/AHM/src/data.js
 * defines, split into one JSON per tool (the layout the dashboard expects
 * on disk).
 *
 * Usage: pnpm dashboard:fixtures   (or pnpm --filter dashboard fixtures:generate)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import type {
  AccessibilityTool,
  ApiTool,
  BrowserBlock,
  ManifestEntry,
  MobileSecurityTool,
  MobileUiTool,
  PerformanceTool,
  RunInfo,
  TestCase,
  VisualDiff,
  VisualTool,
  WebSecurityTool,
  WebUiTool,
} from '../src/shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const reportsDir = path.resolve(
  process.env.REPORTS_DIR ?? path.join(repoRoot, 'reports'),
);

// ---------- Run 1: 2026-05-24-build-4582 ---------------------------------

const run1Info: RunInfo = {
  project: 'Acme Storefront',
  buildId: 'build-4582',
  branch: 'main',
  commit: '9a7e21f',
  triggeredBy: 'ci-bot',
  startedAt: '2026-05-24 09:42:11',
  duration: '27m 14s',
  env: 'staging',
};

const playwrightTests: TestCase[] = [
  { name: 'Login with valid credentials', suite: 'Auth', file: 'auth/login.spec.ts', dur: '2.4s', status: 'passed' },
  { name: 'Login with locked account',    suite: 'Auth', file: 'auth/login.spec.ts', dur: '1.8s', status: 'passed' },
  { name: 'Password reset — email link',  suite: 'Auth', file: 'auth/reset.spec.ts', dur: '4.1s', status: 'passed' },
  { name: 'Checkout — credit card',       suite: 'Checkout', file: 'checkout/card.spec.ts', dur: '12.3s', status: 'passed' },
  { name: 'Checkout — apple pay button',  suite: 'Checkout', file: 'checkout/apay.spec.ts', dur: '5.6s', status: 'failed',
    error: "TimeoutError: locator('button[data-test=apple-pay]') not visible within 10000ms\n  at checkout/apay.spec.ts:42:18",
    steps: [
      { keyword: 'Given ', name: 'a logged-in customer with a saved card', status: 'passed', dur: '420ms', location: 'checkout/apay.spec.ts:8' },
      { keyword: 'When ',  name: 'they click the Apple Pay button',         status: 'failed', dur: '10.2s', location: 'checkout/apay.spec.ts:42',
        error: "TimeoutError: locator('button[data-test=apple-pay]') not visible within 10000ms" },
      { keyword: 'Then ',  name: 'the Apple Pay sheet should appear',       status: 'skipped', dur: '0ms' },
    ],
    failedStepIndex: 1,
  },
  { name: 'Cart — quantity stepper',      suite: 'Checkout', file: 'checkout/cart.spec.ts', dur: '3.1s', status: 'passed' },
  { name: 'Dashboard — KPI grid loads',   suite: 'Dashboard', file: 'dash/kpi.spec.ts', dur: '2.0s', status: 'passed' },
  { name: 'Dashboard — chart hover',      suite: 'Dashboard', file: 'dash/chart.spec.ts', dur: '3.9s', status: 'skipped' },
  { name: 'Reports — export PDF',         suite: 'Reports', file: 'reports/export.spec.ts', dur: '8.7s', status: 'passed' },
  { name: 'Reports — schedule weekly',    suite: 'Reports', file: 'reports/schedule.spec.ts', dur: '6.2s', status: 'failed',
    error: "Expected toast 'Scheduled' to appear, got 'Server error 502'\n  at reports/schedule.spec.ts:88:12" },
  { name: 'Settings — change avatar',     suite: 'Settings', file: 'settings/avatar.spec.ts', dur: '4.0s', status: 'passed' },
  { name: 'Settings — danger zone',       suite: 'Settings', file: 'settings/danger.spec.ts', dur: '1.7s', status: 'passed' },
  { name: 'Checkout completes for US/en — Example row 1', suite: 'Checkout', file: 'checkout/outline.spec.ts', dur: '4.2s', status: 'passed',
    steps: [
      { keyword: 'Given ', name: 'a US/en customer',                         status: 'passed', dur: '120ms', location: 'checkout/outline.spec.ts:5' },
      { keyword: 'When ',  name: 'they place a delivery order',              status: 'passed', dur: '3.9s',  location: 'checkout/outline.spec.ts:8' },
      { keyword: 'Then ',  name: 'the order success screen is shown',        status: 'passed', dur: '180ms', location: 'checkout/outline.spec.ts:12' },
    ],
  },
  { name: 'Checkout completes for MX/es — Example row 2', suite: 'Checkout', file: 'checkout/outline.spec.ts', dur: '5.1s', status: 'failed',
    error: 'Expected order ID to match /^OMNI-MX-/',
    steps: [
      { keyword: 'Given ', name: 'a MX/es customer',                         status: 'passed', dur: '150ms', location: 'checkout/outline.spec.ts:5' },
      { keyword: 'When ',  name: 'they place a delivery order',              status: 'failed', dur: '4.9s',  location: 'checkout/outline.spec.ts:8',
        error: 'Expected order ID to match /^OMNI-MX-/' },
      { keyword: 'Then ',  name: 'the order success screen is shown',        status: 'skipped', dur: '0ms' },
    ],
    failedStepIndex: 1,
  },
];

const PW_SUITES = ['Auth', 'Checkout', 'Dashboard', 'Reports', 'Settings'];

// WebKit passes the Apple-Pay scenario the other engines fail (it's Safari).
const webkitTests: TestCase[] = playwrightTests.map((t) =>
  t.name === 'Checkout — apple pay button' ? { ...t, status: 'passed', error: undefined } : t,
);
// Firefox flakes one extra scenario.
const firefoxTests: TestCase[] = playwrightTests.map((t) =>
  t.name === 'Settings — change avatar'
    ? { ...t, status: 'failed', error: "Error: avatar upload input not focusable in Firefox\n  at settings/avatar.spec.ts:21:9" }
    : t,
);

const playwrightBrowsers1: BrowserBlock[] = [
  { browser: 'chrome',  passed: 50, failed: 1, skipped: 2, duration: '2m 51s', suites: PW_SUITES, tests: playwrightTests },
  { browser: 'firefox', passed: 46, failed: 2, skipped: 2, duration: '2m 44s', suites: PW_SUITES, tests: firefoxTests },
  { browser: 'webkit',  passed: 46, failed: 1, skipped: 2, duration: '2m 47s', suites: PW_SUITES, tests: webkitTests },
];

const playwright1: WebUiTool = {
  kind: 'web_ui',
  id: 'playwright',
  name: 'Playwright',
  description: 'End-to-end browser tests across Chromium, Firefox and WebKit.',
  passed: playwrightBrowsers1.reduce((a, b) => a + b.passed, 0),
  failed: playwrightBrowsers1.reduce((a, b) => a + b.failed, 0),
  skipped: playwrightBrowsers1.reduce((a, b) => a + b.skipped, 0),
  duration: '8m 22s',
  suites: PW_SUITES,
  tests: playwrightTests,
  browsers: playwrightBrowsers1,
};

const apiTests: TestCase[] = [
  { name: 'POST /auth/login — happy path',      suite: 'Auth',    file: 'auth.spec.js',    dur: '120ms', status: 'passed' },
  { name: 'POST /auth/login — wrong password',  suite: 'Auth',    file: 'auth.spec.js',    dur: '95ms',  status: 'passed' },
  { name: 'GET /users/:id — schema',            suite: 'Users',   file: 'users.spec.js',   dur: '82ms',  status: 'passed' },
  { name: 'PATCH /users/:id — partial update',  suite: 'Users',   file: 'users.spec.js',   dur: '110ms', status: 'passed' },
  { name: 'GET /catalog — pagination',          suite: 'Catalog', file: 'catalog.spec.js', dur: '140ms', status: 'passed' },
  { name: 'POST /orders — invalid payload',     suite: 'Orders',  file: 'orders.spec.js',  dur: '70ms',  status: 'failed',
    error: 'AssertionError: expected status 400, got 500\nresponse: { error: "ENOENT writes" }',
    steps: [
      { keyword: 'Given ', name: 'an authenticated client',              status: 'passed', dur: '30ms', location: 'orders.spec.js:12' },
      { keyword: 'When ',  name: 'POST /orders with an invalid payload', status: 'failed', dur: '40ms', location: 'orders.spec.js:18',
        error: 'AssertionError: expected status 400, got 500\nresponse: { error: "ENOENT writes" }' },
    ],
    failedStepIndex: 1,
  },
  { name: 'GET /search?q=foo — relevance',      suite: 'Search',  file: 'search.spec.js',  dur: '210ms', status: 'passed' },
  { name: 'POST /billing/charge — idempotency', suite: 'Billing', file: 'billing.spec.js', dur: '165ms', status: 'passed' },
];

const api1: ApiTool = {
  kind: 'api',
  id: 'api',
  name: 'API Suite',
  description: 'REST and GraphQL contract tests, schema validation and auth flows.',
  passed: 312, failed: 1, skipped: 0, duration: '1m 48s',
  suites: ['Auth', 'Billing', 'Users', 'Catalog', 'Search', 'Orders'],
  tests: apiTests,
};

const androidTests: TestCase[] = [
  { name: 'Onboarding — skip to main',       suite: 'Onboarding', file: 'onboarding.test.js', dur: '6.4s',  status: 'passed' },
  { name: 'Onboarding — accept permissions', suite: 'Onboarding', file: 'onboarding.test.js', dur: '5.2s',  status: 'passed' },
  { name: 'Payments — add Visa',             suite: 'Payments',   file: 'payments.test.js',   dur: '12.0s', status: 'passed' },
  { name: 'Payments — biometric prompt',     suite: 'Payments',   file: 'payments.test.js',   dur: '9.8s',  status: 'failed',
    error: 'ElementNotInteractable: BiometricPrompt did not appear on Pixel 8 emulator',
    steps: [
      { keyword: 'Given ', name: 'a logged-in user on the Pixel 8',  status: 'passed', dur: '800ms', location: 'payments.test.js:32' },
      { keyword: 'When ',  name: 'they trigger a biometric prompt',  status: 'failed', dur: '9.0s',  location: 'payments.test.js:48',
        error: 'ElementNotInteractable: BiometricPrompt did not appear on Pixel 8 emulator' },
    ],
    failedStepIndex: 1,
  },
  { name: 'Push — notification deep link',   suite: 'Push',       file: 'push.test.js',       dur: '4.7s',  status: 'passed' },
  { name: 'Push — silent payload',           suite: 'Push',       file: 'push.test.js',       dur: '3.0s',  status: 'skipped' },
];

const iosTests: TestCase[] = [
  { name: 'Onboarding — skip to main',       suite: 'Onboarding', file: 'onboarding.test.js', dur: '5.9s',  status: 'passed' },
  { name: 'Onboarding — accept permissions', suite: 'Onboarding', file: 'onboarding.test.js', dur: '4.8s',  status: 'passed' },
  { name: 'Payments — add Visa',             suite: 'Payments',   file: 'payments.test.js',   dur: '10.6s', status: 'passed' },
  { name: 'Payments — Face ID prompt',       suite: 'Payments',   file: 'payments.test.js',   dur: '8.4s',  status: 'failed',
    error: 'WebDriverError: FaceID secure-enclave not available in this simulator session',
    steps: [
      { keyword: 'Given ', name: 'a logged-in user on the iPhone 15', status: 'passed', dur: '700ms', location: 'payments.test.js:32' },
      { keyword: 'When ',  name: 'they trigger Face ID',              status: 'failed', dur: '7.7s',  location: 'payments.test.js:54',
        error: 'WebDriverError: FaceID secure-enclave not available in this simulator session' },
    ],
    failedStepIndex: 1,
  },
  { name: 'Payments — Apple Pay sheet',      suite: 'Payments',   file: 'payments.test.js',   dur: '11.2s', status: 'failed',
    error: 'Expected ApplePayPaymentSheet visible — got: PayWithCardScreen' },
  { name: 'Push — notification deep link',   suite: 'Push',       file: 'push.test.js',       dur: '4.4s',  status: 'passed' },
];

const appium1: MobileUiTool = {
  kind: 'mobile_ui',
  id: 'appium',
  name: 'Appium',
  description: 'Native mobile flows on iOS simulators and Android emulators.',
  passed: 88, failed: 5, skipped: 3, duration: '11m 02s',
  platforms: {
    android: {
      passed: 46, failed: 2, skipped: 1, duration: '5m 38s',
      device: 'Pixel 8 · Android 14',
      suites: ['Onboarding', 'Payments', 'Push'],
      tests: androidTests,
    },
    ios: {
      passed: 42, failed: 3, skipped: 2, duration: '5m 24s',
      device: 'iPhone 15 · iOS 17.4',
      suites: ['Onboarding', 'Payments', 'Push'],
      tests: iosTests,
    },
  },
};

const gatling1: PerformanceTool = {
  kind: 'performance',
  id: 'gatling',
  name: 'Gatling',
  description: 'Sustained load + spike scenarios against staging services.',
  passed: 18, failed: 2, skipped: 0, duration: '14m 30s',
  perf: {
    rps: 1842, avgMs: 124, p95Ms: 312, p99Ms: 612,
    errorRate: 0.42, requests: 1_672_481, maxRps: 2400,
    distribution: [
      { label: '< 100 ms',   pct: 62,  count: 1_037_000 },
      { label: '100–250 ms', pct: 24,  count: 401_000 },
      { label: '250–500 ms', pct: 9,   count: 150_500 },
      { label: '500 ms–1 s', pct: 3,   count: 50_100 },
      { label: '1 s–3 s',    pct: 1.5, count: 25_100 },
      { label: '> 3 s',      pct: 0.5, count: 8800 },
    ],
    scenarios: [
      {
        name: 'checkout-load',
        rps: 920, p95: 412, errors: 0.5,
        steps: [
          { name: 'home',      rps: 240, p95: 180, errors: 0    },
          { name: 'login',     rps: 220, p95: 220, errors: 0.05 },
          { name: 'addToCart', rps: 250, p95: 350, errors: 0.30 },
          { name: 'checkout',  rps: 210, p95: 520, errors: 1.10 },
        ],
      },
      {
        name: 'catalog-load',
        rps: 720, p95: 360, errors: 0.3,
        steps: [
          { name: 'home',   rps: 420, p95: 188, errors: 0    },
          { name: 'search', rps: 300, p95: 360, errors: 0.55 },
        ],
      },
    ],
  },
};

type FixtureVisualTool = Omit<VisualTool, 'diffs'> & {
  diffs: Omit<VisualDiff, 'images'>[];
};

const pixelmatch1: FixtureVisualTool = {
  kind: 'visual',
  id: 'pixelmatch',
  name: 'PixelMatch',
  description: 'Pixel-by-pixel comparison of UI screens vs baselines.',
  passed: 54, failed: 3, skipped: 2, duration: '2m 12s',
  suites: ['Marketing', 'App shell', 'Email templates'],
  diffs: [
    {
      name: 'Catalog grid — US/en — desktop', baseline: 'catalog__catalog_screen__web__desktop__us__en',
      diffPct: 0.04, status: 'passed',
      bucketing: { feature: 'catalog', snapshot: 'catalog_screen', platform: 'web', viewport: 'desktop', market: 'us', language: 'en' },
      triggeredBy: { feature: 'catalog', scenario: 'Catalog renders in US/en', runId: '2026-05-24-build-4582' },
    },
    {
      name: 'Checkout summary — MX/es — desktop', baseline: 'checkout__checkout_order_summary__web__desktop__mx__es',
      diffPct: 4.12, status: 'failed',
      bucketing: { feature: 'checkout', snapshot: 'checkout_order_summary', platform: 'web', viewport: 'desktop', market: 'mx', language: 'es' },
      triggeredBy: { feature: 'checkout', scenario: 'Checkout completes for MX/es — Example row 2', runId: '2026-05-24-build-4582' },
    },
    { name: 'Dashboard — sidebar', baseline: 'dash-sidebar',     diffPct: 3.21, status: 'failed' },
    { name: 'Settings — billing',  baseline: 'settings-billing', diffPct: 0.00, status: 'passed' },
    { name: 'Email — receipt',     baseline: 'email-receipt',    diffPct: 1.84, status: 'failed' },
    { name: 'Marketing — footer',  baseline: 'mkt-footer',       diffPct: 0.12, status: 'passed' },
  ],
};

// axe counts: failed = critical+serious violations, skipped = moderate+minor,
// passed = sum of per-audit `passes` counts, duration = 0 (no timing).
const axe1: AccessibilityTool = {
  kind: 'accessibility',
  id: 'axe',
  name: 'axe-core',
  description: 'WCAG 2.x accessibility audit',
  passed: 80, failed: 2, skipped: 2, duration: '0s',
  suites: ['Catalog', 'Checkout'],
  audits: [
    {
      feature: 'Catalog',
      auditId: 'catalog_grid',
      url: 'https://staging.acme-storefront.example/catalog',
      timestamp: '2026-05-24T09:48:02Z',
      passes: 42,
      incomplete: 2,
      violations: [
        {
          id: 'color-contrast',
          impact: 'serious',
          help: 'Elements must meet minimum color contrast ratio thresholds',
          description: 'Ensures the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/color-contrast',
          tags: ['wcag2aa', 'wcag143'],
          nodes: [
            {
              target: ['.product-card > .price-strike'],
              html: '<span class="price-strike">$24.99</span>',
              failureSummary: 'Fix any of the following:\n  Element has insufficient color contrast of 2.61 (foreground: #9a8fb0, background: #2a2140, font size: 12.0pt, font weight: normal). Expected contrast ratio of 4.5:1',
            },
            {
              target: ['.pagination > .page-hint'],
              html: '<span class="page-hint">Page 1 of 12</span>',
              failureSummary: 'Fix any of the following:\n  Element has insufficient color contrast of 3.12 (foreground: #8d82a6, background: #241c38). Expected contrast ratio of 4.5:1',
            },
          ],
        },
        {
          id: 'landmark-one-main',
          impact: 'moderate',
          help: 'Document should have one main landmark',
          description: 'Ensures the document has a main landmark',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/landmark-one-main',
          tags: ['best-practice'],
          nodes: [
            {
              target: ['html'],
              html: '<html lang="en">',
              failureSummary: 'Fix all of the following:\n  Document does not have a main landmark',
            },
          ],
        },
      ],
    },
    {
      feature: 'Checkout',
      auditId: 'checkout_summary',
      url: 'https://staging.acme-storefront.example/checkout',
      timestamp: '2026-05-24T09:52:18Z',
      passes: 38,
      incomplete: 1,
      violations: [
        {
          id: 'image-alt',
          impact: 'critical',
          help: 'Images must have alternate text',
          description: 'Ensures <img> elements have alternate text or a role of none or presentation',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/image-alt',
          tags: ['wcag2a', 'wcag111'],
          nodes: [
            {
              target: ['.order-summary img.product-thumb'],
              html: '<img class="product-thumb" src="/img/pizza-margherita.png">',
              failureSummary: 'Fix any of the following:\n  Element does not have an alt attribute',
            },
            {
              target: ['.payment-methods img[src$="visa.svg"]'],
              html: '<img src="/img/visa.svg">',
              failureSummary: 'Fix any of the following:\n  Element does not have an alt attribute',
            },
          ],
        },
        {
          id: 'region',
          impact: 'minor',
          help: 'All page content should be contained by landmarks',
          description: 'Ensures all page content is contained by landmarks',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/region',
          tags: ['best-practice'],
          nodes: [
            {
              target: ['.promo-ribbon'],
              html: '<div class="promo-ribbon">Free delivery over $30</div>',
              failureSummary: 'Fix any of the following:\n  Some page content is not contained by landmarks',
            },
          ],
        },
      ],
    },
  ],
};

// zap counts: failed = High+Medium alerts across both scans (+1 per failing
// gate), passed = Low+Informational alerts, duration = 0 (no timing).
const zap1: WebSecurityTool = {
  kind: 'security',
  scope: 'web',
  id: 'zap',
  name: 'OWASP ZAP',
  description: 'Web application security scan',
  passed: 7, failed: 5, skipped: 0, duration: '0s',
  targetUrl: 'https://staging.acme-storefront.example',
  baseline: {
    byRisk: { High: 0, Medium: 2, Low: 3, Informational: 2 },
    findings: [
      { name: 'Content Security Policy (CSP) Header Not Set', risk: 'Medium', confidence: 'High',   instances: 12 },
      { name: 'Missing Anti-clickjacking Header',             risk: 'Medium', confidence: 'Medium', instances: 8 },
      { name: 'X-Content-Type-Options Header Missing',        risk: 'Low',    confidence: 'Medium', instances: 14 },
      { name: 'Cookie Without Secure Flag',                   risk: 'Low',    confidence: 'Medium', instances: 3 },
      { name: 'Server Leaks Version Information',             risk: 'Low',    confidence: 'High',   instances: 22 },
      { name: 'Re-examine Cache-control Directives',          risk: 'Informational', confidence: 'Low', instances: 31 },
      { name: 'Modern Web Application',                       risk: 'Informational', confidence: 'Medium', instances: 2 },
    ],
  },
  apiScan: {
    byRisk: { High: 1, Medium: 1, Low: 1, Informational: 1 },
    findings: [
      { name: 'SQL Injection',                                       risk: 'High',   confidence: 'Medium', instances: 2 },
      { name: 'Application Error Disclosure',                        risk: 'Medium', confidence: 'Medium', instances: 4 },
      { name: 'Strict-Transport-Security Header Not Set',            risk: 'Low',    confidence: 'High',   instances: 9 },
      { name: 'A Client Error response code was returned by server', risk: 'Informational', confidence: 'High', instances: 17 },
    ],
  },
  tls:        { pass: true,  reportPath: 'reports/security/tls-check.json', findingsCount: 0 },
  schemaFuzz: { pass: false, reportPath: 'reports/security/schema-fuzz.json' },
};

// mobsf counts: failed = sum of `high` across present platforms, passed =
// count of non-high findings, duration = 0 (no timing).
const mobsf1: MobileSecurityTool = {
  kind: 'security',
  scope: 'mobile',
  id: 'mobsf',
  name: 'MobSF',
  description: 'Mobile app static security analysis',
  passed: 9, failed: 3, skipped: 0, duration: '0s',
  platforms: {
    android: {
      appFile: 'acme-storefront-release.apk',
      securityScore: 64,
      high: 2, warning: 3, info: 2,
      findings: [
        { severity: 'high',    title: 'Debug Enabled For App', description: '[android:debuggable=true] Debugging was enabled on the app which makes it easier for reverse engineers to hook a debugger to it.' },
        { severity: 'high',    title: 'Clear text traffic is Enabled For App', description: '[android:usesCleartextTraffic=true] The app intends to use cleartext network traffic such as HTTP.' },
        { severity: 'warning', title: 'App can be installed on a vulnerable Android version', description: 'Android 7.0, minSdk=24. Older devices miss recent security patches.' },
        { severity: 'warning', title: 'Application Data can be Backed up', description: '[android:allowBackup=true] This flag allows anyone to backup your application data via adb.' },
        { severity: 'warning', title: 'Insecure Random Number Generator', description: 'The app uses java.util.Random, an insecure PRNG, in a security-sensitive context.' },
        { severity: 'info',    title: 'App uses SQLite Database', description: 'The app uses a local SQLite database and executes raw SQL queries.' },
        { severity: 'info',    title: 'Firebase URL detected', description: 'A Firebase realtime database endpoint was found in string resources.' },
        { severity: 'secure',  title: 'This application has no privacy trackers', description: 'No known advertising or analytics trackers were detected in the binary.' },
      ],
    },
    ios: {
      appFile: 'AcmeStorefront.ipa',
      securityScore: 71,
      high: 1, warning: 2, info: 1,
      findings: [
        { severity: 'high',    title: 'App Transport Security AllowsArbitraryLoads is allowed', description: 'NSAllowsArbitraryLoads set to true disables ATS restrictions for all network connections.' },
        { severity: 'warning', title: 'Binary makes use of insecure API(s)', description: 'The binary may contain the following insecure API(s): _memcpy, _strlen.' },
        { severity: 'warning', title: 'Binary does not have Restricted segment', description: 'Missing __RESTRICT segment makes DYLD environment-variable injection easier.' },
        { severity: 'info',    title: 'Binary makes use of malloc function', description: 'The binary may use the _malloc function instead of calloc.' },
      ],
    },
  },
};

// ---------- Run 2: 2026-05-23-build-4571 ---------------------------------
// A few more failures and slightly different counts to make the run-picker
// dropdown feel like it actually shows different data.

const run2Info: RunInfo = {
  project: 'Acme Storefront',
  buildId: 'build-4571',
  branch: 'feat/cart-redesign',
  commit: 'c1b4d09',
  triggeredBy: 'pull-request-bot',
  startedAt: '2026-05-23 16:08:02',
  duration: '32m 47s',
  env: 'staging',
};

const playwright2: WebUiTool = {
  ...playwright1,
  passed: 134, failed: 9, skipped: 9, duration: '9m 04s',
  tests: playwrightTests.map((t, i) =>
    i === 2 ? { ...t, status: 'failed', error: 'TimeoutError: reset email never arrived (mailhog inbox empty after 30s)' } : t,
  ),
};

const api2: ApiTool = {
  ...api1,
  passed: 310, failed: 3, skipped: 0, duration: '1m 56s',
  tests: apiTests,
};

const appium2: MobileUiTool = {
  ...appium1,
  passed: 84, failed: 8, skipped: 4, duration: '12m 18s',
  platforms: {
    android: { ...appium1.platforms.android, passed: 44, failed: 4, skipped: 1, duration: '5m 51s' },
    ios:     { ...appium1.platforms.ios,     passed: 40, failed: 4, skipped: 3, duration: '6m 27s' },
  },
};

const gatling2: PerformanceTool = {
  ...gatling1,
  passed: 16, failed: 4, skipped: 0, duration: '15m 12s',
  perf: {
    ...gatling1.perf,
    rps: 1680, avgMs: 148, p95Ms: 384, p99Ms: 720,
    errorRate: 0.71,
    scenarios: gatling1.perf.scenarios.map((sim) =>
      sim.name === 'checkout-load'
        ? { ...sim, errors: 1.0, steps: sim.steps?.map((s) => s.name === 'checkout' ? { ...s, errors: 2.2 } : s) }
        : sim,
    ),
  },
};

const pixelmatch2: FixtureVisualTool = {
  ...pixelmatch1,
  passed: 51, failed: 6, skipped: 2, duration: '2m 21s',
  diffs: pixelmatch1.diffs.map((d, i) =>
    i === 0 ? { ...d, diffPct: 1.92, status: 'failed' as const } : d,
  ),
};

// One extra serious violation on the catalog audit (failed 2 → 3).
const axe2: AccessibilityTool = {
  ...axe1,
  passed: 78, failed: 3, skipped: 2,
  audits: axe1.audits.map((a) =>
    a.auditId === 'catalog_grid'
      ? {
          ...a,
          passes: 40,
          violations: [
            ...a.violations,
            {
              id: 'link-name',
              impact: 'serious' as const,
              help: 'Links must have discernible text',
              description: 'Ensures links have discernible text',
              helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/link-name',
              tags: ['wcag2a', 'wcag244'],
              nodes: [
                {
                  target: ['.cart-mini > a.icon-only'],
                  html: '<a class="icon-only" href="/cart"><svg aria-hidden="true">…</svg></a>',
                  failureSummary: 'Fix all of the following:\n  Element is in tab order and does not have accessible text',
                },
              ],
            },
          ],
        }
      : a,
  ),
};

// The cart-redesign branch introduces a CORS misconfiguration (Medium).
const zap2: WebSecurityTool = {
  ...zap1,
  passed: 7, failed: 6,
  baseline: {
    byRisk: { High: 0, Medium: 3, Low: 3, Informational: 2 },
    findings: [
      { name: 'CORS Misconfiguration', risk: 'Medium', confidence: 'Medium', instances: 5 },
      ...zap1.baseline!.findings,
    ],
  },
};

// Android score drops after enabling a debug flag in the redesign build.
const mobsf2: MobileSecurityTool = {
  ...mobsf1,
  passed: 9, failed: 4,
  platforms: {
    android: {
      ...mobsf1.platforms.android!,
      securityScore: 58,
      high: 3,
      findings: [
        { severity: 'high', title: 'Janus Vulnerability', description: 'The APK is signed with v1 signature scheme only, making it vulnerable to the Janus vulnerability on Android 5.0-8.0.' },
        ...mobsf1.platforms.android!.findings,
      ],
    },
    ios: mobsf1.platforms.ios,
  },
};

// -------------------------------------------------------------------------

const manifest: ManifestEntry[] = [
  { runId: '2026-05-24-build-4582', project: run1Info.project, buildId: run1Info.buildId, branch: run1Info.branch, startedAt: run1Info.startedAt },
  { runId: '2026-05-23-build-4571', project: run2Info.project, buildId: run2Info.buildId, branch: run2Info.branch, startedAt: run2Info.startedAt },
];

interface RunBundle {
  runId: string;
  run: RunInfo;
  playwright: WebUiTool;
  appium: MobileUiTool;
  api: ApiTool;
  gatling: PerformanceTool;
  pixelmatch: FixtureVisualTool;
  axe: AccessibilityTool;
  zap: WebSecurityTool;
  mobsf: MobileSecurityTool;
}

const runs: RunBundle[] = [
  { runId: manifest[0].runId, run: run1Info, playwright: playwright1, appium: appium1, api: api1, gatling: gatling1, pixelmatch: pixelmatch1, axe: axe1, zap: zap1, mobsf: mobsf1 },
  { runId: manifest[1].runId, run: run2Info, playwright: playwright2, appium: appium2, api: api2, gatling: gatling2, pixelmatch: pixelmatch2, axe: axe2, zap: zap2, mobsf: mobsf2 },
];

// ---------- PNG generation ------------------------------------------------

const PNG_W = 1280;
const PNG_H = 800;

interface RGBA { r: number; g: number; b: number; a: number }

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function paintRect(
  png: PNG,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGBA,
): void {
  const xEnd = Math.min(PNG_W, x + w);
  const yEnd = Math.min(PNG_H, y + h);
  for (let py = Math.max(0, y); py < yEnd; py++) {
    for (let px = Math.max(0, x); px < xEnd; px++) {
      const idx = (PNG_W * py + px) << 2;
      png.data[idx]     = color.r;
      png.data[idx + 1] = color.g;
      png.data[idx + 2] = color.b;
      png.data[idx + 3] = color.a;
    }
  }
}

function fill(png: PNG, color: RGBA): void {
  paintRect(png, 0, 0, PNG_W, PNG_H, color);
}

async function writePng(filePath: string, png: PNG): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const chunks: Buffer[] = [];
    png.pack()
      .on('data', (c) => chunks.push(c as Buffer))
      .on('end', async () => {
        try {
          await fs.writeFile(filePath, Buffer.concat(chunks));
          resolve();
        } catch (e) {
          reject(e);
        }
      })
      .on('error', reject);
  });
}

async function generateDiffPngs(
  runId: string,
  diffs: FixtureVisualTool['diffs'],
): Promise<void> {
  const baseColor: RGBA   = { r: 28, g: 22, b: 48,  a: 255 }; // dark purple
  const overlayColor: RGBA = { r: 156, g: 96, b: 220, a: 255 }; // accent purple
  const diffColor: RGBA   = { r: 220, g: 60, b: 60,  a: 255 }; // alert red

  const outDir = path.join(reportsDir, runId, 'pixelmatch');

  for (const d of diffs) {
    const seed = hashSeed(`${runId}:${d.baseline}`);
    const ox = 200 + (seed % 600);
    const oy = 150 + ((seed >>> 8) % 400);
    const ow = 240;
    const oh = 160;

    // baseline.png — solid color + one decorative overlay
    {
      const png = new PNG({ width: PNG_W, height: PNG_H });
      fill(png, baseColor);
      paintRect(png, ox, oy, ow, oh, overlayColor);
      await writePng(path.join(outDir, `${d.baseline}-baseline.png`), png);
    }
    // actual.png — same but the overlay is shifted, simulating a layout drift
    {
      const png = new PNG({ width: PNG_W, height: PNG_H });
      fill(png, baseColor);
      const shift = d.status === 'failed' ? 60 : 6; // bigger shift = visible diff
      paintRect(png, ox + shift, oy + shift, ow, oh, overlayColor);
      await writePng(path.join(outDir, `${d.baseline}-actual.png`), png);
    }
    // diff.png — base dimmed + red overlay showing the drifted region
    {
      const png = new PNG({ width: PNG_W, height: PNG_H });
      fill(png, { r: 18, g: 14, b: 32, a: 255 });
      const shift = d.status === 'failed' ? 60 : 6;
      paintRect(png, ox, oy, ow + shift, oh + shift, diffColor);
      await writePng(path.join(outDir, `${d.baseline}-diff.png`), png);
    }
  }
}

// ---------- Top-level emit ------------------------------------------------

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function main(): Promise<void> {
  await fs.mkdir(reportsDir, { recursive: true });
  await writeJson(path.join(reportsDir, 'manifest.json'), manifest);

  for (const bundle of runs) {
    const runDir = path.join(reportsDir, bundle.runId);
    await writeJson(path.join(runDir, 'run.json'),        bundle.run);
    await writeJson(path.join(runDir, 'playwright.json'), bundle.playwright);
    await writeJson(path.join(runDir, 'appium.json'),     bundle.appium);
    await writeJson(path.join(runDir, 'api.json'),        bundle.api);
    await writeJson(path.join(runDir, 'gatling.json'),    bundle.gatling);
    await writeJson(path.join(runDir, 'pixelmatch.json'), bundle.pixelmatch);
    await writeJson(path.join(runDir, 'axe.json'),        bundle.axe);
    await writeJson(path.join(runDir, 'zap.json'),        bundle.zap);
    await writeJson(path.join(runDir, 'mobsf.json'),      bundle.mobsf);
    await generateDiffPngs(bundle.runId, bundle.pixelmatch.diffs);
    console.log(`[fixtures] wrote ${bundle.runId}`);
  }

  console.log(`[fixtures] manifest.json + ${runs.length} runs at ${reportsDir}`);
}

main().catch((err) => {
  console.error('[fixtures] failed:', err);
  process.exitCode = 1;
});
