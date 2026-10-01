#!/usr/bin/env node
// Capture the read-only Lead Follow-Up queue with one private headless Chromium
// using the CDP/auth conventions in the walkthrough capture helper.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'

const origin = process.env.CAPTURE_ORIGIN || 'http://127.0.0.1'
const cdp = 'http://127.0.0.1:9229'
const captureDir = path.resolve('.local/video-captures/landing-refined')
const publicImage = path.resolve('artifacts/patient-pipeline-landing-video/public/images/queue-refined.png')
let tab
let ws
let browser
let profileDir
let launchedBrowser = false
let sequence = 0
const pending = new Map()

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (response.exceptionDetails) throw new Error('A browser-side capture step failed.')
  return response.result.value
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitForCdp(timeout = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`${cdp}/json/version`)
      if (response.ok) return
    } catch {}
    await pause(250)
  }
  throw new Error('The private headless Chromium did not start its CDP endpoint.')
}

async function startPrivateChromium() {
  try {
    const existing = await fetch(`${cdp}/json/version`)
    if (existing.ok) {
      throw new Error('CDP port 9229 is already in use; refusing to touch another browser.')
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('already in use')) throw error
  }
  const executable = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium'
  profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'landing-refined-chrome-'))
  await fs.chmod(profileDir, 0o700)
  const browserEnv = { ...process.env }
  delete browserEnv.DEMO_PASSWORD
  browser = spawn(executable, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=9229',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { detached: true, stdio: 'ignore', env: browserEnv })
  launchedBrowser = true
  browser.unref()
  await waitForCdp()
}

async function waitFor(expression, timeout = 40000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return
    await pause(250)
  }
  throw new Error('Timed out waiting for the demo queue to load.')
}

async function capturePng() {
  const response = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  })
  return Buffer.from(response.data, 'base64')
}

