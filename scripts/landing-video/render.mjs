#!/usr/bin/env node
// Capture the landing film's real Chromium playback, verify representative
// frames, and mux the original composite soundtrack into an MP4.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const artifactRoot = path.join(workspaceRoot, 'artifacts/patient-pipeline-landing-video')
const videoSource = path.join(artifactRoot, 'src/components/video/VideoTemplate.tsx')
const audioPath = path.join(artifactRoot, 'public/audio/landing-composite-niches-faster.mp3')
const captureRoot = path.join(workspaceRoot, 'exports/.landing-capture')
const defaultOutput = path.join(workspaceRoot, 'exports/Patient-Pipeline-Landing-Video.mp4')
const pacingSource = await fs.readFile(path.join(artifactRoot, 'src/components/video/pacing.ts'), 'utf8')
const narrationTempo = Number(pacingSource.match(/NARRATION_TEMPO\s*=\s*([\d.]+)/)?.[1])
if (!Number.isFinite(narrationTempo) || narrationTempo <= 0) throw new Error('Invalid narration tempo.')
const width = 1280
const height = 720

function parseArguments(argv) {
  let outputPath
  let verifyOnly = false
  let durationOverride = null

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--verify-only') {
      verifyOnly = true
    } else if (arg === '--duration') {
      const value = Number(argv[index + 1])
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('--duration requires a positive number of seconds.')
      }
      durationOverride = value
      index += 1
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`)
    } else if (!outputPath) {
      outputPath = path.resolve(arg)
    } else {
      throw new Error('Only one output MP4 path may be provided.')
    }
  }

  return {
    outputPath: outputPath || defaultOutput,
    verifyOnly,
    durationOverride,
  }
}

function readSceneDurations(source) {
  const match = source.match(/export\s+const\s+SCENE_DURATIONS\s*=\s*\{([\s\S]*?)\}/)
  if (!match) throw new Error(`Could not find SCENE_DURATIONS in ${videoSource}`)

  const body = match[1].replace(/\/\/.*$/gm, '')
  const entries = [...body.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(\d+)\s*,?/g)]
  const remainder = body
    .replace(/([A-Za-z_$][\w$]*)\s*:\s*(\d+)\s*,?/g, '')
    .replace(/[\s,]/g, '')
  if (!entries.length || remainder) {
    throw new Error('SCENE_DURATIONS is not a plain static object of integer millisecond values.')
  }

  const durations = Object.fromEntries(entries.map(([, key, value]) => [key, Number(value)]))
  if (Object.values(durations).some(value => !Number.isSafeInteger(value) || value <= 0)) {
    throw new Error('SCENE_DURATIONS contains an invalid scene duration.')
  }
  return durations
}

function buildMilestones(durations, duration) {
  const sceneKeys = Object.keys(durations)
  const sceneStarts = {}
  let cursor = 0
  for (const [key, milliseconds] of Object.entries(durations)) {
    sceneStarts[key] = cursor / 1000
    cursor += milliseconds
  }

  const representativeOffsets = {
    opportunity: 19.5,
    introduction: 12.4,
    reactivation: 10.9,
    lead: 14.4,
    workflow: 12.2,
    revenue: 24.2,
    invitation: 15.3,
  }
  const milestones = []
  const add = (label, scene, offset, cue) => {
    const targetTime = (sceneStarts[scene] ?? 0) + offset
    if (targetTime < duration) milestones.push({ label, scene, cue, targetTime })
  }

  if (sceneKeys.includes('opportunity')) add('early-opening', 'opportunity', 1.5, 'opening')
  for (const scene of sceneKeys) {
    const sceneDuration = durations[scene] / 1000
    const representative = Math.min(
      representativeOffsets[scene] === undefined ? sceneDuration * 0.6 : representativeOffsets[scene] / narrationTempo,
      Math.max(0.25, sceneDuration - 0.5),
    )
    add(`${scene}-representative`, scene, representative, 'scene representative')
    add(`${scene}-end`, scene, Math.max(0.1, sceneDuration - 0.35), 'scene end')
  }
  if (sceneKeys.includes('reactivation')) {
    add('reactivation-starting-screen', 'reactivation', 3.8 / narrationTempo, 'opening script')
    add('reactivation-cursor', 'reactivation', 9.6 / narrationTempo, 'cursor')
  }
  if (sceneKeys.includes('lead')) add('lead-cursor', 'lead', 13.1 / narrationTempo, 'cursor')
  if (sceneKeys.includes('workflow')) {
    add('workflow-queue', 'workflow', 4.5 / narrationTempo, 'queue')
    add('workflow-cursor-note', 'workflow', 8.8 / narrationTempo, 'cursor')
    add('workflow-partial-note', 'workflow', 10.2 / narrationTempo, 'typing')
    add('workflow-typed-note', 'workflow', 12.2 / narrationTempo, 'typing')
  }
  if (sceneKeys.includes('revenue')) {
    add('revenue-financial-peak', 'revenue', 24.2 / narrationTempo, 'financial peak')
    add('revenue-qualified-close', 'revenue', 31.2 / narrationTempo, 'financial close')
  }
  if (sceneKeys.includes('invitation')) add('invitation-call-to-action', 'invitation', 15.3 / narrationTempo, 'call to action')

  milestones.sort((left, right) => left.targetTime - right.targetTime || left.label.localeCompare(right.label))
  return { milestones, sceneStarts }
}

function relativePath(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join('/')
}

function escapeConcatPath(filePath) {
  return filePath.replaceAll('\\', '\\\\').replaceAll("'", "'\\''")
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

const { outputPath, verifyOnly, durationOverride } = parseArguments(process.argv)
const renderUrl = process.env.VIDEO_RENDER_URL
if (!renderUrl) throw new Error('Set VIDEO_RENDER_URL to the running landing-video artifact URL.')
let parsedRenderUrl
try {
  parsedRenderUrl = new URL(renderUrl)
} catch {
  throw new Error('VIDEO_RENDER_URL must be an absolute HTTP(S) URL.')
}
if (!['http:', 'https:'].includes(parsedRenderUrl.protocol)) {
  throw new Error('VIDEO_RENDER_URL must use HTTP or HTTPS.')
}

const source = await fs.readFile(videoSource, 'utf8')
const sceneDurations = readSceneDurations(source)
const canonicalDuration = Object.values(sceneDurations).reduce((sum, milliseconds) => sum + milliseconds, 0) / 1000
const duration = durationOverride ?? canonicalDuration
const stopAtPlayerSignal = durationOverride === null || Math.abs(duration - canonicalDuration) < 0.01
const { milestones, sceneStarts } = buildMilestones(sceneDurations, duration)
if (!milestones.length) throw new Error('No representative-frame milestones fit within the requested duration.')
if (!verifyOnly && !/\.mp4$/i.test(outputPath)) throw new Error('The output path must end in .mp4.')
if (!verifyOnly && await exists(outputPath)) {
  throw new Error(`Refusing to overwrite existing output MP4: ${outputPath}`)
}
if (!verifyOnly) await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.access(audioPath)

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const runDirectory = path.join(captureRoot, `${stamp}-${process.pid}`)
const frameDirectory = path.join(runDirectory, 'frames')
const representativeDirectory = path.join(runDirectory, 'representative')
const profileDirectory = path.join(runDirectory, 'chromium-profile')
const journalPath = path.join(runDirectory, 'frames.jsonl')
const contactSheetPath = path.join(runDirectory, 'contact-sheet.jpg')
await fs.mkdir(frameDirectory, { recursive: true })
await fs.mkdir(representativeDirectory, { recursive: true })

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const frames = []
const representativeFrames = []
const audioSamples = []
const pendingWrites = new Set()
const milestoneTaken = new Set()
let socket
let chrome
let journal
let armed = false
let closingBrowser = false
let startedAt = null
let endedAt = null
let fatal = null
let frameIndex = 0
let messageCounter = 0
let lastScene = null
let lastBrowserState = null
let lastAudioSampleAt = -Infinity
let previousAudioSample = null
const pendingMessages = new Map()

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++messageCounter
    const timeout = setTimeout(() => {
      pendingMessages.delete(id)
      reject(new Error(`CDP request timed out after 30 seconds: ${method}`))
    }, 30000)
    pendingMessages.set(id, {
      resolve: value => {
        clearTimeout(timeout)
        resolve(value)
      },
      reject: error => {
        clearTimeout(timeout)
        reject(error)
      },
    })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })
  if (response.exceptionDetails) {
    throw new Error(`Browser evaluation failed: ${JSON.stringify(response.exceptionDetails)}`)
  }
  return response.result?.value
}

function trackWrite(promise) {
  pendingWrites.add(promise)
  promise.then(
    () => pendingWrites.delete(promise),
    error => {
      fatal ||= error
      pendingWrites.delete(promise)
    },
  )
}

function scheduleRepresentative(milestone, jpeg, elapsed, index) {
  const filename = `${String(index).padStart(2, '0')}-${milestone.label}.jpg`
  const filePath = path.join(representativeDirectory, filename)
  trackWrite(fs.writeFile(filePath, jpeg))
  representativeFrames.push({
    label: milestone.label,
    cue: milestone.cue,
    expectedScene: milestone.scene,
    observedScene: lastScene,
    observedCues: lastBrowserState ? {
      cursorVisible: lastBrowserState.cursorVisible,
      typedNoteText: lastBrowserState.typedNoteText,
      financialPeak: lastBrowserState.financialPeak,
    } : null,
    targetElapsed: milestone.targetTime,
    actualElapsed: elapsed,
    path: relativePath(filePath),
  })
}

function handleScreencastFrame(message) {
  const { data, metadata, sessionId } = message.params
  send('Page.screencastFrameAck', { sessionId }).catch(error => { fatal ||= error })
  if (!startedAt || (endedAt && stopAtPlayerSignal && metadata.timestamp > endedAt)) return

  const elapsed = metadata.timestamp - startedAt
  if (elapsed < 0 || elapsed > duration + 0.5) return
  const jpeg = Buffer.from(data, 'base64')
  if (!verifyOnly) {
    const filePath = path.join(frameDirectory, `frame-${String(frameIndex).padStart(6, '0')}.jpg`)
    const record = { index: frameIndex, elapsed, path: path.relative(runDirectory, filePath).split(path.sep).join('/') }
    frames.push(record)
    journal.write(`${JSON.stringify(record)}\n`)
    trackWrite(fs.writeFile(filePath, jpeg))
    frameIndex += 1
  }

  for (const milestone of milestones) {
    if (!milestoneTaken.has(milestone.label) && elapsed >= milestone.targetTime) {
      milestoneTaken.add(milestone.label)
      scheduleRepresentative(milestone, jpeg, elapsed, representativeFrames.length)
    }
  }
}

function handleMessage(event) {
  let message
  try {
    message = JSON.parse(event.data.toString())
  } catch (error) {
    fatal ||= new Error(`Could not decode Chromium DevTools message: ${error.message}`)
    return
  }

  if (message.id && pendingMessages.has(message.id)) {
    const pending = pendingMessages.get(message.id)
    pendingMessages.delete(message.id)
    message.error
      ? pending.reject(new Error(JSON.stringify(message.error)))
      : pending.resolve(message.result)
    return
  }
  if (message.method === 'Runtime.exceptionThrown') {
    fatal ||= new Error(`Uncaught browser exception: ${JSON.stringify(message.params.exceptionDetails)}`)
  } else if (message.method === 'Runtime.bindingCalled' && armed) {
    try {
      const signal = JSON.parse(message.params.payload)
      if (signal.type === 'start') {
        if (startedAt !== null && Math.abs(signal.time - startedAt) > 0.3) {
          fatal ||= new Error('The video remounted during the armed capture.')
        } else {
          startedAt = signal.time
          console.log('CAPTURE_STARTED')
        }
      } else if (signal.type === 'stop' && endedAt === null) {
        endedAt = signal.time
        console.log(`PLAYER_STOPPED after ${(endedAt - startedAt).toFixed(3)} seconds.`)
      }
    } catch (error) {
      fatal ||= new Error(`Invalid recording signal: ${error.message}`)
    }
  } else if (message.method === 'Page.screencastFrame') {
    handleScreencastFrame(message)
  }
}

async function waitForChromePort() {
  const portFile = path.join(profileDirectory, 'DevToolsActivePort')
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    if (fatal) throw fatal
    try {
      const [port] = (await fs.readFile(portFile, 'utf8')).split('\n')
      if (port) return port
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    await wait(100)
  }
  throw new Error('Chromium did not create DevToolsActivePort within 45 seconds.')
}

async function getPageTarget(port) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`, { signal: controller.signal })
      if (!response.ok) throw new Error(`DevTools target endpoint returned HTTP ${response.status}.`)
      const pages = await response.json()
      const page = pages.find(target => target.type === 'page' && target.webSocketDebuggerUrl)
      if (page) return page
    } catch (error) {
      if (Date.now() >= deadline) throw error
    } finally {
      clearTimeout(timeout)
    }
    await wait(150)
  }
  throw new Error('Chromium started but did not expose a page target.')
}

