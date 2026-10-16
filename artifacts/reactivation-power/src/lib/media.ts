import { apiUrl } from './api'
/** Build a same-origin streaming URL for a private blob pathname */
export function mediaUrl(pathname: string | null): string {
  if (!pathname) return ''
  return apiUrl(`/media?pathname=${encodeURIComponent(pathname)}`)
}

/**
 * Same as mediaUrl, but for the admin area — the media route skips the
 * participant-session check only for an authenticated administrator.
 * admin=1 is a cache separator, not authorization.
 */
export function adminMediaUrl(pathname: string | null): string {
  if (!pathname) return ''
  return apiUrl(`/media?pathname=${encodeURIComponent(pathname)}&admin=1`)
}
