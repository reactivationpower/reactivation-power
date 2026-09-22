/**
 * Shared niche catalog: the concern chips the call player shows, the
 * keyword -> niche matcher used by imports, and the public service catalog.
 *
 * This is the single source of truth for both the web app and the api-server
 * (including the script-flow lint). Add a new niche here, once.
 */
export * from './concern-options.ts'
export * from './niche-match.ts'
export * from './service-catalog.ts'