async function waitUntilReady() {
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    if (fatal) throw fatal
    const ready = await evaluate(`(() => {
      const film = document.querySelector('.landing-film');
      const audio = film?.querySelector('audio');
      return Boolean(film && film.dataset.currentScene && audio && audio.readyState >= 2);
    })()`)
    if (ready) return
    await wait(200)
  }
  throw new Error('The landing film or its soundtrack did not become ready within 120 seconds.')
}

async function preloadAssets() {
  const imageDirectory = path.join(artifactRoot, 'public/images')
  const imageNames = (await fs.readdir(imageDirectory))
    .filter(name => /\.(png|jpe?g|webp|svg)$/i.test(name))
    .sort()
  const baseUrl = new URL(renderUrl)
  if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/'
  const imageUrls = imageNames.map(name => new URL(`images/${name}`, baseUrl).href)
  const result = await evaluate(`(async () => {
    const imageUrls = ${JSON.stringify(imageUrls)};
    const audio = document.querySelector('.landing-film audio');
    if (!audio?.currentSrc) throw new Error('The composite soundtrack has no current source.');
    const soundtrack = await fetch(audio.currentSrc);
    if (!soundtrack.ok) throw new Error('Soundtrack preload failed: HTTP ' + soundtrack.status);
    await soundtrack.arrayBuffer();
    await document.fonts.ready;
    await Promise.all(imageUrls.map(src => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => image.decode().then(resolve, reject);
      image.onerror = () => reject(new Error('Image preload failed: ' + src));
      image.src = src;
    })));
    return { images: imageUrls.length, fonts: document.fonts.status, audioSource: audio.currentSrc };
  })()`)
  if (!result?.audioSource || result.fonts !== 'loaded') {
    throw new Error(`Asset preload did not complete: ${JSON.stringify(result)}`)
  }
  return result
}

