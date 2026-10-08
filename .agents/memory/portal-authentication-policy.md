---
name: Portal authentication policy
description: User-approved sign-in requirements for practice owners and individual callers.
---

Practice owners and callers must each use their own registered email as their username, their own password, and a fresh six-digit email code. Avoid shared office inboxes and shared accounts.

**Why:** The user explicitly requested individual email/password sign-in and confirmed that both owners and callers need an email code, not only callers.

**How to apply:** Keep enrollment, caller invitations, profile editing, and welcome instructions consistent with individual accounts. Password setup/reset must verify access to the registered email; it must not directly grant portal access.

Email codes must be single-use, expire after five minutes, permit at most six incorrect attempts, and have rate-limited resends. A fresh password-and-code sign-in is required after the five-minute inactivity logout.

**Why:** These were explicit user requirements. Passive playback and automatic requests must not postpone inactivity logout.

**How to apply:** Preserve the five-minute rules when changing authentication or adding protected routes. Inactivity logout affects the browser session and its tabs, not other independently authenticated devices.
