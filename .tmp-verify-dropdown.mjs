import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = process.cwd();
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.normalize(path.join(root, relative));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadPuppeteer() {
  try {
    return createRequire(import.meta.url)('puppeteer-core');
  } catch {
    const spec = pathToFileURL(path.join(root, 'node_modules', 'puppeteer-core', 'lib', 'esm', 'puppeteer', 'puppeteer-core.js')).href;
    return import(spec);
  }
}

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const screenshotDir = path.join(root, '.tmp-dropdown-shots');
fs.mkdirSync(screenshotDir, { recursive: true });

await new Promise((resolve) => server.listen(8765, resolve));
const puppeteer = (await loadPuppeteer()).default || await loadPuppeteer();
const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: chromePath,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,900']
});

const failures = [];

async function assert(condition, message) {
  if (!condition) failures.push(message);
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${message}`);
}

async function runViewport(name, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('http://127.0.0.1:8765/pages/auth/login.html', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#roleDropdownToggle');

  const closed = await page.$eval('#roleDropdown', (el) => ({
    open: el.classList.contains('is-open'),
    placeholder: el.querySelector('.role-dropdown-placeholder')?.textContent?.trim() || '',
    nativeValue: document.getElementById('role').value,
    toggleWidth: el.querySelector('.role-dropdown-toggle').getBoundingClientRect().width,
    inputWidth: document.getElementById('email').getBoundingClientRect().width
  }));

  await assert(!closed.open, `${name}: dropdown starts closed`);
  await assert(closed.placeholder === 'Select your role', `${name}: placeholder text is Select your role`);
  await assert(closed.nativeValue === '', `${name}: native select starts empty`);
  await assert(Math.abs(closed.toggleWidth - closed.inputWidth) < 1, `${name}: dropdown width matches email input`);

  await page.screenshot({ path: path.join(screenshotDir, `${name}-closed.png`), fullPage: true });

  await page.click('#roleDropdownToggle');
  await wait(250);

  const opened = await page.$eval('#roleDropdown', (el) => {
    const options = [...el.querySelectorAll('.role-dropdown-option')].map((option) => ({
      value: option.dataset.value,
      text: option.querySelector('.role-option-text')?.textContent?.trim(),
      icon: option.querySelector('.role-option-icon i')?.className,
      visible: option.getBoundingClientRect().height > 0
    }));
    return {
      open: el.classList.contains('is-open'),
      expanded: el.querySelector('#roleDropdownToggle').getAttribute('aria-expanded'),
      optionCount: options.length,
      options
    };
  });

  await assert(opened.open, `${name}: dropdown opens on click`);
  await assert(opened.expanded === 'true', `${name}: aria-expanded is true when open`);
  await assert(opened.optionCount === 4, `${name}: four role options are shown`);
  await assert(opened.options.every((option) => option.visible), `${name}: all options are visible`);
  await assert(opened.options[0].value === 'donor' && opened.options[0].icon.includes('fa-droplet'), `${name}: donor uses droplet icon`);
  await assert(opened.options[1].value === 'organization' && opened.options[1].icon.includes('fa-building'), `${name}: organization uses building icon`);
  await assert(opened.options[2].value === 'hospital' && opened.options[2].icon.includes('fa-hospital'), `${name}: hospital uses hospital icon`);
  await assert(opened.options[3].value === 'admin' && opened.options[3].icon.includes('fa-shield-halved'), `${name}: admin uses shield icon`);

  await page.screenshot({ path: path.join(screenshotDir, `${name}-open.png`), fullPage: true });

  await page.click('#role-option-hospital');
  await wait(250);

  const selected = await page.$eval('#roleDropdown', (el) => ({
    open: el.classList.contains('is-open'),
    nativeValue: document.getElementById('role').value,
    label: el.querySelector('.role-dropdown-label')?.textContent?.trim() || '',
    icon: el.querySelector('.role-dropdown-value .role-option-icon i')?.className || '',
    placeholder: el.querySelector('.role-dropdown-placeholder') ? true : false,
    selectedOption: el.querySelector('.role-dropdown-option.is-selected')?.dataset.value || ''
  }));

  await assert(!selected.open, `${name}: dropdown closes after selecting a role`);
  await assert(selected.nativeValue === 'hospital', `${name}: native select value is hospital`);
  await assert(selected.label === 'Hospital', `${name}: closed dropdown shows Hospital`);
  await assert(selected.icon.includes('fa-hospital'), `${name}: closed dropdown shows hospital icon`);
  await assert(!selected.placeholder, `${name}: placeholder is gone after selection`);
  await assert(selected.selectedOption === 'hospital', `${name}: hospital option marked selected`);

  await page.screenshot({ path: path.join(screenshotDir, `${name}-selected.png`), fullPage: true });

  await page.click('#roleDropdownToggle');
  await wait(250);
  await page.click('#email');
  await wait(250);
  const closedOutside = await page.$eval('#roleDropdown', (el) => el.classList.contains('is-open'));
  await assert(!closedOutside, `${name}: clicking outside closes the dropdown`);
  const valueAfterOutside = await page.$eval('#role', (el) => el.value);
  await assert(valueAfterOutside === 'hospital', `${name}: selected role remains after outside click`);

  await assert(errors.length === 0, `${name}: no page errors (${errors.join(' | ')})`);
  await page.close();
}

try {
  await runViewport('desktop', { width: 1280, height: 900, deviceScaleFactor: 1, isMobile: false });
  await runViewport('mobile', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}

console.log('\nAll dropdown checks passed');
