# #180 · Legal: what starting a team and paying agree to

- State: closed (done: merged spool-cloud 9c18004, spool 98191f6c)
- Labels: ready-for-agent
- Parent: #118
- Blocked by: #179
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:49:49.222Z
- Updated: 2026-10-21T18:05:09.509Z
- Closed: 2026-10-21T18:05:09.509Z

## Parent

Spec: the landing page, pricing and the legal pages (#118)

## What to build

What starting a team and paying agree to. Spans **spool-cloud** (the landing's start form, `/start`'s confirm page, the Stripe port's Checkout call) and **spool** (the app's New team dialog).

One line, "Starting a team agrees to the Terms and the DPA", linking both pages, under the landing's start button, on `/start`'s confirm page, and in the app's New team dialog. Stripe Checkout gains the terms consent (`consent_collection.terms_of_service: "required"`, custom text linking the Terms and DPA) and one line of custom text on a consumer's right to cancel within 14 days with a full refund. This is the recommendation in #118's Open question 2; build it unless Liam answered otherwise in #118's comments.

## Acceptance criteria

- [ ] The landing, `/start`'s confirm page and the New team dialog carry the line and links to `/legal/terms` and `/legal/dpa`
- [ ] Checkout is opened with the terms consent required and both custom texts, asserted over the fake Stripe port; Stripe is never called in tests
- [ ] The Terms URL is set in Stripe's public business details in live and test mode (Liam's dashboard step; ask on #118 if it isn't), and a test-mode Checkout shows the tick
- [ ] Core's team screen tests cover the dialog's line; spool-cloud's start and billing worker tests cover theirs
- [ ] Both repos' tests and checks pass; core lands a changeset for the dialog's new line

## Blocked by

- Legal: the public pages and company details (#179)

## Comments

### agent, 2026-10-21T18:00:07.726Z

Built, **not merged**: it depends on #179's pages and the placeholder company details.

- spool-cloud `205-b118`: 7812132 makes Checkout require the terms tick (`consent_collection.terms_of_service: required`). It adds custom text linking the Terms and the DPA, and a submit line telling a consumer they can cancel within 14 days for a full refund. Tests assert this through the fake Stripe port and the port's form mapping.
- c47e362 puts the line on /start's confirm page (worker test). b9a3ac5 puts it under the landing's start button (check-site).
- spool core, branch `205-are-there-any-other-gaps-compared--spec-205-b118`: fc1e3b64 adds the line, with links on spool.page, to the New team dialog, with a teams.test case and a patch changeset (`.changeset/new-team-terms.md`).

**Liam:** set the Terms URL in Stripe's public business details, in live and test mode; Checkout errors without it once consent is required. Then check that a test-mode Checkout shows the tick. Merge both repos with #179. The app's line reaches users only after a core release; mirror it in design/frames/app if the frame shows the dialog.

### agent, 2026-10-21T18:05:09.509Z

Merged into spool-cloud main in 9c18004 and spool main in 98191f6c (the New team dialog, with a patch changeset).

**The terms tick sits behind a flag, off by default.** Checkout requires the tick and shows the two custom texts only while the Worker var `STRIPE_TERMS_CONSENT` is `"on"`. wrangler.jsonc ships it `"off"` in both production and beta, so deploying before Stripe has the Terms URL doesn't break Checkout. Tests cover both off (no consent fields sent) and on.

To turn it on: (1) set the Terms URL (https://spool.page/legal/terms) in Stripe's public business details, in test and live mode; (2) in wrangler.jsonc, set `"STRIPE_TERMS_CONSENT": "on"` in beta's vars and deploy, then check that a test-mode Checkout shows the tick; (3) set it `"on"` in production's vars and deploy.

The dialog's line reaches users with the next spool.page release, then a bump of spool-cloud's pin.
