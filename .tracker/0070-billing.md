# #70 · Billing

- State: closed (wontfix)
- Labels: wontfix
- Created: 2026-10-18T17:43:55.966Z
- Updated: 2026-10-18T17:43:59.108Z
- Closed: 2026-10-18T17:43:59.108Z

> Out of date: this body predates Decide what Spool Cloud costs and what stays free (#90) and Decide how seats and billing are run (#99) (paid only, a trial with a card, no free one-editor team). Spec: buying and paying for a team (#112) rewrites it. Don't build from it.

## Parent

#64

## What to build

A team pays per editor through plain Stripe on Mojo AB: one product, $20 per editor monthly or $16 a month billed yearly, in USD and EUR. Every editor is a seat once a team has two, after 14 days' grace from the second editor joining; viewers, outsiders and pending invites never are. Admins pay with Stripe Checkout and manage it in the customer portal; Stripe Tax and VAT number collection give businesses reverse charge. Added editors are prorated, removed ones credited. When Stripe's retries run out the team lapses to free: the admin who owns the subscription stays the one editor, everyone else becomes a viewer. Maintainer-only "free team" switch; coupons for design partners. People shows "N people · M seats" to admins; Settings' Billing slot comes alive.

## Acceptance criteria

- [ ] A team with one editor is never asked to pay
- [ ] Adding a second editor shows the cost in the confirm and starts 14 days' grace
- [ ] Stripe webhooks (signed fixtures in tests) move a team through free, grace, paying and lapsed
- [ ] Lapsing leaves one editor and makes everyone else a viewer; history and shares stay
- [ ] A free-team switch exempts a team; Devosurf is marked free
- [ ] Stripe is never called in tests
- [ ] Owed before going live: whether Mojo AB is VAT-registered and on OSS

## Blocked by

- #69

*From Linear DEV-185.*

Related: #89

Duplicate of #122

Plane: SPOOL-70

## Comments

### agent, 2026-10-18T17:43:59.084Z

**Liam, 2026-10-05:** Prerequisites in place (2026-10-05): a Stripe test-mode secret key for account `mojo consulting ab` (`acct_1RTGoHHGKApTNEh3`) is `STRIPE_SECRET_KEY` in `~/.config/spool-cloud/secrets.env` (mode 600): load by reference, never print. Test mode has no products, prices or webhooks yet: create them. Stripe Tax is on with one registration, Sweden Small seller (EU), and no OSS. Set `automatic_tax` and `tax_id_collection` per Checkout session. The customer portal is configured but doesn't allow quantity changes (correct, since Spool drives quantity). Before going live: live keys from Liam, and the accountant's answer on OSS.

### agent, 2026-10-18T17:43:59.091Z

**Liam, 2026-10-05:** Deferred (Liam, 2026-10-05): the first run is Devosurf dogfood with no billing. Back to `ready-for-agent` when billing is picked up. The Stripe test key stays where the earlier comment says.

### agent, 2026-10-18T17:43:59.100Z

**Liam, 2026-10-11:** Replaced by Spec: paying for a team: trial, seats and billing (#122) and its six tickets (2026-10-11, agent-hub task 123).
