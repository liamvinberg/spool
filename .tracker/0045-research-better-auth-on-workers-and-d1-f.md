# #45 · Research: Better Auth on Workers and D1 for Spool Cloud accounts

- State: closed
- Labels: wayfinder:research
- Parent: #3
- Created: 2026-10-18T17:43:55.721Z
- Updated: 2026-10-18T17:43:58.318Z
- Closed: 2026-10-18T17:43:58.318Z

## Question

Can Better Auth carry Spool Cloud accounts as Decide teams, roles and invites (#19) settled them, on the existing Cloudflare Workers + D1 estate? Facts needed:

- Does it run on Workers with D1 (adapter, edge constraints, cold start), and what is its current release and maintenance state?
- Google sign-in, six-digit email codes (sent through Resend) and passkeys: which are core and which plugins, and how mature is each?
- One account per verified email address, with every method reaching the same account: what does it do by default, and can Google be trusted only for Gmail and verified Workspace addresses?
- Long-lived, revocable per-device sessions for a daemon, and a browser handoff to a CLI or Mac app (loopback plus PKCE, as the beta built).
- Rate limits on email sends, and whether the beta's per-mailbox and per-IP budgets fit.
- How the beta's hand-built tables (`migrations/auth/` in spool-cloud) and sessions would move over, against keeping the hand-built auth.

Report: `spool-cloud/research/<n>-better-auth-accounts/`.

*From Linear DEV-159.*

Related: #64, #19

Plane: SPOOL-45

## Comments

### agent, 2026-10-18T17:43:58.311Z

**Liam, 2026-10-04:** ## Resolution

Report: `spool-cloud/research/159-better-auth-accounts/` (commit `6dcea82`), checked 2026-10-04 against better-auth 1.7.7, with a local Worker and D1 spike beside it.

- Better Auth 1.7.7 (2026-09-30, MIT) is actively maintained: seven patch releases in six weeks, but 25 security advisories since 2026-05-01 (one critical on 2026-09-30, not in features Spool would enable) and a policy of supporting only the latest release.
- It runs on Workers and D1: the built-in Kysely adapter takes the D1 binding, and `getMigrations` created all tables on local D1. D1 has no interactive transactions, so invite, team and passkey writes run sequentially without rollback. Bundle with Google, email codes, organizations and passkeys is 3.4 MiB (about 570 KiB gzip).
- Open Workers and D1 bugs at 1.7.7: a Kysely 0.29 mutex that throws cross-request I/O errors under parallel load (better-auth/better-auth#11483) and initialization promises that hang after an aborted first request (better-auth/better-auth#10315). Both have unmerged fix PRs.
- Google and email codes are core, passkeys are the separate `@better-auth/passkey` package. Google's `emailVerified` is the raw claim, so Gmail and Workspace only needs a `validateUserInfo` rule. Same-address Google and code sign-ins land in one account by default, and linking now needs the local email verified too.
- Session tokens are stored raw in D1 (the beta stores an HMAC). Session lifetime is one global value. Revocation is by token, and the organization plugin gives custom roles, a last-admin guard, invites bound to the session's address and a creation gate. These were run in the spike.
- Email send limits are per IP and path only (3 per 60 s by default). Six codes went to one address from six IPs, so the beta's per-mailbox, global and eligibility checks stay app code. The address is lower-cased whole, and zero-width characters are rejected, not stripped.
- CLI and Mac handoff has no exact match: oauthProvider has S256 PKCE with a loopback redirect on any port but issues OAuth tokens, device authorization gives a revocable session through a typed code, Electron uses a deep link. Beta hashed sessions cannot be imported, so everyone signs in once at cutover.

Unverified: remote D1 and parallel behaviour, Google end to end and the `validateUserInfo` rule, a passkey ceremony, hashing session tokens or per-device lifetimes through hooks, per-device revocation of oauthProvider tokens, last-admin races and partial invite writes on D1.
