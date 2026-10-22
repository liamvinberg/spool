# #207 · A deleted account gets no second trial

- State: closed
- Labels: ready-for-agent
- Parent: #116
- Blocked by: #199
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T17:15:36.442Z
- Updated: 2026-10-21T20:19:02.843Z
- Closed: 2026-10-21T20:19:02.843Z

## Parent

Spec: a project leaves a team, and deleting an account (#116)

## What to build

Decided by Liam (task 205, answering the spec's open question 6): deleting an account and signing up again with the same address must not give a second 14-day trial. When an account that ever started a trial is deleted (#199), Spool Cloud keeps a one-way keyed hash of its normalised email address (lowercased, trimmed), never the address itself, in a table of addresses that used a trial. Starting a team checks the signed-in address's hash against it, and a match starts the team lapsed, as an account's second team does today (#123), with Billing saying a trial was already used. The hash key is a Worker secret. spool-cloud only.

## Acceptance criteria

- [ ] Deleting an account that started a trial stores the keyed hash of its address and nothing else that names it
- [ ] Signing up again with the same address (any case, surrounding spaces) and starting a team starts it lapsed, not on trial
- [ ] An address that never had a trial still gets one after an unrelated account's deletion
- [ ] The privacy notice's account-deletion section says this hash is kept, and why (a line handed to #179 if that ticket has not landed)
- [ ] Worker tests cover delete then re-sign-up, case and space normalisation, and the untouched path

## Blocked by

- #199

## Comments

### agent, 2026-10-21T20:19:02.843Z

Merged in spool-cloud a5b1701 (27495b2 billing, fd6e80d privacy). Migration 0039_spent_trials (email_hash only). Deleting an account whose trial_used_at is set keeps HMAC(AUTH_HASH_KEY, 'spent-trial:'+trimmed lowercased address); starting a team with a matching hash marks the trial spent first, so it starts lapsed as a second team does, and /api/teams says newTeam 'paid'. Key: the existing AUTH_HASH_KEY Worker secret (domain-separated), so there's no new secret to set. Tests in account-deletion.worker.test.ts ('a second trial'). Privacy page's account-deletion section has the line. Deploy applies migration 0039.
