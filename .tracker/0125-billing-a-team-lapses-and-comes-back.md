# #125 · Billing: a team lapses and comes back

- State: closed
- Labels: ready-for-agent
- Parent: #122
- Blocked by: #123
- Created: 2026-10-18T17:43:56.600Z
- Updated: 2026-10-18T17:44:01.005Z
- Closed: 2026-10-18T17:44:01.005Z

## Parent

Spec: paying for a team: trial, seats and billing (#122)

## What to build

A team with no paid time left goes local, and paying again brings it back. A daily sweep (taking `now`, idempotent) emails every admin 3 days before a trial ends and lapses a trial past its end with no subscription. Lapsing tells the team's sync objects at once; their answer for a lapsed team is a new standing, `unpaid`. The daemon stops that copy without ending it: the repo's `spool.json` stays, nothing is committed, the person is told once that the team has gone local and their copy keeps working here, and standing is checked again at start and hourly. Shares of a lapsed team answer with the stopped-share page; its cloud canvas answers admins only. Every member gets one email when it lapses. An admin opening the team gets one dialog: choose who stays an editor, then pay (Billing's payment choice). When it pays, every copy reconnects through the existing offline catch-up and local work goes up as ordinary saves. Spans spool-cloud (sweep, standing, shares, canvas, emails) and spool (daemon, dialog, notice).

## Acceptance criteria

- [ ] The sweep sends the 3-day email once and lapses an unpaid trial at its end; running it twice changes nothing more
- [ ] A lapsed team's sync connections close with `unpaid` and new ones are refused; a free, trial, paying, failing or ending team's aren't
- [ ] The daemon keeps an `unpaid` copy linked and untouched, says so once, and reconnects by itself when standing returns to editor, with saves made while lapsed reaching the team without rolling it back
- [ ] Shares of a lapsed team show the stopped page; its canvas opens for admins and is refused to editors and viewers
- [ ] Admins see the trial-end dialog; other members see a one-line notice and get one email
- [ ] Paying from the dialog makes the team paying and lets sync back in

## Blocked by

- Billing: a team on a trial pays through Stripe

*From Linear DEV-276.*

Related: #128

Plane: SPOOL-125

## Comments

### agent, 2026-10-18T17:44:00.984Z

**Liam, 2026-10-11:** Landed on the build branches (not main yet; the ticket closes when it merges).

**spool-cloud** `124-implement-spec-https-linear-app-devosurf`:
- 42c5b8b billing: once-only markers for billing emails
- e70bdab billing: the summary says whether the team has paid before
- 5d4f3e3 sync: a lapsed team's copies close with unpaid and new ones are refused
- 7ceb980 shares: a lapsed team's shares say they have stopped
- 37ca7cb frames: a lapsed team's canvas opens for its admins only
- 0a83687 billing: the sweep lapses ended trials and sends the trial and lapse emails
- 805f21e billing: tests for a team that lapses and comes back

**spool** `124-implement-spec-https-linear-app-devosurf`:
- 64628752 daemon: stop a lapsed team's copy without ending it, and follow it again once the team pays
- 0d32648a ui: trial-end dialog for a lapsed team's admins and a gone-local line for everyone else on its home

Wire: close code 4402 `unpaid`, 402 `{error:"unpaid"}` before upgrade, `standing:"unpaid"` on the project read. The sweep runs on every 5-minute cron tick (idempotent). Coming in the review fix pass: a lapsed team refuses new projects, moves in, shares and cover uploads; the daemon retries an unreachable standing check sooner than hourly.

### agent, 2026-10-18T17:44:00.994Z

**Liam, 2026-10-12:** Merged to main in both repos and released: spool.page 0.38.0 on npm, spool.page (cloud) deployed to production billing in Stripe test mode until #128. Closing.
