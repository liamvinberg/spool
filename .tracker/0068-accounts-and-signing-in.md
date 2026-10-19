# #68 · Accounts and signing in

- State: closed
- Labels: ready-for-agent
- Parent: #64
- Created: 2026-10-18T17:43:55.947Z
- Updated: 2026-10-18T17:43:59.021Z
- Closed: 2026-10-18T17:43:59.021Z

## Parent

#64

## What to build

Extend the beta's hand-built auth into accounts: one account per verified, lower-cased email address. One sign-in page at `spool.page/sign-in`: Continue with Google (trusted only for Gmail and verified Workspace addresses), or an email field that sends a six-digit code through Resend. After signing in, a skippable offer to add a passkey; a returning person with a passkey signs in in one step. The Mac app (Sign in at the foot of Home's sidebar) and `spool login` hand off through the system browser with the existing loopback and PKCE handoff and get a long-lived session per machine, stored hashed in the cloud and in the Keychain, renewed while in use. `spool.page/account` lists Macs and passkeys and revokes a machine. Beta publishers become accounts under the email they were approved with; beta invited viewers become accounts on first sign-in with outsider access carried over.

## Acceptance criteria

- [X] Google and an email code for the same address reach one account
- [X] A Google account with an unverified non-Workspace address is asked for an email code
- [X] Code sends are limited per mailbox, per IP and globally; invisible characters are refused
- [X] A passkey can be added after sign-in and used to sign in with no email
- [X] `spool login` and the app's Sign in produce a machine session that survives restarts and renews in use
- [X] Revoking a machine on `spool.page/account` refuses its next request
- [X] Sign out of this Mac works
- [X] Beta publishers and invited viewers map onto accounts as described
- [X] Worker tests beside the existing auth app tests; an end-to-end test of the `spool login` handoff

## Blocked by

None (can start immediately)

*From Linear DEV-183.*

Related: #59, #3

Plane: SPOOL-68

## Comments

### agent, 2026-10-18T17:43:59.006Z

**Liam, 2026-10-05:** Prerequisites in place (2026-10-05): Google OAuth client `667639668671-hvfhkecdutli2n06sbc3d0vj6ug6guod` (project `spool-cloud-beta-test`) has the redirect URI `https://spool.page/auth/google/callback` and is In production. Branding verification isn't done, so Google won't show the app name on the consent screen. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `RESEND_API_KEY` (sending only, `mail.spool.page`) are set on the production `spool-cloud` Worker. The beta's isolated env keeps its own. Local copies are in `~/.config/spool-cloud/secrets.env` (mode 600): load by reference, never print. Generate `AUTH_HASH_KEY`, `MAILBOX_CODE_KEY` and `MAINTAINER_TOKEN` yourself. Resend is on the Free plan (100 a day): fine for Devosurf, move to Pro before signup opens.

### agent, 2026-10-18T17:43:59.014Z

**Liam, 2026-10-06:** Shipped in spool.page 0.28.0, with the cloud live on beta.spool.page and spool.page. 0.31.0 moved core's default to spool.page, so people sign in once more after updating.

Decisions where the spec was silent:
- A browser session lasts 30 days. A Mac's session lasts 90 days past its last use.
- The passkey offer stops after one "Not now", per account.
- Sign-in is invite-only until launch. Only an address with an account, an open invite, a live people share, or a beta approval or invitation gets a code. Anyone else sees "spool is invite-only for now", and no email goes out.
- Beta approvals with no publisher row can't publish from an account. That stays with #59.
- The maintainer can delete an account. Only the last admin of a team is refused.
- The one-a-minute email limit counts codes and invites apart, so an invite never holds up the code that follows it.

Left:
- Deleting your own account isn't built. It needs its own ticket (Liam).
- Old sign-in attempts, handoffs and passkey challenges are never cleaned up. A cleanup pass later (no owner yet).

Checks for Liam on real devices:
- [ ] Sign in with Gmail on spool.page and land on the passkey offer.
- [ ] Add a passkey on /account with Touch ID, then sign in with it in a fresh browser profile.
- [ ] Sign in from the foot of Home in the Mac app. It comes back by itself and the Mac shows on /account.
- [ ] Revoke that Mac on /account. Its next spool cloud list fails.
- [ ] Choose "Not now", sign in again, and get no offer.
- [ ] An uninvited address by Google, by code and through spool login gets the invite-only page and no email.
