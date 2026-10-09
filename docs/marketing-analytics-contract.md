# First-party marketing analytics

This system extends internal sales leads, not patient records or a parallel CRM.
Marketing attribution never writes affiliate ownership or commission rules.

## Measurement contract

Version 1 accepts only registered page/control identifiers and closed semantic
event types. No full URLs, query strings, form values, error messages, IP addresses,
fingerprints or session recordings are stored in behavioral telemetry. UTM labels
are allow-listed and restricted to short campaign-label syntax. Referrers contain
only validated hostnames. Authorized contact names come from the sales lead join.

Browser identity is an estimate, not a person count. Defaults are 90 days of
attribution and 30 minutes of inactivity per session. First touch means first in
observed, retained history, never guaranteed lifetime acquisition. Direct visits
are retained and **last touch includes direct**; first and last are separate
allocation models, never summed. Conversion snapshots are immutable.

Only successful backend intake may associate anonymous history. Once a browser
is known, a different submitted lead must get a fresh identity; it cannot inherit
the previous contact's events. No IP/name matching. Trusted existing lead/customer
relationships are the only cross-device joins.

Customer conversion means completed enrollment, not a CRM stage, contract value,
card save or pending payment. Collected revenue derives from authoritative
successful billing history, separated by currency, net of refunds and recorded
dispute adjustments. Backend IDs deduplicate outcomes and recover missing
analytics independently of form/booking/payment availability.

## Cohorts and limitations

Funnel cohort date is the browser's first eligible session in the selected funnel.
Count ordered stages within the configured observation window (default 90 days)
of that entry; later bookings are counted against that cohort, not current-period
visits. Repeated submissions/reloads remain activity but are not new conversions.
Post-booking video is never pre-booking influence. Watched/not-watched comparisons
are associations, not causation; small samples are not reliable evidence.

Video: union of observed content intervals, bounded by 240 seconds. Active elapsed
playback and distinct content seconds are separate, especially at non-1x speed.
Sample approximately once per second, batch transport; reset sample baseline on
seeking, buffering, pause and visibility changes. Hidden playback is not engaged.
Position is not watch duration. Replay adds elapsed time but not unique seconds.
Playback observations are neither proof of attention nor perfectly lossless.

## Privacy and operations

Behavioral tracking requires opt-in and is disabled for DNT/GPC. Refusal must not
break forms, scheduling or video. Short-link redirects do not count as people.
Known test/internal/bot traffic is excluded by default; bot detection is best
effort and missing/blocked tracking reduces totals.

Detailed events default to 180-day retention. Non-identifying aggregates may be
kept longer; conversion/audit and legal financial records have separate retention.
Behavioral removal must not delete billing records. Administrative analytics
requests must never refresh the five-minute human-activity timer.

## Recovery and aggregation details

The durable sales-submission, confirmed-appointment, completed-enrollment and
billing records are the reconciliation queue. Inline hooks are best effort;
the existing five-minute sales/lead worker wakeups and daily billing job retry
missing analytics using stable business IDs. They never retry a payment, form,
message or booking merely to recover analytics. Reports show query freshness;
business outcomes can lag until the next successful reconciliation.

Visitor source labels use observed touches up to the cohort's observation-window
end. Each conversion uses its own immutable snapshot; a later direct revisit
can therefore change a visitor's latest-source grouping without changing an
earlier sale's credit. Source-row lead/visitor ratios are descriptive, not the
ordered funnel conversion rate. Headline visitor-to-booking only counts booked
browsers in its denominator cohort. Unobserved business outcomes are listed
separately through unknown/unattributed rows, not invented browser visits.
All cohort-attributed outcomes, including money, use the selected observation
window. Unobserved outcomes use their business event date for date filtering.

Video rows deduplicate content per session/video/placement. Viewer aggregates
union the same content seconds across that browser's sessions per placement.
Repeated content seconds and active elapsed time remain separate. Play events
are playback starts/resumes, not unique viewers. Recorded proven dispute cash
losses and subsequent recoveries adjust net money; unresolved face-value
disputes without cash evidence are not assumed to be additional withdrawals.

To add a public page, implement the route, then register its stable ID/path/funnel
in Lead Sources. Standard views/links are handled by the shared tracker.
Use the shared track hook and registered control IDs for semantic UI outcomes.
Custom trusted business outcomes still need an explicit server hook and durable
recovery source; they cannot be detected automatically. The analytics-test
route demonstrates reuse and is classified as test traffic.