async function inspectIframeControls() {
  const [appSource, browserContext] = await Promise.all([
    fs.readFile(path.join(artifactRoot, 'src/App.tsx'), 'utf8'),
    evaluate(`({ isFramed: window.self !== window.top, url: location.href })`),
  ])
  const wrapperMounted = /\bWorkspaceControlledVideo\b/.test(appSource)
  if (!wrapperMounted) {
    return {
      checked: true,
      available: false,
      reason: 'The top-level export intentionally omits iframe-only preview controls; the custom VideoWithControls wrapper is checked separately.',
      isFramed: browserContext.isFramed,
    }
  }
  if (!browserContext.isFramed) {
    return {
      checked: true,
      available: false,
      reason: 'VIDEO_RENDER_URL opens the artifact as a top-level document; workspace iframe controls are not installed in that context.',
      isFramed: false,
    }
  }
  return {
    checked: true,
    available: false,
    reason: 'The page is framed, but this direct CDP target cannot issue a trusted command from its external workspace parent.',
    isFramed: true,
  }
}

async function sampleRuntime(elapsed, force = false) {
  const shouldRecord = force || elapsed - lastAudioSampleAt >= 10
  const sample = await evaluate(`(() => {
    const film = document.querySelector('.landing-film');
    const audio = film?.querySelector('audio');
    return {
      scene: film?.dataset.currentScene ?? null,
      audioTime: audio?.currentTime ?? null,
      audioDuration: Number.isFinite(audio?.duration) ? audio.duration : null,
      audioReadyState: audio?.readyState ?? null,
      audioPaused: audio?.paused ?? null,
      audioEnded: audio?.ended ?? null,
      audioError: audio?.error ? { code: audio.error.code, message: audio.error.message } : null,
      audioBlocked: film?.dataset.audioBlocked === 'true',
      cursorVisible: Boolean(film?.querySelector('.virtual-cursor')),
      typedNoteText: film?.querySelector('[data-typed-note]')?.textContent ?? '',
      financialPeak: film?.querySelector('.revenue-total h2')?.textContent?.trim() ?? '',
    };
  })()`)
  // The soundtrack can naturally finish before the player's final timer fires.
  // Accept only a genuine media end at the canonical end, never an early pause.
  const completedAudio = stopAtPlayerSignal && elapsed >= duration - 0.15
    && sample.audioEnded && sample.audioTime >= duration - 0.15
  if (!sample?.scene || sample.audioReadyState < 2 || (sample.audioPaused && !completedAudio) || sample.audioBlocked || sample.audioError) {
    throw new Error(`Soundtrack or film runtime is unhealthy at ${elapsed.toFixed(1)}s: ${JSON.stringify(sample)}`)
  }
  lastScene = sample.scene
  lastBrowserState = sample
  if (!shouldRecord) return
  if (!completedAudio && previousAudioSample && elapsed - previousAudioSample.elapsed > 5) {
    const advanced = sample.audioTime - previousAudioSample.audioTime
    const sceneLooped = sample.scene !== previousAudioSample.scene && advanced < 0
    if (advanced < 1 && !sceneLooped) {
      throw new Error(`Soundtrack time did not advance between runtime samples: ${JSON.stringify(previousAudioSample)} -> ${JSON.stringify(sample)}`)
    }
  }
  lastAudioSampleAt = elapsed
  previousAudioSample = { elapsed, audioTime: sample.audioTime, scene: sample.scene }
  audioSamples.push({ elapsed, ...sample })
}

