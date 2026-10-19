# #20 · Decide what a team pays for

- State: closed
- Labels: wayfinder:grilling
- Parent: #3
- Blocked by: #6, #11, #13
- Created: 2026-10-18T17:43:55.478Z
- Updated: 2026-10-18T17:43:57.629Z
- Closed: 2026-10-18T17:43:57.629Z

## Question

Where does free end and paid begin? The July answer was: one person is free and fully featured, a team starts paying when the second member joins a private project, and viewers are free forever. [Live working-tree sync](https://github.com/liamvinberg/spool-cloud/issues/2) noted that charging for "reach it anywhere" would charge the solo user instead. What does a seat cost, and which billing provider takes the money once the AB exists?

*From Linear DEV-119.*

Related: #42, #43, #48, #49, #60, #64, #90, #92, #19

Plane: SPOOL-20

## Comments

### agent, 2026-10-18T17:43:57.606Z

**Liam, 2026-10-02:** Input from the "where a team's design lives" grilling (2026-10-02): Liam floated splitting plans by how the design is shared. One plan would be live, a team project synced through Spool Cloud. Another would cover only what's tracked on `main` in git, or there might be one plan for both. This is unexplored, so weigh it here.

### agent, 2026-10-18T17:43:57.612Z

**Liam, 2026-10-04:** Input from Decide teams, roles and invites (#19) (2026-10-04):

- Each team is billed on its own, and a person in several teams belongs to several subscriptions. There's no organisation above a team in v1.
- The roles to price are admin, editor and viewer. Viewers never hold files and the cloud refuses their saves, so they can be made free if this ticket chooses to.
- Only admins invite, partly so nobody adds a paid seat without the person paying knowing. Open here: whether a pending invite already takes a seat.
- Devosurf (Liam, Asim, Morgan) is the dogfood team and is free, through a maintainer-only "free team" switch.
- This effort doesn't wire live Stripe, but the spec should leave billing ready to plug in once the AB exists.
- Creating a team is gated by the maintainer until launch, then signup opens. So until billing is live, "open" would mean free for anyone.

### agent, 2026-10-18T17:43:57.617Z

**Liam, 2026-10-04:** ## Resolution (grilling with Liam, 2026-10-04)

**A team pays per editor, from its second editor, on one plan through plain Stripe on Mojo AB's account.**

- **Seats are editors.** Every editor is a seat, admins included because admins edit. Viewers and outsiders are free and unlimited. No seat minimum: the terms say one account per person, and live cursors and set-aside saves make a shared account awkward anyway. Limiting machines per account was rejected because it breaks one person on a Mac and a laptop, which is what the free tier is for.
- **Free:** solo projects and their shares, and a team with one editor (sync between your own machines, history, viewers, outsiders). This answers the [live working-tree sync](https://github.com/liamvinberg/spool-cloud/issues/2) worry: reaching it anywhere stays free for one person. A second editor starts billing for every editor after 14 days' grace. A free team of two or three was rejected: two or more always pay. Moving a solo project into a team keeps its history and shares, and how is for Decide how a project becomes a team project and reaches each member's machine (#43).
- **One plan, no tiers, no meters.** $20 per editor monthly, or $16 a month billed yearly, in USD and EUR. In line with Figma Professional, Linear Business, Vercel and Framer, and with Paper by Liam's account. Storage and history get fair-use limits, not a meter. Enterprise extras stay out of scope.
- **Only admins invite or promote an editor.** Anyone can invite a viewer. Mid-month changes use Stripe's proration: an added editor is charged pro rata, a removed one becomes a credit.
- **A team that stops paying** drops back to free after Stripe's retry period: the admin stays the one editor, everyone else becomes a viewer, history and shares stay. Every editor holds the whole folder, so nothing is lost.
- **Billing: plain Stripe** on Mojo AB's existing account (Checkout, Billing, Tax, customer portal), collecting VAT numbers so businesses get reverse charge. About 3% of revenue cheaper than Paddle. If UK consumer VAT is a nuisance, UK buyers must give a VAT number. Owed at setup: whether Mojo is already VAT-registered and on OSS.
- **Billing ships with the first team version.** The free beta waited only on an AB, and Mojo AB exists. Design partners get Stripe coupons.

Handed on:

- Research: what a team costs to run (#42) now also sets the fair-use limits and checks the margin at $16.
- Backlog ideas, past the first paid version: Idea: a canvas of what's on main (#48) (Liam's live plan beside a plan for `main`) and Idea: editors can request a seat (#49).
- Decide how a project becomes a team project and reaches each member's machine (#43) gets the worktree case: a new worktree, like a fresh clone, has no `design/` on a team project.

Glossary: **Seat** added to spool-cloud's `GLOSSARY.md` (`0c8cb29`).

### agent, 2026-10-18T17:43:57.623Z

**Liam, 2026-10-10:** Replaced on 2026-10-09 by Decide what Spool Cloud costs and what stays free (#90): Spool Cloud is paid only, every editor is a seat, there is a 14-day trial, and a lapsed team goes local instead of dropping to free.
