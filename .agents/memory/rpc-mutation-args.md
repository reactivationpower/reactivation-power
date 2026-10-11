---
name: RPC actions as react-query mutationFn
description: Passing a web RPC action straight to useMutation sends react-query's context object to the server as an extra argument.
---
Wrap RPC actions in an arrow when used as `mutationFn` (`(input) => action(input)`), never pass the action itself.

**Why:** TanStack Query v5 calls `mutationFn(variables, context)`; the `action()` wrapper forwards every argument, so the QueryClient context is serialized into the RPC call. Tests asserting call args fail, and the server receives junk.

**How to apply:** any new useMutation in artifacts/reactivation-power; a few older pages still pass actions directly.
