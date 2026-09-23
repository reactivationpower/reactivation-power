/**
 * Helpers shared by the web app and the api-server. This package is the
 * single copy: the two artifacts used to carry hand-copied twins of every
 * file below (script-merge had drifted by ~60 lines), and the guard test in
 * artifacts/api-server/src/lib/niche-catalog.test.ts fails if a per-artifact
 * copy reappears. Keep this package free of artifact-local imports and
 * runtime dependencies; sanitize-html based notes-html stays server-only.
 */
export * from './analytics-types.ts'
export * from './call-time.ts'
export * from './email-templates.ts'
export * from './format.ts'
export * from './lazy-time.ts'
export * from './lead-followup.ts'
export * from './lead-validation.ts'
export * from './lead-webhooks.ts'
export * from './notes-text.ts'
export * from './opportunity.ts'
export * from './phone.ts'
export * from './script-merge.ts'
export * from './types.ts'
export * from './us-timezones.ts'
