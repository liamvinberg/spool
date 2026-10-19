# #99 · Decide how seats and billing are run

- State: closed
- Labels: wayfinder:grilling
- Parent: #89
- Blocked by: #90, #92
- Created: 2026-10-18T17:43:56.307Z
- Updated: 2026-10-18T17:44:00.198Z
- Closed: 2026-10-18T17:44:00.198Z

## Question

Who adds and removes editors and what it costs mid-term (proration), invoices and receipts, VAT IDs, a failed payment, cancelling, changing monthly to yearly, and what the billing page in a team's Settings shows.

*From Linear DEV-250.*

Related: #101, #112, #122, #98, #93, #60

Plane: SPOOL-99

## Comments

### agent, 2026-10-18T17:44:00.178Z

**Liam, 2026-10-11:** Resolved with Cata (grilling, 2026-10-10, agent-hub task 114).

- **Seats** always equal editors, and only admins add them. Changes mid-term are prorated: an added editor goes on the next invoice (monthly) or is charged at once (yearly). A removed editor gives a credit against future invoices, never refunded. Prorating is the fairest and leaves no add-after-invoice, remove-before-renewal hole.
- **Trial** (changes #90): 14 days, up to 10 editors, pending editor invites counting toward the 10. A card is required at the start: Stripe checks it without charging, and the card is charged on day 14 for the team's editors then, unless an admin removes editors or cancels first. One trial per account and per card (Stripe's card fingerprint). A card that already had a trial gets no trial and is charged at once, with one line: "This card has already had a trial". Checkout offers monthly and yearly, monthly selected; switchable in the portal before day 14. Reminders: Stripe's trial-end email 7 days before (a card network rule) and ours to every admin 3 days before. Reason: Spool Cloud has no free plan (Spool on your own Mac stays free), so the trial is its only free door and the card stops it being reused.
- **Failed payment:** Stripe's retries for about 2 weeks stand. Admins see a banner, and Stripe emails the billing contact. We email every admin on the first failure and 3 days before the team goes local. Other members hear only when it lapses.
- **Cancelling:** any admin, in Stripe's customer portal. The team works to the end of the paid period, and the cancel can be undone until then. Cancelling within 14 days of the first payment refunds it in full and ends the team at once, without us in the loop.
- **Monthly to yearly** at once, unused days credited. **Yearly to monthly** at the end of the year.
- **Invoices and receipts:** Stripe emails each to the billing email (the admin who paid, changeable), and the history is in the portal. Company name, address and VAT ID are optional at checkout (#90's "anyone can pay" stands over #93's business-only advice). A VAT ID added later counts from the next invoice; past invoices aren't reissued.
- **Billing in Settings:** admins only. One line for where the team stands (trial with days left, payment failing, ends on a date, gone local, free team), the plan, "N editors × $20", the next charge date and amount, the card's last 4, and **Manage billing** to Stripe's portal, which holds the card, invoices, VAT ID, plan switch and cancel. Designed in Prototype pricing and buying a team (#98); Cata wants it clean and in Spool's system.
- **Replaced from #90:** the no-card trial, and "the admin picks who stays an editor when the trial ends" (the day-14 charge covers whoever is an editor then).

Glossary: Trial now starts with a card, spool-cloud branch `114-wayfinder-dev-250` (27f4ab7), on top of `97-launch-pricing`.

### agent, 2026-10-18T17:44:00.188Z

**Liam, 2026-10-11:** The card part is overturned by Prototype pricing and buying a team (#98): asked again on 2026-10-11 (agent-hub task 117), Cata kept the trial without a card. No card fingerprint and no day-14 charge; a trial ended unpaid lapses. The rest of this decision stands and is built from Spec: paying for a team: trial, seats and billing (#122).
