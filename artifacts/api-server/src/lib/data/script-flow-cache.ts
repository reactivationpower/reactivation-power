import type { ScriptFlow } from './reactivation'

// Script text is shared configuration, not patient data. Keep the cache short
// because CLI edits and other serving hosts cannot invalidate this process.
const TTL_MS = 60_000
const MAX_ENTRIES = 128
const entries = new Map<string, { expires: number; promise: Promise<ScriptFlow> }>()

export async function cachedScriptFlow(key: string, load: () => Promise<ScriptFlow>): Promise<ScriptFlow> {
  const now = Date.now()
  const existing = entries.get(key)
  if (existing && existing.expires > now) return existing.promise
  for (const [k, entry] of entries) if (entry.expires <= now) entries.delete(k)
  if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value!)
  const entry = { expires: now + TTL_MS, promise: Promise.resolve().then(load) }
  entries.set(key, entry)
  try {
    return await entry.promise
  } catch (error) {
    if (entries.get(key) === entry) entries.delete(key)
    throw error
  }
}

export function clearScriptFlowCache(): void {
  entries.clear()
}
