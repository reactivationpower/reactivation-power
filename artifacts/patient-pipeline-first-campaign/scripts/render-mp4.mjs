#!/usr/bin/env node
// Capture the real browser playback, then mux the existing mixed soundtrack.
// No app/player edits, simulated clocks, altered narration, or external services.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const timing = JSON.parse(await fs.readFile(path.join(root, 'src/components/video/narration-timing.json'), 'utf8'))
const duration = Object.values(timing).reduce((sum, scene) => sum + scene.durationMs, 0) / 1000
const url = process.env.VIDEO_RENDER_URL
if (!url) throw new Error('Set VIDEO_RENDER_URL to the running tutorial URL.')
const output = path.resolve(process.argv[2] || 'exports/Patient-Pipeline-Setting-Up-Your-Campaign.mp4')
await fs.mkdir(path.dirname(output), { recursive: true })
try { await fs.access(output); throw new Error(`Refusing to overwrite ${output}`) }
catch (error) { if (error.code !== 'ENOENT') throw error }
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'campaign-mp4-'))
const profile = path.join(scratch, 'browser')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const frames = []
const samples = []
const pendingWrites = new Set()
let socket, chrome, armed = false, startedAt, endedAt, fatal, watchdog
let counter = 0
const pending = new Map()
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++counter
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 20000)
    pending.set(id, {
      resolve: value => { clearTimeout(timeout); resolve(value) },
      reject: error => { clearTimeout(timeout); reject(error) },
    })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}

