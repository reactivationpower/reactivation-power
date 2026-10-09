---
name: Structural merge integrity
description: Why validation must run again after concurrent task merges, and how to handle colliding migration metadata.
---

A clean structural sync is not proof that sibling functions or tests retained their correct behavior.

**Why:** The workspace's structural merge can silently omit an import or pair a repeated call/assertion with the wrong test, even after all explicit conflicts are resolved.

**How to apply:** Preserve both tasks' functional changes, compare conflicted blocks with incoming code, and run type checks and affected regression tests against the merged tree rather than relying on pre-sync passes.

Concurrent migration snapshots must be regenerated after retaining the incoming migration sequence, not hand-merged.

**Why:** Task branches can independently consume the same migration numbers, while their development changes may already have been applied to the shared database.

**How to apply:** Append a regenerated migration after incoming history, review its SQL, and ensure it safely handles the already-applied task-owned objects without altering or deleting unrelated shared data.
