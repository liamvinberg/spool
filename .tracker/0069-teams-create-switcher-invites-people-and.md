# #69 · Teams: create, switcher, invites, People and Settings

- State: closed
- Labels: ready-for-agent
- Parent: #64
- Blocked by: #68
- Created: 2026-10-18T17:43:55.957Z
- Updated: 2026-10-18T17:43:59.062Z
- Closed: 2026-10-18T17:43:59.062Z

## Parent

#64

## What to build

A signed-in person can create a team ("New team…" in Home's switcher, gated by a maintainer-only "may create a team" switch until launch) and becomes its first admin. Home's switcher lists the person's teams and "Your projects"; under a team sit Projects, People and Settings (admins only), and the same pages exist at `spool.page/<team>`. Admins invite by exact email with a role (anyone in the team may invite viewers); the invite goes by email and shows as one line above Home's covers with Decline and Join. The invite page is the sign-in page with the address fixed, handles the wrong-address case ("Sign in as …", ask the inviter) and expiry after 7 days; invites can be resent and cancelled. People shows one row per member with a role menu (Admin, Editor, Viewer, Remove), confirms only where a change costs or takes something, Leave, and the last-admin guard. Settings: logo, name, address with redirects after rename, and Delete team (access ends at once, purged after 30 days). The cloud enforces every rule; core's Home renders these screens against the cloud's team API.

## Acceptance criteria

- [X] Creating a team is refused without the maintainer switch and works with it
- [X] Switcher shows several teams and Your projects; a viewer-only team opens in the browser
- [X] Invite accept works only on the exactly matching verified address; wrong address and expired states shown
- [X] Editors land on Open in Spool after accepting, viewers on the team's page
- [X] Only admins invite or promote editors; the last admin can't leave, step down or be removed
- [X] A renamed team's old address redirects
- [X] Deleting a team ends access at once and schedules a 30-day purge
- [X] Devosurf can be created and its three members invited
- [X] Worker tests for every role rule; browser tests for the switcher and the invite line

## Blocked by

- #68

*From Linear DEV-184.*

Plane: SPOOL-69

## Comments

### agent, 2026-10-18T17:43:59.054Z

**Liam, 2026-10-06:** Shipped in spool.page 0.28.0, with team pages and the team API live on beta.spool.page and spool.page.

Devosurf exists on both. Liam is admin, asim01.syed and morgan.jonasson are editors, and the logo is set. It was made with the same statements the code runs, so no invite emails went out.

Decisions where the spec was silent:
- Only the per-account switch lets someone create a team. Beta approvals don't count.
- No display names. People show by email.
- Only a change to viewer, removing someone, leaving and deleting ask first. Promotions ask nothing.
- Reserved addresses are as listed in the code. A purged team's addresses are free again.
- An invite is accepted when its link opens after sign-in with the matching address.
- Resend sends a new link and closes the old one.
- Who made an invite or share falls back to the longest-standing admin, then the team's name, once that account is gone. So deleting an account is only refused for the last admin.
- A browser test now accepts an invite end to end. It found that Chrome couldn't post any form on the team pages. That is fixed.

Left:
- Devosurf exists twice. Beta's copy can go once everyone is on 0.31.0. Beta projects don't move over by themselves (Liam).
- Seats and billing are #70.

Checks for Liam:
- [ ] The Mac app's switcher shows Devosurf.
- [ ] Upload a logo from Settings in Safari and Chrome.
- [ ] Invite a fresh address from People in a real browser. The code it asks for arrives at once.
