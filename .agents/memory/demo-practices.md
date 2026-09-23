---
name: Two sales-demo practices
description: How the chiro and aesthetics demo accounts are isolated, seeded and verified; what to keep in mind when adding a niche or a third demo.
---
- Each demo practice is a participant family (owner + 4 callers under the demo e-mail domain) keyed by its owner e-mail; every reset/wipe/"view as" resolves the practice from the owner e-mail of the current family and only touches ids in that family. Never wipe by `is_demo = true` alone — that would cross practices.
  **Why:** sales runs both demos on the same shared Supabase project; a presenter resetting one must not wipe a colleague's live demo.
- Niche ids for BOTH practices are resolved from the `niches` table by exact name at seed time; a renamed niche makes the seed throw (on purpose) instead of silently dropping a showcase patient.
- Showcase patients must number <= the owner's `call_batch_size`; the aesthetics owner runs batch 16 (not in `CALL_BATCH_SIZES`), so the batch-size select shows the current value as an extra option rather than blanking. Adding a 17th aesthetic niche means raising that batch size or rotating showcases.
- Verifying a seed: bundle a throwaway script with esbuild (see api-server-scripts.md), call `ensureDemoSeeded(key, { force: true })`, then `getCallQueueState(ownerId, batchSize)` and check every showcase niche appears in `followUps + newCalls`. Contacts use `name` (single column) and `original_complaint`, not first/last/chief_complaint.
- Sample CSV per practice deliberately includes two rows whose niche the account lacks (entitlement warning the user wants) and two rows whose phone matches a seeded patient (dedupe demo); the seeded phones are deterministic per rngSeed, so changing a seed or the RNG call order requires re-picking those two phones.
- Aesthetic complaints are the concern-option chip labels for that niche (except Cellulite Reduction and Red Light / Body Contouring which name the service); a unit test enforces it along with the banned-phrase lint on practice-copy.ts.

**Shell check:** the RPC accepts FormData as `{"__formData":[[k,v],...]}`, so `demo/enterDemo` + `demo/resetDemo` with a cookie jar reseeds without a browser.
