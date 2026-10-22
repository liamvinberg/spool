# #209 · Legal: Spool Cloud is sold to businesses only, and fees are non-refundable

- State: closed (done)
- Labels: ready-for-agent
- Parent: #118
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T19:11:02.912Z
- Updated: 2026-10-21T20:21:43.702Z
- Closed: 2026-10-21T20:21:43.702Z

## Parent

Spec: the landing page, pricing and the legal pages (#118)

## Decision

Liam, task 205: sell like Linear and Figma, for the most revenue with the least friction. Spool Cloud is for business use only and fees are non-refundable. One tick at checkout ("I'm buying for my business or work") makes the business purchase explicit, which under EU case law (CJEU C-464/01 Gruber) keeps a buyer who claims to buy for business from relying on consumer withdrawal rights. No forced company name: Stripe's optional company name and VAT number stay as they are. Refunds may still be given by hand as goodwill (an email to us), never promised.

## What to build

- **Terms**: section 1 says Spool Cloud is sold only to businesses and professionals (freelancers included) for use in their work, and that starting a team or paying confirms that. Section 7: fees are non-refundable; cancelling stops renewal and the team keeps working to the end of the paid period; the automatic 14-day refund is gone. Section 16 (consumers) is replaced by a short clause: not sold to consumers; whoever ticks the business box confirms they are not buying as a consumer. Keep the refund for a change we make that harms a paying team (section 13) and for our own breach. UPDATED.terms moves to the merge day. TERMS.refundDays goes.
- **Checkout and starting a team**: a required tick "I'm buying for my business or work", next to the existing Terms/DPA line, wherever a team is started (spool.page /start and the Mac app's New team dialog) and before Stripe Checkout. Record that it was ticked, by whom and when, on the team.
- **Remove** the withdrawal function from #208 (Billing's Withdraw from contract, its confirmation and its email) and the automatic full refund on cancelling within 14 days from #126, in both repos. Any team still inside 14 days of its first payment when this deploys keeps its refund until its window ends (check production read-only for how many; most likely none).
- Landing and pricing keep "plus VAT".

## Acceptance criteria

- [ ] A team can't be started, nor Checkout opened, without the business tick; the tick is recorded
- [ ] Cancelling no longer refunds anything; a team inside its old 14-day window still gets its refund
- [ ] Billing has no withdrawal control; its route, email and tests are gone
- [ ] Terms read as above; Privacy and DPA still agree with the Terms (facts.ts)
- [ ] Worker and browser tests cover the tick, the no-refund cancel and the grandfathered window

## Comments

### agent, 2026-10-21T20:21:43.702Z

Merged: spool-cloud e56bc37, spool 90f66bc2.
- Production check (read-only SELECT on spool-cloud-auth, 21 Oct 2026): 0 teams inside a 14-day window; no team has ever paid.
- Business tick: spool.page refuses `POST /api/teams` and Checkout without `business: true` (`business_required`). It records `teams.business_confirmed_at`/`_by` (migration 0040) at the start and again at Checkout. The landing's start form, `/start` (whose confirm page asks when the tick is missing), the Mac app's New team dialog and Billing's payment choice all ask for the tick.
- No 14-day refund: cancelling or deleting refunds nothing. Grandfathered: a team with no business confirmation (one that paid under the old Terms) keeps the refund until its window ends; tested. The withdrawal route, its email, `withdrawUntil` and the core UI are reverted, and #208's unreleased changeset is deleted.
- Terms: §1 sold only to businesses and professionals, §7 fees non-refundable (goodwill refunds by email, never promised), §15 refund on our breach, §16 Not for consumers; §13 kept. TERMS.refundDays is gone. Checkout's custom text now says business use only, non-refundable.
- Changeset: spool.page minor (the New team dialog and Billing tick).
Left for Liam: release spool.page and bump its pin in spool-cloud **before** deploying spool-cloud. Until then the web's New team dialog and Billing, and older Mac apps, send no tick and get `business_required`. Then apply migration 0040 and deploy.
