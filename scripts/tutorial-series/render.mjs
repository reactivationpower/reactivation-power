// Deterministic frames use the SAME pure, time-derived artwork as browser playback.
// Original uncompressed narration is muxed without modifying its speed.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const slug = process.argv[2];
const verifyOnly = process.argv.includes('--verify-only');
const output = path.resolve(process.argv[3]);
const lesson = JSON.parse(await fs.readFile(`artifacts/${slug}/src/components/video/lesson.json`, 'utf8'));
const seconds = lesson.durationMs / 1000;
// Use the shared artifact proxy directly, not its public development wrapper.
// The public wrapper injects a development banner that must never enter an MP4.
const url = new URL(`http://127.0.0.1:80/${slug}/?frame=0`);
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'pp-tutorial-'));
const evidence = path.resolve(`exports/verification/${slug}`);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(evidence, { recursive: true });
try { await fs.access(output); throw Error(`Refusing to overwrite ${output}`); }
catch (e) { if (e.code !== 'ENOENT') throw e; }
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
try {
  chrome = spawn('chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--remote-debugging-port=0', '--remote-allow-origins=*',
    `--user-data-dir=${scratch}/browser`, 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await fs.readFile(`${scratch}/browser/DevToolsActivePort`, 'utf8')).split('\n')[0]; break; } catch {}
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
  const add = t => { if (t >= 0 && t < seconds) samples.add(Math.round(t * 1000000) / 1000000); };
  const range = (from, to, fps) => { for (let t = from; t <= to; t += 1 / fps) add(t); };
  for (const scene of lesson.scenes) {
    const start = scene.startMs / 1000, end = (scene.startMs + scene.durationMs) / 1000;
    if (verifyOnly) {
      add(start); add(start + scene.durationMs / 2000); add(end - .1);
      continue;
    }
    range(start, end - .02, 1);
    range(start, start + .65, 15);
    add(end - .1);
    if (scene.app === 'guide') for (let i = 0; i < scene.fields.length; i++) add(start + .8 + i * 1.5);
    for (const action of scene.actions) {
      const at = start + .65 + action.at * scene.voiceMs / 1000;
      range(at, Math.min(end - .01, at + 2.6), 20);
      if (action.typing) range(at + 1.4, Math.min(end - .01, at + 1.5 + action.result.length * .092), 12);
      add(at + 6.01); add(at + 9.01);
    }
  }
  const times = [...samples].sort((a,b) => a-b);
  const concat = ['ffconcat version 1.0'];
  const layoutChecks = [];
  console.log(`CAPTURE_START ${slug} ${seconds}s ${times.length} frames`);
  for (let i = 0; i < times.length; i++) {
    if (fatal) throw fatal;
    const time = times[i];
    await evaluate(`window.__setTutorialTime(${time})`);
    const image = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 94, captureBeyondViewport: false });
    const file = path.join(scratch, `${String(i).padStart(6, '0')}.jpg`);
    await fs.writeFile(file, Buffer.from(image.data, 'base64'));
    concat.push(`file '${file}'`, `duration ${((times[i+1] ?? seconds) - time).toFixed(6)}`);
    const scene = [...lesson.scenes].reverse().find(s => time >= s.startMs / 1000);
    const local = time - scene.startMs / 1000;
    if (verifyOnly || local < .001 || Math.abs(local - (scene.durationMs / 1000 - .1)) < .005) {
      const suffix = local < .001 ? 'start' : local < scene.durationMs / 1000 - .2 ? 'middle' : 'end';
      await fs.copyFile(file, path.join(evidence, `${String(lesson.scenes.indexOf(scene)+1).padStart(2,'0')}-${scene.key}-${suffix}.jpg`));
      const check = await evaluate(`({scene:window.__tutorialInfo.scene, controls:!!document.querySelector('select'), fields:[...document.querySelectorAll('.settings-fields>[data-target],.settings-fields>.field-row')].map(e=>({text:e.textContent,bottom:e.getBoundingClientRect().bottom})), shellBottom:document.querySelector('.screen-shell')?.getBoundingClientRect().bottom})`);
      if (check.controls) throw Error('Preview controls leaked into export');
      if (check.fields.some(f => f.bottom > check.shellBottom - 3)) throw Error(`Field cropped: ${JSON.stringify(check)}`);
      layoutChecks.push({time,...check});
    }
    if (i % 200 === 0) console.log(`CAPTURE ${i}/${times.length} ${(time/seconds*100).toFixed(0)}% ${scene.key}`);
  }
  concat.push(`file '${path.join(scratch, `${String(times.length-1).padStart(6, '0')}.jpg`)}'`);
  await fs.writeFile(`${scratch}/frames.txt`, concat.join('\n'));
  socket.close();
  const browserClosed = once(chrome, 'close');
  chrome.kill('SIGTERM');
  await browserClosed;
  if (verifyOnly) {
    await fs.writeFile(path.join(evidence,'chapter-checks.json'), JSON.stringify({seconds,audioSeconds,layoutChecks},null,2));
    console.log(`VERIFICATION_COMPLETE ${slug}: ${layoutChecks.length} frames, all chapters, audio duration matched.`);
    await fs.rm(scratch,{recursive:true,force:true,maxRetries:3,retryDelay:200});
    process.exit(0);
  }
  console.log('ENCODING_START');
  const encoder = spawn('ffmpeg', ['-hide_banner','-loglevel','error','-n','-f','concat','-safe','0','-i',`${scratch}/frames.txt`,
    '-i',`artifacts/${slug}/public/audio/tutorial-mix.mp3`,'-map','0:v:0','-map','1:a:0','-t',String(seconds),
    '-vf','fps=30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-threads','4',
    '-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart','-metadata',`title=Patient Pipeline — ${lesson.title}`,output], {stdio:'inherit'});
  const [code] = await once(encoder,'close');
  if (code !== 0) throw Error(`ffmpeg exited ${code}`);
  await fs.writeFile(output.replace('.mp4','.render.json'),JSON.stringify({seconds,frames:times.length,width:1280,height:720,audioSeconds,layoutChecks,renderMethod:'Pure time-derived DOM frames; same artwork as preview; unmodified original narration speed.'},null,2));
  console.log(`RENDER_COMPLETE ${output}`);
  await fs.rm(scratch,{recursive:true,force:true,maxRetries:3,retryDelay:200});
} catch (e) { console.error(`RENDER_FAILED ${e.stack}\nTemporary evidence: ${scratch}`); process.exitCode=1; }
finally {socket?.close();chrome?.kill('SIGTERM');}