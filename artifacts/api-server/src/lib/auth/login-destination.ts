/**
 * All accounts land on the product chooser after login. Preserve specific
 * same-origin deep links, but treat the portal root as a normal login.
 */
export function resolveLoginDestination(next: string): string {
  const path = next.trim()
  if (path && /^\/(?![\/\\])/.test(path)) {
    const pathname = path.split(/[?#]/, 1)[0].replace(/\/+$/, '')
    if (pathname !== '/portal') return path
  }
  return '/portal/start'
}
