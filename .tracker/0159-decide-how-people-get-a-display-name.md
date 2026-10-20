# #159 · Decide how people get a display name

- State: closed (resolved)
- Labels: wayfinder:grilling
- Parent: #155
- Tasks: task 179 (◆ #159 Decide how people get a display name)
- Created: 2026-10-18T17:43:56.981Z
- Updated: 2026-10-19T19:35:03.102Z
- Closed: 2026-10-19T19:35:03.102Z

## Question

Comments need a name on them, and today presence shows a person's email. How does a person get a display name: a name step when they first sign in with an email code, Google's name when they sign in with Google, editable at spool.page/account? Where does the name show instead of the email (comments, live pointers, People, history)? What does someone who never gave one show? Start from `spool-cloud/research/159-better-auth-accounts/` and what the account record holds today.

Plane: SPOOL-159

## Comments

### agent, 2026-10-19T19:35:03.102Z

## Resolution

Decided with Cata on 2026-10-19 (agent-hub task 179), using Figma's sign-up as the reference ([Mobbin flow](https://mobbin.com/flows/bddead9d-c072-4fa7-84e9-a33b666c2f03)). Figma asks "What's your name?" right after the email is confirmed, with the part of the address before the @ as the placeholder and a live preview of your cursor label. Google sign-in skips that step.

**Getting a name**
- **Email code, new account:** a required name step after the code is accepted and before the passkey offer. The field is prefilled with a guess from the address (kim.berg@ → "Kim Berg"), so accepting it is one click. Beside the field, a live preview of your pointer pill in your team colour, the way Figma does it. The Mac app and CLI sign in through the browser, so they get the same step.
- **Google:** add the `profile` scope and take Google's `name` without asking. Never overwrite a name the account already has.
- **Accounts that already exist** (beta migrations and current members): they're asked on their next sign-in, filled from Google if they sign in with Google, and asked in the comment box the first time they comment without a name.
- **Fallback:** an account without a name is called by its address before the @. One rule everywhere, which ends today's mismatch where the same person shows as `kim.berg` in one place and `kim` in another.

**What a name is**
- One "Name" field: 1 to 64 characters, any text, not unique. No first/last split and no handle.
- No photos: a coloured disc with an initial. The team colour is what tells people apart.
- Changed on the account page (spool.page/account and Home's account page; the sidebar account menu links there). Everything the account did shows its current name: comments and history point to the account, not to a copy of its name. Emails already sent stay as they were.

**Where it shows**
- The name alone everywhere a person appears: pointers and pills, following, comments, recent / "saved by", set-aside notices, "shared by", "X invited you" emails, "X's agent", the move sheet.
- The email shows beside the name only on the team's People page, on your own account page and in your sidebar menu. Invites keep the address, since nobody has a name before they join.
- Outsiders see members' names, never their emails.

**Left to other tickets**
- How someone with only a link (no account) gives a name to comment: Decide who can comment and who sees whose comments (spool#158).
- Which name and identity agents see in prompts (today the set-aside prompt includes the full email): Decide how agents read, act on and answer comments (spool#164).

**Glossary:** added **Name** to spool-cloud `GLOSSARY.md` (main, commit e70c458).