// CDP screencasts emit damaged frames, not a continuous stream. A final
// static hold must still be sampled for review even when nothing repaints.
async function capturePendingMilestones(elapsed) {
  const due = milestones.filter(item => (
    !milestoneTaken.has(item.label) && elapsed >= item.targetTime
  ))
  if (!due.length) return
  const screenshot = await send('Page.captureScreenshot', {
    format: 'jpeg', quality: 90, captureBeyondViewport: false,
  })
  const actualElapsed = Date.now() / 1000 - startedAt
  const jpeg = Buffer.from(screenshot.data, 'base64')
  for (const milestone of due) {
    if (milestoneTaken.has(milestone.label)) continue
    milestoneTaken.add(milestone.label)
    scheduleRepresentative(milestone, jpeg, actualElapsed, representativeFrames.length)
  }
}

async function waitForPlayback() {
  const naturalCompletion = stopAtPlayerSignal
  const deadline = Date.now() + (duration + 60) * 1000
  let lastReport = -15
  while (true) {
    if (fatal) throw fatal
    const elapsed = startedAt === null ? 0 : Date.now() / 1000 - startedAt
    if (startedAt !== null && !naturalCompletion && elapsed >= duration) break
    if (endedAt !== null && naturalCompletion) break
    if (Date.now() > deadline) {
      throw new Error(`Playback did not complete within the ${duration + 60}s watchdog window.`)
    }
    if (startedAt !== null) {
      await sampleRuntime(elapsed)
      await capturePendingMilestones(elapsed)
      if (elapsed >= lastReport + 15) {
        console.log(`PLAYBACK ${Math.min(100, elapsed / duration * 100).toFixed(0)}% | ${lastScene} | ${frameIndex} frames`)
        lastReport = elapsed
      }
    }
    await wait(400)
  }
  if (startedAt === null) throw new Error('The player never called window.startRecording().')
  if (naturalCompletion && endedAt === null) {
    throw new Error('The player reached the expected duration without calling window.stopRecording().')
  }
  await sampleRuntime(Math.min(duration, Date.now() / 1000 - startedAt), true)
  await capturePendingMilestones(Math.min(duration, Date.now() / 1000 - startedAt))
}

