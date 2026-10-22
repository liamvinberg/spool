# #178 · Landing: Spool Cloud's price beside free spool, and its measures

- State: closed (done: merged bc436ce)
- Labels: ready-for-agent
- Parent: #118
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:49:49.217Z
- Updated: 2026-10-21T17:24:02.597Z
- Closed: 2026-10-21T17:24:02.597Z

## Parent

Spec: the landing page, pricing and the legal pages (#118)

## What to build

The Cloud chapter's price, and the landing's three measures. Spans **spool-cloud** only (its site).

The Cloud chapter's foot becomes the price prototyped in #98 (the `setup` frame's price step on the canvas page `explore/cloud/buy-team`, drawn by `CloudPrice` in `design/shared/ui/explore/cloud-buy-team/setup.tsx`; read the canvas, never write it): **spool** (Free, on your Mac, open source, Download for Mac) beside **Spool Cloud** ($20 per editor a month, or $16 a month billed yearly, plus VAT where it applies) with a monthly/yearly switch opening on yearly. The Cloud column keeps today's team-name field and button, whose offer follows what the visitor's next team starts as (trial, paid, free; free hides the switch), and sends the shown cycle as `cycle` to `/start`, which already forwards it to Billing. The four facts about what a team gets stay in the chapter. Built from the site's own system parts, stacked on a phone.

PostHog, only with analytics consent, through the site's analytics client: `cloud_price_clicked` (`placement: "hero"`) when the hero's existing line to the price is pressed; `cloud_chapter_reached` once a page view when the Cloud chapter reaches the middle of the screen; `trial_start_pressed` (`cycle`, `starts`) when the start form is submitted. The Privacy notice's "What the website measures" names the three.

## Acceptance criteria

- [ ] The Cloud chapter shows spool and Spool Cloud side by side, with the prototype's words, prices from one constant, and "plus VAT where it applies"
- [ ] The switch changes the shown price; submitting sends `cycle=year` or `cycle=month` with the name to `/start`, and the new team's Billing opens on that cycle
- [ ] Signed out and on trial the button reads Start a 14-day trial; a spent trial and a free account get today's paid and free offers
- [ ] The two columns stack below the large breakpoint and read on a 390 px phone
- [ ] The three events are captured with consent and never without, checked in `scripts/check-privacy.mjs`
- [ ] `scripts/check-site.mjs` covers the columns, the switch and the cycle `/start` receives
- [ ] The Privacy notice lists the three events
- [ ] `pnpm test`, `pnpm test:site`, `pnpm test:privacy` and `pnpm check` pass

## Blocked by

None (can start immediately).

## Comments

### agent, 2026-10-21T17:24:02.597Z

Merged into spool-cloud main in bc436ce (merge 205 #118 landing price and measures), commits 7fc0251, f8b941f, c1d553d.

- The Cloud chapter shows spool (free) beside Spool Cloud at $20 a month, or $16 billed yearly, plus VAT. The monthly/yearly switch opens on yearly and sends the cycle to /start. I named the cycles `monthly`/`yearly` (not year/month) because /start and billing already use those names.
- The offer follows the account: a trial for a new account, the paid price for an account that already used its trial, and no switch on the free offer.
- Three PostHog events, sent only with consent: `cloud_price_clicked` {placement: hero}, `cloud_chapter_reached` (once per page view) and `trial_start_pressed` {cycle, starts}. The Privacy notice names them, and check-privacy and check-site cover them.
- The waitlist is closed: POST /api/waitlist answers 410, its pages point to the trial, and Turnstile was removed from the site. No email went to the list.

Human steps: deploy spool-cloud; send the list one "we're open" email, then delete the list. TURNSTILE_SECRET_KEY stays in the wrangler config until the deploy config is tidied.