try {
  await startPrivateChromium()
  const tabResponse = await fetch(`${cdp}/json/new?${encodeURIComponent(`${origin}/demo`)}`, { method: 'PUT' })
  if (!tabResponse.ok) throw new Error('Could not open the private Chromium capture tab.')
  tab = await tabResponse.json()
  ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = () => reject(new Error('Could not connect to the private Chromium capture tab.'))
  })
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    message.error ? reject(new Error(message.error.message)) : resolve(message.result)
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await waitFor(`Boolean(document.querySelector('#demo-password') || document.querySelector('nav[aria-label="Portal"]'))`)

  if (await evaluate(`Boolean(document.querySelector('#demo-password'))`)) {
    if (!process.env.DEMO_PASSWORD) {
      throw new Error('DEMO_PASSWORD is required; no credentials were printed.')
    }
    await evaluate(`(() => {
      const input = document.querySelector('#demo-password');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(process.env.DEMO_PASSWORD)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('form').requestSubmit();
    })()`)
    await waitFor(`Boolean(document.querySelector('nav[aria-label="Portal"]'))`)
  }

  await send('Page.navigate', { url: `${origin}/portal/leads?view=calls` })
  await waitFor(`Boolean(document.querySelector('section[aria-label="Ready to call"] > ul'))`)
  await waitFor(`document.querySelectorAll('section[aria-label="Ready to call"] > ul > li').length >= 6`)
  await pause(500)

  const layout = await evaluate(`(() => {
    document.body.style.zoom = '0.95';
    const demoBar = [...document.querySelectorAll('div')].find(element =>
      element.classList.contains('border-accent/30') &&
      element.textContent.includes('Demo account')
    );
    if (!demoBar) return { ok: false };
    demoBar.style.display = 'none';
    document.querySelector('dl[data-testid="lead-stats"]')?.style.setProperty('display', 'none');
    const content = document.querySelector('main > div');
    if (content) content.style.maxWidth = '1680px';
    const portalHeader = [...document.querySelectorAll('header')].find(header =>
      header.querySelector('nav[aria-label="Portal"]')
    );
    if (portalHeader?.firstElementChild) portalHeader.firstElementChild.style.maxWidth = '1680px';
    if (portalHeader) {
      portalHeader.style.position = 'sticky';
      portalHeader.style.top = '0';
      portalHeader.style.zIndex = '100';
    }
    const queueSection = document.querySelector('section[aria-label="Ready to call"]');
    const readyHeading = queueSection?.querySelector('h2');
    if (readyHeading) {
      readyHeading.style.position = 'sticky';
      readyHeading.style.zIndex = '90';
      readyHeading.style.background = '#f8fafc';
      readyHeading.style.paddingTop = '4px';
      readyHeading.style.paddingBottom = '4px';
    }
    window.scrollTo(0, 0);
    const rows = [...document.querySelectorAll('section[aria-label="Ready to call"] > ul > li')];
    if (rows.length < 8 || !portalHeader || !readyHeading) return { ok: false };
    for (const row of rows) {
      row.style.paddingTop = '10px';
      row.style.paddingBottom = '10px';
      row.style.minHeight = '100px';
    }
    const tail = rows.slice(-8);
    const tailHeight = tail.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
    const headerHeight = portalHeader.getBoundingClientRect().height;
    const headingHeight = readyHeading.getBoundingClientRect().height;
    readyHeading.style.top = headerHeight + 'px';
    const targetTop = Math.max(headerHeight + headingHeight + 16, innerHeight - tailHeight - 24);
    const rowTopInDocument = tail[0].getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, rowTopInDocument - targetTop);
    const rowRects = tail.map(row => {
      const rect = row.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height };
    });
    return {
      ok: rowRects.length === 8 && rowRects.every(rect => rect.height > 0),
      totalCount: rows.length,
      visibleCount: rowRects.length,
      headingBottom: readyHeading.getBoundingClientRect().bottom,
      rows: rowRects,
    };
  })()`)
  if (!layout?.ok || layout.visibleCount < 6 || layout.rows[0].top < layout.headingBottom + 8 || layout.rows.at(-1).bottom > 888) {
    throw new Error('Eight complete queue rows do not fit beneath the visible headings; no capture was made.')
  }
  await pause(250)

  const finalBounds = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('section[aria-label="Ready to call"] > ul > li')].slice(-8);
    const readyHeading = document.querySelector('section[aria-label="Ready to call"] h2');
    const list = document.querySelector('section[aria-label="Ready to call"] > ul');
    const headingBottom = readyHeading?.getBoundingClientRect().bottom ?? 0;
    return {
      visibleCount: rows.length,
      complete: rows.length >= 6 && rows.every(row => {
        const rect = row.getBoundingClientRect();
        return rect.height > 0 && rect.top >= headingBottom + 8 && rect.bottom <= innerHeight - 12;
      }) && (list?.getBoundingClientRect().bottom ?? innerHeight) <= innerHeight - 8,
    };
  })()`)
  if (!finalBounds.complete) {
    throw new Error('The queue list edge was not fully visible; no capture was made.')
  }

  await fs.mkdir(captureDir, { recursive: true, mode: 0o700 })
  await fs.chmod(captureDir, 0o700)
  await fs.mkdir(path.dirname(publicImage), { recursive: true })

  // Keep the unredacted source solely in the ignored, private capture directory.
  const source = await capturePng()
  const sourcePath = path.join(captureDir, 'queue-source.png')
  await fs.writeFile(sourcePath, source, { mode: 0o600 })
  await fs.chmod(sourcePath, 0o600)

  const blurSummary = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('section[aria-label="Ready to call"] > ul > li')];
    let blurredIdentityFields = 0;
    let blurredCallerNames = 0;
    function makeBlurSpan() {
      const blur = document.createElement('span');
      blur.style.setProperty('filter', 'blur(6px)', 'important');
      blur.style.setProperty('background', 'transparent', 'important');
      blur.style.setProperty('color', 'inherit', 'important');
      return blur;
    }
    function blurAllText(element) {
      if (!element || !element.firstChild) return false;
      const range = document.createRange();
      range.selectNodeContents(element);
      range.surroundContents(makeBlurSpan());
      return true;
    }
    function blurCallerName(paragraph) {
      if (!paragraph) return false;
      const separator = paragraph.textContent.indexOf('·');
      if (separator <= 0 || paragraph.textContent.slice(0, separator).trim() === 'Team member') return false;
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let first = null;
      let endNode = null;
      let endOffset = 0;
      let consumed = 0;
      let node;
      while ((node = walker.nextNode())) {
        if (!first) first = node;
        if (consumed + node.data.length >= separator) {
          endNode = node;
          endOffset = separator - consumed;
          break;
        }
        consumed += node.data.length;
      }
      if (!first || !endNode || endOffset <= 0) return false;
      const range = document.createRange();
      range.setStart(first, 0);
      range.setEnd(endNode, endOffset);
      range.surroundContents(makeBlurSpan());
      return true;
    }
    for (const row of rows) {
      const identityCell = row.children[0];
      for (const element of [
        identityCell?.querySelector('a'),
        identityCell?.querySelector('p'),
      ]) {
        if (blurAllText(element)) blurredIdentityFields += 1;
      }
      if (blurCallerName(row.children[4]?.querySelectorAll('p')[1])) blurredCallerNames += 1;
    }
    return { blurredIdentityFields, blurredCallerNames };
  })()`)
  if (blurSummary.blurredIdentityFields < finalBounds.visibleCount * 2) {
    throw new Error('The individual personal-field blurs were incomplete; sanitized capture aborted.')
  }

  const sanitized = await capturePng()
  const hiddenSanitized = path.join(captureDir, 'queue-refined.png')
  await fs.writeFile(hiddenSanitized, sanitized, { mode: 0o600 })
  await fs.chmod(hiddenSanitized, 0o600)
  await fs.writeFile(publicImage, sanitized, { mode: 0o644 })
  await fs.chmod(publicImage, 0o644)

  const dimensions = {
    width: sanitized.readUInt32BE(16),
    height: sanitized.readUInt32BE(20),
  }
  console.log(JSON.stringify({
    dimensions,
    totalQueueRows: layout.totalCount,
    visibleRows: finalBounds.visibleCount,
    blurredIdentityFields: blurSummary.blurredIdentityFields,
    blurredCallerNames: blurSummary.blurredCallerNames,
    privateSource: path.relative(process.cwd(), sourcePath),
    privateSanitized: path.relative(process.cwd(), hiddenSanitized),
    publicSanitized: path.relative(process.cwd(), publicImage),
  }))
} finally {
  if (tab?.id) await fetch(`${cdp}/json/close/${tab.id}`).catch(() => {})
  if (launchedBrowser) {
    try {
      await Promise.race([send('Browser.close'), pause(1000)])
    } catch {}
    try {
      if (browser?.pid) process.kill(-browser.pid, 'SIGTERM')
    } catch {}
    await pause(500)
    try {
      if (browser?.pid) process.kill(-browser.pid, 'SIGKILL')
    } catch {}
    if (profileDir) await fs.rm(profileDir, { recursive: true, force: true })
  }
  ws?.close()
}