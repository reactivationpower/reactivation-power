/**
 * Where this server is running, and whether it may cause real-world effects.
 *
 * Vercel Preview deployments share the one Supabase database with production,
 * so a preview must never run scheduled jobs, send real email or texts, or use
 * live Stripe. Vercel sets VERCEL=1 and VERCEL_ENV=production|preview|development
 * on every deployment. Anything on Vercel that is not explicitly production is
 * treated as a preview. Replit (no VERCEL variable) keeps its existing behavior.
 */

export type DeploymentTarget = 'replit' | 'vercel-production' | 'vercel-preview'

export function deploymentTarget(env: NodeJS.ProcessEnv = process.env): DeploymentTarget {
  if (!env.VERCEL) return 'replit'
  return env.VERCEL_ENV === 'production' ? 'vercel-production' : 'vercel-preview'
}

export function isVercel(env: NodeJS.ProcessEnv = process.env): boolean {
  return deploymentTarget(env) !== 'replit'
}

/** True on any Vercel deployment that is not production (Preview or `vercel dev`). */
export function isVercelPreview(env: NodeJS.ProcessEnv = process.env): boolean {
  return deploymentTarget(env) === 'vercel-preview'
}

export class PreviewSafetyError extends Error {
  constructor(action: string) {
    super(`${action} is turned off on Vercel Preview deployments (they share the production database).`)
    this.name = 'PreviewSafetyError'
  }
}

/** Throw before doing something real (send, charge, scheduled job) on a preview. */
export function assertRealEffectsAllowed(action: string, env: NodeJS.ProcessEnv = process.env): void {
  if (isVercelPreview(env)) throw new PreviewSafetyError(action)
}
