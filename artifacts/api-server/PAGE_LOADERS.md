# Page loader API

All loaders use `GET /api/pages/...`. Successful loaders return `{ "data": { ... } }`.
A Next redirect is returned with HTTP 200 as `{ "redirect": "/path" }`; a Next
`notFound()` is returned with HTTP 404 as `{ "notFound": true }`. Unexpected
errors are HTTP 500 with `{ "error": "..." }`.

Every `/portal/**` loader requires a valid `tp_session` cookie and otherwise
redirects to `/login?next=<encoded pathname>`. Every `/admin/**` loader requires
a valid `tp_admin` cookie and otherwise redirects to
`/admin-login?next=<encoded pathname>`. Public loaders have no cookie guard.
Query parameters are strings; repeated/array values are ignored unless noted.

`Map` and `Set` values from the original server components cannot be represented
in JSON. Map-derived values below are returned as plain objects keyed by the
original map key, and sets used only for computation are not returned.

## Layouts and authentication

### `GET /api/pages/portal/_layout`

Query: none. Auth: participant.

Data:
- `participant` — current participant record.
- `demo` — `null` for normal accounts, otherwise `{ currentId, identities, seededLabel, stale }`; `identities` is the active demo identity array.

### `GET /api/pages/admin/_layout`

Query: none. Auth: admin. Data has no keys (`{}`).

### `GET /api/pages/login`

Query: `next` (optional). Auth: public; an existing participant session redirects
to `/portal`.

Data:
- `next` — optional requested post-login path.

### `GET /api/pages/admin-login`

Query: `next` (optional). Auth: public.

Data:
- `next` — optional requested post-login path.

## Portal

### `GET /api/pages/portal`

Query: none. Auth: participant.

Data:
- `participant` — current participant record.
- `ownerId` — account owner UUID.
- `isOwner` — whether the participant is the owner.
- `courses` — accessible course records.
- `staff` — owner staff records (empty for staff viewers).
- `sectors` — enabled account sector strings.
- `entityLabel` — `"practice"` for healthcare, otherwise `"business"`.
- `activeStaff` — active staff count.
- `withProgress` — array of `{ course, completed, total, percent }`.

### `GET /api/pages/portal/course/:slug`

Query: none. Auth: participant. A missing/non-live course is 404; inaccessible
courses redirect to `/portal`.

Data:
- `slug` — course slug.
- `participant` — current participant.
- `course` — course record.
- `accessibleIds` — accessible course UUIDs.
- `tree` — course with ordered modules and videos.
- `videoIds` — ordered video UUIDs.
- `progress` — participant progress rows.
- `state` — computed course unlock/completion state.
- `stateByModule` — plain object keyed by module UUID containing module state.

### `GET /api/pages/portal/course/:slug/video/:videoId`

Query: none. Auth: participant. Missing course/video is 404; inaccessible course
redirects to `/portal`; a locked video redirects to the course page.

Data:
- `slug`, `videoId` — route identifiers.
- `participant`, `course`, `accessibleIds`, `tree` — authenticated course context.
- `flat` — ordered array of `{ video, module }` for the course.
- `currentIndex` — current video's zero-based position.
- `video`, `module` — current records.
- `videoIds`, `progress`, `state` — progress inputs and computed state.
- `videoStates` — plain object keyed by video UUID containing video state.
- `currentState` — current video state.
- `attachments` — current video's attachment rows.
- `prev`, `next` — adjacent `{ video, module }` entries or `null`.
- `nextState` — next video's state or `null`.
- `upNext` — at most five subsequent `{ video, module }` entries.

### `GET /api/pages/portal/contacts`

Query: none. Auth: participant.

Data:
- `participant`, `ownerId`, `isOwner`, `owner` — account context.
- `sectors` — enabled sectors.
- `contacts` — account contacts with niche/stage metadata.
- `stages` — account pipeline stages.
- `niches` — enabled account niches.
- `allSectorNiches` — all active niches in the account sectors.
- `serviceMappings` — saved imported-service mappings.
- `defaultNiche` — owner's default niche or `null`.
- `healthcare` — healthcare-sector flag.

### `GET /api/pages/portal/contacts/:id`

Query: none. Auth: participant. Returns 404 if the contact is absent or belongs
to another account.

Data:
- `id` — contact UUID.
- `participant`, `ownerId` — viewer/account context.
- `contact` — contact with niche/stage/follow-up metadata.
- `history` — call history rows.
- `stages` — account pipeline stages.
- `niches` — enabled account niches.

### `GET /api/pages/portal/dialer`

Query: none. Auth: participant.

