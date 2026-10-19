# #64 · Spec: accounts, teams, roles, invites and billing

- State: closed
- Labels: ready-for-agent
- Parent: #3
- Created: 2026-10-18T17:43:55.903Z
- Updated: 2026-10-18T17:43:58.851Z
- Closed: 2026-10-18T17:43:58.851Z

## Problem Statement

Spool Cloud today knows publishers approved by hand and viewers invited to one publication. There's no way for a product team to exist in Spool: no team, no roles, no invites, no way to pay. A team of two to eight people who each run Spool and their own agent can't say "these people work on these projects together", can't let a client or stakeholder see the canvas without holding the files, and can't pay Spool for it. Spool can't charge for the first paid version without these.

## Solution

Spool Cloud gets accounts, teams, roles, invites and billing:

- **One account per person**, keyed on a verified email address. People sign in with Google or a six-digit code sent by email, and can add a passkey afterwards. The Mac app and the CLI sign in through the system browser and keep a long-lived session per machine that the person can revoke.
- **Two levels: a team and its team projects.** A person can be in several teams. Membership is team-wide.
- **Three roles:** admin, editor and viewer. Access comes only from team membership, never from a repo.
- **Invites by exact email address** with a role, sent by email and shown in Spool.
- **Running a team** lives on People and Settings pages under Home's team switcher, and the same pages are at `spool.page/<team>`.
- **Billing.** A team pays $20 per editor monthly or $16 a month billed yearly once it has a second editor, after 14 days' grace, through Stripe on Mojo AB. Solo projects and one-editor teams are free, and viewers and outsiders are always free.
- Until launch, creating a team needs a maintainer's approval. Devosurf is the first team, marked free.

## User Stories

### Accounts and signing in

1. As a new person, I want to sign in with Google, so that I don't need another password.
2. As a person without Google, I want a six-digit code sent to my email, so that I can sign in with any address.
3. As a person reading my email on my phone while signing in on my Mac, I want a code rather than a link, so that signing in works across devices.
4. As a person who signed in with Google and later with an email code for the same address, I want to reach the same account, so that I never have two accounts.
5. As a person with a Gmail or verified Workspace address, I want Google to count as proof of my address, so that I can skip the email code.
6. As a person whose Google account has an unverified non-Workspace address, I want Spool to ask for an email code instead, so that nobody can claim my address through Google.
7. As a person who has signed in, I want a skippable offer to add a passkey, so that I can sign in later with no email.
8. As a returning person with a passkey, I want to sign in in one step, so that it's fast.
9. As a person, I want one sign-in page at `spool.page/sign-in` with Google and the email field, so that there's one way in to remember.
10. As a Mac app user, I want Sign in at the foot of Home's sidebar to open the system browser and hand back to the app, so that I sign in where my passwords and passkeys are.
11. As a CLI user, I want `spool login` to do the same browser handoff, so that agents and terminals sign in the same way.
12. As an editor, I want my machine to stay signed in while it's in use, so that sync never quietly expires.
13. As a person, I want to see my signed-in Macs and passkeys at `spool.page/account`, so that I know where I'm signed in.
14. As a person who lost a laptop, I want to revoke that machine's session, so that it stops syncing at once.
15. As a person, I want "Sign out of this Mac", so that I can leave a shared machine.
16. As a person mistyping an email, I want invisible characters removed or refused, so that the code goes where I meant.
17. As Spool, I want code sends limited per mailbox, per IP and globally, so that sign-in can't be used to spam or run up costs.
18. As a person who can't receive a code, I want a clear message that a code was sent and when I can ask again, so that I don't hammer the button.
19. As a beta publisher, I want my account to be the one under the email I was approved with, so that I keep my access.
20. As a beta invited viewer, I want an account the first time I sign in, with my access carried over as outsider access, so that links shared with me keep working.
21. As a beta user, I want to be told I need to sign in once at cutover, so that losing my session isn't a surprise.

### Teams

