#!/usr/bin/env node
// Authentic 1280×720 captures from the authenticated, seeded chiro demo.
// CDP uses an isolated tab in the already-running Chrome; no demo records are written.
// Run with DEMO_PASSWORD in the environment: node scripts/capture-demo.mjs
import fs from 'node:fs/promises'

const origin = process.env.CAPTURE_ORIGIN || 'http://127.0.0.1'
const output = new URL('../public/images/', import.meta.url)
const tab = await (await fetch('http://127.0.0.1:9229/json/new?' + encodeURIComponent(origin + '/demo'), { method: 'PUT' })).json()
const ws = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let seq = 0
const awaiting = new Map()
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data)
  if (msg.id && awaiting.has(msg.id)) {
    const { resolve, reject } = awaiting.get(msg.id)
    awaiting.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  }
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq
    awaiting.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
  return r.result.value
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitText(text, ms = 17000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (await evalJs(`document.body?.innerText.includes(${JSON.stringify(text)})`)) return
    await pause(250)
  }
  throw Error(`Timed out waiting for text: ${text}; page: ${await evalJs('document.body.innerText.slice(0,500)')}`)
}
async function goto(path, text) {
  await send('Page.navigate', { url: origin + path })
  // A same-URL reload can briefly show the prior React state. Do not match
  // its text before the new document has replaced it.
  await pause(900)
  if (text) await waitText(text)
  await pause(800)
}
async function clickText(text, tag = '*', nth = 0) {
  const clicked = await evalJs(`(() => {
    const elements = [...document.querySelectorAll(${JSON.stringify(tag)})]
      .filter(el => el.textContent.trim() === ${JSON.stringify(text)} && el.getBoundingClientRect().width > 0);
    if (!elements[${nth}]) return false;
    elements[${nth}].click(); return true;
  })()`)
  if (!clicked) throw Error(`Can't click ${text} (${tag}); visible: ${await evalJs('document.body.innerText.slice(0,800)')}`)
  await pause(650)
}
async function choice(needle) {
  const clicked = await evalJs(`(() => {
    const button = [...document.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(needle)}) && x.getBoundingClientRect().width);
    if (!button) return false;
    button.click(); return true;
  })()`)
  if (!clicked) throw Error('Choice unavailable: ' + needle)
  await pause(700)
}
async function screenshot(name) {
  // Stage fictional demo identifiers in the browser's DOM for this film only.
  // Do not change any database row or screenshot UI branding.
  await evalJs(`(() => {
    const name = ${JSON.stringify(name)};
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    let stagedPhone = 0;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('script,style')) continue;
      node.textContent = node.textContent
        .replace(/\\(?(?:202|303|719|720|970)\\)?[ -]555-1\\d{3}/g, () => '(202) 555-01' + String(stagedPhone++ % 100).padStart(2,'0'))
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g, 'demo@example.com');
      if (name === 'queue' || name.startsWith('live-') || name === 'fine-choice' || name === 'fine-result') {
        node.textContent = node.textContent.replaceAll('Cynthia Pham','Bill Carter').replaceAll('Cynthia','Bill');
        if (name === 'queue') node.textContent = node.textContent.replaceAll('Jason Radcliffe','Ann Smith');
      }
    }
    document.querySelector('footer')?.style.setProperty('visibility','hidden');
  })()`)
  await pause(450)
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true })
  await fs.writeFile(new URL(`rev-${name}.png`, output), Buffer.from(r.data, 'base64'))
  console.log('Captured rev-' + name)
}
async function inspect(heading) {
  console.log('\n' + heading + '\n' + await evalJs(`document.body.innerText.slice(0,4200)`))
  console.log('Actions:', await evalJs(`JSON.stringify([...document.querySelectorAll('button,a,[role=button],input')].filter(x=>x.getBoundingClientRect().width>0).map(x=>({text:x.innerText?.trim().slice(0,75),href:x.getAttribute('href'),type:x.getAttribute('type')})).filter(x=>x.text||x.type).slice(0,55))`))
}
try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
  await waitText('Demo password')
  if (!process.env.DEMO_PASSWORD) throw Error('DEMO_PASSWORD is required; no credentials printed')
  await evalJs(`(() => {
    const input = document.querySelector('#demo-password');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    setter.call(input, ${JSON.stringify(process.env.DEMO_PASSWORD)});
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('form').requestSubmit();
  })()`)
  await waitText('Contacts', 40000)
  await goto('/portal/contacts', 'Upload Contacts')
  console.log('Logo asset:', await evalJs(`document.querySelector('header img')?.getAttribute('src')`))
  if (await evalJs(`document.querySelector('header img')?.getAttribute('src')`) !== '/images/patient-pipeline-logo.png') throw Error('App branding not updated yet; aborting capture')
  await screenshot('contacts')
  await clickText('Upload Contacts', 'button')
  await evalJs(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const hide = document.createElement('style');
    hide.textContent = '[role="dialog"] .border-accent\\\\/40, [role="dialog"] a[download] {display:none!important}';
    document.head.append(hide);
    dialog.querySelector('details').open = true;
    [...dialog.querySelectorAll('p')].find(x => x.textContent.includes('Not sure how to format'))?.parentElement?.style.setProperty('display','none');
    dialog.querySelector('#csv-paste')?.parentElement?.style.setProperty('display','none');
    dialog.scrollTop = 0;
  })()`)
  await screenshot('upload-dialog')
  await goto('/portal/contacts', 'Upload Contacts')
  await clickText('Upload Contacts', 'button')
  // Use a fictional file with reserved numbers. Selecting it triggers the app's
  // real CSV parser and genuine match-columns preview; no import is submitted.
  await evalJs(`(() => {
    const csv = 'Name,Phone,Niche,Service\\nBill Carter,(202) 555-0100,Chiropractic,Chiropractic\\nAnn Smith,(202) 555-0101,Decompression,Decompression';
    const file = new File([csv], 'ridgeline-patient-export.csv', {type:'text/csv'});
    const input = document.querySelector('input[type=file]');
    const transfer = new DataTransfer();
    transfer.items.add(file); input.files = transfer.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`)
  await waitText('Match')
  await screenshot('upload-preview')
  await goto('/portal/training', 'Training Portal')
  await screenshot('training')
  await evalJs(`document.body.style.zoom='0.8'`)
  await screenshot('training-practice')
  await goto('/portal/dialer/script?from=training', 'Practice')
  await screenshot('practice-open')
  await clickText('Patient is on the line: continue', 'button')
  await screenshot('practice-question')
  await goto('/portal/dialer', 'Calls Due')
  await evalJs(`document.body.style.zoom='0.8'`)
  await screenshot('queue')
  const callHref = await evalJs(`document.querySelector('a[data-testid^="button-start-call"], a[href*="/dialer/call/"]')?.getAttribute('href')`)
  if (!callHref) throw Error('No Start Call link in queue')
  await goto(callHref, 'The Open')
  await screenshot('live-open')
  await inspect('Live open')
  await clickText('Patient is on the line: continue', 'button')
  await screenshot('live-question')
  await choice('Still feeling great')
  await screenshot('live-still-good')
  await inspect('Still feeling great')
  await goto(callHref, 'The Open')
  await choice('Patient is on the line: continue')
  await choice('Pretty much back to where I was')
  await screenshot('live-back-result')
  await goto(callHref, 'The Open')
  await choice('Patient is on the line: continue')
  await choice('Still feeling great')
  await choice('They confirmed it still feels good')
  await choice('Yes, that’s okay')
  await choice('Nothing is bothering them')
  await screenshot('fine-choice')
  await inspect('Fine choice')
  await choice('I was feeling fine')
  await screenshot('fine-result')
  await goto('/portal/campaigns', 'Campaigns')
  await evalJs(`(() => {
    const style = document.createElement('style');
    style.textContent = 'a[data-testid^="card-campaign"] h2.truncate{white-space:normal!important;overflow:visible!important;text-overflow:unset!important;font-size:16px!important;line-height:1.25!important}';
    document.head.append(style);
  })()`)
  await screenshot('campaigns-source')
  await goto('/portal/leads', 'Call Now')
  await screenshot('lead-queue')
  const leadHref = await evalJs(`document.querySelector('a[href$="/call"][href*="/leads/"]')?.getAttribute('href')`)
  if (!leadHref) throw Error('No lead Call Now link in queue')
  await goto(leadHref, 'Text size')
  // Browser zoom and wider responsive layout are authentic UI framing, not an
  // image composite; keep the actual script and response buttons in 16:9.
  await evalJs(`(() => {
    document.body.style.zoom='0.9';
    document.querySelector('main .max-w-4xl')?.style.setProperty('max-width','1200px');
  })()`)
  await screenshot('lead-open')
  await screenshot('lead-choice')
  await choice('Needs a different time')
  await screenshot('lead-move-time')
  await evalJs(`(() => {
    const button = [...document.querySelectorAll('button')].find(x=>x.textContent.includes('Not sure they want to come in'));
    button.scrollIntoView({block:'center'});
  })()`)
  await pause(300)
  console.log('Lead second choice position:', await evalJs(`(() => { const r=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Not sure they want to come in')).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`))
  await screenshot('lead-move-choice')
  await choice('Not sure they want to come in')
  await evalJs(`window.scrollTo(0,0)`)
  await screenshot('lead-not-sure')
  await evalJs(`(() => {
    const outcome = [...document.querySelectorAll('*')].find(x => x.textContent.trim() === 'What happened on this call?');
    outcome?.scrollIntoView({block:'center'});
  })()`)
  await pause(300)
  await screenshot('lead-outcome')
  await inspect('Lead different time')
} finally {
  ws.close()
  await fetch(`http://127.0.0.1:9229/json/close/${tab.id}`)
}