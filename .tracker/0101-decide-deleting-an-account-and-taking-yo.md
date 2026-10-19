# #101 · Decide deleting an account and taking your data with you

- State: closed
- Labels: wayfinder:grilling
- Parent: #89
- Blocked by: #93
- Created: 2026-10-18T17:43:56.329Z
- Updated: 2026-10-18T17:44:00.279Z
- Closed: 2026-10-18T17:44:00.279Z

## Question

Deleting your own account isn't built (found in the first run's review). What deleting an account does to its teams, shares and saves, and how a person or a team takes their data with them.

*From Linear DEV-252.*

Related: #116, #100, #99, #57

Plane: SPOOL-101

## Comments

### agent, 2026-10-18T17:44:00.260Z

**Liam, 2026-10-10:** From Decide history and restore for team projects (#57): one way a team could take its data is a git repo of its whole team history, one commit per save, built on export. Cata asked about git behind the scenes, which was ruled out, but git fits here as an export format. It's an idea, not decided.

### agent, 2026-10-18T17:44:00.269Z

**Liam, 2026-10-11:** Resolved with Cata (grilling, 2026-10-11, agent-hub task 119). Cata took every recommendation.

**Deleting an account**
- Self-serve at `spool.page/account`, at the foot: a confirm that says what happens (teams keep your work, your Macs stop syncing, their folders stay as ordinary local projects), confirmed by typing your email. Web only.
- It goes **at once**, no grace and no undo. Signing in again later makes a fresh, empty account; open invites and people shares naming the address still reach it. Today's maintainer route (`DELETE /internal/accounts/:email`) already does the deleting; it gains the self-serve door and the steps below.
- **Last admin:** with other members it's refused until someone else is admin (the spec's rule). A team where they're the **only member** is offered for deletion in the same confirm, each team named; each gets the normal team delete (30 days, then purged).
- **What the team keeps:** their saves, files, shares and invites stay the team's. Team history shows their saves as **Former member**, with no name kept.
- **Billing email:** if a team's Stripe billing email is their address, it moves to the team's longest-standing other admin, who is told. Any other address (a finance@) is left alone.

**A paying team deleted** (from Settings, or with its last member's account): the subscription ends at once, no refund, except the full refund within 14 days of the first payment that cancelling already has (#99).

**Taking data out**
- **Team export:** admins only. Each team project as a git repository: its current files, plus the 90-day team history as commits, one per applied save, authored by the member who made it. Plus a team file of members, roles and shares. Git is the export format #57 pointed at.
- **Where:** in the Mac app, written at once to a folder: Export… in the project menu, and Export all in team Settings. On `spool.page`, Export opens the Mac app, or offers the download if it's missing, as Open in spool does. No emailed links and no zips built in the cloud: the files are already on the Mac, and a 1 GB project is beyond what a Worker can zip in memory. Cata asked about Figma-style emailed exports; those fit products whose files live only in their cloud.
- **After a team ends:** admins can still export until the purge, 30 days after a delete and 6 months after a lapse. Nothing else works in that time. This is the Data Act's (art. 25) at-least-30-days retrieval window (#93); the terms list the export's contents as the "exportable data".
- **A person's own data** (GDPR access and portability): no button. The account page shows email, teams, Macs and passkeys; anything more is a request to privacy@spool.page (forwards to Cata), answered by hand within a month.

**What we still hold after deletion** (for the privacy notice): live data goes at once; daily backups roll off within 30 days and are not scrubbed; invoices stay 7 years (bokföringslagen).

**Left to others:** "Put design/ back in git" and removing a project are Decide how a project leaves a team (#100); the export doesn't replace it. Whether the Data Act applies, and the terms' switching clause, stay with the lawyer (#93).

Glossary: **Account** (deleting), **Former member** and **Team export** in `spool-cloud/GLOSSARY.md`, branch `119-wayfinder-dev-252` (376f52d).
