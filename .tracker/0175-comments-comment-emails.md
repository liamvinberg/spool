# #175 · Comments: comment emails

- State: closed (shipped in 0.44.0 and deployed)
- Labels: ready-for-agent
- Parent: #167
- Blocked by: #170, #174
- Created: 2026-10-20T06:52:21.751Z
- Updated: 2026-10-20T17:57:30.082Z
- Closed: 2026-10-20T17:57:30.082Z

## Parent

Spec: comments on Spool Cloud (spool#167)

## What to build

People are told about comments meant for them. The sync object holds each "for you" event (a mention of you, a reply on a comment you wrote or replied in, an outsider's comment on a share you made; for outsiders, a reply on a comment they're part of) in an outbox for 10 minutes, then sends one email per person per project bundling everything still unread, through the mail sender Cloud already uses; a person who read it in the meantime gets nothing. No email for Team comments that aren't for you. Every email has a one-click unsubscribe, and the account page has "Comment emails: For you / Off". Everything is decided inside the project's sync object, with no cross-project index.

## Acceptance criteria

- [ ] A mention, a reply in your comment and an outsider's comment on your share each lead to one bundled email after the 10-minute hold
- [ ] Reading the comment during the hold cancels the email
- [ ] Outsiders are emailed about replies to comments they're part of, and never about Team comments
- [ ] One-click unsubscribe and the account setting stop the emails
- [ ] Worker tests with an injected clock and a fake mail sender cover the hold, bundling, cancelling and unsubscribing, as the billing endings tests do

## Blocked by

- Comments: the inbox and the rules (spool#170)
- Comments: outsiders on shares (spool#174)

## Comments

### agent, 2026-10-20T12:52:10.619Z

Landed on the spec branches. Handoff: /tmp/pi-orch/spec-191/handoffs/t175.md. Deploy: apply auth migration 0033 before the worker.

### agent, 2026-10-20T17:57:30.082Z

Shipped: spool.page 0.44.0 is on npm (spool `b3d38aab`), and Spool Cloud is merged (`40e1a7d`) and deployed to production on 2026-10-20 with auth migrations 0031–0033 applied.
