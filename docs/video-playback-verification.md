# Video playback verification

## Delivery contract

The API serves only three explicitly allowlisted public MP4s. On Replit the API
build copies them into its own runtime output, so delivery does not depend on the
static-site proxy or web build order. Players use the base-path-aware API URL;
posters stay static. Private Blob videos remain on the authenticated `/api/media`
route.

**On Vercel** the web build links the pages straight to the same files under
`/videos/`, which the CDN serves with its own full range support, and the API
build does not copy the MP4s into the function. `/api/public-media/*` answers
with a 302 to `/videos/<name>` there (never reading the function's disk), so
older links keep working.

Each valid single-range GET returns at most 4 MiB (`MAX_MEDIA_RANGE_BYTES`), with
the actual requested offset, authoritative total and exact body length. The cap
is below the 4.5 MB a Vercel function may return in one response and is
guarded by a startup check plus tests, so the same bound applies on both hosts;
an iPad walks a lesson as consecutive `bytes=N-` requests of at most 4 MiB. Large suffix requests return
the beginning of the requested suffix, not a different suffix relabeled as that
range. HEAD describes the full representation without fetching a video body.
Malformed/multiple/unsatisfiable ranges receive 416.

**Full-response limitation:** Small ordinary GETs and stale If-Range requests
return complete 200 responses. Large public videos and private video full-response
requests return explicit 400 `MEDIA_RANGE_REQUIRED`, with no Content-Range and no
video bytes. Clients must retry with `Range: bytes=0-` without the stale validator.
This deliberately does not pretend a chunk is a complete file or return unsolicited
206 responses. It is not general-purpose full-file download support. Existing
non-video private attachment delivery is unchanged.

Public responses revalidate; failures are not cached. Private responses retain
private caching and cookie authorization; `admin=1` is not authorization. Streams
close on client disconnect. Player retries create/load a fresh media element;
public play is invoked inside the user click so sound does not rely on an effect
retaining Safari's gesture permission.

## Inventory

| Placement | Source |
|---|---|
| Strategy-call muted preview | `patient-pipeline-walkthrough-preview.mp4`, 185,476 bytes, 10s, H.264/yuv420p, no audio |
| Homepage introduction | `patient-pipeline-introduction.mp4`, 9,180,574 bytes, 146s, H.264/yuv420p + AAC |
| Strategy-call full, homepage full, standalone `/walkthrough`, booking confirmation | Shared `patient-pipeline-walkthrough.mp4`, 49,513,673 bytes, 240s, H.264/yuv420p + AAC |
| Portal lessons | Private uploaded Blob video pathname, authenticated media route |
| Admin thumbnail video previews | Same private media route with authenticated admin cookie |
| Healthcare testimonial | Intentional coming-soon placeholder, no source supplied |
| Lessons without uploaded media | Intentional coming-soon placeholders, unchanged |

The separately registered video-authoring artifacts are not playback placements
inside Patient Pipeline and were not edited.

## Verification matrix (2026-10-09)

| Check | Evidence / status |
|---|---|
| Original published failure | Read-only request to `https://patientpipeline.app/videos/patient-pipeline-walkthrough.mp4` with `Range: bytes=0-` reproduced HTTP 500 before changes |
| All three actual public files through preview proxy | Every consecutive chunk through EOF compared byte-for-byte with source: passed (58,879,723 total bytes) |
| Large-file regression | Synthetic >32 MiB file: all consecutive chunks, middle/suffix/large ranges, exact offsets and bodies passed |
| HTTP edge cases | HEAD, conditional GET, current/stale If-Range, ordinary small/large GET, malformed/unsatisfiable ranges, unknown names/traversal passed |
| Private protocol regressions | Authorized participant/admin, denied anonymous, poisoned-cache retry, incorrect-offset rejection, bounded open-ended responses, HEAD and explicit oversized fallback passed |
| Player regression tests | Strategy retry remount/load and unmuted click; shared-player retry; portal resume, no autoplay on retry, no false completion, stall recovery; confirmation-page video source: passed |
| Builds and types | API runtime build and web production build passed; both affected artifact typechecks passed |
| Broader test suite | Initial runs hit the shared connection limit, followed by an unrelated scheduler concurrency-test failure. Scheduler fixture isolation and deterministic concurrency coordination now pass alone and in two overlapping invocations (4 tests each); full completion validation is rerun separately. |
| Visual preview | Strategy-call page rendered with poster/player and no application console errors |
| Actual desktop/mobile browser playback | Blocked by the available Chromium 140 runtime: `canPlayType` for H.264/AAC returns empty; both original static intro/preview and the new endpoint fail identically with `DEMUXER_ERROR_NO_SUPPORTED_STREAMS`. Desktop and Android emulation attempted, no WebKit available. Continuous playback, seek, ended and successful retry cannot be claimed. |
| Actual private lesson inventory / authenticated preview | Blocked: read-only queries using the application's Supabase service client failed twice with “Could not query the database for the schema cache. Retrying.” No disposable accounts or lesson mutations were made. Mock-backed protocol and portal-player tests pass, but are not actual authorized playback evidence. |
| Actual physical iPad | Not available in this environment; not claimed |
| Repaired published endpoint | Not checked: no deployment was authorized or performed |

After an approved publish, repeat exact-byte range probes against the new public
endpoint and verify native playback across chunk boundaries on an actual iPad.
Do not use the still-deployed old static endpoint as evidence about the repaired
API endpoint.

### Browser observations

The strategy-call, homepage introduction/full walkthrough, standalone walkthrough,
and confirmation page all requested the new endpoint with native
`Range: bytes=0-`. No native no-Range request was observed. A deliberately failed
request displayed Retry; retry issued a new request and received 206, but could
not decode in this browser. The muted-loop preview had the intended attributes
but also could not decode. Android emulation is not physical-iPad verification.
The original static sources produced the same error in isolated video elements,
confirming this is an environment-level codec limitation, not evidence that
bounded delivery succeeds or fails in Safari.