22. As a person approved to create a team, I want to create one from Home's switcher with "New team…", so that I can start working with others.
23. As a person not yet approved before launch, I want to be told team creation is not open yet, so that I know why I can't.
24. As the person who created a team, I want to be its first admin, so that I can run it.
25. As a person in several teams, I want a switcher at the top of Home's sidebar listing each team and "Your projects", so that I can move between an agency's team and a client's.
26. As a person, I want the switcher to show a team where I'm only a viewer, and open it in the browser, so that it isn't hidden.
27. As a member, I want Projects, People and Settings (admins only) under the team in the switcher, so that running a team lives where its projects do.
28. As a member in a browser, I want the same pages at `spool.page/<team>`, so that viewers and people away from their Mac can see the team.
29. As an admin, I want to set the team's logo, with the letter mark as the fallback, so that the team is recognisable in the switcher and on its page.
30. As an admin, I want to rename the team and change its address, with the old address redirecting, so that links and `spool.json` pointers never break.
31. As an admin, I want to delete the team, told everyone loses access at once and it's gone for good after 30 days, so that I know the consequence.
32. As a member of a deleted team, I want my local copies to stay as ordinary local projects, so that I never lose work.
33. As Spool, I want a deleted team's cloud copy and history kept 30 days and then purged, so that a mistake can be undone and data doesn't live forever.

### Roles

34. As an admin, I want to invite, change roles, remove members, handle billing, rename and delete the team, and remove a team project, so that I can run the team.
35. As an editor, I want to hold team projects on my machine and have my saves reach the team, so that I can work with my agent.
36. As an editor or admin, I want to turn a project into a team project and share pages, so that I can bring work in and show it.
37. As a viewer, I want to see the whole team canvas live in the browser, so that I can follow the work without running Spool.
38. As a viewer, I want "Open in spool" never offered to me, so that I'm not sent somewhere I can't use.
39. As a team, I want the cloud to refuse a viewer's saves, so that the role is real and not just hidden buttons.
40. As an admin, I want a role menu of just Admin, Editor, Viewer and Remove, so that changing a role is one step.
41. As an admin making a change that costs or takes something away, I want a short confirm that says so ("Make Sam a viewer? Sam's Mac stops syncing Tidemark. The folders stay on it."), so that I know what happens.
42. As a team, I want at least one admin always, so that the last admin can't leave or step down ("You're the only admin. Make someone else an admin first.").
43. As an admin, I want admins to be equals who can remove each other, so that no one is stuck with an absent owner.
44. As a member, I want to leave a team, told the folders stay on this Mac as ordinary projects and the team's shares keep working, so that leaving is safe.
45. As a removed member, I want access to end at once, so that removal means removal.
46. As a person who is the last admin of a team with other members, I want deleting my account refused until I hand over, so that a team isn't orphaned.

### Invites

47. As an admin, I want to invite by email address with a role, so that I choose who joins and what they can do.
48. As an invited person with an account, I want the invite as one line above the covers on Home with Decline and Join, so that I don't miss it.
49. As an invited person, I want the invite by email too, so that I find it without Spool open.
50. As an invited person, I want the invite page to be the sign-in page with my address fixed, so that accepting is signing in.
51. As an invited person signed in under a different address, I want to be told who the invite is for and offered "Sign in as ", so that I don't join under the wrong account.
52. As that person, I want to be offered to ask the inviter for an invite to my other address, so that I can fix it without leaving.
53. As an invited person with an expired invite, I want to be told who to ask, so that I can get a new one.
54. As an admin, I want invites to expire after 7 days, and to resend or cancel them, so that stale invites don't linger.
55. As a member, I want to see pending invites on the People page, so that everyone knows who's coming.
56. As an invited editor, I want accepting on the web to lead to "Open in Spool" or a download, so that I get to the canvas.
57. As an invited viewer, I want accepting to take me straight to the team's page, so that I can look at once.
58. As Spool, I want invites to match exactly the invited address, with no alias or domain matching, so that nobody joins through a lookalike address.
59. As an admin, I want no reusable invite links and no domain auto-join, so that every member was chosen.

### People page

60. As a member, I want one row per member with face, name, email and role, so that I know who's in the team.
61. As an admin, I want "5 people · 4 seats" at the top, so that I see what we pay for.
62. As a non-admin, I want the seat count hidden, so that billing stays with admins.

### Billing

