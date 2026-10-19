# #126 · Billing: failed payments, cancelling and the 14-day refund

- State: closed
- Labels: ready-for-agent
- Parent: #122
- Blocked by: #125
- Created: 2026-10-18T17:43:56.611Z
- Updated: 2026-10-18T17:44:01.053Z
- Closed: 2026-10-18T17:44:01.053Z

## Parent

Spec: paying for a team: trial, seats and billing (#122)

## What to build

The paying team's other ways out, from Stripe's events. A failed payment makes the team failing: everything keeps working while Stripe retries for about two weeks, admins see a banner, and every admin is emailed on the first failure and, by the sweep, 3 days before it lapses. When Stripe gives up and cancels, the team lapses. Cancelling in the portal runs to the period's end: the team is ending, Billing says "Ends on ", and undoing it in the portal makes it paying again. A cancel within 14 days of the first paid invoice refunds that invoice in full and ends the subscription at once, without us in the loop, and the team lapses. Billing shows each state's line.

## Acceptance criteria

- [ ] An invoice payment failed fixture makes the team failing, shows admins the banner and sends the first email once; a later paid invoice makes it paying again
- [ ] The sweep emails admins 3 days before a failing team lapses
- [ ] A subscription deleted fixture lapses the team through the same path as an ended trial
- [ ] Cancel at period end shows "Ends on "; undoing it returns to paying
- [ ] A cancel within 14 days of the first paid invoice refunds it in full through the port and cancels at once; a cancel after that doesn't refund
- [ ] Billing shows the right line in failing, ending and lapsed, and editors and viewers see none of it

## Blocked by

- Billing: a team lapses and comes back

*From Linear DEV-277.*

Plane: SPOOL-126

## Comments

### agent, 2026-10-18T17:44:01.033Z

**Liam, 2026-10-11:** Landed on the build branches (not main yet; the ticket closes when it merges).

**spool-cloud** `124-implement-spec-https-linear-app-devosurf`:
- be6261d billing: the stripe port refunds an invoice and ends a subscription at once, real and fake
- 90b9d1f billing: failing, ending and the 14-day refund from stripe's events, with the failing emails
- 19fbe46 billing: tests for failed payments, cancelling and the 14-day refund
- 5014692 billing: the sweep reads a failing or ending team past its date again, should stripe's news be lost

**spool** `124-implement-spec-https-linear-app-devosurf`:
- de0adaf5 ui: billing says a failing, ending or lapsed team's line above its summary
- 358c7d9b ui: a failing team's admins get a line on home with manage billing

Coming in the review fix pass: the 14-day refund covers every invoice paid in the window; a team Stripe leaves past\_due/unpaid after its retries is cancelled and lapsed 3 days past its date. Stripe settings for test mode and go-live: cancel the subscription after all retries fail; email customers about refunds.

### agent, 2026-10-18T17:44:01.045Z

**Liam, 2026-10-12:** Merged to main in both repos and released: spool.page 0.38.0 on npm, spool.page (cloud) deployed to production billing in Stripe test mode until #128. Closing.
