# #19 · Decide teams, roles and invites

- State: closed
- Labels: wayfinder:grilling
- Parent: #3
- Blocked by: #11, #13
- Created: 2026-10-18T17:43:55.469Z
- Updated: 2026-10-18T17:43:57.589Z
- Closed: 2026-10-18T17:43:57.589Z

## Question

What shape does a team account take: organisation, team, project, or fewer levels? Who can edit and who can only view, how invites work, and how members sign in (Google as in the beta, GitHub, email)? How does that relate to access to the linked repo? And how do the beta's approved publishers and invited viewers carry over into it?

*From Linear DEV-118.*

Related: #20, #22, #43, #44, #45, #46, #59, #64

Plane: SPOOL-19

## Comments

### agent, 2026-10-18T17:43:57.574Z

**Liam, 2026-10-04:** Context from Prototype the team's home in Spool Cloud (#22), closed 2026-10-04: Home picks a team with a switcher, so the screens assume one person can belong to several teams (an agency's own team plus a client's), with "Your projects" as a non-team entry and "New team…" in the menu. Invites were drawn loosely as an email field on the team; roles were not drawn.

### agent, 2026-10-18T17:43:57.582Z

**Liam, 2026-10-04:** ## Resolution (grilling with Liam, 2026-10-04)

**Two levels, a team and its team projects. One account per person, keyed on a verified email address. Three roles, and access comes only from team membership, never from the repo.**

- **Levels.** A team holds the people and the subscription. A team project belongs to exactly one team. Nothing sits above a team, and there's no personal cloud space: working alone in the cloud is a team of one. A person can be in several teams, each billed on its own. An organisation over several teams (the Eidra case) is filed as Idea: an organisation over several teams (#46).
- **Membership is team-wide.** Every member is on every team project in the team, and nothing inside a team is private. Someone who should see less goes in another team or gets shared pages.
- **Roles.** **Admin** edits and runs the team. **Editor** holds the folder on their machine, and their saves reach the team. **Viewer** sees the whole canvas live in the browser and is seen there, never gets the files, and the cloud refuses their saves; "Open in spool" isn't offered to them.
- **Who can do what.** Admins invite, change roles, remove members, handle billing, rename or delete the team, and remove a team project. Editors and admins turn a project into a team project and share pages. Anyone can leave. A team always has an admin: the last one can't leave or step down. Admins are equals and can remove each other.
- **Accounts and sign-in.** One account per verified email address, and any sign-in that proves the address reaches the same account. This reverses the beta's rule against matching people by email. Ways in are Google (trusted for Gmail and verified Workspace addresses) or a six-digit code by email (Resend). A code rather than a link, so it works when the email is read on another device. After signing in, a person can add a passkey and from then on sign in with no email at all. No passwords and no GitHub. The Mac app and the CLI sign in through the system browser with the existing handoff and Keychain. An editor's machine stays signed in while it's in use, so sync never quietly expires, and each machine can be revoked. Whether Better Auth replaces the beta's hand-built auth is a choice for the spec, with facts from Research: Better Auth on Workers and D1 for Spool Cloud accounts (#45).
- **The repo grants nothing.** Team membership is the only access to a team project. The July spec's GitHub App, repo-permission mirroring and "public repo means public canvas" retire.
- **Invites.** Admins invite by email address with a role. The invite goes by email and also appears in Spool for people who already have an account. Accepting needs an account with exactly the invited address; signed in as another address, the person is told who the invite is for. No alias or domain matching. Invites expire after 7 days and can be resent or cancelled. No reusable invite links and no domain auto-join in v1. The beta's email-sending limits apply, and the invite field strips invisible characters.
- **Outsiders.** An outsider is an account with access to shared pages and no team membership. The team owns every share: any editor or admin can change or stop it, and it outlives the member who made it. Two kinds of share: named people who sign in, or anyone with the link. Members can see who a project is shared with; outsiders see nobody and appear nowhere.
- **The beta's people.** Approved publishers become accounts under the email they were approved with. Invited viewers become accounts the first time they sign in, and their access carries over as outsider access. Publisher approval becomes a maintainer-only "may create a team" gate until launch, after which signup opens; joining an approved team needs no approval. A maintainer-only "free team" switch sits beside it. What happens to the beta's publications themselves stays on the map.
- **Leaving and removal.** Removal and leaving end access at once, and the team's shares keep working. Spool never deletes or locks a local copy: the daemon stops syncing, says the person is no longer in the team, and the folder becomes an ordinary local project. Going from editor to viewer works the same for the files. Deleting a team stops everything at once and keeps the cloud copy and history for 30 days before purging. An account can't be deleted while it's the last admin of a team that still has other members.
- **First team:** Devosurf, marked free. Liam (vinberg.liam@gmail.com) is admin; asim01.syed@gmail.com and morgan.jonasson@gmail.com are editors.

Rejected: an organisation level, a personal account beside teams, per-project members and billing, two roles with no viewer, editors inviting, GitHub sign-in and auto-joining from repo access, passwords, reusable invite links and domain joins, and wiping a removed member's folder.

Vocabulary: **Account**, **Team**, **Member**, **Admin**, **Editor**, **Viewer** and **Outsider** are in `spool-cloud/GLOSSARY.md` (commits `797b024`, `9896b9a`, `94fa359`, `9e8d424`).

Handed on: payment questions to Decide what a team pays for (#20). What happens on a laptop after accepting an invite to Decide how a project becomes a team project and reaches each member's machine (#43). The screens to Prototype signing in and running a team (#44).
