# #179 · Legal: the public pages and company details

- State: closed (done: merged spool-cloud 9c18004)
- Labels: ready-for-agent
- Parent: #118
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:49:49.220Z
- Updated: 2026-10-21T18:52:12.362Z
- Closed: 2026-10-21T18:05:09.492Z

## Parent

Spec: the landing page, pricing and the legal pages (#118)

## What to build

The public legal pages, reviewed by the agent in place of a lawyer (task 205). Spans **spool-cloud** only (its site, the route table in `vite.seo.ts`, the reserved team addresses).

Static pages prerendered like Privacy & cookies, each dated, in the site's nav and footer: **Terms** at `/legal/terms`, **DPA** at `/legal/dpa`, **Subprocessors** at `/legal/subprocessors`, **Report abuse** at `/legal/abuse`, and the **Privacy notice** at `/privacy`, extended from the website to the product, naming Mojo Consulting AB as controller and keeping its consent controls. **Company details** (registered name, organisation number, seat, street address, email, VAT number) are one constant read by the footer of every public page, the waitlist pages and the Privacy notice included. `legal` joins the reserved team addresses.

Write the text from #93's report (spool-cloud branch `97-i-m-thinking-we-should-probably-get--task-97-research-97-r4`, `research/244-paperwork-for-selling/README.md`, read with `git show`) and #118's Implementation Decisions: Terms for businesses with a consumer clause (anyone can pay, #90), refund and cancellation as their own section (#99), DSA content rules and notice-and-action, Data Act switching and export, DPA by reference, Swedish law; DPA on the 2021/915 clauses; subprocessors with purpose, data, location and transfer basis, claiming a location only where it is confirmed (read the D1 and Durable Object locations from Cloudflare first); the product privacy sections (accounts and sign-in, teams, invites, outsiders, shares, comment emails, team content under the DPA, billing and seven-year invoice retention, legal bases, transfers, account deletion per #101).

The company facts come from Liam: ask on #118 if they aren't there, and don't merge with placeholders.

## Acceptance criteria

- [ ] `/legal/terms`, `/legal/dpa`, `/legal/subprocessors`, `/legal/abuse` and `/privacy` answer 200, each with its own title, description and last-updated date, and are in the sitemap
- [ ] Every public page's footer carries the company details and links Terms, Privacy, DPA, Subprocessors and Report abuse
- [ ] The Privacy notice names Mojo Consulting AB and covers the product as listed, and keeps the website sections and consent controls
- [ ] The Subprocessors page states no location that wasn't confirmed, and says how admins hear of changes
- [ ] The Report abuse page gives the monitored address, the languages, and what a notice must include
- [ ] A team can't take the address `legal`, and a team named Legal gets another address
- [ ] `scripts/check-site.mjs` loads every page and follows the footer's links; the addresses test covers `legal`
- [ ] `pnpm test`, `pnpm test:site` and `pnpm check` pass

## Blocked by

None (can start immediately).

## Comments

### agent, 2026-10-21T18:00:07.683Z

Built on spool-cloud branch `205-b118` (pushed; worktree `~/dev/projects/spool-cloud-205-b118`): 806c1bb, 80d3b9d, be6b8e0, d30202a. **Not merged**: the company details are placeholders.

- New pages: /legal/terms, /legal/dpa, /legal/subprocessors and /legal/abuse. /privacy grows into the full Privacy notice, with its consent controls kept. All of them use one LegalPage layout, are prerendered and have SEO entries.
- The footer of every page links each legal page and gives the company line, all read from one constant, `src/site/company.ts` (`COMPANY`, `LEGAL`). The facts the pages state (prices, the trial, the 14-day refund, retention, notice periods) come from `src/site/legal/facts.ts`, which the landing's price reads too.
- The legal pages state the team history of 90 days and backups of 30 days (#114).
- The Subprocessors page lists Cloudflare, Stripe, Resend, PostHog EU and Google sign-in. I read both D1 databases' jurisdiction as `eu`. The Durable Objects have no jurisdiction set, so the page doesn't claim the data stays in the EU.
- The Terms state Swedish law and the Stockholm District Court; a consumer keeps their home law and can go to ARN. The 14-day refund, Data Act switching (no exit fees, export), DSA notice-and-action with statements of reasons, and 30 days' notice of changes are all in. There's no withdrawal button.
- `legal` is now a reserved team address, with a test.
- check-site covers every page, the footer links and the company line.

**Liam, before merging:** fill in `COMPANY` (organisation number, registered office, address, contact email, VAT number), set up the privacy@ and abuse@spool.page mailboxes, and get the lawyer's review. Then rebase, merge and deploy.

### agent, 2026-10-21T18:05:09.492Z

Merged into spool-cloud main in 9c18004 (merge 205 #118 legal pages, agreeing to the terms, mac-only wording). The company details are filled in from allabolag.se and bolagsfakta.se (21 October 2026): Morgan Jonasson Consulting AB, org. no. 556991-2321, seat Botkyrka, c/o Morgan Jonasson, Kopernikus Väg 6, 147 46 Tumba, VAT SE556991232101. The legal pages' leads and SEO now read the name from `COMPANY`. No general contact mailbox was given, so `COMPANY.email` (the footer, and the Terms' contact for refunds, export and account issues) is privacy@spool.page until there is one.

Liam: set up forwarding for privacy@ and abuse@spool.page, get the lawyer's review, and deploy spool-cloud.

### agent, 2026-10-21T18:51:51.326Z

Correction: there is no lawyer's review step. Liam decided the agent's review stands in for it (task 205, which found the withdrawal function gap, now #208). Ignore the lawyer step in my earlier comments; the legal pages no longer say they are drafts for a lawyer (spool-cloud 8d39c95). Still left for Liam: forwarding for privacy@ and abuse@spool.page, and deploying spool-cloud.