Data:
- `participant`, `ownerId`, `isOwner`, `owner` — account context.
- `sectors`, `healthcare` — sectors and healthcare flag.
- `batchSize` — effective call batch size.
- `queueState` — complete computed queue state.
- `niches`, `staff`, `teamStats` — enabled niches, owner-only staff, and owner-only team stats.
- `followUps`, `newCalls`, `waiting` — queue-state arrays/count used by the page.

### `GET /api/pages/portal/dialer/call/:contactId`

Query: none. Auth: participant. Returns 404 for a missing/cross-account contact.

Data:
- `contactId`, `participant`, `ownerId`, `contact` — call context.
- `sectors`, `niches` — enabled sector/niche data.
- `script` — master script or `null`.
- `sections` — niche script sections.
- `queue` — complete call queue.
- `owner` — owner participant or `null`.
- `callHistory` — contact call history.
- `flow` — `{ steps, choices }` script flow.
- `remaining` — queue after removing the current contact.
- `nextContactId` — next queued contact UUID or `null`.
- `nicheInactive` — whether the page must show its blocked-call state.

### `GET /api/pages/portal/dialer/script`

Query: `screen`, `from`, `course` (all optional). Auth: participant.

Data:
- `screen`, `from`, `course` — original query values.
- `participant`, `ownerId`, `owner`, `sectors`, `niches` — account/script context.
- `courseSlug` — validated course slug or `null`.
- `backHref`, `backLabel` — computed safe back-link values.
- `flow` — `{ steps, choices }` script flow.

### `GET /api/pages/portal/settings`

Query: none. Auth: participant.

Data:
- `participant`, `ownerId`, `isOwner`, `owner` — account context.
- `sectors`, `healthcare`, `entityLabel` — sector-derived display context.
- `niches` — enabled account niches.
- `staff` — owner staff (empty for staff viewers).
- `stages` — pipeline stages.
- `batchSize` — effective call batch size.

### `GET /api/pages/portal/analytics`

Query: none. Auth: participant.

Data:
- `participant`, `ownerId`, `owner`, `staff` — account context.
- `members` — owner followed by staff.
- `memberIds` — member UUIDs.
- `teamStats` — per-member team stat cards.
- `team` — combined call analytics (summary, insights, trends, buckets).
- `leaders` — niche leaderboard rows.

### `GET /api/pages/portal/analytics/:callerId`

Query: none. Auth: participant. Returns 404 if the caller is outside the
viewer's account.

Data:
- `callerId`, `viewer`, `ownerId`, `caller` — viewer/caller context.
- `analytics` — caller summary, insights, dispositions, and chart buckets.
- `courseIds` — account-accessible course UUIDs.
- `audit` — caller training audit.
- `s` — alias of `analytics.summary`, matching the server component.
- `hasCalls` — whether the summary contains any calls.

### `GET /api/pages/portal/reactivation`

Query: none. Auth: participant. Always redirects to `/portal/dialer`. This is
the canonical loader for the original optional catch-all legacy page.

## Admin

### `GET /api/pages/admin`

Query: none. Auth: admin.

Data:
- `stats` — dashboard aggregate statistics.
- `mostWatched` — most-watched video rows.
- `viewers` — all viewer analytics rows.
- `recentViewers` — six most recently seen viewers.
- `cards` — four preformatted dashboard card objects.

### `GET /api/pages/admin/courses`

Query: none. Auth: admin.

Data:
- `courses` — all course records.
- `counts` — array of `{ courseId, modules, videos }`.
- `countMap` — plain object keyed by course UUID containing those counts.

### `GET /api/pages/admin/courses/:id`

Query: none. Auth: admin. Missing course is 404.

Data:
- `id` — course UUID.
- `tree` — course with ordered modules/videos.
- `videoIds` — all video UUIDs in course order.
- `attachments` — attachment rows for those videos.

### `GET /api/pages/admin/participants`

Query: `q` (default empty), `new`, `status` (default `"active"`). Auth: admin.

Data:
- `q`, `openNew`, `status`, `showDisabled` — normalized filter state.
- `viewers` — all viewer rows.
- `videoCount` — total content-library video count.
- `query` — trimmed lowercase search string.
- `filtered` — search-filtered viewer rows.
- `allOwners` — filtered owner rows before status filtering.
- `activeCount`, `disabledCount` — owner status counts.
- `owners` — owner rows for the selected status.
- `staffByParent` — plain object keyed by owner UUID containing staff rows.

### `GET /api/pages/admin/participants/:id`

Query: none. Auth: admin. Missing participant is 404.

