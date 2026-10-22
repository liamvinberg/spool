# #199 · Leaving a team: delete your own account, and Former member

- State: closed
- Labels: ready-for-agent
- Parent: #116
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:54:18.922Z
- Updated: 2026-10-21T19:58:10.105Z
- Closed: 2026-10-21T19:58:10.105Z

## Parent

Spec: a project leaves a team, and deleting an account (#116)

## What to build

A person deletes their own account at spool.page/account. The account page lists email, teams (name and role), Macs and passkeys, and ends with **Delete account**. Its confirm says teams keep your work, your Macs stop syncing and their folders stay as ordinary local projects. It names every team where you are the only member, which is deleted with the account, and refuses, naming them, while you are the last admin of a team with other members. You confirm by typing your email exactly. The account goes at once, and the page says so.

One account-deletion operation serves this door and the maintainer's `DELETE /internal/accounts/:email`. It does what that route does today and adds two things:
- **Sole-member teams.** Each is deleted through the existing team delete first: 30 days, then purged. A paying one's subscription ends at once, with the 14-day refund where it applies.
- **The billing email.** Where a remaining team's Stripe customer email is the account's address, it moves to the team's other admin with the earliest join, who gets one email saying so. Any other address is left alone. The Stripe port gains setting a customer's email, real and fake. A failure there is logged and doesn't block the deletion.

**Former member.** Saves by an account that no longer exists are named Former member wherever the team's history is read. The navigator's recent list keeps them as Former member instead of dropping them.

The Mac app's account view links to spool.page/account and deletes nothing itself.

Spans spool-cloud (operation, account page and routes, Stripe port, email, recent) and spool (the account view's link).

## Acceptance criteria

- [ ] `/account` lists email, teams with roles, Macs and passkeys, and Delete account at the foot
- [ ] Deleting needs the exact email typed; a mismatch re-renders with the reason and deletes nothing
- [ ] The last admin of a team with other members is refused, with those teams named; the maintainer route answers the same
- [ ] A sole-member team is deleted with the account, scheduled for purge in 30 days; if paying, its subscription is cancelled at once through the port, refunded within 14 days of the first payment
- [ ] A team whose Stripe customer email was the account's moves to its longest-standing other admin, who is emailed once; a finance@ address is untouched; a Stripe failure doesn't stop the deletion
- [ ] After deleting, the account's sessions, passkeys, memberships and solo projects are gone, its Macs stop syncing at once, and signing in again makes a fresh account that open invites still reach
- [ ] The navigator's recent shows a deleted account's saves as Former member
- [ ] Glossary: spool-cloud's **Account** gains its deleting sentence and **Former member** lands, from branch `119-wayfinder-dev-252`, without its stale invite-only wording
- [ ] Tests at the worker routes in the Workers pool with the fake Stripe port; Stripe never called

## Blocked by

None (can start immediately).

## Comments

### agent, 2026-10-21T19:58:10.105Z

Merged: spool a963331e (merge 205 #116 …) and spool-cloud f7dc00e. Built: deleteAccount (src/worker/auth/deletion.ts) behind /account's Delete account and DELETE /internal/accounts/:email; sole-member teams deleted through the team delete (cancel + 14-day refund via the port); last-admin refusal naming teams (409 last_admin); Stripe email moved to the earliest-joined other admin with one email (setCustomerEmail on the port, fake in tests; real one only type-checked); account page lists email, teams+roles, Macs, passkeys; Former member in the navigator's recent (historyAuthors/FORMER_MEMBER in auth/names.ts). Spec Q3 taken: comments keep "Deleted account". Q6 (trial-reuse hash) undecided: nothing built. spool's browser account page also gets Delete account…; the Mac's account foot already links spool.page/account. Human: design/frames/app mirror of the account page's Delete account section; verify setCustomerEmail against Stripe test mode.
