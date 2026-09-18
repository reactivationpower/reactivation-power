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
- Playwright's Chromium cannot decode H.264, so a DEMUXER_ERROR_NO_SUPPORTED_STREAMS on portal videos is a tester limitation; verify /api/media with curl range requests instead.
- Layout loaders (e.g. /admin/_layout) have no page path; the client sends ?_path= so login redirects return to the right page.
