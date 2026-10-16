/**
 * Size limits that keep every request and response inside what a Vercel
 * function can carry. Vercel caps both the request body and a non-streamed
 * response at 4.5 MB per invocation; anything larger fails at the platform
 * edge with a generic error before the app sees it. Replit's published proxy
 * has a higher cap, so the smaller Vercel figure is used everywhere to keep
 * behaviour identical on both hosts.
 *
 * Large transfers never go through the function:
 * - uploads go straight from the browser to Vercel Blob (`/api/upload/token`),
 * - private videos stream as bounded byte ranges (`MAX_MEDIA_RANGE_BYTES`),
 * - public marketing videos are static files on Vercel's CDN,
 * - CSV imports are split into several requests by the browser.
 */

/** Vercel's documented per-request body and response ceiling. */
export const VERCEL_PAYLOAD_LIMIT_BYTES = Math.floor(4.5 * 1024 * 1024);

/** Largest JSON body the general parser accepts (headroom under the ceiling). */
export const JSON_BODY_LIMIT_BYTES = 4 * 1024 * 1024;
export const JSON_BODY_LIMIT = "4mb";

/** Largest file the server-side upload fallback will buffer and forward. */
export const MAX_SERVER_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Largest file body a single route may `send()` in one response. */
export const MAX_RESPONSE_FILE_BYTES = 4 * 1024 * 1024;

export function describeMegabytes(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}
