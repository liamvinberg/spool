# #112 · Spec: buying and paying for a team

- State: closed
- Labels: wayfinder:task
- Parent: #89
- Created: 2026-10-18T17:43:56.452Z
- Updated: 2026-10-18T17:44:00.634Z
- Closed: 2026-10-18T17:44:00.634Z

## Question

Write the build spec and its tickets for taking money, from what's decided:

- Team creation opens to everyone in the release that takes payment (Decide what launches first (#91)).
- Seats, the trial with a card, prorating, failed payments, cancel and the 14-day refund (Decide what Spool Cloud costs and what stays free (#90), Decide how seats and billing are run (#99)).
- The setup list on [spool.page](http://spool.page) and in the app, [spool.page/](http://spool.page/) as Home without the Mac tabs, Settings' General and Billing tabs, People's seat count (Prototype pricing and buying a team (#98)).

It rewrites Billing (#70), whose body predates the pricing decision. Stripe's test-mode account (Mojo Consulting AB) and its Tax registration are in that ticket's comment; products, prices and webhooks are made in the build. Going live needs live keys and the accountant's answer on VAT and OSS (the 16 questions in research 243, Research: selling Spool Cloud from Mojo AB (#92)): list those as launch steps, not code.

*From Linear DEV-263.*

Related: #122, #99, #98, #92, #91, #90, #64, #3

Plane: SPOOL-112

## Comments

### agent, 2026-10-18T17:44:00.626Z

**Liam, 2026-10-11:** Resolved (2026-10-11, agent-hub task 123): Spec: paying for a team: trial, seats and billing (#122), with six tickets under it:

1. Billing: a team on a trial pays through Stripe (the tracer, test mode, behind the flag)
2. Billing: seats follow roles
3. Billing: a team lapses and comes back
4. Billing: failed payments, cancelling and the 14-day refund
5. Billing: the setup list and starting a team from spool.page
6. Billing: open team creation to everyone and go live (Liam's: live keys and the tax steps)

Decided while writing it:
- **No card on the trial.** Prototype pricing and buying a team (#98) is the latest word over Decide how seats and billing are run (#99).
- **The accountant's 16 questions are answered on common practice** instead (Liam: "just apply the best standard"). The answers are in the spec's Further Notes: be VAT-registered in Sweden; prices before VAT; reverse charge for EU and UK businesses; Swedish VAT for EU private buyers under EUR 10,000 with OSS when near; UK VAT registration when the first UK private buyer appears; nothing in the US until a state threshold; payouts in SEK; yearly plans released monthly in the books.
- A lapsed team's daemon gets a new standing, `unpaid`, that stops the copy without ending it, so paying again reconnects through the offline catch-up.
- Deleting a cloud copy after 6 months unpaid waits until after launch.
