# Calls Due Now performance

The dialer, direct due queue, and manual Add More Calls use a compact,
read-only policy snapshot and hydrate full contact/service/call details only
for visible patients and the next reserve batch. Eligibility is still decided
by `planOutreach`, also used when claiming under the patient lock.

There is no queue-result cache: due times, office treatment dates, enabled
niches, opt-outs, and leases must remain fresh. The snapshot remains linear in
the practice's patients and service count, but excludes contact notes, service
notes/complaints, full call rows, and call counts. Full details remain available
in Contacts and the call screen. A missing legacy primary is represented
read-only during selection; detail/claim backfill is scoped to that patient.

## Reproduce the measurement

From the workspace root:

```sh
pnpm --filter @workspace/api-server exec vitest run \
  src/lib/patients/queue-read.db.test.ts --reporter=verbose --silent=false
```

Requires the existing `SUPABASE_DB_URL`. The test uses transaction-local
temporary copies of the real tables and indexes, then rolls back. It never
creates shared patients, sends email, or changes production data.

The benchmark creates 10,000 synthetic patients, 20,000 service rows and
40,000 historical calls, warms both query paths, and measures three samples.
Its baseline reproduces the previous contact/follow-up/latest-call/count plus
full-service read, without the extra primary-service write or niche/stage
lookups (a conservative baseline). Times cover database round trips and Node
row parsing; the compact sample also includes policy computation. This is not
a browser or complete page-loader latency measurement.

Measured in the workspace on 2026-10-07:

| Measurement | Previous full read | Compact policy read |
| --- | ---: | ---: |
| Median latency | 1,787 ms | 952 ms |
| Serialized data | 70,090,027 bytes | 10,890,001 bytes |

This run reduced selection latency by about 47% and serialized data by about
84%. Exact times depend on network/database load; tests assert data reduction
and complete patient coverage rather than a flaky wall-clock ceiling. Separate
queue-state tests verify that a 10,000-patient reserve hydrates only the next
20 patients, retains an accurate waiting count, and never tops up a live batch.
Callbacks and confirmations are unthrottled; timed policy rules are unchanged.
