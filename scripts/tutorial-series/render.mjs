// Deterministic frames use the SAME pure, time-derived artwork as browser playback.
// Original uncompressed narration is muxed without modifying its speed.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';

const slug = process.argv[2];
if (!slug || !process.argv[3] || process.argv[3].startsWith('--')) {
  throw Error('Usage: node scripts/tutorial-series/render.mjs <artifact-slug> <output.mp4> [--verify-only] [--capture-dir <directory>]');
}
let verifyOnly = false, captureDir;
for (let i = 4; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--verify-only') verifyOnly = true;
  else if (arg === '--capture-dir') {
    captureDir = process.argv[++i];
    if (!captureDir || captureDir.startsWith('--')) throw Error('--capture-dir requires a directory');
  } else if (arg.startsWith('--capture-dir=')) {
    captureDir = arg.slice('--capture-dir='.length);
    if (!captureDir) throw Error('--capture-dir requires a directory');
  } else throw Error(`Unknown option: ${arg}`);
}
const output = path.resolve(process.argv[3]);
if (!/\.mp4$/i.test(output)) throw Error('Output must end in .mp4');
const report = output.replace(/\.mp4$/i, '.render.json');
const lesson = JSON.parse(await fs.readFile(`artifacts/${slug}/src/components/video/lesson.json`, 'utf8'));
const seconds = lesson.durationMs / 1000;
// Use the shared artifact proxy directly, not its public development wrapper.
// The public wrapper injects a development banner that must never enter an MP4.
const url = new URL(`http://127.0.0.1:80/${slug}/?frame=0`);
const scratch = captureDir ? path.resolve(captureDir) : await fs.mkdtemp(path.join(os.tmpdir(), 'pp-tutorial-'));
if (/[\r\n]/.test(scratch)) throw Error('Capture directory must not contain line breaks');
const evidence = path.resolve(`exports/verification/${slug}`);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(evidence, { recursive: true });
await fs.mkdir(scratch, { recursive: true });
for (const file of [output, report]) {
  try { await fs.access(file); throw Error(`Refusing to overwrite ${file}`); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}
const browserDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pp-tutorial-browser-'));
let chrome, socket, id = 0, fatal;
const requests = new Map();
const pause = ms => new Promise(r => setTimeout(r, ms));
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { requests.delete(key); reject(Error(`CDP timeout: ${method}`)); }, 30000);
    requests.set(key, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
}
async function evaluate(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const frameFile = i => path.join(scratch, `${String(i).padStart(6, '0')}.jpg`);
const concatFile = file => `file '${file.replaceAll("'", "'\\''")}'`;
async function hasFrame(file) {
  try {
    const bytes = await fs.readFile(file);
    return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
      bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}
async function captureSignature() {
  // Reuse only identical artwork, timing, audio, and renderer settings.
  const hash = createHash('sha256');
  async function add(file) {
    hash.update(file); hash.update('\0'); hash.update(await fs.readFile(file)); hash.update('\0');
  }
  async function tree(dir) {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await tree(file);
      else if (entry.isFile()) await add(file);
    }
  }
  await add('scripts/tutorial-series/render.mjs');
  await tree(`artifacts/${slug}/src`);
  await tree(`artifacts/${slug}/public/images`);
  await add(`artifacts/${slug}/public/audio/${lesson.audioFile ?? 'tutorial-mix.mp3'}`);
  return hash.digest('hex');
}
try {
  chrome = spawn('chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--disable-frame-rate-limit', '--disable-gpu-vsync',
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--remote-debugging-port=0', '--remote-allow-origins=*',
    `--user-data-dir=${browserDir}`, 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await fs.readFile(`${browserDir}/DevToolsActivePort`, 'utf8')).split('\n')[0]; break; } catch {}
    await pause(100);
  }
  if (!port) throw Error('Chromium failed to start');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await once(socket, 'open');
  socket.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (requests.has(m.id)) {
      const request = requests.get(m.id); requests.delete(m.id);
      m.error ? request.reject(Error(JSON.stringify(m.error))) : request.resolve(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') fatal = Error(JSON.stringify(m.params.exceptionDetails));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const msg = m.params.args.map(a => a.value || a.description).join(' ');
      if (!msg.includes('net::ERR')) fatal = Error(`Browser console: ${msg}`);
    }
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: url.href });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    ready = await evaluate("Boolean(window.__setTutorialTime && document.querySelector('.campaign-film'))");
    if (ready) break;
    if (fatal) throw fatal;
    await pause(200);
  }
  if (!ready) throw Error('Tutorial did not load');
  const bounds = await evaluate("(()=>{const r=document.querySelector('.campaign-film').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight}})()");
  if (bounds.top !== 0 || bounds.bottom > bounds.height + 1) throw Error(`Film not contained in viewport: ${JSON.stringify(bounds)}`);
  const images = (await fs.readdir(`artifacts/${slug}/public/images`)).filter(f => f.endsWith('.png'));
  await evaluate(`Promise.all([document.fonts.ready,...${JSON.stringify(images)}.map(f=>new Promise((ok,no)=>{const i=new Image();i.onload=ok;i.onerror=no;i.src=${JSON.stringify(new URL('images/', url).href)}+f}))]).then(()=>true)`);
  const audioSeconds = await evaluate("new Promise((resolve,reject)=>{const a=document.querySelector('audio');if(a.readyState>=1)resolve(a.duration);else{a.onloadedmetadata=()=>resolve(a.duration);a.onerror=()=>reject(Error('Audio failed'));}})");
  if (Math.abs(audioSeconds - seconds) > .15) throw Error(`Audio/timeline length mismatch ${audioSeconds} / ${seconds}`);

  // Dense during actual motion and character entry; lossless timed holds elsewhere.
  const samples = new Set([0]);
  const boundaries = new Set(), holds = [], motion = [];
  const rounded = t => Math.round(t * 1000000) / 1000000;
  const add = t => { if (t >= 0 && t < seconds) samples.add(rounded(t)); };
  const transition = t => { add(t); boundaries.add(rounded(t)); };
  const range = (from, to, fps) => {
    if (to < from) return;
    motion.push([from, to]);
    for (let i = 0; from + i / fps <= to; i++) add(from + i / fps);
    add(to);
  };
  for (const scene of lesson.scenes) {
    const start = scene.startMs / 1000, end = (scene.startMs + scene.durationMs) / 1000;
    const inScene = t => { if (t >= start && t < end) transition(t); };
    const actionTime = action => {
      const localMs = action.startMs ?? (650 + action.at * scene.voiceMs);
      if (!Number.isFinite(localMs) || localMs < 0) throw Error(`Invalid action timing: ${scene.key}/${action.target}`);
      return start + localMs / 1000;
    };
    if (verifyOnly) {
      add(start); add(start + scene.durationMs / 2000); add(end - .1);
      continue;
    }
    for (let t = start; t < end; t += 1) holds.push(t);
    range(start, Math.min(end - .000001, start + .55), 20);
    add(end - .1);
    if (scene.app === 'guide') for (let i = 0; i < scene.fields.length; i++) {
      // The guide reveal uses a strict ">" comparison in the artwork.
      inScene(start + .8 + i * 1.5);
    }
    const actions = scene.actions.map(action => ({ action, at: actionTime(action) }));
    for (const { action, at } of actions) {
      const click = at + (action.clickDelayMs ?? 1180) / 1000;
      // Once another action becomes active, the old cursor/pulse is no longer visible.
      const next = Math.min(end, ...actions.filter(other => other.at > at).map(other => other.at));
      range(at, Math.min(next - .000001, click + .8), 20);
      if (action.typing) {
        // Typed field contents can keep developing after focus moves elsewhere.
        const typingStart = click + .22;
        const typingEnd = Math.min(end - .000001, typingStart + (action.typingMs ?? action.result.length * 92) / 1000);
        range(typingStart, typingEnd, 12);
        if (typingEnd >= typingStart) inScene(typingEnd);
      }
      for (const offset of [0, .07, .12, .22, .62, 1.22, 7.82]) {
        inScene(click + offset);
      }
      inScene(at + 6);
    }
  }
  // Dense windows already cover these times; 1 fps is only needed for steady holds.
  for (const t of holds) if (!motion.some(([from, to]) => t >= from && t <= to)) add(t);
  const times = [...samples].sort((a,b) => a-b);
  if (captureDir) {
    const manifestFile = path.join(scratch, 'capture.json');
    const manifest = { signature: await captureSignature(), slug, verifyOnly, seconds, times };
    let previous;
    try { previous = JSON.parse(await fs.readFile(manifestFile, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(manifest)) {
        throw Error('Capture directory does not match current artwork, audio, timing or render settings. Use a new --capture-dir.');
      }
    } else {
      if ((await fs.readdir(scratch)).length) throw Error('Capture directory is not empty and has no capture.json. Use an empty --capture-dir.');
      await fs.writeFile(manifestFile, JSON.stringify(manifest));
    }
  }
  const concat = ['ffconcat version 1.0'];
  const layoutChecks = [];
  let captured = 0, reused = 0;
  console.log(`CAPTURE_START ${slug} ${seconds}s ${times.length} frames`);
  for (let i = 0; i < times.length; i++) {
    if (fatal) throw fatal;
    const time = times[i];
    const scene = [...lesson.scenes].reverse().find(s => time >= s.startMs / 1000);
    const local = time - scene.startMs / 1000;
    const checkLayout = verifyOnly || local < .001 || Math.abs(local - (scene.durationMs / 1000 - .1)) < .005;
    const file = frameFile(i);
    const cached = captureDir && await hasFrame(file);
    // Resolve strict ">" UI changes just after the exact output boundary, not a
    // full sample later. One microsecond also avoids floating-point typing floors.
    const artworkTime = boundaries.has(time)
      ? Math.min(time + .000001, (scene.startMs + scene.durationMs) / 1000 - .000001)
      : time;
    if (!cached || checkLayout) await evaluate(`window.__setTutorialTime(${artworkTime})`);
    if (!cached) {
      const image = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 94, captureBeyondViewport: false, optimizeForSpeed: true });
      await fs.writeFile(`${file}.tmp`, Buffer.from(image.data, 'base64'));
      await fs.rename(`${file}.tmp`, file);
      captured++;
    } else reused++;
    concat.push(concatFile(file), `duration ${((times[i+1] ?? seconds) - time).toFixed(6)}`);
    if (checkLayout) {
      const suffix = local < .001 ? 'start' : local < scene.durationMs / 1000 - .2 ? 'middle' : 'end';
      await fs.copyFile(file, path.join(evidence, `${String(lesson.scenes.indexOf(scene)+1).padStart(2,'0')}-${scene.key}-${suffix}.jpg`));
      const check = await evaluate(`({scene:window.__tutorialInfo.scene, controls:!!document.querySelector('select'), fields:[...document.querySelectorAll('.settings-fields>[data-target],.settings-fields>.field-row')].map(e=>({text:e.textContent,bottom:e.getBoundingClientRect().bottom})), shellBottom:document.querySelector('.screen-shell')?.getBoundingClientRect().bottom})`);
      if (check.controls) throw Error('Preview controls leaked into export');
      if (check.fields.some(f => f.bottom > check.shellBottom - 3)) throw Error(`Field cropped: ${JSON.stringify(check)}`);
      layoutChecks.push({time,...check});
    }
    if (i % 200 === 0) console.log(`CAPTURE ${i}/${times.length} ${(time/seconds*100).toFixed(0)}% ${scene.key}`);
  }
  console.log(`CAPTURE_COMPLETE ${captured} new / ${reused} reused`);
  concat.push(concatFile(frameFile(times.length - 1)));
  await fs.writeFile(`${scratch}/frames.txt`, concat.join('\n'));
  socket.close();
  const browserClosed = once(chrome, 'close');
  chrome.kill('SIGTERM');
  await browserClosed;
  if (verifyOnly) {
    await fs.writeFile(path.join(evidence,'chapter-checks.json'), JSON.stringify({seconds,audioSeconds,layoutChecks},null,2));
    console.log(`VERIFICATION_COMPLETE ${slug}: ${layoutChecks.length} frames, all chapters, audio duration matched.`);
  } else {
    console.log('ENCODING_START');
    const encoder = spawn('ffmpeg', ['-hide_banner','-loglevel','error','-n','-f','concat','-safe','0','-i',`${scratch}/frames.txt`,
      '-i',`artifacts/${slug}/public/audio/${lesson.audioFile ?? 'tutorial-mix.mp3'}`,'-map','0:v:0','-map','1:a:0','-t',String(seconds),
      '-vf','fps=30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-threads','4',
      '-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart','-metadata',`title=Patient Pipeline — ${lesson.title}`,output], {stdio:'inherit'});
    const [code] = await once(encoder,'close');
    if (code !== 0) throw Error(`ffmpeg exited ${code}`);
    await fs.writeFile(report,JSON.stringify({seconds,frames:times.length,captured,reused,width:1280,height:720,audioSeconds,layoutChecks,renderMethod:'Pure time-derived DOM frames; same artwork as preview; unmodified original narration speed.'},null,2), {flag:'wx'});
    console.log(`RENDER_COMPLETE ${output}`);
  }
  if (!captureDir) await fs.rm(scratch,{recursive:true,force:true,maxRetries:3,retryDelay:200});
  else console.log(`CAPTURES_RETAINED ${scratch}`);
} catch (e) { console.error(`RENDER_FAILED ${e.stack}\nTemporary evidence: ${scratch}`); process.exitCode=1; }
finally {
  socket?.close(); chrome?.kill('SIGTERM');
  await fs.rm(browserDir,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}