Data:
- `id`, `participant`, `ownerId`, `isOwner` — participant/account context.
- `staff`, `aliases`, `sessions` — related account and login records.
- `courses`, `accessIds`, `accessibleCourses`, `courseTrees` — course access and trees.
- `events` — recent participant activity.
- `progress` — participant video progress rows.
- `niches`, `nicheAccessIds` — all active niches and account niche access.
- `nicheAccessSet` — plain object keyed by granted niche UUID with `true` values.
- `nichesBySector` — plain object keyed by sector containing niche rows.
- `progressByVideo` — plain object keyed by video UUID containing progress.
- `accessSet` — plain object keyed by granted course UUID with `true` values.
- `videoIds` — video UUIDs referenced by activity.
- `eventVideos` — matching `{ id, title }` video rows.
- `videoTitle` — plain object keyed by video UUID containing title.
- `parent` — parent owner participant or `null`.
- `reactivationStats` — owner account reactivation stats or `null`.

### `GET /api/pages/admin/analytics`

Query: `participant`, `course`, `event` (all optional filters). Auth: admin.

Data:
- `participant`, `course`, `event` — filter values.
- `stats`, `courses`, `progress`, `viewers`, `events` — source analytics data.
- `trees` — course trees, including possible `null` entries.
- `byVideo` — plain object keyed by video UUID with started/completed/percent/watch aggregates.
- `courseStats` — fully derived course/module/video engagement rows.
- `nameOf` — plain object mapping participant UUID to full name.
- `videoIds`, `eventVideos` — activity video IDs and title rows.
- `videoTitle`, `courseTitle` — plain UUID-to-title objects.
- `activeViewers` — viewers with at least one session.

### `GET /api/pages/admin/reactivation`

Query: none. Auth: admin.

Data:
- `niches` — niche records.
- `script` — master script or `null`.
- `sections` — script section rows.
- `slots` — slot names extracted from the master script.

### `GET /api/pages/admin/payments`

Query: none. Auth: admin.

Data:
- `links` — up to 200 payment-link records, newest first.

### `GET /api/pages/admin/payments/:id`

Query: none. Auth: admin. Missing payment is 404.

Data:
- `id` — payment-link UUID.
- `detail` — `{ link, accounts }`.
- `link` — payment-link record.
- `accounts` — provisioned participant records.
- `isPaid` — paid-status flag.
- `owner` — provisioned owner or `null`.
- `staffAccounts` — provisioned staff records.

### `GET /api/pages/admin/emails`

Query: none. Auth: admin. Data has no keys (`{}`); the original page's template
catalog is static client/build data.

### `GET /api/pages/admin/landing`

Query: none. Auth: admin. Data has no keys (`{}`); the original page has no
server-fetched values.

## Payments

### `GET /api/pages/pay/:token`

Query: none. Auth: public. Missing token is 404; an already-paid link redirects
to its thank-you page.

Data:
- `token` — public payment token.
- `link` — `{ name, amountCents, status }`.

### `GET /api/pages/pay/:token/thank-you`

Query: none. Auth: public. The loader verifies unpaid-looking records with
Stripe and redirects back to checkout if verification is not paid.

Data:
- `token` — public payment token.
- `link` — `{ name, amountCents, status }` as initially loaded.
- `confirmation` — Stripe confirmation result when verification ran, otherwise `null`.

## Healthcare funnel

### `GET /api/pages/healthcare/book-a-call`

Query: `cid`, `name`, `inactive`, `value`, `services` (optional). Auth: public.
Values are truncated exactly as in the original page.

Data:
- `params` — original query object.
- `contactId` — `cid` truncated to 64 characters.
- `firstName` — `name` truncated to 40 characters.
- `carried` — plain object of non-empty sanitized values carried forward.
- `thankYouHref` — computed thank-you URL.

### `GET /api/pages/healthcare/thank-you`

Query: `name`, `services`, `inactive`, `value`, `tz`, `slot` (optional). Auth:
public.

Data:
- `params` — original query object.
- `firstName` — sanitized name.
- `services` — at most 30 display service names.
- `inactiveCount`, `patientValue` — parsed calculator defaults.
- `tzParam`, `timezone` — requested and effective US timezone.
- `timezoneLabel` — display label for the effective timezone.
- `slotMs` — parsed slot epoch milliseconds or `null`.
- `bookedFor` — formatted booked date/time or `null`.
- `servicesLabel` — human-readable service summary.

### `GET /api/pages/healthcare/your-opportunity`

Query: any string-valued parameters. Auth: public. Always redirects to
`/healthcare/book-a-call`, preserving those string parameters.