async function waitForSocket(socketToOpen) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out connecting to Chromium DevTools WebSocket.')), 15000)
    socketToOpen.addEventListener('open', () => {
      clearTimeout(timeout)
      resolve()
    }, { once: true })
    socketToOpen.addEventListener('error', () => {
      clearTimeout(timeout)
      reject(new Error('Chromium DevTools WebSocket failed to open.'))
    }, { once: true })
  })
}

async function makeContactSheet() {
  if (!representativeFrames.length) throw new Error('No representative frames were captured.')
  const columns = 4
  const rows = Math.ceil(representativeFrames.length / columns)
  const pattern = path.join(representativeDirectory, '*.jpg')
  const encoder = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-filter_threads', '2',
    '-framerate', '1', '-pattern_type', 'glob', '-i', pattern,
    '-vf', `scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,tile=${columns}x${rows}:padding=12:margin=12:color=white`,
    '-frames:v', '1', '-threads', '2', contactSheetPath,
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  encoder.stderr.on('data', chunk => { stderr += chunk.toString() })
  const [code] = await once(encoder, 'close')
  if (code !== 0) throw new Error(`ffmpeg could not create the representative contact sheet: ${stderr.trim()}`)
}

async function writeProof(proof, filePath) {
  await fs.writeFile(filePath, `${JSON.stringify(proof, null, 2)}\n`)
}

