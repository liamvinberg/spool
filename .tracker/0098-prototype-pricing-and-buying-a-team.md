# #98 · Prototype pricing and buying a team

- State: closed
- Labels: wayfinder:prototype
- Parent: #89
- Blocked by: #90, #91, #95
- Created: 2026-10-18T17:43:56.293Z
- Updated: 2026-10-18T17:44:00.146Z
- Closed: 2026-10-18T17:44:00.146Z

## Question

The way from [spool.page](http://spool.page) to a working paid team: the pricing section, sign-in, naming the team, checkout, inviting editors and viewers, downloading the app, and the first project moved in.

Also the Billing section in a team's Settings, admins only, in each state: trial with days left, paying, payment failing, cancelled (ends on a date), gone local, free team. What it holds is decided in Decide how seats and billing are run (#99). Clean and in Spool's own system (Cata).

*From Linear DEV-249.*

Related: #99, #112, #118, #119, #122, #97, #64

Plane: SPOOL-98

## Comments

### agent, 2026-10-18T17:44:00.136Z

**Liam, 2026-10-11:** ## Resolution

Decided with Cata on 2026-10-11 (agent-hub task 117), over three rounds. Round one drew three takes (everything in the app; four steps on spool.page; a checklist). Cata leaned toward the checklist and asked for one clean, consistent flow that keeps to spool's design system. Rounds two and three are that flow.

**Prototype:** the `explore/cloud/buy-team` page of the spool canvas at https://spool.page/devosurf/spool. Frames: `setup` and its states (`--sign-in`, `--invite`, `--app`, `--move`, `--done`, `--billing`, `--ended`, `--paid`, `--people`, `--used`), plus `hero-line`. Code: `design/shared/ui/explore/cloud-buy-team/`. The dashed strip at the foot of each frame plays the flow and isn't part of the design. The takes that lost are deleted.

**The landing**
- The hero gets one line under its buttons: "For teams, Spool Cloud keeps everyone on one canvas, from $16 per editor. See pricing". The nav stays as it is. Cata worried grey text gets scrolled past, so it stays quiet for now and PostHog measures it: a click on the line, the Cloud section scrolling into view, and starting a trial as the goal.
- In the Cloud chapter, the waitlist's place becomes the price: spool (free, on your Mac, open source) beside Spool Cloud ($20 per editor a month, or $16 billed yearly, with a monthly/yearly switch). The Cloud column asks for the team's name right there, with the button Start a 14-day trial.

**The trial**
- No card, as decided in Decide what Spool Cloud costs and what stays free (#90) (Cata confirmed again). One trial per account. An account that has had its trial gets "Pay for Tidemark" as step 2, before anyone is invited (`--used`).
- The trial shows only on Settings › Billing ("On trial until October 25") and in the emails before it ends. The sidebar says nothing about it.
- If an admin pays during the trial, the first charge still waits for the trial's last day (Stripe's `trial_end`), so paying early never costs trial days. This was the recommendation; Cata didn't object.
- When the trial ends unpaid, the team's admins get one dialog: choose who stays an editor, then pay. Anyone left out becomes a viewer. If nobody pays, #90's lapse rule applies. With no card there is nothing for Stripe to retry, so I read it as taking effect at the trial's end. Cata can correct this.

**Setting up, once:** one numbered list. It is the same component on spool.page and in the app.
1. **Name the team.** Done on the price, then today's sign-in page ("Sign in to start Tidemark"). Signing in creates the team and starts the trial.
2. **Invite people.** Email rows, each marked editor or viewer, plus Send invites or Skip.
3. **Get spool on your Mac.** Download for Mac, or Open in spool. "Sign in there as  and spool carries on with step 4."
4. **Move a project in.** In the app, which opens on the team at this step and lists your own projects, each with Move to … (today's Move to team… sheet).

A done step keeps its title and says what came of it. When the last step is done the list is gone for good, and a toast says "Tidemark is set up". Paying isn't a setup step, since no card is needed.

**spool.page/** becomes the same Home as the app (the sidebar of Prototype Home once you're in Spool Cloud (#97)), without the Mac's tabs and without Your projects. That way the web and the app look alike.

**Settings** gets two tabs: **General** (logo, name, address, delete, as today) and **Billing**.
- During the trial, Billing shows the payment choice: tick who you pay for (admins and editors are seats, viewers are listed as free), monthly or yearly, the total, then Continue to payment opens Stripe Checkout. Company name and VAT number are optional there.
- Once paid, it shows Plan (seats, cycle, total), Next charge, Card, and a link to Stripe's portal (cards, invoices, cancelling). Seats follow roles.

**People** (admin view): "4 people · 3 seats" under the title, for admins only. The invite row has an email field, a role picker and Invite. When the role is Editor on a paying team, it says the cost before sending: "An editor is one more seat: $16 a month, charged for the days left this year once Noor joins." Below that, one row per member with a role menu.

**Roles:** Admin, Editor and Viewer, with no Owner (Cata confirmed). Admins are equals and at least one admin always remains, as in Spec: accounts, teams, roles, invites and billing (#64). The subscription belongs to the team, so any admin manages it.

**For the build:** Billing (#70) is out of date. It still describes a free one-editor team and grace from the second editor. Rewrite it from #90 and this ticket when the build is specced. Building spool.page/ as Home is new work. The setup list needs a per-team "setup done" record, so the app can pick it up at the right step.
