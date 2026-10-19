# #123 · Billing: a team on a trial pays through Stripe

- State: closed
- Labels: ready-for-agent
- Parent: #122
- Created: 2026-10-18T17:43:56.577Z
- Updated: 2026-10-18T17:44:00.909Z
- Closed: 2026-10-18T17:44:00.909Z

## Parent

Spec: paying for a team: trial, seats and billing (#122)

## What to build

The tracer through Stripe, in test mode and still behind `may_create_team`. A new team starts a 14-day trial with no card, one per account; a second team by the same account starts lapsed. Settings gets General and Billing tabs, Billing for admins only. During the trial Billing says "On trial until " and offers the payment choice: every member listed, admins and editors ticked as seats, viewers free, monthly or yearly, the total, and Continue to payment into Stripe Checkout. Stripe's signed webhook turns the team paying, and Billing then shows plan, next charge, card's last 4 and Manage billing, which opens Stripe's portal. The maintainer can mark a team free; Devosurf is marked. A script creates the product and both prices; the portal is configured. Stripe enters spool-cloud only as an injected port. Spans spool-cloud (model, port, routes, webhook) and spool (the two tabs).

## Acceptance criteria

- [ ] A team created by a flagged account starts a trial ending 14 days on; the same account's next team starts lapsed
- [ ] Checkout is opened with the chosen price and seat quantity, automatic tax, tax ID collection, a required billing address, and the trial's end as the first charge when 48 hours or more remain
- [ ] A signed webhook fixture turns the team paying (or paid within its trial); the same events twice or out of order leave the same state, because the subscription is read fresh from the port
- [ ] Editors left unticked become viewers only when Checkout completes; an abandoned Checkout changes nothing
- [ ] Billing shows the trial line, the payment choice and the paid summary; editors and viewers have no Billing tab and its routes refuse them
- [ ] Manage billing returns a portal URL; the portal allows plan switching (monthly to yearly at once, yearly to monthly at period end) and cancel at period end, and no quantity changes
- [ ] A free team shows "Free team" on Billing and never reaches Stripe; Devosurf is free
- [ ] The price script is idempotent and has been run in test mode
- [ ] Glossary: Seat and Trial land from the unmerged branches with Trial taking no card; Lapsed and Free team added
- [ ] Stripe is never called in tests

## Blocked by

None (can start immediately).

*From Linear DEV-274.*

Related: #128

Plane: SPOOL-123

## Comments

### agent, 2026-10-18T17:44:00.892Z

**Liam, 2026-10-11:** Landed on the build branches (not main yet; tickets close when it merges).

**spool-cloud** `124-implement-spec-https-linear-app-devosurf`:
- 1739334 deps: stripe 23.0.0
- bb60dfb billing: stripe secrets declared and checked
- 5b4729f billing: team billing, setup, checkout and stripe event tables
- 3e01211 billing: the stripe port, real and fake
- eefc620 billing: trials, checkout, portal, the signed webhook and free teams
- 56378a2 billing: the portal opens with spool's own configuration
- e260de7 billing: script for the product, seat prices and portal
- d3db875 glossary: every editor is a seat, and a team starts with a trial
- ef2fd5c glossary: a seat is every admin and editor, a trial takes no card; lapsed and free team
- a8d90d8 billing: the webhook is reached through the worker's own routes

**spool** `124-implement-spec-https-linear-app-devosurf`:
- 73e1b960 teams: billing summary, checkout and portal through spool.page, the daemon and the team source
- 0d17a18a ui: settings in general and billing tabs, billing for admins at both hosts

Stripe test mode: the price script ran three times (idempotent). Product `spool_cloud`, prices `price_1UPPDpHGKApTNEh3VFuKkucu` (spool\_cloud\_seat\_monthly, $20) and `price_1UPPDqHGKApTNEh3uyF336t3` (spool\_cloud\_seat\_yearly, $192), portal configuration `bpc_1UPPDqHGKApTNEh3qYtWzU4o` (account default). The test key lives on the m1 (`~/.config/spool-cloud/secrets.env`), not devobee.

Open: a deleted paying team keeps its subscription, and marking a paying team free doesn't cancel it (asked Liam in agent-hub task 124).

### agent, 2026-10-18T17:44:00.900Z

**Liam, 2026-10-12:** Merged to main in both repos and released: spool.page 0.38.0 on npm, spool.page (cloud) deployed to production billing in Stripe test mode until #128. Closing.
