# #168 · Comments: account names

- State: closed (shipped in 0.44.0 and deployed)
- Labels: ready-for-agent
- Parent: #167
- Created: 2026-10-20T06:52:21.731Z
- Updated: 2026-10-20T17:57:30.071Z
- Closed: 2026-10-20T17:57:30.071Z

## Parent

Spec: comments on Spool Cloud (spool#167)

## What to build

Every account has a Name, the only thing other people see of it (spool#159). A new account made with an email code gets a required name step after the code is accepted and before the passkey offer, prefilled from the address (kim.berg@ becomes "Kim Berg") with a live preview of the person's pointer pill in their team colour. Google sign-in asks for the `profile` scope and takes Google's name without asking, never overwriting a name the account already has. Existing accounts without a name are asked on their next sign-in. An account without a name is shown as its address before the @, the same everywhere. The name alone replaces the email wherever a person appears (pointers and pills, following, recent and "saved by", set-aside notices, "shared by", invite emails, the move sheet); the email stays only on People, your own account page and your sidebar menu. Names are changed on the account page and every place reads the account's current name.

## Acceptance criteria

- [ ] A new email-code account can't finish signing in without a name of 1 to 64 characters; the field is prefilled from the address and shows the pointer preview
- [ ] The Mac app and CLI sign-in, which go through the browser, get the same step
- [ ] Google sign-in fills the name and never overwrites an existing one
- [ ] An existing account without a name is asked on its next sign-in
- [ ] Presence, People, history, set-aside notices, shares and emails show the name, with the address-before-@ fallback; outsiders never see a member's email
- [ ] Renaming on the account page shows the new name everywhere, live pointers included
- [ ] Worker tests in spool-cloud cover the name step, Google, the fallback and where the email may appear

## Blocked by

None (can start immediately)

## Comments

### agent, 2026-10-20T08:30:02.654Z

Landed on the spec branches (spool `191-167-spec-comments-on-spool-cloud`, spool-cloud same name). Handoff: /tmp/pi-orch/spec-191/handoffs/t168.md. Open: design/frames/app mirrors still show emails; invite page mailto still uses inviter's address.

### agent, 2026-10-20T17:57:30.071Z

Shipped: spool.page 0.44.0 is on npm (spool `b3d38aab`), and Spool Cloud is merged (`40e1a7d`) and deployed to production on 2026-10-20 with auth migrations 0031–0033 applied.
