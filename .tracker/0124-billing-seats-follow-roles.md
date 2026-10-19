# #124 · Billing: seats follow roles

- State: closed
- Labels: ready-for-agent
- Parent: #122
- Blocked by: #123
- Created: 2026-10-18T17:43:56.588Z
- Updated: 2026-10-18T17:44:00.955Z
- Closed: 2026-10-18T17:44:00.955Z

## Parent

Spec: paying for a team: trial, seats and billing (#122)

## What to build

Once a team pays, its seats are its admins and editors, and Stripe's quantity follows every join, removal and role change: on a monthly plan prorated onto the next invoice, on a yearly plan invoiced at once; a removed seat leaves a credit, never a refund. People shows admins "N people · M seats" under the title, and inviting an editor on a paying team says what it costs before it's sent ("An editor is one more seat: $16 a month, charged for the days left this year once Noor joins"). A seat is added when the editor joins, not when invited. A trial holds up to 10 editors, pending editor invites counted; the eleventh is refused with a sentence pointing to Billing. A quantity Stripe didn't take is recorded and retried, and never blocks the role change.

## Acceptance criteria

- [ ] Accepting an editor invite, promoting, demoting and removing each set the subscription's quantity to admins plus editors, with the right proration per cycle
- [ ] Sending an editor invite changes no quantity
- [ ] People's seat line and the cost line show for admins only, worded per cycle
- [ ] The trial's 10-editor cap counts pending editor invites and refuses the eleventh with a plain sentence
- [ ] A failed quantity update keeps the role change and is retried until Stripe takes it

## Blocked by

- Billing: a team on a trial pays through Stripe

*From Linear DEV-275.*

Plane: SPOOL-124

## Comments

### agent, 2026-10-18T17:44:00.937Z

**Liam, 2026-10-11:** Landed on the build branches (not main yet; the ticket closes when it merges).

**spool-cloud** `124-implement-spec-https-linear-app-devosurf`:
- ba9a6ef billing: a seat quantity stripe refused is recorded
- 5bc8b31 billing: seats follow roles, a trial holds 10 editors, people shows admins the seats

**spool** `124-implement-spec-https-linear-app-devosurf`:
- d0a379b2 teams: people says seats and what one more costs to admins, and the trial's editor cap

Read where the spec was silent: the trial's 10-editor cap also refuses promoting a viewer past it; accepting an invite is never refused. Coming in the review fix pass: the retry of a refused quantity backs off to daily and logs once after 24 hours.

### agent, 2026-10-18T17:44:00.946Z

**Liam, 2026-10-12:** Merged to main in both repos and released: spool.page 0.38.0 on npm, spool.page (cloud) deployed to production billing in Stripe test mode until #128. Closing.
