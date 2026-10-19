# #128 · Billing: open team creation to everyone and go live

- State: closed
- Labels: ready-for-human
- Parent: #122
- Blocked by: #124, #126, #127
- Created: 2026-10-18T17:43:56.634Z
- Updated: 2026-10-18T17:44:01.155Z
- Closed: 2026-10-18T17:44:01.155Z

## Parent

Spec: paying for a team: trial, seats and billing (#122)

## What to build

The launch switch. Creating a team stops needing `may_create_team`. Devosurf stays free; any other team that exists starts a 14-day trial from release day. Before it ships, one run-through in Stripe test mode: a real Checkout, a portal plan switch, a failing test card through to lapse, a cancel with refund. Then Stripe goes live: live keys, a live webhook endpoint with its secret, the price script and portal configuration in live mode. The tax steps (VAT registration, Stripe Tax threshold monitoring, invoice settings) are in the spec's Further Notes and are Liam's.

## Acceptance criteria

- [ ] Any signed-in account can create a team, which starts a trial
- [ ] Existing teams other than Devosurf get a 14-day trial from release day; Devosurf is free
- [ ] The test-mode run-through passed, with what was checked recorded here
- [ ] Live keys and webhook secret are set as worker secrets (never printed), the live prices exist, and the live portal matches test
- [ ] Mojo Consulting AB's VAT registration is confirmed, Stripe Tax's threshold monitoring is on, and invoices number across the account with the company's details

## Blocked by

- Billing: seats follow roles
- Billing: failed payments, cancelling and the 14-day refund
- Billing: the setup list and starting a team from [spool.page](http://spool.page)

*From Linear DEV-279.*

Related: #125, #123, #118

Plane: SPOOL-128

## Comments

### agent, 2026-10-18T17:44:01.128Z

**Liam, 2026-10-12:** Progress (task 124):
- Stripe live: live restricted key, live product/prices/portal (stripe-prices.mjs --live), live webhook, secrets on spool-cloud. Each environment names its mode (STRIPE\_MODE: production live, isolated test).
- Team creation open to anyone signed in (may\_create\_team no longer gates). Sign-in itself is still waitlist/invite-only.
- Comps: a free list by email (PUT /internal/accounts//free-teams); Checkout takes no promotion codes (the Stripe account's other products have unrestricted 100% codes).
- Existing teams: production has only Devosurf (free), so no trials to start.
- Tax: Stripe Tax active, SE registration, head office Tumba. Threshold monitoring and invoice numbering not checked (the key can't read account settings).
- A customer-persona run on the beta (test mode) went through start, invite, Mac, move, pay, seats, yearly, card, cancel, delete: all worked. Blocker: nothing on spool.page leads to /start (that's #118's landing button), and strangers can't sign in.
Open: #118 (landing start button, pricing, legal pages) and whether sign-in opens beyond the waitlist.

### agent, 2026-10-18T17:44:01.142Z

**Liam, 2026-10-13:** Closed in agent-hub task 146: team creation is open (spool-cloud d086ba4, anyone signed in may start a team) and production bills in live mode (dfee8a6, STRIPE\_MODE live). The tax criterion (VAT registration, Stripe Tax threshold monitoring, invoice numbering) is Liam's and isn't verifiable from the code.
