# #91 · Decide what launches first

- State: closed
- Labels: wayfinder:grilling
- Parent: #89
- Created: 2026-10-18T17:43:56.203Z
- Updated: 2026-10-18T17:43:59.888Z
- Closed: 2026-10-18T17:43:59.888Z

## Question

Do teams and billing launch together, or teams first and billing later? Who can create a team before launch and after it (today: a maintainer's `may_create_team` flag)?

*From Linear DEV-242.*

Related: #112, #122

Plane: SPOOL-91

## Comments

### agent, 2026-10-18T17:43:59.872Z

**Liam, 2026-10-10:** Resolved (Cata, 2026-10-09, agent-hub task 97): **teams only, sold from day one.** Nothing sits above a team at launch. Teams and billing go out together: the release that opens team creation to everyone also takes payment, with seat and billing management in it. Until that release, creating a team stays behind the maintainer's `may_create_team` flag and Devosurf runs as it does now. Read from Cata's "just teams to start with" and "people going to Spool can purchase teams and we get some sort of money in"; Cata to correct if teams-first-then-billing was meant.

### agent, 2026-10-18T17:43:59.880Z

**Liam, 2026-10-11:** Note (task 105, 2026-10-11): spool.page now has a Spool Cloud waitlist (email with double opt-in, Turnstile, stored in prod D1 `waitlist`). Until the release that opens team creation and takes payment, interested visitors join the list instead; team creation is still behind `may_create_team`. The launch release should include mailing the waitlist.
