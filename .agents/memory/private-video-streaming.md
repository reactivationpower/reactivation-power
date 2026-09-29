---
name: Private video streaming
description: Vercel Blob cached range anomalies and limits of automated iPad playback verification.
---
Private Blob cached GET responses have intermittently returned chunk length as total size, wrong offsets, or empty bodies for bounded and suffix ranges, even while full-file metadata is correct.

**Why:** During an iPad playback investigation, both source videos were valid fast-start H.264/AAC files and played on Mac, but range probes of one file produced invalid responses. Cache-bypassed requests returned the expected bytes. A successful SDK result or HTTP 206 alone does not prove correct media delivery.

**How to apply:** Verify requested offsets, body length, and authoritative full-file size separately; compare bounded bodies with uncached reads. Do not correct an offset by merely changing headers. Test both affected videos rather than generalizing from one. Headless Chromium codec limitations mean protocol tests are not proof of real iPad playback.