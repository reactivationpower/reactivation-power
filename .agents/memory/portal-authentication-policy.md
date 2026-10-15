---
name: Portal authentication policy
description: User-approved sign-in requirements for practice owners and individual callers.
---

Practice owners and callers must each use their own registered email as their username, their own password, and a fresh six-digit email code. Avoid shared office inboxes and shared accounts.

**Why:** The user explicitly requested individual email/password sign-in and confirmed that both owners and callers need an email code, not only callers.

**How to apply:** Keep enrollment, caller invitations, profile editing, and welcome instructions consistent with individual accounts. Password setup/reset must verify access to the registered email; it must not directly grant portal access.

Email codes must be single-use, expire after five minutes, permit at most five incorrect attempts (owner lowered from six, Oct 2026), and have rate-limited resends.

Owner-approved change (Oct 2026, to cut down on codes): inactivity logout is 30 minutes (was five), with a "Still there?" warning one minute before. After a correct code, that browser is remembered for that person for a fixed 48 hours from code entry (use does not extend it); during that time they type email + password but skip the code. Memory is per person and per browser.

**Why:** customers were getting too many codes.

**How to apply:** manual log out forgets that browser; password change/reset forgets every browser; inactivity logout must NOT forget it (otherwise the feature does nothing). Account and billing checks still run on a remembered computer. No "trust this computer" checkbox, no device-management screen, and admins have no remembered computer.

Owner-approved speed rules (Oct 2026, after a real customer was blocked right after creating her account): sign-in code emails and password emails use separate per-person limits (codes: 15-second resend gap, 10/hour; password emails: 5/hour). Saving a password from a setup link auto-emails the first code (always allowed) and shows code entry. Limit messages show the real remaining wait. Email only — SMS codes were declined for now.

**Why:** shared limits made "set password, then sign in" hit a 60-second block.

**How to apply:** never re-merge the two counters; per-person password-email limits keep the generic "if registered" reply so the wait time never reveals whether an account exists.

**Why:** These were explicit user requirements. Passive playback and automatic requests must not postpone inactivity logout.

**How to apply:** Preserve the 30-minute inactivity rules when changing authentication or adding protected routes. Inactivity logout affects the browser session and its tabs, not other independently authenticated devices.

The two sales demo accounts must keep their existing demo access behavior, without inactivity logout or the customer password-and-email-code requirements. This includes switching between owner and caller views within either demo.

**Why:** The user explicitly said, “I dont want the demo accounts to have the inactivity logouts, etc. I want the 2 demo accounts to stay like they currently are.”

**How to apply:** Scope the exemption to the two configured demo practice families. Preserve their shared demo-password entry and normal cookie lifetime; do not exempt real customers or administrators.
