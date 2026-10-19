# #92 · Research: selling Spool Cloud from Mojo AB

- State: closed
- Labels: wayfinder:research
- Parent: #89
- Created: 2026-10-18T17:43:56.213Z
- Updated: 2026-10-18T17:43:59.921Z
- Closed: 2026-10-18T17:43:59.921Z

## Question

Plain Stripe with Stripe Tax on Mojo AB, or Stripe Managed Payments as merchant of record: what each costs and takes off our hands for EU, UK and US customers, business and private. VAT IDs and reverse charge, OSS, what an invoice must carry, what is still open with the accountant. Builds on research 110 and Billing (#70).

*From Linear DEV-243.*

Related: #93, #112, #122, #20

Plane: SPOOL-92

## Comments

### agent, 2026-10-18T17:43:59.912Z

**Liam, 2026-10-10:** Resolved by research (2026-10-09): `spool-cloud/research/243-selling-from-mojo-ab/README.md`, on branch `97-i-m-thinking-we-should-probably-get--task-97-research-97-r3` (commit 150f79e, not yet on main).

**Cost on a $20 seat** (list rates, our arithmetic, including the 2% conversion fee to a SEK account):
- Plain Stripe: about 5–7% all-in, the cheapest.
- Paddle: 7.5–9%.
- Stripe Managed Payments: 7–10%. It is open to Sweden but fits poorly: no `tax_id_collection` or `automatic_tax`, subscriptions start only in Checkout or Payment Links, no one-off invoices, and 3.5% on the tax-inclusive amount.

**With plain Stripe, Mojo AB carries the tax:**
- EU businesses with a VAT ID: reverse charge.
- EU private buyers: OSS above EUR 10,000.
- Any UK buyer without a VAT number: UK registration within 30 days.
- US states taxing SaaS, each with its own threshold.

**Corrections to research 110:**
- California taxes SaaS from 2027.
- State thresholds: Washington $100k, Texas $500k, New York $500k and more than 100 sales.

**Recommendation:** keep plain Stripe on Mojo AB (as #20 decided), with Paddle as the fallback and no Managed Payments. Guardrails:
- Settle Mojo AB's VAT status before the first live charge.
- Decide how to treat private and unregistered buyers.
- Register for OSS voluntarily before the first EU private sale, if the accountant agrees.
- Turn on Stripe Tax monitoring.
- Ask about a EUR or USD settlement account.

Switch to Paddle if the tax work is too heavy for two people, if private buyers turn out to be a large share, or when US sales near a state threshold.

**Open:**
- The 16 accountant questions are in §5.
- Test mode would show whether Managed Payments accepts Mojo AB.
- Selling to businesses only (#93's recommendation) would remove most of the OSS and UK consumer work.
