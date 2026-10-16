---
name: React form-action reset and Back-button restores
description: React 19 resets <form action={fn}> fields when the action settles; affects kept entries after errors or bfcache Back restores.
---
React 19 auto-resets a form whose `action` is a function when the action settles. Uncontrolled inputs fall back to their `defaultValue`; controlled selects jump to their first enabled option and React does NOT re-sync them unless the component re-renders afterwards (setting the same state value does not re-render).

**Why:** after a redirecting submit + browser Back (bfcache), the lead form showed blank names and wrong selects even though React state was right.

**How to apply:** to keep entries, settle the action with a state whose `values` echo the FormData (so defaultValues match), and force one extra render in the effect that reacts to `state.values`. Redirecting RPC actions settle on a `pageshow` with `persisted`; pass a `restored` option to `action()` when a form needs custom restore state.
