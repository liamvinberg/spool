# #44 · Prototype signing in and running a team

- State: closed
- Labels: wayfinder:prototype
- Parent: #3
- Created: 2026-10-18T17:43:55.710Z
- Updated: 2026-10-18T17:43:58.289Z
- Closed: 2026-10-18T17:43:58.289Z

## Question

What do signing in and running a team look like, and where do they live: in the app's People view, at [spool.page/](http://spool.page/) (the team page from Prototype the team's home in Spool Cloud (#22)), or both? The rules are settled in Decide teams, roles and invites (#19); this draws them.

- Signing in: Google or an emailed code, and adding a passkey afterwards.
- Accepting an invite, including arriving signed in as the wrong address.
- People and roles (admin, editor, viewer), pending invites with resend and cancel.
- Leaving a team, and the last admin who can't.
- Team settings, with billing as an empty slot.
- Who a project is shared with, as members see it.

Spool frames under `design/frames/explore/cloud/`, variations as separate frames.

*From Linear DEV-158.*

Related: #60, #62, #64, #43, #22, #19

Plane: SPOOL-44

## Comments

### agent, 2026-10-18T17:43:58.274Z

**Liam, 2026-10-04:** ## Resolution (prototype with Liam, 2026-10-04)

**Running a team lives on a People page and a Settings page under the switcher, and spool.page/tidemark shows the same pages in a browser. Sign-in is one page with two ways in, an invite shows as one line on Home, and a project's shares sit in a quiet popover at the canvas's top right.**

- **Where.** Under the switcher: Projects, People, and Settings (Settings for admins only). The same pages are at spool.page/tidemark/people for every member, and viewers only ever have the browser. Rejected: one sheet over Home with tabs, and a read-only People view in the app that sends every change to an account-style page on spool.page.
- **People.** One row per member: face, name, email, role. "5 people · 4 seats" at the top, and only admins see the seat count. Pending invites sit below with Resend and Cancel, and everyone in the team sees them. The role menu is just Admin, Editor, Viewer, then Remove. The cost of a change is said only in a small confirm when there is one ("Make Sam a viewer? Sam's Mac stops syncing Tidemark. The folders stay on it."). Liam wants little explanatory text in general.
- **Leaving.** For the last admin, Leave and stepping down are refused with "You're the only admin. Make someone else an admin first." An ordinary member's confirm says the folders stay on this Mac as ordinary projects and the team's shares keep working.
- **Settings.** Logo first (upload, with the letter mark as the fallback, shown in the switcher and on the team's page), then Name, then Address (spool.page/tidemark; after a rename the old address redirects), then Billing as an empty "Not yet" slot, then Delete team ("Everyone loses access at once. Gone for good after 30 days.").
- **Signing in.** One page at spool.page/sign-in with two ways in: Continue with Google, or an email field that sends a six-digit code. After that come the code page, a skippable offer to add a passkey, and the hand back to the app. A returning person with a passkey needs one step. In the app, Sign in and later the account sit at the foot of Home's sidebar (this Mac, Passkeys and Macs on spool.page/account, Sign out of this Mac). A team where you're only a viewer sits in the switcher like any team and opens in the browser. Rejected: one email field that picks the way in by address.
- **Accepting an invite.** The invite page is the sign-in page with the address fixed. Signed in as another address, the page says who the invite is for, offers "Sign in as noor@tidemark.app" (which switches spool.page to that account), and offers to email the inviter for an invite to the other address. An expired invite says who to ask. Joined as an editor, the next step is spool on the Mac. Joined as a viewer, the person goes straight to the team's page. Inside spool, an invite is one line above the covers on Home with Decline and Join, because an invite that nobody sees expires. Rejected: a row in the switcher's menu with a dot.
- **Who a project is shared with.** A Shared control at the canvas's top right, with one row per share: "kim and ola" or "anyone with the link", plus its pages. A row opens to its people (add and remove), who made it, when, how often it was opened, and Stop sharing ("Their access stops at once."). Viewers see the rows and can't change them or copy the link. A link share carries its pages together, so stopping it stops them all, and a new share always gets a new URL. New shares still start from right-clicking a page. Rejected: marks on the pages rail, and a "shared with" chip on Home's covers.

Handed on: whether a newly joined editor is offered Open spool or Get spool for Mac, to Decide how a project becomes a team project and reaches each member's machine (#43). Whether a share's maker hears when someone else stops it, to the map's Notifications fog.

Frames: spool `design/frames/explore/cloud/team/` (`where/people-page` and its states, `sign-in/sign-in-doors` and its states, `invite/invite-walk` and `invite/invite-app-home`, `shares/shares-popover` and its states), winners kept in commit `84e87781`. Every take drawn is in `5d3d2da9`, `3fb7a503` and `6ec6c30c`, and round two in `f5134785` and `f6f02323`. Fixture: `design/shared/lib/explore/cloud/team/fixture.ts`.

### agent, 2026-10-18T17:43:58.281Z

**Liam, 2026-10-04:** Input from Decide how a project becomes a team project and reaches each member's machine (#43) (2026-10-04), for the screens:

- Accepting an invite on the web leads to "Open in Spool" (or a download). It opens the app on that team in Home's switcher, with "Get it" on the covers of team projects not yet on this Mac.
- "Get it" asks where the local copy goes: a known checkout on this Mac with the project's repo (the default), "In a checkout…" (a folder picker), or "Just on this Mac" (`~/spool/<team>/<project>`). The team page shows the repo a project lives in. Spool never clones, but it may show the clone command.
- "New project" in Home follows the switcher's team. An existing project's cover menu and settings have "Move to team…": pick a team, the folder uploads, then Spool makes one commit, and the sheet says history before the move stays in git.
- When a team project ends for this machine, the canvas shows "No longer synced with Tidemark. This is now a project on this Mac only."