63. As a solo person, I want my projects, their shares, and a one-editor team to be free, so that reaching my own work anywhere costs nothing.
64. As a one-editor team, I want unlimited viewers and outsiders free, so that I can show clients without paying.
65. As an admin adding a second editor, I want to be told in the confirm that every editor becomes a seat after 14 days' grace, so that I'm not surprised by a bill.
66. As an admin, I want to pay $20 per editor monthly or $16 a month billed yearly, in USD or EUR, so that the price is simple.
67. As an admin, I want to pay through Stripe Checkout and manage the subscription in Stripe's customer portal, so that cards, invoices and receipts are handled.
68. As a business, I want to enter a VAT number and get reverse charge, so that our books are right.
69. As an admin, I want an editor added mid-month charged pro rata and a removed one credited, so that I pay for what we use.
70. As an admin, I want only admins able to invite or promote an editor, so that nobody adds a paid seat without the payer knowing.
71. As an admin, I want viewers and outsiders never counted as seats, so that showing work costs nothing.
72. As a team whose payment lapses, I want to drop to free after Stripe's retries, with the admin as the one editor and everyone else a viewer, so that nothing is lost and we can pay again.
73. As a member of a lapsed team, I want my local copy to stay on my machine, so that work is never lost.
74. As the maintainer, I want a "free team" switch, so that Devosurf and design partners don't pay.
75. As the maintainer, I want Stripe coupons for design partners, so that early teams get a discount.
76. As the maintainer, I want a "may create a team" switch per account until launch, so that I control who starts teams.
77. As an admin in a team not yet billing, I want Billing in Settings to say so plainly, so that the empty slot isn't confusing.

## Implementation Decisions

