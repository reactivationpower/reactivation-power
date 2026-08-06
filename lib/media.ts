/** Build a same-origin streaming URL for a private blob pathname */
export function mediaUrl(pathname: string | null): string {
  if (!pathname) return ''
  return `/api/media?pathname=${encodeURIComponent(pathname)}`
}

/**
 * Same as mediaUrl, but for the admin area — the media route skips the
 * participant-session check when admin=1 (admin is unauthenticated for now).
 */
export function adminMediaUrl(pathname: string | null): string {
  if (!pathname) return ''
  return `/api/media?pathname=${encodeURIComponent(pathname)}&admin=1`
}
