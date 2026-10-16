import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { unlink } from 'node:fs/promises'
const out = '.patient-text-demo.mjs'
await build({ entryPoints: ['scripts/patient-text-demo.ts'], outfile: out, bundle: true, platform: 'node', format: 'esm',
  tsconfig: 'tsconfig.json', external: ['pino', 'pino-pretty', 'thread-stream', 'pg-native'],
  banner: { js: "import { createRequire as __demoRequire } from 'node:module'; const require = __demoRequire(import.meta.url);" } })
try {
  const result = spawnSync(process.execPath, [out, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } })
  process.exitCode = result.status ?? 1
} finally { await unlink(out) }
