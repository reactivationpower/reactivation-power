import { VERCEL_PAYLOAD_LIMIT_BYTES } from "./request-limits";

/**
 * Largest body a single video range response may carry. Vercel functions
 * cannot return more than 4.5 MB per request, so 4 MiB keeps headroom for
 * headers; Replit's published proxy allows more, but the same bound applies
 * on both hosts so playback behaves identically.
 */
export const MAX_MEDIA_RANGE_BYTES = 4 * 1024 * 1024;
if (MAX_MEDIA_RANGE_BYTES >= VERCEL_PAYLOAD_LIMIT_BYTES) {
  throw new Error("MAX_MEDIA_RANGE_BYTES must stay below the Vercel response limit");
}
export type ByteRange = { start: number; end: number };

/** Single ranges only; keep every partial response below the hosting response limit. */
export function parseMediaRange(header: string, size: number): ByteRange | null {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : null;
  const end = match[2] ? Number(match[2]) : null;
  if ((start !== null && !Number.isSafeInteger(start)) ||
      (end !== null && !Number.isSafeInteger(end))) return null;
  if (start === null) {
    if (!end) return null;
    // Return the beginning of the requested suffix, not unrelated later bytes.
    const first = Math.max(0, size - end);
    return { start: first, end: Math.min(size - 1, first + MAX_MEDIA_RANGE_BYTES - 1) };
  }
  if (start >= size || (end !== null && end < start)) return null;
  return { start, end: Math.min(end ?? size - 1, size - 1, start + MAX_MEDIA_RANGE_BYTES - 1) };
}

export function matchesIfRange(value: string | undefined, etag: string, modified: Date): boolean {
  if (!value) return true;
  if (value.startsWith('W/')) return false;
  if (value.startsWith('"')) return value === etag;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && modified.getTime() <= date.getTime() + 999;
}