- **Auth stays the beta's hand-built auth, extended.** Research: Better Auth on Workers and D1 (#45) found Better Auth stores session tokens raw (the beta stores an HMAC), has two open Workers and D1 bugs at 1.7.7, had 25 security advisories since May and supports only its latest release, and leaves the send budgets, eligibility, the CLI handoff and per-host access to app code anyway. Beta sessions can't be imported either way. So the beta's auth gains Google's Gmail/Workspace trust rule, passkeys, accounts keyed on verified email, per-device sessions and revocation. This is the spec's choice, which #19 left open.
- **Accounts.** One account per verified, lower-cased email address. Any method that proves the address reaches it. This reverses the beta's rule against matching people by email. Zero-width and other invisible characters are stripped from the invite field and refused at sign-in.
- **Sessions.** Browser sessions are ordinary. Each Mac app or CLI on a machine holds a long-lived device session, stored as an HMAC on the cloud and in the Keychain on the machine, renewed while in use, listed on the account page, and revocable one at a time. A revoked device's writes are refused at once. The browser handoff is the beta's loopback-plus-PKCE handoff.
- **Model.** Account, Team, Membership (account, team, role), Invite (team, exact email, role, inviter, expiry, state), Device session, and Team project (team, name, address). A team project's address is `spool.page/<team>/<project>`; renames record redirects so `spool.json` pointers and links never break.
- **Rules the cloud enforces, not the UI:** role checks on every write; the last-admin guard (leave, step down, remove, account deletion); only admins invite or promote editors; anyone in the team may invite viewers (#20); invites accept only on an exactly matching verified address; invites expire after 7 days.
- **A pending invite doesn't take a seat.** A seat is an editor, and an invite isn't a member until accepted. The confirm when inviting an editor says what it will cost once they join. This is the spec's choice, which #19 left open.
- **Billing.** One Stripe product, two prices (monthly, yearly) in USD and EUR, quantity = editors. The seat count starts at the second editor's join plus 14 days' grace; from then every editor is a seat. Stripe Checkout, Billing, Tax and the customer portal; VAT ID collection for reverse charge. Webhooks drive the team's billing state: free, grace, paying, lapsed. Once Stripe's retries run out, the team is lapsed: the admin who owns the subscription stays the one editor and everyone else, other admins included, becomes a viewer. Which admin stays, when there are several, is the spec's choice: the one who owns the subscription. History and shares stay. The "free team" switch and the "may create a team" switch are maintainer-only.
- **Email** goes through Resend: sign-in codes and invites. The beta's per-mailbox, per-IP and global send budgets stay.
- **Screens** follow Prototype signing in and running a team (#44) and Prototype the team's home in Spool Cloud (#22): the switcher with "Your projects" and "New team…"; Projects, People, Settings; Settings in the order logo, name, address, billing, delete; the invite line above Home's covers; sign-in, code, passkey offer and handoff pages; the invite walk including the wrong-address state. Liam wants little explanatory text: costs are said only in a confirm.
- **Where the screens are built.** Home is core UI served by the daemon, and spool-cloud is private, so the cloud's team API is the contract. Core's Home renders the switcher, the invite line, People and Settings against that API, and `spool.page/<team>` renders the same screens in the cloud's site. The frames under `design/frames/explore/cloud/team/` and `home/` are the reference for both.
- **Before launch** the cloud's team creation checks the "may create a team" switch. Joining an approved team needs no approval.
- **First team:** Devosurf, marked free. Liam ([vinberg.liam@gmail.com](mailto:vinberg.liam@gmail.com)) admin; [asim01.syed@gmail.com](mailto:asim01.syed@gmail.com) and [morgan.jonasson@gmail.com](mailto:morgan.jonasson@gmail.com) editors.
- **Owed at setup:** whether Mojo AB is VAT-registered and on OSS; if UK consumer VAT is a nuisance, UK buyers give a VAT number.

## Testing Decisions

- Test through the cloud's public HTTP API and the screens people use, never through tables or internal modules.
- **Worker tests** (vitest-pool-workers, `*.worker.test.ts`, as the beta's auth and publication apps do): one account per email across Google and code; the Google trust rule; send budgets; device session issue, renew and revoke; role checks on every team route; last-admin guard including account deletion; invite exact-match, expiry, resend and cancel; only admins invite editors; seat count and grace from Stripe webhook fixtures; lapse to free; free-team and create-team switches. Prior art: the auth app and provider tests and the publication app tests in spool-cloud.
- **End-to-end** in the team harness grown from spool-cloud's publication e2e harness (real `spool` CLI against Miniflare with Playwright): `spool login` handoff to a device session; accepting an invite in the browser; revoking a device and seeing its next request refused.
- **Core:** CLI tests for `spool login`/`logout` against a fake cloud origin, as the existing cloud auth CLI tests do; browser tests for the switcher and the invite line on Home.
- Stripe is never called in tests: webhooks are signed fixtures and outbound Stripe calls are intercepted, as the Worker tests already intercept Resend and Google.

## Out of Scope

- What happens to the beta's publications and links: Decide what happens to the beta's publications and links (#59). The beta's people carrying over is in.
- Single sign-on, audit logs, compliance.
- An organisation over teams (#46), editors requesting seats (#49), moving projects between teams (#55).
- GitHub sign-in, passwords, reusable invite links, domain auto-join.
- Syncing files, the canvas and sharing: their own specs.
- Notifications beyond the invite email: Decide what tells a member something changed (#60).

## Further Notes

- Sources: Decide teams, roles and invites (#19), Decide what a team pays for (#20), Research: teams, seats and billing (#11), Research: Better Auth (#45), Prototype signing in and running a team (#44), Prototype the team's home (#22).
- Vocabulary: Account, Team, Member, Admin, Editor, Viewer, Outsider, Seat are in spool-cloud's glossary.
- Part of Wayfinder map: Spool Cloud for teams (#3).

*From Linear DEV-179.*

Related: #89, #98, #112, #122, #60, #59, #55, #49, #46, #45, #44, #22, #20, #19, #11

Plane: SPOOL-64

## Comments

### agent, 2026-10-18T17:43:58.824Z

**Liam, 2026-10-05:** Billing (the Billing section and user stories 63 to 77) is deferred out of the first run: Devosurf dogfood only. #70 is in Backlog. The rest of this spec stands. See the run decisions on #3.

### agent, 2026-10-18T17:43:58.833Z

**Liam, 2026-10-06:** Stays open. #68 and #69 are done and live on spool.page (0.28.0; the invite-only gate and the spool.page default came with 0.31.0). Devosurf is set up with Liam as admin and two editors.

Left:
- #70, billing, is deferred.
- Deleting your own account isn't built. It needs a ticket (Liam).

### agent, 2026-10-18T17:43:58.841Z

**Liam, 2026-10-11:** Closed on 2026-10-11 (agent-hub task 123): accounts and teams are built. Billing was never built and its terms changed (paid only, a trial with a card): Spec: buying and paying for a team (#112) rewrites Billing (#70).
