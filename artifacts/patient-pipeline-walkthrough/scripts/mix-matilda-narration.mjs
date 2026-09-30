import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const audio = join(root, 'public/audio')
const template = readFileSync(join(root, 'src/components/video/VideoTemplate.tsx'), 'utf8')
const durationObject = template.match(/export const SCENE_DURATIONS = \{([^}]+)\}/)?.[1]
if (!durationObject) throw new Error('Cannot find canonical scene durations')
const durations = [...durationObject.matchAll(/\b[a-zA-Z]+:(\d+)/g)].map((match) => Number(match[1]))
if (durations.length !== 11) throw new Error(`Expected 11 scenes, found ${durations.length}`)

const length = (path) => Number(execFileSync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration',
  '-of', 'default=noprint_wrappers=1:nokey=1', path,
], { encoding: 'utf8' }).trim())

const totalMs = durations.reduce((sum, ms) => sum + ms, 0)
const music = join(audio, 'bg_music_rev.mp3')
if (!existsSync(music)) throw new Error('Original music bed is missing')
const musicDuration = length(music)
const tempo = musicDuration / (totalMs / 1000)
const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', music]
const filters = [
  `[0:a]atempo=${tempo.toFixed(6)},apad,atrim=0:${totalMs / 1000},volume=0.22[bed]`,
]
const inputs = ['[bed]']
let offsetMs = 0

durations.forEach((durationMs, index) => {
  // Keep the earlier services reading as a reference; the approved replacement
  // has its own source file and is the one mixed into the current film.
  const narrationFile = index === 7 ? 'vo_matilda_08_2.mp3' : `vo_matilda_${String(index + 1).padStart(2, '0')}.mp3`
  const file = join(audio, narrationFile)
  if (!existsSync(file)) throw new Error(`Narration is missing: ${file}`)
  const durationSec = durationMs / 1000
  const spokenSec = length(file)
  if (spokenSec + 0.75 > durationSec) {
    throw new Error(`Narration ${index + 1} is too long: ${spokenSec.toFixed(2)}s for ${durationSec}s`)
  }
  args.push('-i', file)
  const delayMs = offsetMs + 250
  filters.push(`[${index + 1}:a]adelay=${delayMs}:all=1,volume=1.35[v${index + 1}]`)
  inputs.push(`[v${index + 1}]`)
  console.log(`Scene ${index + 1}: ${spokenSec.toFixed(2)}s narration in ${durationSec}s at ${offsetMs / 1000}s`)
  offsetMs += durationMs
})

filters.push(`${inputs.join('')}amix=inputs=${inputs.length}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[out]`)
const output = join(audio, 'composite_audio_matilda_services.mp3')
const result = spawnSync('ffmpeg', [
  ...args, '-filter_complex', filters.join(';'), '-map', '[out]',
  '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k',
  '-t', String(totalMs / 1000), output,
], { stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
console.log(`Wrote ${output}`)