# #122 · Spec: paying for a team: trial, seats and billing

- State: closed
- Labels: ready-for-agent
- Blocked by: #69
- Created: 2026-10-18T17:43:56.564Z
- Updated: 2026-10-18T17:44:00.861Z
- Closed: 2026-10-18T17:44:00.861Z

## Problem Statement

Spool Cloud can't take money. A team today exists only if a maintainer flipped `may_create_team` on its creator's account, and nothing about it is paid for: there's no trial, no seat, no checkout, no invoice. Someone who finds [spool.page](http://spool.page) and wants their team on one live canvas has no way in, and Mojo Consulting AB has no way to be paid for the hosting, the sync and the shares it runs for every team. The launch can't open team creation to everyone until a team pays for itself without us in the loop (Decide what launches first (#91)).

## Solution

Every team is paid for, per editor, through Stripe on Mojo Consulting AB.

- A new team starts a **14-day trial** for up to 10 editors, with **no card**. One trial per account.
- A **seat** is an editor (admins included). Viewers and outsiders are free. A seat is $20 a month, or $16 a month billed yearly ($192), in USD, plus VAT where it applies.
- An admin pays from **Settings › Billing**: tick who to pay for, pick monthly or yearly, and go to Stripe Checkout. Paying during the trial never costs trial days: the first charge waits for the trial's last day.
- After that, **seats follow roles**: making someone an editor adds a seat, prorated, and People says what it costs before the invite goes.
- **Stripe's customer portal** holds the card, invoices, VAT ID, the monthly/yearly switch and cancelling. Billing in Settings is a thin, admin-only summary with Manage billing.
- A team that stops having paid time (the trial ends unpaid, the card keeps failing, it cancels) **lapses**: it goes local. Every local copy stops syncing and stays as an ordinary project, shares stop, and the cloud canvas stays readable to admins. Paying again picks it up where it was, and what was made meanwhile goes up as ordinary saves.
- A new team is set up through **one setup list**, the same on [spool.page](http://spool.page) and in the app: name the team, invite people, get spool on your Mac, move a project in.
- Team creation opens to everyone in the release that takes payment. Devosurf stays free.

Decided in Decide what Spool Cloud costs and what stays free (#90), Decide how seats and billing are run (#99) and Prototype pricing and buying a team (#98) (canvas: `explore/cloud/buy-team` on [spool.page/devosurf/spool](http://spool.page/devosurf/spool)). Where those disagree, the prototype is the latest word: **the trial takes no card** (Cata, 2026-10-11, agent-hub task 117), so #99's card, card fingerprint and day-14 charge don't apply.

## User Stories

Starting

1. As a visitor on [spool.page](http://spool.page), I want to type my team's name beside the price and press Start a 14-day trial, so that trying Spool Cloud is one step from reading about it.
2. As a visitor who isn't signed in, I want the sign-in page to say "Sign in to start Tidemark", so that I know signing in is what creates my team.
3. As a new customer, I want signing in to create the team and start its trial at once, so that I'm never asked for a card before I've seen a canvas sync.
4. As someone who already had a trial, I want a new team's setup list to put "Pay for Tidemark" as step 2, before invites, so that I'm told plainly that this team starts paid.
5. As a Mac user, I want New team in the app to start the same trial and the same setup list, so that the app and the web never disagree about what a team is.
6. As a new admin, I want the team's address taken from its name, as today, so that I land on [spool.page/tidemark](http://spool.page/tidemark) without choosing a slug.

The setup list

7. As a new admin, I want one numbered list (Name the team, Invite people, Get spool on your Mac, Move a project in), so that I always know the next thing to do.
8. As a new admin, I want a done step to keep its title and say what came of it ("3 invites sent"), so that the list reads as a record.
9. As a new admin, I want to invite people by email rows, each marked editor or viewer, or skip, so that I can set the team up alone first.
10. As a new admin on the web, I want "Get spool on your Mac" to offer Download for Mac or Open in spool, and to say "Sign in there as and spool carries on with step 4", so that I'm not lost between the web and the app.
11. As a new admin, I want the app to open on my team at the step I reached on the web, so that the app carries on where the web stopped.
12. As a new admin, I want step 4 to list my own projects, each with Move to Tidemark…, so that moving one in is today's move sheet and nothing new.
13. As a new admin, I want the list gone for good, with a toast "Tidemark is set up", once the last step is done, so that Home is clean from then on.

The trial

14. As an admin on a trial, I want Settings › Billing to say "On trial until October 25", so that I know when it ends without a countdown chasing me around the app.
15. As an admin on a trial, I want up to 10 editors, pending editor invites counted, so that I can try it with a real team.
16. As an admin on a trial with 10 editors, I want inviting an eleventh editor refused with a plain sentence pointing to Billing, so that I know paying lifts the cap.
17. As an admin, I want an email 3 days before the trial ends, so that the team doesn't go local by surprise.
18. As an admin who pays during the trial, I want the first charge on the trial's last day, so that paying early never costs me trial days.
19. As an admin whose trial ended unpaid, I want one dialog when I next open the team: choose who stays an editor, then pay, so that the team comes back in one move.

Paying

20. As an admin, I want Billing to list every member, with admins and editors ticked as seats and viewers listed as free, so that I choose exactly who I pay for.
21. As an admin, I want unticked editors to become viewers when I pay, so that nobody holds the files without a seat.
22. As an admin, I want monthly or yearly with the total before I continue, so that I know what Checkout will charge.
23. As an admin, I want Checkout to take the card and, optionally, a company name and a VAT number, so that my company gets a proper invoice with reverse charge.
24. As an admin coming back from Checkout, I want Billing to show the team as paid within seconds, so that I trust it worked.
25. As an admin, I want Billing to show the plan (seats, cycle, total), the next charge's date and amount, the card's last 4, and Manage billing, so that I see where the team stands without opening Stripe.
26. As an admin, I want Manage billing to open Stripe's portal for cards, invoices, the VAT ID, switching monthly and yearly, and cancelling, so that money matters stay in Stripe's well-trodden screens.
27. As the person who paid, I want each invoice and receipt emailed to the billing email, so that my bookkeeping gets them without asking.

Seats follow roles

28. As an admin, I want People to say "4 people · 3 seats" under the title, so that I see what we pay for.
29. As an admin inviting an editor on a paying team, I want to read the cost before sending ("An editor is one more seat: $16 a month, charged for the days left this year once Noor joins"), so that adding a seat is never a surprise.
30. As an admin, I want a seat added only when an editor actually joins, not when the invite is sent, so that we never pay for an invite nobody accepts.
31. As an admin on a monthly plan, I want an added editor to appear prorated on the next invoice, and on a yearly plan to be charged at once for the days left, so that seats are fair both ways.
32. As an admin, I want a removed editor, or one made a viewer, to give a credit against future invoices, so that we don't pay for seats we stopped using.
33. As an editor or viewer, I want never to see seats or prices, so that billing stays an admin's business.

Trouble and endings

34. As an admin whose card failed, I want a banner and an email on the first failure, and another 3 days before the team goes local, so that I can fix the card in time.
35. As a member of a team whose card is failing, I want everything to keep working while Stripe retries, so that a bank hiccup doesn't stop my work.
36. As an admin, I want cancelling to run to the end of the paid period, and Billing to say "Ends on November 30", so that the team gets what it paid for.
37. As an admin who cancels within 14 days of the first payment, I want it refunded in full and the team ended at once, without writing to anyone, so that a mistaken purchase costs nothing.
38. As an editor whose team lapsed, I want spool to tell me once that Tidemark has gone local and my copy keeps working here, so that I understand why my teammates' saves stopped arriving.
39. As an editor whose team lapsed, I want my local copy left exactly as it is, with nothing committed for me, so that I decide what happens to design/.
40. As an admin of a lapsed team, I want the cloud canvas still readable in the browser, so that nothing feels lost while we decide.
41. As an outsider holding a share from a lapsed team, I want a plain "This share has stopped" page, so that I'm not shown a broken canvas.
42. As an admin of a lapsed team who pays again, I want every editor's copy to reconnect by itself and their work since to go up as ordinary saves, so that coming back is one payment.
43. As a member who isn't an admin, I want to hear only when the team lapses, so that billing trouble isn't my noise.

Running it

44. As the maintainer, I want to mark a team free (Devosurf), so that our own team never sees billing.
45. As the maintainer, I want to give a design partner a 100%-off coupon in Stripe's dashboard, so that free teams need no code beyond the free switch.
46. As the maintainer, I want Stripe's events to be the only thing that moves a paying team between states, read fresh from Stripe each time, so that a lost or reordered webhook can't leave a team in the wrong state.
47. As the maintainer, I want the tests never to call Stripe, so that the suite runs offline and fast.
48. As the maintainer, I want one script to create the product and prices in test or live mode, so that going live is a key swap, not a dashboard session.

## Implementation Decisions

Where things live

- **spool-cloud** owns the billing rules: the team billing model, the Stripe port, Checkout and portal sessions, the webhook, the daily billing sweep, the emails, and every gate a lapsed team meets (sync standing, shares, the cloud canvas). Every rule is the cloud's; the screens only show what it allows, as for teams today.
- **spool (core)** owns the screens through the team source the Mac app and [spool.page/](http://spool.page/) both draw from: Settings' General and Billing tabs, People's seat line and cost line, the setup list on Home, the trial-end dialog, the failing banner. And the daemon: a lapsed team's local copies stop and resume.

The billing model

- A team's billing has one **state**: `free`, `trial`, `paying`, `failing`, `ending` or `lapsed`. Lapsed means no paid time left: a trial ended unpaid, payments stopped, a cancel ran out, or a team was created by an account whose trial is used. The screens say "gone local" for a lapsed team that once had time, and "Pay for " for one that never did.
- Syncing, sharing and the live canvas work in `free`, `trial`, `paying`, `failing` and `ending`. In `lapsed` they don't.
- New table for team billing, one row per team: state, trial end, Stripe customer and subscription ids, cycle, seats billed, period end, cancel-at, first paid at, failing since, lapsed at, a maintainer `free` flag, updated at. Accounts gain `trial_used_at`. A team gains a setup record (invites skipped at, setup done at). A table of handled Stripe event ids makes the webhook idempotent.
- **Seats** are counted, never stored by hand: admins plus editors. Pending invites never count toward seats, but pending *editor* invites count toward the trial's 10-editor cap.
- A trial belongs to the team and is spent by the account that created it. A second team by the same account starts `lapsed` with "Pay for " in its setup list.

Stripe

- Plain Stripe on Mojo Consulting AB's account. One product, Spool Cloud, with two prices found by lookup key: a seat monthly at $20 and a seat yearly at $192, USD, tax exclusive. A script creates them in test or live mode, idempotently.
- One Stripe customer and at most one subscription per team, with the team id in metadata. The subscription's quantity is the team's seats.
- **Paying** opens a Checkout session in subscription mode: the chosen price, quantity from the ticked members, `automatic_tax` on, `tax_id_collection` on, billing address required, company name optional. During a trial the subscription's `trial_end` is the team's trial end, so the first charge waits. Stripe needs a Checkout trial end at least 48 hours away; with less left, the first charge is at once.
- Unticked editors become viewers when Checkout completes, not before, so abandoning Checkout changes nothing.
- **Seat changes** update the subscription quantity when a member joins, leaves or changes role: monthly with prorations on the next invoice, yearly invoiced at once. A removal's credit stays on the customer's balance and is never refunded. A failed quantity update is retried by the sweep and never blocks the role change.
- **The portal** is configured for card, invoices, tax ID, switching between the two prices (monthly to yearly at once with unused days credited, yearly to monthly at the end of the year, via the portal's shortening-interval schedule), and cancel at period end. Quantity changes stay off: Spool drives quantity.
- **The webhook** verifies Stripe's signature, records the event id, then reads the subscription fresh from Stripe and writes the team's state from it, so order and duplicates don't matter. It handles Checkout completed, subscription created, updated and deleted, and invoice paid and payment failed.
- **The 14-day refund:** when a subscription is set to cancel within 14 days of its first paid invoice, the worker refunds that invoice in full and cancels at once. The team lapses. Nobody is in the loop.
- **Failed payments:** Stripe's retries (about two weeks) stand, then Stripe cancels the subscription. `failing` starts at the first failed payment and records when the team will lapse.
- Billing in Settings reads a summary the team API builds: state and dates from our table, the next charge and card's last 4 from Stripe at the moment an admin opens it.
- Stripe's own emails send invoices and receipts to the billing email. Ours, through today's mail sender, go to every admin: trial ends in 3 days, first failed payment, lapsing in 3 days. Every member gets one when the team lapses.

The sweep

- A daily scheduled run moves trials past their end with no subscription to `lapsed`, sends the 3-day emails, and retries any seat quantity Stripe didn't take. It is idempotent and takes `now` as a dependency, like the team operations.

Lapsing and coming back

- A billing state change calls the existing standing change for each of the team's projects, so sync objects close connections that may no longer sync, at once.
- A lapsed team's sync standing is a new answer, `unpaid`, distinct from `not_editor`. The daemon stops the copy and keeps its link to the team (the repo's `spool.json` stays). It tells the person once, and checks standing again when the daemon starts and every hour. When the team pays, the copy reconnects through the existing offline catch-up, so local work goes up as ordinary saves and never rolls the team back.
- Shares of a lapsed team answer with the stopped-share page. The cloud canvas at [spool.page/](http://spool.page/)/ answers admins only. Home shows admins the trial-end dialog, and everyone else a one-line notice.
- Spool commits nothing. Putting design/ back in git is Decide how a project leaves a team (#100)'s action and is built from Spec: a project leaves a team, and deleting an account (#116).

The team API

- New routes under the team, admin only: read the billing summary; start Checkout (who to pay for, cycle) returning Checkout's URL; open the portal returning its URL. The People response gains the seat count for admins. Invites to an editor on a paying team return the cost line's facts (cycle, seat price, whether it's charged now or on the next invoice); the screen words it.
- A new route at [spool.page/start](http://spool.page/start) takes the team's name (and the cycle the landing's switch showed), sends a signed-out visitor through sign-in titled "Sign in to start ", then creates the team, starts the trial and lands on [spool.page/](http://spool.page/) with the setup list. The landing's button is Spec: the landing page, pricing and the legal pages (#118)'s.
- The setup list's steps are read from facts where they exist: invites sent or skipped, a Mac signed in by a member of this team, a team project exists. The setup record holds only Skip and done.
- The maintainer app gains: mark a team free, and read a team's billing row.

Opening up

- Until the last ticket, creating a team stays behind `may_create_team`, and every billing path is reachable only by flagged accounts and in test mode. The last ticket opens team creation, marks Devosurf free, starts a 14-day trial from release day for any other team that exists, and drops the flag's check.

Glossary

- Seat and Trial land from the unmerged branches `97-launch-pricing` and `114-wayfinder-dev-250`, with Trial rewritten to take no card. Lapsed (a team with no paid time left, shown as "gone local") and Free team are added.

## Testing Decisions

- A good test drives the system from outside: an HTTP request to the worker, a webhook post, a sweep run at a given time, a user's click on a screen. It asserts what a person or another system sees (the response, the team's state, an email sent, a connection closed, a screen's text), never which private function ran.
- **spool-cloud, the main seam:** the worker's apps in the Workers vitest pool with the D1 migrations applied, as the team app's worker tests do today. Stripe enters only as an injected port beside `now` and the mail sender. A fake port records Checkout, portal and quantity calls and serves subscriptions from memory. Webhook tests post events signed with a test secret through Stripe's own test header helper, so the real verification runs. Stripe is never called in tests.
- Covered there: a trial from creation to lapse; paying in a trial keeps the trial's end; Checkout completing turns unticked editors into viewers; a seat follows each role change; the 10-editor trial cap with pending invites; failing, ending, the 14-day refund and lapse from webhook sequences delivered out of order and twice; a lapsed team's sync connections refused with `unpaid`, its shares stopped, its canvas admins-only; paying again lets sync back in; a free team never touched by any of it.
- **spool core screens:** the team screens' browser tests over a fake team source, as the team tests do today: Billing in each state, People's seat line and cost line, the setup list's steps and its disappearance, the trial-end dialog, the failing banner. Viewers and editors never see billing.
- **The daemon:** the team sync tests with a fake standing: `unpaid` stops the copy without ending it, says so once, and a later standing of `editor` reconnects through catch-up with local saves going up.
- One manual check in Stripe's test mode before opening up: a real Checkout, a portal plan switch, a failing test card through to lapse, and a cancel with refund.

## Out of Scope

- The landing's price chapter and hero line (Spec: the landing page, pricing and the legal pages (#118)). This spec gives it [spool.page/start](http://spool.page/start) to link to.
- [spool.page/](http://spool.page/) as the app's Home with the team sidebar (Spec: Home and Get it for Spool Cloud (#113)). The setup list sits on today's Home and moves with it.
- Put design/ back in git (Spec: a project leaves a team, and deleting an account (#116)).
- Deleting a lapsed team's cloud copy after 6 months unpaid, with emails first: no team can reach 6 months until 6 months after launch. It's a follow-up ticket then.
- Measuring the funnel in PostHog (Decide what we measure from launch (#121)).
- Prices in other currencies, coupons beyond the dashboard, an organisation over teams, editors requesting a seat.

## Further Notes

**Tax and the books, decided on common practice instead of an accountant** (Liam, 2026-10-11). These are launch steps for Liam, not code:

1. **Be VAT-registered in Sweden.** Check Mojo Consulting AB's registration on Skatteverket's Mina sidor (its EU VAT number is SE + org number + 01). If it isn't registered, register before the first live charge. Selling abroad with reverse charge needs it either way, and Stripe Tax's Sweden registration assumes it.
2. **Prices are before VAT.** "$20 per editor a month, plus VAT where it applies", as almost every B2B tool shows. Stripe Tax adds the tax on top.
3. **EU businesses with a VAT number:** no Swedish VAT, reverse charge, Stripe checks the number. Mojo files the periodic summary (periodisk sammanställning) for those sales each quarter.
4. **EU private buyers:** Swedish 25% while sales to them stay under EUR 10,000 a year (Stripe's "small seller" registration, as set today). Turn on Stripe Tax's threshold monitoring, and register for OSS when they near the line. Below it, OSS is only extra quarterly work.
5. **UK:** businesses with a VAT number, reverse charge. A UK private buyer obliges a UK VAT registration from the first sale. Register when the first one appears; at $4 of VAT a seat the exposure until then is small and known.
6. **US and elsewhere:** nothing to register until a state's threshold (the lowest is Washington's $100,000). Stripe Tax monitoring watches.
7. **Invoices:** Stripe's invoices carry Mojo Consulting AB's name, address, org number and VAT number, number invoices across the account (not per customer), and print the reverse-charge note. Where Swedish VAT is charged on a USD invoice, the SEK amount is booked at the Riksbank rate of the invoice day.
8. **Payouts** in SEK to Mojo's account to start, at Stripe's 2% conversion. A USD account is worth it only at volume.
9. **Books:** Stripe's monthly reports into Mojo's bookkeeping. Yearly plans are booked as prepaid income and released a twelfth a month. Stripe's fees are a purchase from Stripe's Irish company, so reverse-charge VAT on them.

Paddle stays the fallback if any of this proves too heavy (Research: selling Spool Cloud from Mojo AB (#92)).

**Stripe today:** the test-mode account, its Tax registration and the key's location are in Billing (#70)'s comment. Going live needs live keys, a live webhook endpoint with its secret, the price script run in live mode, and the portal configured in live mode.

**Anyone can pay** (#90) stands over the paperwork research's business-only advice. Checkout carries one line on a consumer's right to cancel, and the 14-day refund covers its money side.

This replaces Billing (#70), written before the pricing decision.

*From Linear DEV-273.*

Related: #121, #118, #116, #113, #112, #100, #99, #98, #92, #91, #90, #89, #64, #3

Duplicate of #70

Plane: SPOOL-122

## Comments

### agent, 2026-10-18T17:44:00.849Z

**Liam, 2026-10-13:** All six build tickets are done; closed in agent-hub task 146.
