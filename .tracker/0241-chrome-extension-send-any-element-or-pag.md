# #241 · Chrome extension: send any element or page to the canvas as a reference

- State: open
- Labels: enhancement, ready-for-agent
- Tasks: task 506 (Build spool Chrome extension)
- Created: 2026-11-07T20:49:41.337Z
- Updated: 2026-11-07T21:13:20.358Z

Rewrite spool's Chrome extension lean, end to end: pick an element or the whole page on any site and send it to the spool canvas open on the Mac as a **reference** frame (a mood board piece), with its DOM, its CSS and its animations, as much as the browser gives. Decided in task 499 (2026-11-07). It replaces the old capture research in spool-cloud `research/30`–`research/85` (debugger permission, forced states, pixel-exact proofs, a review dialog, 26 minutes for linear.app's whole page). None of that shipped and none of it is reused; read it only for traps.

## The design (decided)

`design/frames/app/extension/capture` (To build), code in `design/shared/ui/spool/extension/` (`use-capture.ts` is the picker's state machine, the frame draws it). Build to match it, motion included:

- The toolbar icon (spool's logo) or ⌥⇧S opens the picker; esc leaves at any point.
- The highlight is one body on springs that follows the element under the pointer. A dark tab on its top edge says what it is on (`section.pricing · 1180 × 640`); when the hand rests it unfolds into ↑ ↓, **Whole page ⌘↵** and **Send to spool ↵**. Near the top of the viewport the tab slides inside the body.
- ↑ walks to the parent, and past `body` to the whole page (body to the window's edges, tab reads `<host> · whole page W × H`, a rail down the right edge shows the page's full length with the visible part lit). ↓ walks back the way it came. A walk past either end knocks.
- Click or ↵ sends at once: no review step. Sending runs a line round the body's edge (the rail fills when whole); the tab becomes `In references/ on <project>` with **Open in spool**. Spool not reachable: "spool isn't running on this Mac. Open it, then try again." with **Try again**.
- The overlay lives in a shadow root, draws only with spool's tokens and primitives, reads on light and dark sites, and is still under reduced motion.

## What a capture carries

Reference, not an exact copy. The trick that keeps it small: **keep the site's own CSS and class names** instead of inlining computed styles. Each frame is its own iframe, so they can't clash, and hover, transitions, CSS animations and media queries keep working without forcing states.

- The picked subtree's HTML without scripts or inline handlers; current form values and `currentSrc`; open shadow roots flattened; canvases as images; the ancestors' context (html/body attributes and classes, custom properties) so it renders as on the page.
- Every active stylesheet's text (CSSOM where readable, else fetched), `url()`s resolved; `@font-face` and `@keyframes` kept.
- Animations started from JS that `document.getAnimations()` sees (Web Animations, e.g. Framer Motion's) turned into `@keyframes`. Script-driven rAF effects freeze where they were, and that's fine.
- Images and fonts downloaded into the project (spool's asset store, #216) so the reference survives the site changing.
- What can't come (cross-origin iframes, video streams, closed shadow roots) is left out quietly; at most one line in the frame's notes.

## Where it lands

- The extension sends to the local spool daemon (the installed app's port), never through the clipboard (the old research's clipboard path failed). The daemon writes a frame into `references/` on the canvas that is open (or the last one used), placed where it's in view, and the canvas shows it arriving. Open in spool brings that canvas forward on the frame.
- The route must not be callable by any website: only the extension may write (its origin, plus a pairing token or equivalent). Work out the least-friction way that is still safe.
- The spool skill learns `references/`: frames there are references an agent reads for ideas, never copies as they are.
- A changeset per `docs/releases.md`; the extension's version and build live with the repo (`extension/`), built by a script, its icon spool's logo.

## Done when

- Tested on real sites, each as one element and as the whole page: linear.app, figma.com, spool.page, stripe.com, a docs site (MDN), a site with heavy motion (e.g. one built on Framer). Note per site what came across and what didn't, with shots side by side; fix what's fixable within this design.
- Installed in Liam's Chrome on the m1 with the logo, working against the Mac app, and a packed zip ready for the Chrome Web Store (submitting it needs Liam's developer account: ask before that step).
- `pnpm test`, `pnpm typecheck`, `pnpm check` pass; merged.

## Comments

### agent, 2026-11-07T20:54:30.994Z

## Chrome Web Store readiness (checked from task 499, 2026-11-07)

**The account: not set up yet.** No Google account is signed in to the agent's Chrome on the m1, and none was chosen. The account's email can never be changed afterwards (items can only be transferred), so it's Liam's call:
- **Who publishes:** Spool Cloud is sold by Morgan Jonasson Consulting AB (spool-cloud `src/site/company.ts`). Publishing as that company means declaring it a **trader** (EU DSA), which shows the company's address and email on the listing. Publishing as Liam alone means a non-trader declaration. Recommendation: the company, as a trader, since the extension belongs to a product it sells.
- **Which email:** Google recommends one used only for publishing. Recommendation: a new Google account on `extensions@spool.page` (spool.page mail already goes through Cloudflare Email Routing, so it's one more forwarding rule). Making the account needs a phone number from Liam.
- **2-Step Verification** must be on before publishing or updating anything.
- **Registration fee: $5, once**, paid by card in the dashboard. Needs Liam's yes.
- New publishers get 2 extension slots, which is enough.

**What the build provides (in this ticket's scope):**
- The packed zip, MV3, and no remotely hosted code (everything bundled).
- **Keep permissions to `activeTab` + `scripting` if at all possible.** `<all_urls>` host permissions trigger in-depth review and a scary install warning. Let the local daemon fetch cross-origin stylesheets, images and fonts from the URLs the extension sends; a reference doesn't need assets behind a login. Reaching the daemon on 127.0.0.1 should then need only CORS from the daemon for the extension's origin: verify it.
- Store icon 128×128 (spool's logo; a 96×96 mark with 16 px padding), at least one screenshot at 1280×800 (up to 5: picking, whole page, sent, the reference on the canvas), a small promo tile at 440×280. The screenshots come from the real tests on real sites.
- Listing copy in spool's voice: name, a summary of 132 characters or fewer, a description, category (Developer Tools), and a single-purpose line ("Send an element or a whole page from the open tab to the spool canvas on this Mac, as a reference frame.").
- A justification line for each permission, and the data disclosure: page content goes only to spool on this Mac (localhost), and nothing goes to a server, is sold or is used for ads.
- **Privacy policy:** spool.page/privacy exists (spool-cloud `src/site/privacy/page.tsx`) but says nothing about an extension. Add a short "The Chrome extension" section there in spool-cloud, merged together with this ticket's branch, and use that URL in the listing.

Submitting comes after all of this, and only on Liam's yes.

### agent, 2026-11-07T21:02:23.541Z

Decision (Liam, 2026-11-07): publish under Liam's own existing Chrome Web Store developer account (the one SecureSend was submitted from) for now; it may move to a company publisher later, by Chrome Web Store's transfer. So there's no new account and no fee. Still ask Liam before submitting.

### agent, 2026-11-07T21:13:20.358Z

Chrome Web Store account ready (2026-11-07): Liam's publisher, vinberg.liam@gmail.com, display name "Liam Vinberg", publisher id 912e4496-03c0-4f7e-9c0a-8f161ac545df, contact email verified, non-trader, 2-Step Verification on, 0/3 extension slots used. It is signed in to the agent's Chrome on the m1 (the devconsole tab is open there). Submitting still needs Liam's yes.
