> Research asset for a spool cloud pricing decision, 2026-07-22. Extraction-agent report, verbatim. Gathers comparable pricing structures and open-core conversion evidence to test the hypothesis: per-seat $15–20/mo, unlimited repos per seat; public repos free; private repos get main-branch canvas free; PR previews on private repos + guest links are what a seat buys. Facts only, no recommendation — every claim traces to a primary source (pricing page, docs, or first-party blog) unless explicitly marked UNCONFIRMED. All URLs fetched 2026-07-22 unless noted otherwise.

# Pricing Landscape: Comparables + Open-Core Conversion Evidence

## Task 1 — Comparable pricing extraction

---

### 1. Chromatic (chromatic.com)

**(a) Plan names + prices:** Free — $0/month. Starter — $179/month. Pro — $399/month ("Best value" label). Enterprise — custom, contact sales. No annual toggle/discount was surfaced in this fetch — mark annual pricing UNCONFIRMED (not found, not necessarily absent). [chromatic.com/pricing](https://www.chromatic.com/pricing)

**(b) Metric:** Usage-based, metered in "billed snapshots" per month. TurboSnap technology only snapshots stories affected by a given file change, and TurboSnap-identified-unchanged snapshots are "billed at 1/5th the cost of a regular snapshot." [chromatic.com/pricing](https://www.chromatic.com/pricing), [chromatic.com/docs/billing](https://www.chromatic.com/docs/billing/)

**(c) Free-tier boundary:** 5,000 billed snapshots/month (≈25,000 TurboSnap-equivalent). Explicitly includes "unlimited projects & users" and "unlimited collaborators," Chrome-only browser testing, git/CI integration, UI version tracking. No credit card required. [chromatic.com/pricing](https://www.chromatic.com/pricing)

**(d) First paid-tier gate:** Starter ($179/mo) adds cross-browser testing ("Test on Safari, Firefox, Edge" — free tier is Chrome-only) plus a higher snapshot ceiling (35,000/mo) and per-snapshot overage at $0.008 each.

**(e) Collaboration/guest gating:** Collaborators and users are unlimited and free on every tier, including Free — this is not what paid tiers gate. Four roles exist: Owner ("manage, delete the project, manage/assign roles"), Developer (default — "manage the project, review tests, approve PRs, assign reviewers"), Reviewer ("leave comments, review tests, approve PRs they're assigned to"), Viewer (read-only). External stakeholders get access two ways: an "Invite link" (shared URL, auto-assigned `developer` role) or "Invite email" (role selectable before sending) — explicitly framed for "stakeholders like PMs, designers, and consultants who don't commit code but contribute to the sign off process." This invite-link mechanism functions as Chromatic's shareable review/guest-access path, requiring neither repo access nor a pre-existing Chromatic account. [chromatic.com/docs/collaborators](https://www.chromatic.com/docs/collaborators/)

**(f)** [chromatic.com/pricing](https://www.chromatic.com/pricing), [chromatic.com/docs/billing](https://www.chromatic.com/docs/billing/), [chromatic.com/docs/collaborators](https://www.chromatic.com/docs/collaborators/) — checked 2026-07-22.

---

### 2. Vercel (vercel.com)

**(a) Plan names + prices:** Hobby — free. Pro — $20/month "platform fee" (includes 1 deploying seat + $20/month usage credit); additional Owner/Member seats $20/month each. Enterprise — custom, 99.99% SLA. No annual-discount toggle found for the platform fee itself. [vercel.com/docs/plans/pro-plan](https://vercel.com/docs/plans/pro-plan)

**(b) Metric:** Hybrid — per deploying-seat ($20/mo each) plus a credit-based usage pool ($20/mo credit included, on-demand billing beyond it). Read-only "Viewer" seats are free and unlimited and do not count toward billable seats. [vercel.com/docs/plans/pro-plan](https://vercel.com/docs/plans/pro-plan)

**(c) Free-tier boundary (Hobby):** 100GB Fast Data Transfer, 1,000,000 Edge Requests, 4 active-CPU-hours, 1,000,000 function invocations, 200 projects, 100 deployments/day, 50 WAF IP-blocking rules capped at 3, 1 hour of runtime logs. Critically: **"the Hobby plan restricts users to non-commercial, personal use only"** per Vercel's fair-use guidelines — this is a usage-rights boundary, not just a resource cap. [vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby)

**(d) First paid-tier gate:** Pro ($20/mo) unlocks commercial use rights, team collaboration/RBAC (Owner/Member/Billing/Viewer-Pro roles), unlimited projects (vs 200), 6,000 deployments/day (vs 100), 1 day of runtime logs (vs 1 hour), and Password Protection + Sharable Links for deployment protection (Hobby only has baseline Vercel Authentication). [vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby)

**(e) Previews, collaboration, guest access:** Preview Deployments exist on every git push on **both** Hobby and Pro — not a paid-tier gate by itself. What Pro adds is *protection/sharing infrastructure around* previews: Hobby's only protection method is Vercel Authentication (team-only); Pro adds **Password Protection** (a paid add-on, $150/mo bundled into "Advanced Deployment Protection") and **Sharable Links** (a mechanism to bypass deployment protection for specific non-team viewers). Billable seats: Owner/Member roles at $20/month each, can "configure & deploy projects." Free, unlimited **Viewer Pro** seats get "read-only access to view analytics, speed insights, or access project deployments" and can "comment and collaborate on deployed previews" but cannot configure or deploy. A **Preview Deployment Suffix** (custom domain for preview URLs) is a further add-on: $100/month on Pro, included on Enterprise. [vercel.com/docs/plans/pro-plan](https://vercel.com/docs/plans/pro-plan), [vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby)

**(f)** [vercel.com/pricing](https://vercel.com/pricing), [vercel.com/docs/plans](https://vercel.com/docs/plans), [vercel.com/docs/plans/pro-plan](https://vercel.com/docs/plans/pro-plan), [vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby) — checked 2026-07-22.

---

### 3. Netlify (netlify.com)

**(a) Plan names + prices:** Free — $0/month. Personal — $9/month. Pro — $20/month, described as "unlimited members." Enterprise — custom. A **Legacy Pro** plan still exists in parallel, billed per-seat at $19/team member/month (see (e)). [netlify.com/pricing](https://www.netlify.com/pricing/)

**(b) Metric:** Credit-based flat plans, **not per-seat**, on the current "Credit Pro" plan — Free gets 300 credits, Personal 1,000, Pro 3,000, Enterprise unlimited. Netlify's own docs state directly: "On the Credit Pro plan, team member seats are unlimited and included starting in the base $20/month plan at no additional cost." This is a documented **migration away from per-seat billing** — the still-live Legacy Pro plan is explicitly per-seat ($19/team member/month), meaning Netlify runs both models concurrently for customers on different plan generations. [docs.netlify.com — roles-and-permissions](https://docs.netlify.com/manage/accounts-and-billing/team-management/roles-and-permissions/)

**(c) Free-tier boundary:** 300 credits/month; "unlimited deploy previews," deploy from AI/Git/API, functions & AI models, custom domains + SSL, database/blob storage, firewall rules, CDN access. [netlify.com/pricing](https://www.netlify.com/pricing/)

**(d) First paid-tier gate:** Personal ($9) adds smart secret detection, 1-day observability, priority email support. Pro ($20) adds private organization repos, shared env variables, 3+ concurrent builds, 30-day analytics & metrics. [netlify.com/pricing](https://www.netlify.com/pricing/)

**(e) Previews, collaboration, guest access — closest analog in this survey to spool's value line:** Deploy Previews are **"unlimited" and free on every tier, including Free.** The **Reviewer role is explicitly free, unlimited, and non-billable on every tier**, scoped exclusively to Deploy Preview commenting — reviewers "never touch the dashboard." Netlify's own docs: "A Team Owner can add an unlimited number of Reviewers to your team for free... Reviewers do not contribute to your total member count, and are not included on your bill." A Team Owner/Developer must first approve a Reviewer invite; once approved, the Reviewer can access Deploy Preview and branch-deploy links across the team's sites and leave feedback via the **Netlify Drawer** — annotated screenshots, screen recordings, and comments that "automatically post in the corresponding pull/merge request at your Git provider and vice versa." Git Contributors (a separate free role) get automatic preview access "as long as the links do not require Netlify Team Login, Netlify SSO, or other forms of authentication." The paid/billable roles are Owner, Developer, and Publisher — unlimited & included at no extra charge on Credit Pro, but still $19/member/month on Legacy Pro. [docs.netlify.com — roles-and-permissions](https://docs.netlify.com/manage/accounts-and-billing/team-management/roles-and-permissions/), [docs.netlify.com — collaborate-on-deploys](https://docs.netlify.com/site-deploys/collaborate-on-deploys/)

**(f)** [netlify.com/pricing](https://www.netlify.com/pricing/), [docs.netlify.com/manage/accounts-and-billing/team-management/roles-and-permissions](https://docs.netlify.com/manage/accounts-and-billing/team-management/roles-and-permissions/), [docs.netlify.com/site-deploys/collaborate-on-deploys](https://docs.netlify.com/site-deploys/collaborate-on-deploys/) — checked 2026-07-22.

---

### 4. Magic Patterns (magicpatterns.com)

**(a) Plan names + prices:** A direct fetch of magicpatterns.com/pricing today returned only a page header with no rendered pricing content (client-side-rendered pricing table not captured by the fetch) — today's live-page numbers are **UNCONFIRMED by direct fetch**. However, Magic Patterns' own first-party blog post ("New Plans, Credits, and On-Demand Usage") fetched cleanly and, combined with convergent third-party corroboration, gives: Free $0/mo (50 credits/mo), Starter $20/month ($17/month billed annually, -15%), Business $100/month ($85/month billed annually), Enterprise custom. Legacy pricing (Hobby $19 → Starter, Pro $75 → Business) is grandfathered for existing monthly subscribers "until June 30, 2026"; annual subscribers keep legacy pricing through the end of their current billing cycle. [magicpatterns.com/blog/new-plans-and-pricing](https://www.magicpatterns.com/blog/new-plans-and-pricing) (first-party, fetched cleanly); numeric tier details cross-checked via search snippets of [magicpatterns.com/pricing](https://www.magicpatterns.com/pricing) — UNCONFIRMED for today specifically, though this exact figure set was directly confirmed via live fetch in the project's own 2026-07-20 research (see `research/03-landscape.md` §1).

**(b) Metric:** Per-seat base plan plus variable-complexity credits ("simple changes... use fewer credits than complex requests"); overage $0.02/credit pay-as-you-go.

**(c) Free-tier boundary:** 50 credits/month.

**(d) First paid-tier gate:** Starter adds 1,000 monthly credits, team workspaces (up to 10 users), watermark removal on previews, MCP export, GitHub sync. Business adds 5,000 credits, latest AI models, SSO, usage reporting, workspaces for 10+ users.

**(e) Previews/guest access:** Not found in this session's sources — no specific external-guest-link gating documentation was located (distinct from the multiplayer live-cursor canvas collaboration noted in prior research).

**(f)** [magicpatterns.com/pricing](https://www.magicpatterns.com/pricing) (returned no content today — UNCONFIRMED), [magicpatterns.com/blog/new-plans-and-pricing](https://www.magicpatterns.com/blog/new-plans-and-pricing) (first-party, confirmed) — checked 2026-07-22.

---

### 5. Payload / Payload Cloud (payloadcms.com)

**(a) Plan names + prices:** No numeric self-serve pricing tiers are currently surfaced anywhere on payloadcms.com's own pages reachable this session (`/pricing` → 404; `/cloud` and `/cloud-pricing` render no plan/price data — `/cloud-pricing` shows only a link to `/get-started` and the statement "No pricing changes are currently planned for Cloud customers"; `/get-started` lists deploy templates and an Enterprise contact tier with no dollar figures). Third-party aggregators consistently and convergently report **Self-Hosted/Personal $0, Standard Cloud $35/month, Pro Cloud $199/month, Enterprise Cloud $833/month** — **UNCONFIRMED against a first-party numeric source this session** (a Payload pricing PDF hosted on images.g2crowd.com confirmed the plan *names* "personal," "team," and "pro" via its embedded checkout URLs but its dollar amounts were embedded in a compressed PDF stream this session could not parse).

**(b) Metric (confirmed first-party):** Per-admin-panel-user-seat, not feature-gated. Payload's own blog states directly: "As a self-hosted CMS, Payload doesn't have any business in how many user roles, content types or API requests your app handles" — i.e., the tiers are not differentiated by feature depth at all, only by admin-panel user count. [payloadcms.com/posts/blog/free-forever](https://payloadcms.com/posts/blog/free-forever)

**(c) Free-tier boundary (confirmed first-party):** The "Personal" plan is "a completely free option for users to have a fully featured, headless CMS, on an individual basis" — fully featured, but capped at one admin-panel user, positioned explicitly for "portfolio sites, personal projects, or APIs that will only ever have one admin panel user." [payloadcms.com/posts/blog/free-forever](https://payloadcms.com/posts/blog/free-forever)

**(d) First paid-tier gate (confirmed first-party, price UNCONFIRMED):** The "Team" tier's sole documented gate is raising the admin-panel user cap to "up to five users." The "Pro" tier removes the user cap entirely. [payloadcms.com/posts/blog/free-forever](https://payloadcms.com/posts/blog/free-forever)

**(e) Previews/guest access:** Not found — no preview-link or guest-share feature documentation was located for Payload Cloud this session.

**(f) Status note (material to this research, confirmed first-party):** Payload was acquired by Figma; Figma's own blog dates the announcement to **June 17, 2025**, "coinciding with Config 2025" (one secondary aggregator dates it June 24, 2025 — UNCONFIRMED variance, first-party date used here). Figma's commitment: **"Payload will remain an open-source product... In the immediate future, nothing is changing for users. We will continue to actively invest in and improve the open-source project."** Figma's stated strategic angle: developing "a content management system for Figma Sites," with Payload becoming part of "a central hub for digital product creation, where you can build and deploy what you create directly within our ecosystem." Payload's own site today carries a homepage banner reading "Payload is now part of Figma!" and its cloud-pricing page states "No pricing changes are currently planned for Cloud customers." [figma.com/blog/payload-joins-figma](https://www.figma.com/blog/payload-joins-figma/), [payloadcms.com/cloud-pricing](https://payloadcms.com/cloud-pricing), [payloadcms.com](https://payloadcms.com) — checked 2026-07-22.

---

### 6. Subframe (subframe.com)

**(a) Plan names + prices:** Free — $0. Pro — $29/month per editor. Custom/Enterprise — "Schedule demo," no listed price. Only monthly figures were found; no annual-billing toggle was observed. Note: a direct fetch of subframe.com/pricing returned HTTP 404 today (matching the 403 the same page returned in the project's 2026-07-20 research) — the pricing data below came from a direct fetch of the subframe.com **homepage**, which does render a pricing section, and counts as first-party. [subframe.com](https://www.subframe.com/)

**(b) Metric:** Per editor seat, with free unlimited viewer seats layered on top ("Free viewer seats are available on all plans").

**(c) Free-tier boundary:** 1 project, up to 10 pages, 2 prototypes, unlimited team members, "limited AI features," 24-hour version history.

**(d) First paid-tier gate:** Pro ($29/editor/mo) unlocks unlimited projects/pages/prototypes, unlimited AI usage, custom fonts, and extends version history to 7 days.

**(e) Guest/viewer access:** "Free viewer seats are available on all plans" is the only guest/collaboration-gating statement found this session — viewing is explicitly decoupled from the paid editor seat. Subframe also offers student/educator discounts on request. No public documentation of a distinct external "share preview link" mechanism was found this session (prior research, `03-landscape.md` §6, separately documents Subframe's "Basic prototyping" click-through preview mode and its non-linkable organizational "Flows," gathered from Subframe's help docs rather than the pricing page).

**(f)** [subframe.com](https://www.subframe.com/) (homepage, pricing section) — checked 2026-07-22; [subframe.com/pricing](https://www.subframe.com/pricing) returned 404.

---

### 7. Pencil.dev / pen.dev (pencil.dev)

**(a) Plan names + prices:** None — pen.dev states directly: **"pen.dev is currently free,"** with no plan names or tiers. Note: pencil.dev/pricing 307-redirects to **pen.dev/pricing**, indicating the product now operates under the pen.dev domain (a rebrand/domain change since the project's 2026-07-20 research, which used the pencil.dev domain throughout).

**(b) Metric:** None currently — no monetization is live.

**(c) Free-tier boundary:** No limits stated; the entire product is free at time of check.

**(d) First paid-tier gate:** N/A — no paid tier exists yet. The page adds: "In the future, we may introduce paid features or plans," with a commitment to "transparently communicate terms if monetization is introduced."

**(e) Previews/guest access:** N/A — not applicable with no paid tier to gate anything.

**(f)** [pen.dev/pricing](https://www.pen.dev/pricing) (redirected from pencil.dev/pricing) — checked 2026-07-22.

---

### 8. Onlook (onlook.com)

**(a) Plan names + prices:** No public pricing. The hosted cloud product offers only "Custom pricing tailored to your team's needs" — contact sales or book a demo.

**(b) Metric:** Self-hosted (free, open source) vs. hosted cloud (contact-gated, no public numeric metric).

**(c) Free-tier boundary:** The free option is full self-hosting via GitHub (Apache 2.0, per prior research) — the *hosted* product has no published free allotment.

**(d) First paid-tier gate:** N/A publicly — team features named for the paid/enterprise tier include Project Templates, Branching & Version Control, Theming & Branding, and Advanced Security (SSO/SAML/OAuth, audit logs, admin controls), but none carry a price.

**(e) Previews/guest access:** Not found — no public pricing page section addresses this.

**(f)** [onlook.com/pricing](https://onlook.com/pricing) — checked 2026-07-22. Product is confirmed "currently in closed beta," consistent with the project's 2026-07-20 finding in `03-landscape.md` §2.

---

### 9. Framer (framer.com)

**(a) Plan names + prices:** Free — $0/month. Basic — $10/month billed annually ($15/month billed monthly). Pro — $30/month billed annually ($45/month billed monthly). Enterprise — custom. A third-party-reported "Scale" plan at $100/month (annual-only) was seen across several aggregators but **could not be verified via direct fetch this session — UNCONFIRMED.** [framer.com/pricing](https://www.framer.com/pricing/) (direct fetch confirmed Free/Basic/Pro monthly figures and the annual/monthly split figures were corroborated by multiple independent third-party sources converging on the same $10/$15 and $30/$45 numbers).

**(b) Metric:** Hybrid — the base plan fee is flat (not multiplied by team size), but additional **Editor** seats are billed per-seat on top: "Additional editors are $20/month" (capped at 10 seats on Basic, "Unlimited" on Pro). A cheaper **Content Editor** seat (CMS/localization access only) is $10/month per editor.

**(c) Free-tier boundary:** "500 credits to try," free framer.xxx subdomain, 1GB bandwidth, 10 CMS collections, 1,000 pages, 5MB file uploads, one free locale. Workspaces without any paid subscription still support "collaboration with up to three editors" for free.

**(d) First paid-tier gate:** Basic ($10/mo annual) unlocks a free custom domain. Pro ($30/mo annual) adds 10 CMS collections (vs 2 on Basic), 100GB bandwidth (vs 50GB on Basic), a **staging environment**, and **"branching with previews."**

**(e) Previews, collaboration, guest access:** **Viewers are free** and can "view and add comments on pages and designs" without a paid seat — the paid unit is specifically edit/publish capability (Editor, $20/mo) or CMS-only edit capability (Content Editor, $10/mo). The staging environment and preview-branching feature — Framer's closest analog to spool cloud's PR-preview value line — is gated specifically to the **Pro** tier ($30/mo annual), not available on Free or Basic.

**(f)** [framer.com/pricing](https://www.framer.com/pricing/) — checked 2026-07-22.

---

### 10. v0 by Vercel (v0.app)

**(a) Plan names + prices:** Free — $0/month. Plus — $30/user/month. Business — $100/user/month. Enterprise — custom. A third-party-sourced claim that a legacy "Premium" $20/mo plan is being sunset for new users could not be confirmed via direct fetch of the relevant Vercel blog posts this session — **UNCONFIRMED.** [v0.app/pricing](https://v0.app/pricing)

**(b) Metric:** Per-user seat with included monthly credits bundled per seat (hybrid).

**(c) Free-tier boundary:** "$5 of included monthly credits," a hard "7 message/day limit," plus Design Mode, GitHub sync, and deploy-to-Vercel.

**(d) First paid-tier gate:** Plus ($30/user/mo) includes $30 of monthly credits per user plus "$2 of free daily credits on login per user," and adds chat-sharing/team collaboration.

**(e) Previews, collaboration, guest access:** Business ($100/user/mo) differs from Plus mainly on data handling ("Training opt-out by default" vs Enterprise's "Your data is never used for training") plus SAML SSO/RBAC on Enterprise. No canvas, multi-frame, or preview-link-gating mechanism was found — consistent with the project's 2026-07-20 finding (`03-landscape.md` §5) that v0 has no design-canvas surface at all, single-project Design Mode only.

**(f)** [v0.app/pricing](https://v0.app/pricing) — checked 2026-07-22.

---

### 11. Lovable (lovable.dev)

**(a) Plan names + prices:** **UNCONFIRMED by direct fetch.** Three separate WebFetch attempts on lovable.dev/pricing today (including one explicitly asking for a full verbatim markdown dump) all returned the FAQ/mechanics text but never rendered the actual plan-card dollar figures — almost certainly a client-side-rendered pricing widget the fetch tool's HTML-to-markdown conversion doesn't capture. Nine-plus independent third-party sources converge tightly and consistently on: **Free $0, Pro $25/month, Business $50/month, Enterprise custom.** Treat these specific numbers as UNCONFIRMED-but-strongly-corroborated rather than primary-source-confirmed.

**(b) Metric (confirmed first-party):** Explicitly **not** per-seat. Lovable's own pricing-page FAQ states directly: **"Workspaces support unlimited members on all plans, and plans are priced by the credits they include, not by seats."** Pure credit/usage-based, workspace-shared credit pool.

**(c) Free-tier boundary (confirmed first-party):** "Daily grant of 5 build credits (up to 30 a month), plus monthly grants of 20 Cloud credits," plus 4 credits for AI features inside user-built apps.

**(d) First paid-tier gate:** Paid plans add a larger monthly credit balance on top of the same daily/monthly grants every plan gets. Published per-action credit costs (Default Mode): "Make the button gray" = 0.50 credits; "Remove the footer" = 0.90; "Add authentication with sign up and login" = 1.20; "Build me a landing page, use images" = 1.70. Plan Mode is a flat 1 credit/message. Monthly-plan credits expire 2 months after issue; annual-plan credits expire 1 month after the annual period ends; top-up credits last 12 months.

**(e) Previews, collaboration, guest access:** Not found — no design-canvas or PR-preview-style gating exists; consistent with the project's 2026-07-20 characterization of Lovable (`03-landscape.md` §8, third-party-sourced there) as lacking multi-screen canvas capability. Collaboration is entirely workspace-credit-pool-based: "Workspace owners can set monthly credit limits and per-member overrides," with unlimited members regardless of plan.

**(f)** [lovable.dev/pricing](https://lovable.dev/pricing) — fetched 2026-07-22, but plan dollar figures not present in extracted text (see (a)).

---

## Task 2 — Open-core conversion + willingness-to-pay evidence

---

### n8n

**Rationale (first-party):** n8n created its own "Sustainable Use License" (SUL), announced on its own blog. Direct quote on why fair-code over pure open source: **"fair-code offers people many of the same benefits of open source (e.g. extensibility, security, privacy, transparency) while also ensuring you can build a sustainable business."** n8n's stated critique of pure OSS: **"It has become common for other businesses (especially cloud providers) to capture the value created by open-source projects and monetize it, with little to no return to the original developers."**

**Where the line is drawn:** SUL permits self-hosting and modification for "internal business purposes"; reselling the service as a hosted product is restricted. n8n explicitly *loosened* one restriction in this announcement: **"we have lifted that restriction altogether. This means you are now free to offer commercial consulting or support services (e.g. building n8n workflows or building n8n nodes for clients) without the need for a separate license agreement."**

**Sustainability framing:** **"Products that are solving a big enough problem (like n8n does) eventually need hundreds, even thousands, of people to keep up the work involved in development: releasing features, fixing bugs, and providing reliable software at scale. It's very hard to do this kind of constant high-quality work without positive cash flow."**

**Conversion rate:** Not published / not found this session.

**Source:** [blog.n8n.io/announcing-new-sustainable-use-license](https://blog.n8n.io/announcing-new-sustainable-use-license/) (first-party) — checked 2026-07-22.

---

### Payload

**Rationale (first-party):** Payload's line is drawn on *admin-panel user count alone*, not feature depth: **"As a self-hosted CMS, Payload doesn't have any business in how many user roles, content types or API requests your app handles."** The free "Personal" plan is framed around solo-founder capital allocation: **"every solo founder is faced with a ton of decisions—most critical of all is how to best use capital,"** so Payload "made one decision easy" by making Personal "a completely free option for users to have a fully featured, headless CMS, on an individual basis," aimed at "portfolio sites, personal projects, or APIs that will only ever have one admin panel user."

**Where the line is drawn:** Personal (free) = 1 admin-panel user, full features. Team (paid, price UNCONFIRMED — see Task 1 §5) = up to 5 admin-panel users. Pro (paid) = unlimited admin-panel users. No feature is removed at any tier — only the user-count ceiling changes.

**Post-acquisition context:** Now owned by Figma (announced by Figma 2025-06-17); Figma's stated commitment: "Payload will remain an open-source product... nothing is changing for users." Payload's own site: "No pricing changes are currently planned for Cloud customers."

**Conversion rate:** Not published / not found this session.

**Sources:** [payloadcms.com/posts/blog/free-forever](https://payloadcms.com/posts/blog/free-forever), [figma.com/blog/payload-joins-figma](https://www.figma.com/blog/payload-joins-figma/), [payloadcms.com/cloud-pricing](https://payloadcms.com/cloud-pricing) (all first-party) — checked 2026-07-22.

---

### Chromatic / Storybook

**Rationale:** Chromatic's own billing docs explain snapshot-counting *mechanics* in detail (see Task 1 §1) but **do not state an explicit rationale for why snapshot-based billing was chosen** — this was actively searched for and not found in Chromatic's own documentation this session. The only adjacent mission-style statement found, from the docs' refund-policy section, is: **"We want customers to ship consistent UIs, save time, and build bulletproof component libraries."**

**Where the line is drawn:** Not on collaboration (collaborators are free/unlimited on every tier, see Task 1 §1) — purely on testing volume (snapshot count) and browser coverage (Chrome-only on Free, cross-browser on paid).

**Conversion rate:** Not published / not found this session.

**Source:** [chromatic.com/docs/billing](https://www.chromatic.com/docs/billing/) (first-party) — checked 2026-07-22. Explicitly flagging: a rationale-specific blog post was searched for and not located.

---

### Sentry

**Rationale:** No first-party "why we price this way" blog post was located this session despite multiple targeted searches (including for Sentry's known historical shift away from strict per-seat pricing). This absence is being reported explicitly rather than padded with third-party paraphrase.

**Where the line is drawn (confirmed first-party, from Sentry's own pricing page):** Developer/Free tier is explicitly **"Limited to one user"** (5k errors/month, 5M spans, 10 custom dashboards). Team tier ($26/month billed annually) is explicitly **"Unlimited users"** (50k errors/month) — seats themselves are unlimited and not billed on Team-and-above; the free/paid boundary is drawn at *whether more than one person can use the account at all*, not at a per-seat price. Business ($80/month billed annually) adds unlimited custom dashboards, unlimited metric monitors, SAML+SCIM.

**Conversion rate:** Not published / not found this session.

**Source:** [sentry.io/pricing](https://sentry.io/pricing/) (first-party) — checked 2026-07-22.

---

### PostHog

**Rationale (first-party, from PostHog's own newsletter — a first-party domain, authored by a PostHog team member):** PostHog states explicit numbered principles for free-tier design:
1. **"Hobbyists or pre-PMF startups should be able to use PostHog for free."**
2. **"Be more generous than competitors, making it a no-brainer to choose PostHog."**
3. **"Every product should be priced separately. This means separate free tiers for each product."**
4. **"Features that increase stickiness should be free with a reasonable limit."**

Stated growth rationale: a generous free tier **"creates ultra-valuable word-of-mouth growth."** PostHog cites offering "mobile session replay for free" as a specific example of principle #2 in action, noting they're "one of the few session replay tools" doing so.

**Conversion rate:** The specific first-party post fetched this session **contains no published numbers on free-tier usage share or conversion rate** — this was checked explicitly and confirmed absent. A separate, lower-confidence search snippet (not traced to a specific first-party page) claimed "more than 90% of companies use the platform for free" — this figure is **UNCONFIRMED**, not found in the primary source directly fetched, and is reported here only to flag that it circulates, not as a verified fact.

**Source:** [newsletter.posthog.com/p/non-obvious-pricing-advice-for-startups](https://newsletter.posthog.com/p/non-obvious-pricing-advice-for-startups) (first-party, PostHog domain) — checked 2026-07-22.

---

### Supabase

**Rationale (first-party, but shallow — the deeper source was unreachable):** Supabase's live pricing page states only: **"Start for free, scale as you grow. Pay only for what you use"** and **"as a team of developers we are committed to pricing being as developer friendly as possible."** The page explicitly points to a fuller rationale post — **"Our pricing is in Beta. You can read more about our decisions in our pricing blog post"** — linking to `/blog/2021/03/29/pricing`. Two direct-fetch attempts on that URL this session both returned the same shallow pricing-page boilerplate rather than the original 2021 post's content, so **the deeper rationale in that post could not be extracted or quoted this session.** Note also that the "pricing is in Beta" framing is likely stale copy predating Supabase's current four-tier structure (Free/Pro/Team/Enterprise), carried forward on the live page.

**Where the line is drawn:** Organization-based billing — a flat monthly plan fee per organization (Free $0, Pro $25/mo, Team $599/mo per third-party-corroborated figures, Enterprise custom) plus usage-metered compute/bandwidth/storage/auth per project within that organization.

**Conversion rate:** Not published / not found this session.

**Source:** [supabase.com/blog/pricing](https://supabase.com/blog/pricing) (first-party, fetched, shallow) — checked 2026-07-22; supabase.com/blog/2021/03/29/pricing referenced but not independently extractable this session.

---

### Cal.com

**Rationale (first-party):** Cal.com's own blog frames its choice as inseparable from the problem: **"The limitations of existing scheduling products could only be solved by open-source,"** paired with a general caution: **"you should only consider making your project open-source if open-source actually solves the challenges that you want to address."** On the commercial open-source (COSS) trade-off specifically: **"An open-source company... looks fundamentally different, with a ton of self-hosters and free customers, who sometimes don't even know a commercial company behind the project exists."** And on the payoff: **"You won't capture revenue from people that self-host your product on their own, but you hope that the traction of open source puts you on the radar of big companies."** This post did not itself state Cal.com's specific tier boundaries.

**Where the line is drawn (confirmed first-party, from Cal.com's own pricing page):** Free = "1 user," full individual feature set (unlimited event types & calendars, 100+ app integrations, Stripe/PayPal payments, Salesforce/HubSpot sync). Teams = **$12/user/month** (annual billing, "Save 25%") — gates team scheduling across 1 team and round-robin scheduling. Organizations = **$28/user/month** (annual billing, "Save 25%") — gates unlimited sub-teams plus compliance (SAML SSO, SOC 2, HIPAA, ISO 27001). Enterprise = custom.

**Conversion rate:** Not published / not found this session.

**Sources:** [cal.com/blog/open-source](https://cal.com/blog/open-source), [cal.com/pricing](https://cal.com/pricing) (both first-party) — checked 2026-07-22.

---

### Willingness-to-pay evidence (indie developers / small teams, dev tools)

**No solid primary or well-sourced data was found this session.** This is being stated explicitly per instructions rather than padded. What was searched and explicitly excluded as unsuitable:

- Numerous "indie developer pricing guide" articles (dev.to, getmonetizely.com, and similar) citing specific-sounding numbers (e.g., "$49–199/month realistic indie pricing," a single indie dev's "$9/month... 3% of value delivered" anecdote) — these are unsourced, single-anecdote, or content-farm-style pieces and were excluded per the task's explicit "no content-farm blogspam, no invented numbers" instruction.
- A claim that "enterprise developers are 3.5x more likely to pay for developer tools than independent developers," attributed in search snippets to SlashData, could not be traced to a specific, fetchable SlashData report or page this session — excluded as unverifiable.
- OpenView Partners' SaaS Benchmarks data ("only 6% of SaaS companies have done sophisticated pricing research on buyer needs and willingness to pay") is a legitimate, well-sourced report, but it measures **SaaS vendors' research practices**, not **indie-developer/small-team willingness to pay** — off-target for this question and not included as evidence of the latter.

SlashData's "State of the Developer Nation" survey program is confirmed to exist as a legitimate, large-scale (95,000+ developers, 165+ countries per its own description) developer research effort, and plausibly contains relevant willingness-to-pay data in some edition — but no specific figure from it could be located and confirmed within this session's search budget. Flagging this as a lead for follow-up research rather than a finding.

---

## Patterns observed

Purely descriptive; no evaluation of the pricing hypothesis is intended.

**Pricing metric, across the 11 Task-1 products:**

| Metric shape | Products |
|---|---|
| Has a per-seat component (sole or hybrid) | Vercel, Magic Patterns, Payload (by admin-user count), Subframe, Framer (seat add-ons on a flat base), v0.app — 6 of 11 |
| Explicitly not per-seat for collaboration | Netlify (current Credit Pro plan — "unlimited members... at no additional cost"), Lovable ("priced by the credits they include, not by seats"), Chromatic ("unlimited collaborators" on every tier including Free) — 3 of 11 |
| Usage/credits as the primary metered unit | Chromatic (snapshots), Lovable (credits), Magic Patterns (credits, on top of a seat), v0.app (credits, on top of a seat), Vercel (credit pool, on top of a seat) — 5 of 11, all hybridized with something else except Chromatic and Lovable |
| No public numeric pricing (contact/beta-gated) | Onlook — 1 of 11 |
| Free / no monetization live | Pencil.dev / pen.dev — 1 of 11 |

**Free-tier boundary shape:** Of the products where the free/paid line could be confirmed, several draw it at *team size / collaboration*, not feature depth, while keeping the product fully-featured for a single user: Payload (Personal = 1 admin user, "fully featured"), Vercel Hobby (usable solo, but "restricted to non-commercial, personal use only"), Framer (workspace collaboration free "up to three editors," paid seats beyond that), Sentry (Free = "limited to one user," Team = "unlimited users"), Cal.com (Free = "1 user," Teams = $12/user/mo for team scheduling). 5 of the 18 products/companies covered across both tasks state their free/paid line explicitly in exactly these terms.

**Preview/guest/reviewer access specifically — the closest analog to spool cloud's proposed value line:** Of the 5 products in this survey with a documented, named "external stakeholder can look without editing" mechanism (Chromatic, Vercel, Netlify, Framer, Subframe), **all 5 keep that specific role free and unlimited on every tier, including the free tier**, and gate payment instead on edit/deploy/configure/publish capability:
- Chromatic: Viewer/Reviewer roles unlimited on Free; paid tiers gate snapshot volume + browser coverage.
- Vercel: Viewer Pro seats free & unlimited, can comment on previews; paid seats ($20/mo) are required for configure/deploy rights, and *protecting/sharing* previews with outsiders (Password Protection, Sharable Links) is itself a Pro-tier/paid-add-on feature layered on top of the free-to-view baseline.
- Netlify: Reviewer role free & unlimited & explicitly non-billable ("do not contribute to your total member count, and are not included on your bill") on every tier; Deploy Previews themselves are unlimited & free on every tier too.
- Framer: Viewers free ("view and add comments"); Editor/Content-Editor are the paid seats.
- Subframe: "Free viewer seats are available on all plans"; Editor is the $29/mo paid seat.

None of the 5 charge specifically for the *ability to grant a guest a look* at something; all 5 charge for the ability to *make or ship* the thing. Two products in the survey (Vercel, via paid Password Protection / Sharable Links add-ons) additionally gate the ability to *restrict or specially route* preview access, layered on top of the free baseline.

**Open-core rationale (Task 2, 7 companies):** Every company that published an explicit rationale (n8n, Payload, PostHog, Cal.com) framed its free tier around *adoption/word-of-mouth* rather than as a loss-leader trial — n8n and Payload both explicitly connect this to long-term business sustainability language ("positive cash flow," "how to best use capital"). None of the 7 companies researched (n8n, Payload, Chromatic/Storybook, Sentry, PostHog, Supabase, Cal.com) had a locatable first-party statement of a numeric free→paid conversion rate. The single specific conversion-adjacent number encountered (PostHog "more than 90% free") could not be traced to a first-party source and is marked UNCONFIRMED.

**Fetch reliability note:** 2 of the 11 Task-1 pricing pages (Magic Patterns, Lovable) render their actual price figures via client-side JavaScript that this session's fetch tooling could not capture directly, despite the HTTP request succeeding — both required third-party corroboration to report numbers, both flagged UNCONFIRMED accordingly. 1 product (Subframe) 404'd on its dedicated `/pricing` path both today and in the project's prior 2026-07-20 research (which saw a 403 there instead) — its pricing data in both research passes came from its homepage instead.
