// Browser smoke test with a MOCKED Supabase (all https://mock.supabase.test requests are answered by this script).
// It checks the user interface in a real Chromium. It does NOT test the real database, real uploads or phone scanning.
// Usage: VITE_SUPABASE_URL=https://mock.supabase.test VITE_SUPABASE_ANON_KEY=mock npm run build
//        npx vite preview --port 4173 &   then   node tests/smoke.mjs      (needs the "playwright" package and a Chromium)
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.APP_URL ?? 'http://localhost:4173', MOCK = 'https://mock.supabase.test';
const spec = JSON.parse(readFileSync('sample/exercise.json', 'utf8')); const { dimensions, ...ex } = spec;
const results = []; const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
const json = (route, body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });
let role = 'admin'; const logged = [];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
await ctx.route(`${MOCK}/**`, async route => {
  const u = new URL(route.request().url()), p = u.pathname, m = route.request().method();
  if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (p.endsWith('/rpc/get_public_exercise')) {
    const code = JSON.parse(route.request().postData() ?? '{}').p_code?.toUpperCase();
    if (code === 'EG-0001') return json(route, { state: 'ok', exercise: { ...ex, exercise_code: 'EG-0001', front_view_path: 'f/front.png', top_view_path: 'f/top.png', side_view_path: 'f/side.png', model_file_path: 'f/part.glb', model_source: 'generated', model_rotation: [0, 0, 0], reference_dimension: null, reference_axis: null }, dimensions, settings: { institution_name: 'Demo College', department_name: 'Mechanical' } });
    return json(route, { state: code === 'EG-0002' ? 'unavailable' : 'not_found' });
  }
  if (p.endsWith('/rpc/log_exercise_access')) { logged.push(JSON.parse(route.request().postData() ?? '{}')); return json(route, null); }
  if (p.includes('/storage/v1/object/public/exercise-assets/f/')) {
    const f = p.split('/').pop(); return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: f.endsWith('glb') ? 'model/gltf-binary' : 'image/png', body: readFileSync(`sample/${f}`) });
  }
  if (p.endsWith('/auth/v1/token')) return json(route, { access_token: 'a.b.c', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: { id: 'u1', email: 'prof@demo.edu', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2024-01-01' } });
  if (p.endsWith('/rest/v1/users')) return json(route, { id: 'u1', name: 'Prof Demo', email: 'prof@demo.edu', role });
  if (p.endsWith('/rest/v1/app_settings')) return json(route, { institution_name: 'Demo College', department_name: 'Mechanical', public_base_url: 'https://eg.demo.edu' });
  if (p.endsWith('/rpc/dashboard_stats')) return json(route, { total: 1, published: 1, drafts: 0, scans: 3, visits: 5, top: [{ exercise_code: 'EG-0001', title: ex.title, visits: 5 }], daily: [{ day: '2026-10-14', visits: 5 }] });
  if (/\/rest\/v1\/(subjects|topics|exercises|exercise_dimensions)$/.test(p)) return json(route, [], 200, { 'content-range': '*/0' });
  return json(route, { message: `unmocked ${m} ${p}` }, 404);
});
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));

