export const MAX_MEDIA_RANGE_BYTES = 8 * 1024 * 1024;
export type ByteRange = { start: number; end: number };

/** Single ranges only; keep every partial response below the published proxy limit. */
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
