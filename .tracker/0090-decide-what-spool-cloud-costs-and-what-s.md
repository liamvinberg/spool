# #90 · Decide what Spool Cloud costs and what stays free

- State: closed
- Labels: wayfinder:grilling
- Parent: #89
- Created: 2026-10-18T17:43:56.192Z
- Updated: 2026-10-18T17:43:59.848Z
- Closed: 2026-10-18T17:43:59.848Z

## Question

Spool Cloud is paid only (Cata, 2026-10-09), overturning Decide what a team pays for (#20)'s free one-editor team. Is every editor a seat from the first one? Is there a trial, how long, with or without a card? What does a seat cost, monthly and yearly, in which currency? What stays free: viewers, outsiders, a solo project's shares? What does a team become when its trial ends or it stops paying, and what happens to its files, canvas and shares? Does Devosurf stay free?

*From Linear DEV-241.*

Related: #100, #103, #106, #112, #122, #59, #57, #20, #3

Plane: SPOOL-90

## Comments

### agent, 2026-10-18T17:43:59.830Z

**Liam, 2026-10-10:** Resolved with Cata (grilling, 2026-10-09, agent-hub task 97). This replaces Decide what a team pays for (#20).

- **Paid only.** Every editor is a seat, the first one too, with no minimum. $20 per editor a month or $16 a month billed yearly, in USD.
- **Trial:** 14 days, no card, up to 10 editors, one per account that creates a team. When it ends, the admin picks who stays an editor and pays for those seats.
- **Free:** viewers and outsiders on a paid team, and Spool on your own machine. Nothing Spool Cloud hosts is free. Personal (solo) share links go away: sharing a frame or a project with a client is part of a team, and so of the trial. What happens to the beta's existing links is #59.
- **Team size:** no editor cap on paid teams, like Figma, Linear and Paper. Load is per project, not per team: a 200-person studio is many projects with a few people in each. The real limits are per project: 120 saves a minute shared by everyone, which a handful of agents saving at once can reach, and presence relayed to everyone in the project. That is to be checked by the load test ticket on this map.
- **When a team stops paying** (trial ends, card fails, cancel):
- Stripe retries the card for about 2 weeks, with a banner, while everything keeps working.
- Then every local copy stops syncing and stays as an ordinary local project, and each member gets a notice. Share links stop. The cloud canvas stays readable to admins.
- Spool commits nothing by itself. One person uses "Put design/ back in git" (the same action as Decide how a project leaves a team (#100)), and the others get it on their next pull.
- Paying again reconnects everything, and anything made while local goes up as ordinary saves. After 6 months unpaid the cloud copy is deleted, with emails first.
- **Free teams:** Devosurf stays free. Any other free team gets a 100%-off Stripe coupon.
- **Who buys:** sold "for businesses", as Linear and Paper do, but anyone with a card can pay. Company name and VAT number are optional at checkout. Checkout carries one line on the consumer's right to cancel, and our 14-day refund on a new team's first payment covers that right's money side.

Glossary: Seat and a new Trial entry, spool-cloud branch `97-launch-pricing` (590624e).

### agent, 2026-10-18T17:43:59.839Z

**Liam, 2026-10-11:** Changed by Decide how seats and billing are run (#99) (Cata, 2026-10-10): the trial now needs a card, charged on day 14 for the team's editors then, one trial per account and per card. "The admin picks who stays an editor when the trial ends" goes with it. The rest stands.