// --- student page
await page.goto(`${BASE}/exercise/EG-0001`);
await page.getByRole('heading', { level: 1 }).waitFor();
check('student page shows code and title', (await page.getByRole('heading', { level: 1 }).innerText()).includes('EG-0001'));
await page.waitForSelector('canvas', { timeout: 20000 }); check('3D canvas rendered (WebGL)', true);
await page.waitForTimeout(2500);
const px = await page.evaluate(() => { const c = document.querySelector('canvas'); const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const g = t.getContext('2d'); g.drawImage(c, 0, 0); const d = g.getImageData(0, 0, t.width, t.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 200 || d[i + 1] < 200) n++; return n; });
check('model pixels visible in canvas (not blank)', px > 500, `${px} non-background pixels`);
await page.screenshot({ path: 'tests/shot-student-mobile.png', fullPage: true });
check('ortho views start collapsed on a phone', (await page.locator('details.collapse').getAttribute('open')) === null);
await page.locator('details.collapse > summary').click(); await page.locator('.ortho').scrollIntoViewIfNeeded(); await page.waitForTimeout(800);
const imgs = await page.$$eval('.ortho img', els => els.map(e => ({ ok: e.complete && e.naturalWidth > 0 })));
check('three orthographic images load', imgs.length === 3 && imgs.every(i => i.ok), `${imgs.length} images`);
const order = await page.$$eval('.ortho-cell', els => els.map(e => ({ v: e.dataset.view, r: e.style.gridRow, c: e.style.gridColumn })));
check('third-angle layout: top above front, right beside front', order.find(o => o.v === 'top').r === '1' && order.find(o => o.v === 'front').r === '2' && order.find(o => o.v === 'side').c === '2', JSON.stringify(order));
check('dimensions table shown', (await page.locator('.dims-table tr').count()) >= 3);
await page.getByRole('button', { name: 'Front', exact: true }).click();
check('Front button highlights the front drawing', (await page.locator('.ortho-cell.is-hl').getAttribute('data-view')) === 'front');
await page.getByRole('button', { name: 'Left', exact: true }).click();
check('Left button gives honest note (only right view supplied)', (await page.locator('.s-viewer .hint[role=status]').innerText()).includes('no left-side drawing'));
await page.getByRole('button', { name: 'Reset Exercise' }).click();
check('Reset returns to isometric', (await page.getByRole('button', { name: 'Isometric', exact: true }).getAttribute('aria-pressed')) === 'true');
await page.getByRole('button', { name: 'Compare side by side' }).click();
check('compare mode toggles', (await page.locator('.s-main.s-split').count()) === 1);
check('hints are hidden until requested', (await page.getByText('so it is a circle only').count()) === 0);
await page.getByRole('button', { name: 'Show hints' }).click(); check('hint reveals', (await page.getByText('circle only in the front view').count()) === 1);
check('access logged once', logged.length === 1, JSON.stringify(logged));
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check('no horizontal page scroll at 390px', !overflow);
// --- states
await page.goto(`${BASE}/exercise/EG-9999`); await page.getByRole('heading', { name: 'Exercise not found' }).waitFor(); check('unknown code → not found page', true);
await page.goto(`${BASE}/exercise/EG-0002`); await page.getByRole('heading', { name: 'Not available' }).waitFor(); check('unpublished code → not available page', true);
await page.goto(BASE); await page.getByLabel('Exercise code').fill('https://evil.example/hello'); await page.getByRole('button', { name: 'Open' }).click();
check('bad scanned/typed text is rejected', await page.getByText('is not an exercise code').isVisible());
await page.getByLabel('Exercise code').fill('https://eg.demo.edu/exercise/eg-0001'); await page.getByRole('button', { name: 'Open' }).click();
await page.waitForURL('**/exercise/EG-0001'); check('exercise link text opens the exercise', true);

// --- faculty (mocked auth)
await page.goto(`${BASE}/admin`); await page.waitForURL('**/login');
check('signed-out /admin redirects to login', true);
await page.getByLabel('Email').fill('prof@demo.edu'); await page.getByLabel('Password').fill('secret123'); await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL('**/admin'); await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
for (const n of ['Dashboard', 'All Exercises', 'Create Exercise', 'QR Code Manager', 'Topics and Categories', 'Student Usage', 'Settings']) { if (await page.getByRole('link', { name: n, exact: true }).count() === 0) { await page.getByRole('button', { name: /Menu/ }).click(); } }
check('all 7 faculty navigation items exist', (await page.locator('.sidebar a').count()) === 7);
await page.goto(`${BASE}/admin/settings`); await page.getByLabel('Public web address').fill('http://localhost:5173');
check('localhost base address is refused in Settings', await page.getByText('localhost addresses only work').isVisible());
await page.getByLabel('Public web address').fill('https://eg.demo.edu'); check('valid address accepted', await page.getByText('/exercise/EG-0001').first().isVisible());
await page.goto(`${BASE}/admin/exercises/new`); await page.getByRole('heading', { name: 'A. Basic information' }).waitFor();
check('editor: projection not pre-selected', (await page.locator('input[name=proj]:checked').count()) === 0);
check('editor: publish locked on empty draft', await page.getByRole('button', { name: 'Publish' }).isDisabled());
check('editor: reconstruction panel disabled and marked unavailable', await page.getByRole('button', { name: 'Generate 3D model from views' }).isDisabled());
await page.getByRole('button', { name: 'Add feature' }).click();
await page.waitForSelector('canvas', { timeout: 20000 }); check('editor: geometry builder renders 3D preview', true);
check('editor: volume reported', await page.getByText(/Solid built\. Volume/).isVisible());
await page.screenshot({ path: 'tests/shot-editor.png', fullPage: false });
// worksheet needs a saved exercise; not covered here.
role = 'student';
check('no uncaught page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
await browser.close();
const failed = results.filter(r => !r.ok); console.log(`\n${results.length - failed.length}/${results.length} passed`); process.exit(failed.length ? 1 : 0);