let preloadInfo
let iframeControlProbe = {
  checked: false,
  available: false,
  reason: 'Only run during --verify-only.',
}

try {
  await fs.mkdir(runDirectory, { recursive: true })
  journal = createWriteStream(journalPath, { flags: 'wx' })
  await new Promise((resolve, reject) => {
    journal.once('open', resolve)
    journal.once('error', reject)
  })
  journal.on('error', error => { fatal ||= error })

  console.log(`Landing film: ${Object.keys(sceneDurations).length} scenes, ${canonicalDuration.toFixed(1)}s canonical; requested ${duration.toFixed(1)}s.`)
  console.log(`Capture workspace: ${runDirectory}`)
  chrome = spawn(process.env.CHROMIUM_PATH || 'chromium', [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--remote-debugging-port=0',
    '--remote-allow-origins=*', `--user-data-dir=${profileDirectory}`, 'about:blank',
  ], { stdio: 'ignore' })
  chrome.on('error', error => { fatal ||= error })
  chrome.on('exit', (code, signal) => {
    if (!closingBrowser && !endedAt) {
      fatal ||= new Error(`Chromium exited unexpectedly (code=${code}, signal=${signal}).`)
    }
  })

  const port = await waitForChromePort()
  const page = await getPageTarget(port)
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await waitForSocket(socket)
  socket.onmessage = handleMessage
  socket.onerror = () => { fatal ||= new Error('Chromium DevTools WebSocket reported an error.') }
  socket.onclose = () => {
    if (!closingBrowser) fatal ||= new Error('Chromium DevTools WebSocket closed unexpectedly.')
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Runtime.addBinding', { name: '__landingCaptureSignal' })
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.startRecording = () => window.__landingCaptureSignal(JSON.stringify({ type: 'start', time: Date.now() / 1000 }));
      window.stopRecording = () => window.__landingCaptureSignal(JSON.stringify({ type: 'stop', time: Date.now() / 1000 }));
    `,
  })
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  })

  await send('Page.navigate', { url: renderUrl })
  await waitUntilReady()
  preloadInfo = await preloadAssets()
  console.log(`Preloaded ${preloadInfo.images} images, ${preloadInfo.fonts} fonts, and ${preloadInfo.audioSource}.`)
  if (verifyOnly) iframeControlProbe = await inspectIframeControls()

  await send('Page.startScreencast', {
    format: 'jpeg',
    quality: 90,
    maxWidth: width,
    maxHeight: height,
    everyNthFrame: verifyOnly ? 1 : 2,
  })
  armed = true
  await send('Page.reload', { ignoreCache: false })

  const armDeadline = Date.now() + 30000
  while (startedAt === null && Date.now() < armDeadline) {
    if (fatal) throw fatal
    await wait(100)
  }
  if (startedAt === null) throw new Error('The reloaded player did not call window.startRecording() within 30 seconds.')

  await waitForPlayback()
  await send('Page.stopScreencast')
  await Promise.all([...pendingWrites])
  await new Promise((resolve, reject) => {
    journal.once('error', reject)
    journal.end(resolve)
  })
  if (fatal) throw fatal
  socket.close()
  closingBrowser = true
  chrome.kill('SIGTERM')
  await wait(250)

  const missingMilestones = milestones.filter(milestone => !milestoneTaken.has(milestone.label))
  if (missingMilestones.length) {
    throw new Error(`Representative frames were not captured: ${missingMilestones.map(item => item.label).join(', ')}`)
  }
  const sceneMismatches = representativeFrames.filter(frame => frame.observedScene !== frame.expectedScene)
  if (sceneMismatches.length) {
    throw new Error(`Representative frame scene mismatch: ${sceneMismatches.map(frame => `${frame.label} expected ${frame.expectedScene}, saw ${frame.observedScene}`).join('; ')}`)
  }
  const cueMismatches = representativeFrames.filter(frame => (
    (frame.cue === 'cursor' && !frame.observedCues?.cursorVisible)
    || (frame.cue === 'typing' && !frame.observedCues?.typedNoteText)
    || (frame.cue === 'financial peak' && frame.observedCues?.financialPeak !== '$10,500')
  ))
  if (cueMismatches.length) {
    throw new Error(`Representative cue not present: ${cueMismatches.map(frame => frame.label).join(', ')}`)
  }
  if (!verifyOnly) {
    const usable = frames
      .filter(frame => frame.elapsed < duration)
      .sort((left, right) => left.elapsed - right.elapsed)
    if (usable.length < 100 || usable[0].elapsed > 0.5) {
      throw new Error(`Incomplete screencast: ${usable.length} frames; first frame at ${usable[0]?.elapsed ?? 'missing'}s.`)
    }
  }

  await makeContactSheet()
  const proof = {
    artifact: 'artifacts/patient-pipeline-landing-video',
    renderUrl,
    mode: verifyOnly ? 'verify-only' : 'mp4-export',
    generatedAt: new Date().toISOString(),
    dimensions: { width, height },
    canonicalDurationSeconds: canonicalDuration,
    requestedDurationSeconds: duration,
    durationOverrideSeconds: durationOverride,
    sceneDurationsMilliseconds: sceneDurations,
    sceneStartSeconds: sceneStarts,
    playbackStartedAtEpochSeconds: startedAt,
    playbackStoppedAtEpochSeconds: endedAt,
    playerPlaybackSeconds: endedAt === null ? null : endedAt - startedAt,
    capturedElapsedSeconds: startedAt === null
      ? null
      : Math.min(duration, endedAt !== null && stopAtPlayerSignal ? endedAt - startedAt : Date.now() / 1000 - startedAt),
    frameCount: verifyOnly ? null : frames.filter(frame => frame.elapsed < duration).length,
    firstCapturedFrameSeconds: verifyOnly ? null : frames.find(frame => frame.elapsed < duration)?.elapsed ?? null,
    lastCapturedFrameSeconds: verifyOnly ? null : [...frames].reverse().find(frame => frame.elapsed < duration)?.elapsed ?? null,
    representativeFrames,
    audioRuntimeSamples: audioSamples,
    assetPreload: preloadInfo,
    iframeControlProbe,
    capturesDirectory: relativePath(runDirectory),
    frameJournal: relativePath(journalPath),
    contactSheet: relativePath(contactSheetPath),
    outputMp4: verifyOnly ? null : relativePath(outputPath),
    audioSource: relativePath(audioPath),
  }
  await writeProof(proof, path.join(runDirectory, 'render.json'))

  if (!verifyOnly) {
    const usable = frames
      .filter(frame => frame.elapsed < duration)
      .sort((left, right) => left.elapsed - right.elapsed)
    const concatEntries = ['ffconcat version 1.0']
    for (let index = 0; index < usable.length; index += 1) {
      const startTime = index === 0 ? 0 : usable[index].elapsed
      const endTime = usable[index + 1]?.elapsed ?? duration
      if (endTime <= startTime) continue
      const image = path.resolve(runDirectory, usable[index].path)
      concatEntries.push(`file '${escapeConcatPath(image)}'`, `duration ${(endTime - startTime).toFixed(6)}`)
    }
    concatEntries.push(`file '${escapeConcatPath(path.resolve(runDirectory, usable.at(-1).path))}'`)
    const concatPath = path.join(runDirectory, 'frames.ffconcat')
    await fs.writeFile(concatPath, `${concatEntries.join('\n')}\n`)

    const encoder = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-hide_banner', '-loglevel', 'warning', '-n',
      '-filter_threads', '2', '-filter_complex_threads', '2',
      '-f', 'concat', '-safe', '0', '-i', concatPath,
      '-i', audioPath,
      '-map', '0:v:0', '-map', '1:a:0', '-t', String(duration),
      '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-threads', '2',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-movflags', '+faststart',
      '-metadata', 'title=Patient Pipeline — Landing Page Video',
      '-progress', 'pipe:1', '-stats_period', '15', outputPath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    encoder.stdout.on('data', chunk => {
      for (const match of chunk.toString().matchAll(/out_time_us=(\d+)/g)) {
        console.log(`ENCODING ${(Number(match[1]) / 1e6 / duration * 100).toFixed(0)}%`)
      }
    })
    encoder.stderr.on('data', chunk => process.stderr.write(chunk))
    const [exitCode] = await once(encoder, 'close')
    if (exitCode !== 0) throw new Error(`ffmpeg exited with code ${exitCode}; captures retained in ${runDirectory}.`)

    proof.encodedFileBytes = (await fs.stat(outputPath)).size
    proof.ffmpeg = {
      videoCodec: 'H.264 / libx264',
      pixelFormat: 'yuv420p',
      frameRate: 30,
      audioCodec: 'AAC',
      faststart: true,
      threads: 2,
    }
    await writeProof(proof, path.join(runDirectory, 'render.json'))
    console.log(`RENDER_COMPLETE ${outputPath} (${proof.encodedFileBytes} bytes)`)
    console.log(`RENDER_PROOF ${path.join(runDirectory, 'render.json')}`)
  } else {
    console.log(`VERIFY_COMPLETE: ${representativeFrames.length} representative frames; contact sheet ${contactSheetPath}`)
    console.log(`RENDER_PROOF ${path.join(runDirectory, 'render.json')}`)
  }
} catch (error) {
  console.error(`LANDING_VIDEO_RENDER_FAILED: ${error.stack || error}`)
  console.error(`Captures and browser profile retained at ${runDirectory}`)
  process.exitCode = 1
} finally {
  closingBrowser = true
  socket?.close()
  chrome?.kill('SIGTERM')
  if (journal && !journal.destroyed && !journal.writableEnded) journal.end()
}