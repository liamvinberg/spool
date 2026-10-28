# #217 · Billing: hold a team started with the trial used for an hour, and remove lapsed teams after six months

- State: closed
- Created: 2026-10-27T14:34:39.923Z
- Updated: 2026-10-27T14:34:40.090Z
- Closed: 2026-10-27T14:34:40.090Z

Built and shipped in task 232 (Liam: "do whatever you recommend and just ship it").

## Why
An account whose trial was spent could still start teams. They were born lapsed and stayed forever, holding their address (Eidra sat for a month). The Terms already promised a lapsed team is deleted after 6 months with an email first, but nothing did it.

## What others do (researched in task 232)
- Vercel: one Pro trial per account; later teams must pay. https://vercel.com/docs/plans/pro-plan/trials
- Zendesk deletes an unpaid trial 270 days after it ends; Atlassian deactivates free sites after 120 days inactive.
- GitHub bans name squatting by policy. https://docs.github.com/en/site-policy/other-site-policies/github-username-policy
- Stripe's trial-abuse guide: measure before adding signup layers. https://stripe.com/resources/more/how-to-prevent-free-trial-abuse-in-saas-and-ai-products
- Stripe Checkout `expires_at`: 30 minutes to 24 hours.

## What shipped
- **Held team** (spool-cloud): a team started with the trial spent is held until `team_billing.held_until`, an hour from its start and from each Checkout opened, whose session expires then. The billing sweep closes its open Checkouts and removes it (deleted and purged at once, address free on the next purge). A Checkout Stripe says completed keeps it.
- **Lapsed team** removed 184 days after it lapsed (the Terms' 6 months), every admin emailed 14 days before (`deleting` billing email).
- `BillingSummary.deletesAt`; spool's Billing and setup list say until when a held team waits ("It's held for you until 14:32…") and the day a lapsed team's cloud copy is deleted; New team says the hour.
- Terms: section 5 says the hold; section 10 forbids holding unused names. Glossary: Held team.
- Trial farming with new addresses: left alone until there's abuse to measure.

spool-cloud main 009bb52, deployed (version 824b420a), migration 0041_held_teams. spool main c752020e with a patch changeset (ships with the next release).
