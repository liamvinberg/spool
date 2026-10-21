# #174 · Comments: outsiders on shares

- State: closed (shipped in 0.44.0 and deployed)
- Labels: ready-for-agent
- Parent: #167
- Blocked by: #168, #173
- Created: 2026-10-20T06:52:21.750Z
- Updated: 2026-10-20T17:57:30.080Z
- Closed: 2026-10-20T17:57:30.080Z

## Parent

Spec: comments on Spool Cloud (spool#167)

## What to build

Comments reach clients (spool#158, spool#163). Each comment has an Audience: Team by default, or one share of its page, chosen in the composer's picker on the Mac and in members' browsers; replies keep it. Members see every audience; an outsider sees only their share's comments with every reply, others on the same share included, and only once signed in. Signed out on a link share, frames still open but there are no pins and no count, and the Comment tool, C, the Comments button, the rail's Sign in and a one-time tip all open one "Sign in to see comments" dialog: Google, or an email code then the name step. On a link share's own onspool.page host, the sign-in ends in a session scoped to that host: the email code and name steps run in the dialog against the host, Google runs in a popup on spool.page and hands back a one-time code, and the passkey offer is skipped. After sign-in the pins ripple in and the reached-for action carries on; the rail foot shows their name. Outsiders' composer has no picker and says their share and the team read it; they see the element outline but never its tag, and get no mentions. Their browser opens a comments-only socket to the sync object, tagged with the share, hearing only that audience; they never join presence. Outsider pins are hollow. A share's settings list who has commented through it, with Block (admins and editors), which deletes their comments on that share and refuses their posts. A share that ends leaves its comments readable by members, marked "share ended". A link share's outsiders together post at most 300 a day. An agent's reply on a share's comment is stored as a draft visible only to its person, who sends or edits it from the card. "For you" gains outsiders' comments on shares you made.

## Acceptance criteria

- [ ] An outsider on a link share views without an account, and every comment surface opens the one sign-in dialog
- [ ] Signing in on the link host works with an email code and with Google, without leaving the share's page, and carries on the reached-for action
- [ ] An outsider sees only their share's comments, never Team's or another share's, and hears them live
- [ ] A member's Team comment never reaches any outsider; a share comment reaches that share's outsiders
- [ ] Block deletes the outsider's comments on that share and refuses their posts; an ended share's comments stay readable by members
- [ ] An agent's reply on a share's comment stays a draft until its person sends it
- [ ] The 300-a-day cap per link share refuses with a reason
- [ ] Worker tests cover audiences, the host sign-in handoff, the outsider socket, Block, share end and the cap; browser tests cover the signed-out and signed-in viewer
- [ ] spool-cloud's glossary entry for Outsider is updated

## Blocked by

- Comments: account names (spool#168)
- Comments: in the browser for members (spool#173)

## Comments

### agent, 2026-10-20T12:25:23.711Z

Landed on the spec branches. Handoff: /tmp/pi-orch/spec-191/handoffs/t174.md. Decided where silent: a blocked outsider loses read access too; outsiders get no stills; team member on a link host is an outsider there; shares labelled 'Link share' / people's names (shares have no names). Not done: sign-out for link outsiders. Deploy: serving worker needs RESEND_API_KEY and MAILBOX_CODE_KEY.

### agent, 2026-10-20T17:57:30.080Z

Shipped: spool.page 0.44.0 is on npm (spool `b3d38aab`), and Spool Cloud is merged (`40e1a7d`) and deployed to production on 2026-10-20 with auth migrations 0031–0033 applied.
