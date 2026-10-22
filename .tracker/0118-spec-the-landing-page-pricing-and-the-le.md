# #118 · Spec: the landing page, pricing and the legal pages

- State: closed (done: all children merged)
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.521Z
- Updated: 2026-10-21T18:52:12.359Z
- Closed: 2026-10-21T18:05:09.537Z

## Problem Statement

Spool Cloud already sells: anyone may sign in, anyone signed in may start a team with a 14-day trial, and production bills in live Stripe mode (#122, #128). The public site at spool.page has not caught up with that.

- A visitor reading the Cloud chapter sees one line of price inside a paragraph and a team-name field. They can't see spool (free, on your Mac) set beside Spool Cloud, can't choose monthly or yearly before starting, and aren't told the price is before VAT.
- Nobody can tell whether the hero's line to the price, or the Cloud chapter itself, leads anyone to start a trial: the site measures only download clicks and install-command copies.
- A business buying seats finds no terms, no data processing agreement, no subprocessor list, no company details and no way to report abuse. The only legal page, Privacy & cookies, covers the marketing site and names Liam personally as controller, while the seller is Mojo Consulting AB. Several of these are required by law before taking money (Research: the paperwork for selling software to businesses (#93)).
- Nothing a person does on the way in (the landing's Start a 14-day trial, `/start`, the app's New team…, Stripe Checkout) says what they agree to, and Checkout carries no line about a consumer's right to cancel, which #122 promised.

## Solution

- The Cloud chapter's foot becomes the price as prototyped in Prototype pricing and buying a team (#98): **spool** (Free, on your Mac, open source, Download for Mac) beside **Spool Cloud** ($20 per editor a month, or $16 billed yearly, plus VAT where it applies, with a monthly/yearly switch). The Cloud column keeps the team name field and Start a 14-day trial (or what the visitor's next team starts as), and the cycle it showed goes to `/start`, which already hands it to Billing.
- PostHog, under the visitor's existing consent, measures the three things #98 named: a click on the hero's line to the price, the Cloud chapter reaching the screen, and Start a 14-day trial pressed as the goal.
- Six public pages, drafted from #93 and reviewed by the agent in place of a lawyer (Liam, task 205): **Terms** (written for businesses, with a consumer clause since anyone can pay, #90), the **Privacy notice** extended to the product and naming Mojo Consulting AB, a click-through **DPA**, a **Subprocessors** table, **company details** in every public page's footer, and a **Report abuse** page. Every page has a last-updated date.
- Starting a team and paying say what they bind to: one line by every way to start a team, and at Stripe Checkout the terms' consent and the consumer's cancel line.
- What the landing says about platforms follows Decide whether Spool Cloud launches Mac only (#111) once it is decided.

## User Stories

The price

1. As a visitor, I want spool and Spool Cloud side by side in the Cloud chapter, so that I see at once what is free and what my team would pay for.
2. As a visitor, I want the spool column to say Free, on your Mac, open source, with Download for Mac, so that I know the canvas itself costs nothing.
3. As a visitor, I want the Spool Cloud column to say $20 per editor a month, or $16 a month billed yearly, so that I can work out my team's cost.
4. As a visitor, I want a monthly/yearly switch on the Spool Cloud column, opening on yearly, so that I see both prices without doing sums.
5. As a visitor in the EU, I want the price to say plus VAT where it applies, so that the invoice holds no surprise.
6. As a visitor, I want to read that viewers and share links for clients are free, so that I know only editors are seats.
7. As a visitor, I want to name my team in the Cloud column and press Start a 14-day trial, so that trying it is one step from reading the price.
8. As a visitor who chose yearly, I want Billing to open on yearly once my team exists, so that my first choice carries through.
9. As a signed-in visitor whose trial is spent, I want the button and its line to say the team is paid from the start, so that I'm not promised a trial I can't have.
10. As a signed-in visitor whose teams are free, I want the column to say teams I start are free, so that I'm not shown a price that doesn't apply.
11. As a phone visitor, I want the two columns stacked, so that the price reads on a narrow screen.
12. As a visitor reading the hero, I want its line to the price to take me to the Cloud chapter, so that I find the price without scrolling blind.

Measuring

13. As Liam, I want a click on the hero's line to the price counted, so that I know whether the quiet line is read.
14. As Liam, I want the Cloud chapter reaching the screen counted once a visit, so that I know how many visitors see the price.
15. As Liam, I want Start a 14-day trial pressed counted with the cycle shown and what the team starts as, so that the landing has a goal to measure against.
16. As a visitor who declined analytics, I want none of these events sent, so that my choice holds.
17. As a visitor, I want the Privacy notice to list these events among what the website measures, so that what I consent to is what is measured.

The legal pages

18. As a buyer, I want Terms at a stable address, dated, so that I know what my company agrees to and can save them.
19. As a buyer, I want the terms to state the seats, the trial, billing, auto-renewal, how to cancel and the 14-day full refund, so that the money side is plain before I pay.
20. As a buyer, I want the terms to say how to export our data and switch away, so that we're never locked in.
21. As a buyer, I want the terms to state what content isn't allowed and how removal and suspension work, so that I know the rules for what we host.
22. As a private person who pays, I want the terms to state my 14-day right to cancel and that the 14-day refund meets it, so that I know my rights.
23. As a buyer's security reviewer, I want a DPA that binds by accepting the terms, with no signature, so that we can buy without a paper process.
24. As a security reviewer, I want the DPA to say Mojo Consulting AB is processor for team content and controller for account, billing and usage data, so that the roles are clear.
25. As a security reviewer, I want a Subprocessors page listing each vendor, what it does, which data, where, and its transfer basis, so that I can check the chain.
26. As a customer, I want to know how I'm told when a subprocessor changes, so that I can object in time.
27. As anyone, I want a Privacy notice covering accounts, teams, invites, outsiders, shares, billing and the website, naming Mojo Consulting AB as controller, so that I know who holds my data and why.
28. As an account holder, I want the notice to say how long data is kept, invoices included, and how deleting my account works, so that I know what stays.
29. As a visitor, I want the Privacy notice to keep its consent controls, so that I can still change my choice there.
30. As anyone, I want the company's name, organisation number, seat, address, email and VAT number in every public page's footer, so that I know who I deal with.
31. As anyone who finds illegal content in a share, I want a Report abuse page saying what to include and where to send it, so that it reaches a person.
32. As an authority, I want a contact point and the languages it accepts on that page, so that an order reaches Mojo Consulting AB at once.
33. As a visitor, I want every legal page in the site's own nav and footer, so that it reads as part of spool.page.
34. As a search engine, I want each legal page in the sitemap with its own title and description, so that "spool terms" finds them.
35. As a team admin, I want no team ever to be given an address a legal page uses, so that a link to the terms never opens a team.

Agreeing

36. As a visitor starting a team on the landing, I want a line under Start a 14-day trial saying that starting agrees to the Terms and the DPA, with links, so that I know what I accept.
37. As someone landing on `/start` from another site, I want its confirm page to say the same, so that the agreement doesn't depend on which way I came in.
38. As a Mac user, I want the app's New team dialog to say the same, so that the app and the web agree.
39. As an admin paying in Stripe Checkout, I want to tick that I accept the Terms, so that the subscription rests on them.
40. As a private person paying, I want Checkout to say I may cancel within 14 days for a full refund, so that I know my right before I pay.

Platforms

41. As a visitor on Linux or Windows, I want the landing to say plainly whether I can be an editor on a team, so that I don't buy seats for a machine that can't hold a team project (waits on #111).

## Implementation Decisions

Where things live

- **spool-cloud** holds all of it but one line: the landing and the pages (its site), the route table that gives every page its head and the sitemap, the reserved team addresses, the start route's confirm page, and the Stripe port's Checkout session.
- **spool (core)** holds the app's New team dialog, which gains its agreement line. Nothing else in core changes.

The price

- The Cloud chapter's foot (today's team-name form and four facts) is replaced by the prototype's two-column price (the `setup` frame's price step on the canvas page `explore/cloud/buy-team`, drawn by `CloudPrice` in `design/shared/ui/explore/cloud-buy-team/setup.tsx`, read only), built from the site's own system parts. The four facts about what a team gets stay in the chapter.
- The Spool Cloud column's offer still follows what the visitor's next team starts as (trial, paid, free), as the landing does today; free hides the price switch.
- The switch opens on yearly, as prototyped, and is sent as the start form's `cycle` field; `/start` already accepts `cycle` and forwards it to Billing.
- Prices come from one constant beside the copy, $20 and $16, and the words say "plus VAT where it applies" (#122; e-handelslagen 9 §).
- The hero's line already ships ("Free on your Mac, with the source on GitHub. Spool Cloud for teams, from $16 a seat →"). It stays as worded; it gains only its measure.

Measuring

- Three PostHog events beside today's `download_clicked`, sent only with the analytics consent, through the site's existing analytics client:
  - `cloud_price_clicked` with `placement: "hero"` when the hero's line is pressed;
  - `cloud_chapter_reached` once a page view, when the Cloud chapter reaches the middle of the screen (the chapters' existing reached signal);
  - `trial_start_pressed` with `cycle` and `starts` (trial, paid, free) when the start form is submitted.
- The Privacy notice's "What the website measures" names them.
- Which product events (signed up, trial started, converted, cancelled) count, and where money numbers come from, stay with Decide what we measure from launch (#121).

The legal pages

- Five new or extended static pages in the site, prerendered like Privacy & cookies, each with a last-updated date and the site nav and footer: `/legal/terms`, `/legal/dpa`, `/legal/subprocessors`, `/legal/abuse`, and the product Privacy notice, which stays at `/privacy` (Google's sign-in branding and existing links point there). `legal` joins the reserved team addresses; no other word is reserved.
- Company details (registered name, organisation number, seat, street address, email, VAT number) are one constant that the footer of every public page reads, so the waitlist pages and the landing carry them too.
- Text is drafted from #93's recommendation, in plain English: Terms 2,500–4,000 words written for businesses with a consumer clause (#90: anyone can pay); refund and cancellation as its own headed section matching #99 (cancel to period end; full refund within 14 days of the first payment); DSA content rules, notice-and-action and statement of reasons; Data Act switching and export (every editor holds `design/`; admins export, per #101); the DPA incorporated by reference; Swedish law with a venue for businesses. The DPA builds on the Commission's 2021/915 clauses, with the controller/processor split, general authorisation of subprocessors with notice to team admins by email, the SCC fallback, return and deletion at the end, breach notice without undue delay.
- The Subprocessors table lists Cloudflare, Stripe, Resend, PostHog (website only) and Google (sign-in), each with purpose, data, location and transfer basis. It claims a location only where it is confirmed: the D1 databases' and Durable Objects' locations are read from Cloudflare before writing, and nothing says "EU only" unless every store is.
- The Privacy notice keeps today's website sections and consent controls and adds: Mojo Consulting AB as controller; accounts and sign-in (emailed codes, Google, passkeys, device sessions); teams, invites, outsiders, shares and comment emails; team content with Mojo as processor under the DPA; billing through Stripe and seven-year invoice retention; legal bases (contract, legal obligation, legitimate interest, consent); per-vendor transfers; account deletion (#101) and requests to privacy@spool.page.
- The Report abuse page names one monitored address, the languages (English, Swedish), the four things a notice must hold (DSA art. 16(2)), and that the sender hears back.

Agreeing

- One line, "Starting a team agrees to the Terms and the DPA", with links, under the landing's start button, on `/start`'s confirm page, and in the app's New team dialog.
- Stripe Checkout gains `consent_collection.terms_of_service: "required"` with custom text linking the Terms and DPA, and one line of custom text on a consumer's right to cancel within 14 days with a full refund. This rides the existing Stripe port's Checkout call; the fake port records it.

## Testing Decisions

- A good test drives what a visitor or Stripe sees: the built page in a browser, the events PostHog would receive, the route's response, the Checkout parameters the port was handed. It never asserts which component rendered.
- **The built site, the main seam:** `scripts/check-site.mjs` (Playwright against the built and previewed site) already checks the landing's forms against the worker's contract. It gains: the price columns and switch, the switch's cycle in the URL `/start` receives, the offer per account state, every legal page answering 200 with its title, nav and the company footer, and the footer's links reaching each page.
- **Events:** `scripts/check-privacy.mjs` intercepts PostHog and asserts what is captured with and without consent; it gains the three events. `src/site/analytics/client.test.ts` is the unit prior art for the client's capture functions.
- **The worker:** the start app's existing worker tests gain the agreement line on the confirm page; the addresses test gains `legal` refused and avoided; the billing worker tests over the fake Stripe port assert Checkout carries the terms consent and the consumer line. Stripe is never called.
- **Core:** the team screens' browser tests (`src/ui/team-setup.test.ts` and the teams tests) assert the New team dialog's line and links.
- The route table's sitemap stays generated from the table, so a page is in the sitemap by being in the table.

## Out of Scope

- No lawyer: Liam decided the agent reviews the pages (task 205). The review found the withdrawal function gap, built as #208.
- The internal abuse procedure, breach procedure and record of processing (#93's three internal notes).
- Product analytics beyond the landing's three events (#121), support and a status page (#120).
- A withdrawal button inside the product (see Open questions).
- The setup list, `/start`, sign-in titled "Sign in to start …", Billing and the trial: built by #122.
- Retiring the waitlist (see Open questions).
- A DMCA agent, a security page, translations of the legal pages.

## Further Notes

Audit of what already ships, against each decided behaviour (spool-cloud unless marked):

- **Chapters landing (#95): shipped.** `src/site/chapters/ui/site/chapters/landing.tsx` (hero, agents switcher, Fair, Sola, Stilla, Gust, Get it), nav and footer in `src/site/chapters/ui/site/system/site.tsx` (Docs, GitHub, Cloud, Sign in; signed in: face and Your projects), motion kit in `src/site/chapters/ui/site/motion/`.
- **Waitlist with double opt-in and Let in (#95): shipped, then superseded** by the start form (commit bc5dd96). Still live: `src/worker/waitlist/`, `src/site/chapters/ui/site/chapters/waitlist.tsx`, `/waitlist/confirmed` and `/waitlist/expired` (`pages.tsx`), whose copy still says teams are let in a few at a time.
- **Hero line to the price (#98): shipped** (62f97bc), worded "Spool Cloud for teams, from $16 a seat →" rather than the prototype's "…from $16 per editor. See pricing". Its measure is missing.
- **Cloud chapter starts a team (#98): partial.** Team name and Start a 14-day trial into `/start`, with the offer by account (trial, paid, free): `CloudJoin` in `landing.tsx`. Missing: spool beside Spool Cloud, the monthly/yearly switch, "plus VAT".
- **`/start`, sign-in titled for the team, cycle into Billing (#122): shipped.** `src/worker/teams/start.ts`, `src/worker/auth/account-pages.ts`; core `src/ui/viewer/team-home.tsx` reads `cycle`.
- **PostHog measures (#98): missing.** `src/site/analytics/client.ts` captures only `download_clicked` and `install_command_copied`.
- **Privacy notice (#93): partial.** `src/site/privacy/page.tsx` covers the website and waitlist only and names Liam Vinberg.
- **Terms, DPA, subprocessors, company details, abuse contact (#93): missing.** No page, no footer details; `src/worker/teams/addresses.ts` reserves only `privacy`.
- **Checkout's consumer line and terms consent (#122): missing.** `src/worker/billing/stripe.ts` collects business name and tax ID but no consent or custom text.
- **Agreement at team start: missing** in both repos (`start.ts`; core `src/ui/teams.tsx` NewTeamDialog).
- **Platform wording: waits on #111.** Today: Download for Mac throughout, "on any machine with Node 22" in Get it, and `operatingSystem: "macOS, Linux, Windows"` in `vite.seo.ts`.

Research #93's report is on spool-cloud branch `97-i-m-thinking-we-should-probably-get--task-97-research-97-r4` (commit 1e7da1a, `research/244-paperwork-for-selling/`), not on main; read it there with `git show`.

Liam supplies, outside code: done: Morgan Jonasson Consulting AB's details are in, and privacy@ and abuse@spool.page forward to Liam; the Terms URL in Stripe's public business details (Checkout's terms consent needs it); the lawyer.

## Open questions

1. **What the landing says about platforms.** Waits on Decide whether Spool Cloud launches Mac only (#111), undecided. Recommendation: none here; the platform-wording ticket stays blocked by #111, and until then the landing keeps today's words.
2. **Where a team's terms are accepted, with a no-card trial.** A trial runs 14 days before anyone reaches Checkout, so the DPA would bind only at payment unless starting a team agrees to it. Recommendation: the one line by every way to start a team (as specced above), plus Stripe's consent at Checkout; no checkbox before the trial, as Linear and Paper do. The agreeing ticket builds this unless Liam says otherwise on this ticket.
3. **Does a consumer need a labelled withdrawal button?** Since 2026-06-19 a consumer contract made online needs a clearly labelled withdrawal function (#93 §2). Anyone can pay (#90), and today cancelling in Stripe's portal within 14 days refunds in full and ends at once. Recommendation: put the question to the lawyer in the same review; build nothing until they answer; if they say yes, a "Withdraw from the contract" link in Billing that runs the existing 14-day refund.
4. **Retire the waitlist.** Its sign-up is gone from the landing, but its pages and worker still answer and promise to let teams in. Recommendation: turn both pages into a pointer to Start a 14-day trial, stop taking new sign-ups, keep the list (and the notice's section on it) until its confirmed addresses get one "Spool Cloud is open" email, then delete it. A small follow-up ticket once agreed.

*From Linear DEV-269.*

Related: #122, #128, #98, #95, #93, #89

Plane: SPOOL-118

## Comments

### agent, 2026-10-21T16:49:49.239Z

Spec and build tickets written (agent-hub task 205). The body above is the spec, with the audit of what already ships in Further Notes and four open questions at its end. Tickets: #178 (price and measures), #179 (legal pages), #180 (agreeing, blocked by #179), #181 (platform wording, blocked by #111, #178, #179). Liam owes: Mojo Consulting AB's company facts, the abuse and privacy mailboxes, the Terms URL in Stripe's public details, and the lawyer's review before launch.

### agent, 2026-10-21T16:52:55.124Z

Only #181 needs #111; the spec as a whole is unblocked (task 205).

### agent, 2026-10-21T18:05:09.537Z

All four children are closed. #178: spool-cloud bc436ce. #179, #180, #181: spool-cloud 9c18004; #180's dialog line: spool 98191f6c. Left for Liam: deploy spool-cloud; mailbox forwarding; the lawyer's review; Stripe's Terms URL, then `STRIPE_TERMS_CONSENT` on (see #180); the waitlist's one email, then delete the list; a spool.page release and pin bump for the dialog line.

### agent, 2026-10-21T18:51:51.319Z

Correction: there is no lawyer's review step. Liam decided the agent's review stands in for it (task 205, which found the withdrawal function gap, now #208). Ignore the lawyer step in my earlier comments; the legal pages no longer say they are drafts for a lawyer (spool-cloud 8d39c95). Still left for Liam: deploy spool-cloud; mailbox forwarding for privacy@ and abuse@spool.page; Stripe's Terms URL, then `STRIPE_TERMS_CONSENT` on; the waitlist's one email; a spool.page release and pin bump.