try {
  console.log(`Preparing ${duration.toFixed(1)}s, 1280×720 MP4; temporary frames: ${scratch}`)
  chrome = spawn(process.env.CHROMIUM_PATH || 'chromium', [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--remote-debugging-port=0',
    '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' })
  chrome.on('error', error => { fatal = error })
  let port
  for (let i = 0; i < 100; i++) {
    try { port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch {}
    if (fatal) throw fatal
    await wait(100)
  }
  if (!port) throw new Error('Chromium did not start.')
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
  await once(socket, 'open')
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (pending.has(message.id)) {
      const promise = pending.get(message.id)
      pending.delete(message.id)
      message.error ? promise.reject(new Error(JSON.stringify(message.error))) : promise.resolve(message.result)
      return
    }
    if (message.method === 'Runtime.exceptionThrown') {
      fatal = new Error(`Browser exception: ${JSON.stringify(message.params.exceptionDetails)}`)
    }
    if (message.method === 'Runtime.bindingCalled' && armed) {
      const signal = JSON.parse(message.params.payload)
      if (signal.type === 'start') {
        if (startedAt && signal.time - startedAt > 0.3) fatal = new Error('Video remounted during recording.')
        startedAt = signal.time
        console.log('CAPTURE_STARTED')
      }
      if (signal.type === 'stop' && !endedAt) {
        endedAt = signal.time
        console.log(`Playback completed in ${(endedAt - startedAt).toFixed(3)}s.`)
      }
    }
    if (message.method === 'Page.screencastFrame') {
      const { data, metadata, sessionId } = message.params
      send('Page.screencastFrameAck', { sessionId }).catch(error => { fatal = error })
      if (!startedAt || endedAt || metadata.timestamp < startedAt) return
      const file = path.join(scratch, `frame-${String(frames.length).padStart(6, '0')}.jpg`)
      frames.push({ file, time: metadata.timestamp - startedAt })
      const write = fs.writeFile(file, Buffer.from(data, 'base64'))
      pendingWrites.add(write)
      write.catch(error => { fatal = error }).finally(() => pendingWrites.delete(write))
    }
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Runtime.addBinding', { name: '__mp4Signal' })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.startRecording = () => window.__mp4Signal(JSON.stringify({type:'start',time:Date.now()/1000}));
    window.stopRecording = () => window.__mp4Signal(JSON.stringify({type:'stop',time:Date.now()/1000}));
  ` })
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url })
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (await evaluate("Boolean(document.querySelector('.campaign-film') && document.querySelector('audio')?.readyState >= 3)")) { ready = true; break }
    if (fatal) throw fatal
    await wait(200)
  }
  if (!ready) throw new Error('Tutorial or audio failed to load.')
  const imagePaths = (await fs.readdir(path.join(root, 'public/images')))
    .filter(file => /\.(png|jpe?g|webp|svg)$/i.test(file))
    .map(file => new URL(`images/${file}`, url).href)
  await evaluate(`Promise.all([
    document.fonts.ready,
    fetch(document.querySelector('audio').currentSrc).then(r=>{if(!r.ok)throw Error('Soundtrack unavailable');return r.arrayBuffer()}),
    ...${JSON.stringify(imagePaths)}.map(src=>new Promise((resolve,reject)=>{
      const img=new Image();img.onload=resolve;img.onerror=()=>reject(Error('Image failed: '+src));img.src=src;
    }))
  ]).then(()=>true)`)
  console.log('Fonts, all screenshots, and full soundtrack preloaded.')
  await send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 1280, maxHeight: 720, everyNthFrame: 2 })
  armed = true
  await send('Page.reload', { ignoreCache: false })
  const deadline = Date.now() + (duration + 35) * 1000
  let lastReport = -30
  while (!endedAt) {
    if (fatal) throw fatal
    if (Date.now() > deadline) throw new Error('Playback did not signal completion in time.')
    await wait(500)
    if (startedAt && Date.now() / 1000 - startedAt >= lastReport + 30) {
      const elapsed = Date.now() / 1000 - startedAt
      const sample = await evaluate(`({
        chapter:document.querySelector('.film-kicker')?.textContent,
        audioTime:document.querySelector('audio')?.currentTime,
        audioReady:document.querySelector('audio')?.readyState,
        paused:document.querySelector('audio')?.paused,
        controls:!!document.querySelector('button[aria-label^="Jump to scene"]')
      })`)
      samples.push({ elapsed, ...sample })
      if (sample.controls) throw new Error('Preview controls are visible in export.')
      if (elapsed > 3 && (sample.paused || Math.abs(sample.audioTime - elapsed) > 2)) {
        throw new Error(`Soundtrack stopped or drifted: ${JSON.stringify(sample)}, elapsed=${elapsed}`)
      }
      console.log(`CAPTURE ${Math.min(100, elapsed / duration * 100).toFixed(0)}% | ${sample.chapter} | ${frames.length} frames`)
      lastReport = elapsed
    }
  }
  await send('Page.stopScreencast')
  await Promise.all(pendingWrites)
  if (fatal) throw fatal
  socket.close()
  chrome.kill('SIGTERM')
  if (Math.abs(endedAt - startedAt - duration) > 2) throw new Error('Playback length drifted from soundtrack.')
  const usable = frames.filter(frame => frame.time < duration)
  if (usable.length < 500 || usable[0].time > 1) throw new Error('Incomplete browser capture.')
  const concat = ['ffconcat version 1.0']
  for (let i = 0; i < usable.length; i++) {
    const start = i === 0 ? 0 : usable[i].time
    const end = usable[i + 1]?.time ?? duration
    if (end <= start) continue
    concat.push(`file '${usable[i].file}'`, `duration ${(end - start).toFixed(6)}`)
  }
  concat.push(`file '${usable.at(-1).file}'`)
  const manifest = path.join(scratch, 'frames.ffconcat')
  await fs.writeFile(manifest, concat.join('\n') + '\n')
  const audio = path.join(root, 'public/audio/composite_conversation_v1.mp3')
  const metadataPath = output.replace(/\.mp4$/i, '.render.json')
  await fs.writeFile(metadataPath, JSON.stringify({
    duration, width: 1280, height: 720, frames: usable.length,
    firstFrameTime: usable[0].time, lastFrameTime: usable.at(-1).time,
    playbackDuration: endedAt - startedAt, samples,
  }, null, 2) + '\n')
  console.log(`ENCODING_STARTED: ${usable.length} captured frames; original narration/music mix.`)
  const encoder = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'warning', '-n',
    '-f', 'concat', '-safe', '0', '-i', manifest, '-i', audio,
    '-map', '0:v:0', '-map', '1:a:0', '-t', String(duration),
    '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-threads', '4', '-c:a', 'aac', '-b:a', '192k',
    '-ar', '48000', '-movflags', '+faststart',
    '-metadata', 'title=Patient Pipeline — Setting Up Your Campaign',
    '-progress', 'pipe:1', '-stats_period', '15', output,
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  encoder.stdout.on('data', data => {
    for (const match of data.toString().matchAll(/out_time_us=(\d+)/g)) {
      console.log(`ENCODING ${(Number(match[1]) / 1e6 / duration * 100).toFixed(0)}%`)
    }
  })
  encoder.stderr.on('data', data => process.stderr.write(data))
  const [code] = await once(encoder, 'close')
  if (code !== 0) throw new Error(`ffmpeg exited with ${code}; frames retained in ${scratch}`)
  console.log(`RENDER_COMPLETE ${output} (${(await fs.stat(output)).size} bytes)`)
  await fs.rm(scratch, { recursive: true, force: true })
} catch (error) {
  console.error(`RENDER_FAILED: ${error.stack || error}. Frames retained at ${scratch}`)
  process.exitCode = 1
} finally {
  clearTimeout(watchdog)
  socket?.close()
  chrome?.kill('SIGTERM')
}