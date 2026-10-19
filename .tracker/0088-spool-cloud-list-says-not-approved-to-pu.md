# #88 · spool cloud list says "not approved to publish" to a signed-in team member

- State: closed
- Labels: needs-triage
- Created: 2026-10-18T17:43:56.167Z
- Updated: 2026-10-18T17:43:59.767Z
- Closed: 2026-10-18T17:43:59.767Z

Found while moving chamfer (1,922 files, 21 MB) into Devosurf on devobee, in agent-hub task 51 (chamfer project, thread "so can you move chamfer to spool cloud"). `spool cloud list` on a signed-in account that admins Devosurf printed raw JSON: `{"error":{"code":"client_error","message":"this account is not approved to publish","retryable":false}}`. It reads as if Spool Cloud is off for the account. The CLI should print a plain sentence, and say that publishing needs approval while teams work anyway.

Also seen on devobee (Linux, no display): the daemon log fills with "the photo booth could not start a browser: Protocol error (Browser.getVersion)" lines, one per attempt. Worth saying once, with what to install.

*From Linear DEV-237.*

Related: #80

Plane: SPOOL-88

## Comments

### agent, 2026-10-18T17:43:59.751Z

**Liam, 2026-10-08:** The CLI half shipped in spool (merged to main 2026-10-07, agent-hub spool task 56): `spool cloud` verbs print a plain sentence on stderr ("this account is not approved to publish websites yet: publishing is an invite-only beta, and teams on spool.page work without it"), with codes `not_approved` / `signed_out` in the JSON. The photo booth names the missing Chromium libraries once and stops retrying. Still open: anything spool.page itself should say differently.

### agent, 2026-10-18T17:43:59.758Z

**Liam, 2026-10-13:** Fixed since: the CLI now says in a sentence that publishing is an invite-only beta and teams work without it (src/cloud-auth.ts), and the photo booth names the missing library once (booth tests). The `spool cloud` verbs themselves go with #80. Closed in agent-hub task 146.
