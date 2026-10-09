---
name: Next.js port architecture
description: How the Vercel/Next app was ported to Express + Vite here, and the traps hit doing it
---
The port keeps server actions verbatim behind one RPC route and replaces server components with per-page loader endpoints (see replit.md for paths).

**Why:** An earlier port pass had stubbed the whole data layer ("null as any; // mocked server data", "read-only port" toasts), which the user experienced as an empty demo app. Rewriting actions as REST would have been far more work than emulating next/headers|navigation via AsyncLocalStorage.

**How to apply:**
- When something in the SPA "shows nothing", first grep for leftover placeholders (mocked server data, /* redirect */, undefined 'router').
- Any action exposed over HTTP must be in the allow-list with an auth level; in Next it was implicitly protected by the page proxy, over HTTP it is not.
- Source files are CRLF: generating code from grep output without stripping \r produced broken TS. Strip \r first.
- Bundled Playwright Chromium may lack H.264/AAC; an empty `canPlayType` plus `DEMUXER_ERROR_NO_SUPPORTED_STREAMS` is a tester limitation, not asset corruption. Validate HTTP ranges, then try an installed codec-capable system browser before declaring playback blocked.
- Layout loaders (e.g. /admin/_layout) have no page path; the client sends ?_path= so login redirects return to the right page.

**Why (media testing):** The bundled test browser rejected a valid four-minute walkthrough while the system Chromium decoded that same unmodified MP4, advanced playback, and sought near its end.

**How to apply (media testing):** Ask the existing tester to report codec support, media error, and range responses, then use a codec-capable installed browser when available. Verify playback there without regenerating or re-encoding an already valid video.
