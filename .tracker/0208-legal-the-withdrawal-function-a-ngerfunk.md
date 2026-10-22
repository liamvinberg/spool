# #208 · Legal: the withdrawal function (ångerfunktion) for consumers

- State: closed (done)
- Labels: ready-for-agent
- Parent: #118
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T18:09:56.115Z
- Updated: 2026-10-21T18:51:51.334Z
- Closed: 2026-10-21T18:51:51.334Z

## Parent

Spec: the landing page, pricing and the legal pages (#118)

## Why

Liam asked the agent to act as the reviewer instead of a lawyer (task 205). The review found one gap: since 19 June 2026, the Swedish distance contracts law (lag 2005:59, DAL, implementing Article 11a of the Consumer Rights Directive as amended by Directive (EU) 2023/2673) requires a trader that sells online to consumers to offer a **withdrawal function** ("ångerfunktion") during the withdrawal period. Spool Cloud lets anyone pay (#90), so a consumer can buy, and Terms section 16 already promises a 14-day withdrawal; cancelling in Stripe's portal is not a clearly labelled withdrawal function.

## What to build

In Settings › Billing, for 14 days from a team's first payment, an admin sees a clearly labelled **Withdraw from contract** control (English label; the law asks the label to say plainly that it withdraws, e.g. "Withdraw from contract here"). It opens one confirmation step that names the team and says what happens (the payment is refunded in full and the subscription ends at once), with a **Confirm withdrawal** button. Confirming runs the existing 14-day refund path (#126), and sends an acknowledgement email at once (Resend, durable medium) with the date and time of the withdrawal and what was refunded. Terms section 16 names the control. The control is shown to every paying team in its first 14 days; nothing asks whether the payer is a consumer. spool-cloud only (and the Mac app's Billing if it renders its own; it opens spool.page's).

## Acceptance criteria

- [ ] An admin of a team within 14 days of its first payment sees Withdraw from contract in Billing; after 14 days it is gone
- [ ] Confirming refunds the first payment in full, ends the subscription at once, and the team lapses as a cancelled team does
- [ ] An acknowledgement email with the withdrawal's date and time and the refund goes to the admin who withdrew and the billing email
- [ ] Non-admins never see it
- [ ] Terms section 16 points to the control; UPDATED.terms moves to the day it merges
- [ ] Worker tests cover inside and outside the window, the refund call through the Stripe port, and the email

## Comments

### agent, 2026-10-21T18:51:51.334Z

Built and merged: spool-cloud 8d39c95 (POST /api/teams/:team/billing/withdraw: for 14 days from the first payment it refunds in full, ends the subscription at once, lapses the team and emails a receipt with the date, time and amount to the admin and the billing email; `withdrawUntil` in the billing summary; Terms §16 names the control; draft-for-lawyer notes removed) and spool 4887afa8 (Settings › Billing: "Withdraw from contract here" → confirmation naming the team → "Confirm withdrawal"; daemon proxy route; minor changeset for spool.page). Left for Liam: deploy spool-cloud, release spool.page and bump its pin in spool-cloud so the button shows on the web and in the Mac app.
