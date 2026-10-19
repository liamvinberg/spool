# #11 · Research: teams, seats and billing

- State: closed
- Labels: wayfinder:research
- Parent: #3
- Created: 2026-10-18T17:43:55.398Z
- Updated: 2026-10-18T17:43:57.342Z
- Closed: 2026-10-18T17:43:57.342Z

## Question

How do comparable products structure organisations, teams, projects, roles and seats (Figma, Vercel, Linear, GitHub, Chromatic, Framer, Paper, Pencil, Penpot, Liveblocks, Supabase); what triggers payment in dev and design tools that went open core or freemium in 2024 to 2026; and which billing providers fit a Swedish AB (Stripe, Paddle, Lemon Squeezy, Polar, Creem), including EU VAT, fees and seat billing? Updates research 06.

Report: `spool-cloud/research/110-teams-seats-billing/`.

*From Linear DEV-110.*

Related: #64

Plane: SPOOL-11

## Comments

### agent, 2026-10-18T17:43:57.337Z

**Liam, 2026-10-01:** ## Resolution

Report: `spool-cloud/research/110-teams-seats-billing/` (commit `c22fe0d`), 149 source extractions, checked 2026-10-01.

- In every product that documents it, single sign-on and audit logs sit above the first paid tier (Figma Organization, Supabase Team at $599, Linear Enterprise, Vercel's $300/month add-on). Penpot says plainly that it charges for "governance".
- Free viewers are common but not universal. True at Figma, Vercel, Framer, Paper, Chromatic and Penpot. Not at Linear (guests billed as members) or GitHub (outside collaborators on private repos take a paid licence); Supabase and Liveblocks put read-only roles behind a higher tier.
- What triggers payment: a second-person gate at Vercel, Sentry and Cal.com; member or editor caps at Penpot (8), Framer (3 editors) and Figma (3 collaborative files); no free-plan people limit at Linear, Chromatic, Supabase or n8n. Paper dropped its editor limit in August 2026. Figma now puts AI credits inside every seat.
- Published conversion evidence is thin. Figma's S-1 says about 70% of new Organization and Enterprise customers included someone from a Professional plan; PostHog says 97% of companies use it free.
- Billing for the AB: Stripe has the lowest list fees but leaves the tax to the seller; Stripe Managed Payments adds 3.5%; Paddle 5% + 50 cents; Lemon Squeezy is being folded into Stripe Managed Payments; Polar 3.4 to 5% plus 30 to 50 cents (fees changed 2026-05-27); Creem 3.9% + 40 cents. All pay out to Sweden and support per-seat quantities, proration and usage billing. The VAT facts covered: EU reverse charge, the EUR 10,000 threshold with OSS, the UK from the first sale, US state nexus.
- Corrections to report 06: Vercel password protection is now $20 per project per month, and Framer Pro is capped at 10 editors.

Unverified: Figma's monthly seat prices, whether Stripe can onboard before the AB exists, how Stripe Managed Payments handles B2B VAT numbers, Swedish tax treatment of payouts.
