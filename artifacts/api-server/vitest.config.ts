import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./src/test/database-pools.ts'],
    // Each isolated worker owns a pool against the shared Supabase session
    // pooler. Unbounded workers can exhaust its connection limit.
    // Real-database suites round-trip to Supabase on every statement; the 5 s
    // default times out under a full run even though each test passes alone.
    ...(process.env.SUPABASE_DB_URL ? { maxWorkers: 1, hookTimeout: 30000, testTimeout: 30000 } : {}),
  },
  resolve: {
    alias: [
      { find: 'next/headers', replacement: r('./src/shims/next-headers.ts') },
      { find: 'next/navigation', replacement: r('./src/shims/next-navigation.ts') },
      { find: 'next/cache', replacement: r('./src/shims/next-cache.ts') },
      { find: /^@\/(.*)$/, replacement: r('./src/') + '$1' },
    ],
  },
})
