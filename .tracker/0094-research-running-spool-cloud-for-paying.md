# #94 · Research: running Spool Cloud for paying customers on Cloudflare

- State: closed
- Labels: wayfinder:research
- Parent: #89
- Created: 2026-10-18T17:43:56.237Z
- Updated: 2026-10-18T17:43:59.987Z
- Closed: 2026-10-18T17:43:59.987Z

## Question

What the service needs before paying teams depend on it: backup and restore of the sync objects' SQLite (point-in-time recovery), sending sign-in and invite email at volume (today 100 a day), abuse protection once sign-up is open (Turnstile, rate limits, WAF), alerts worth having, and what fails first at 100 and 1,000 teams. Builds on research 155 and 156.

*From Linear DEV-245.*

Related: #103, #106, #108, #114, #117, #58, #57

Plane: SPOOL-94

## Comments

### agent, 2026-10-18T17:43:59.977Z

**Liam, 2026-10-10:** Resolved by research (2026-10-09): `spool-cloud/research/245-cloudflare-for-paying-teams/README.md`, on branch `97-i-m-thinking-we-should-probably-get--task-97-research-97-r5` (commit 0973e6b, not yet on main).

- **Backup:** SQLite Durable Objects keep 30 days of point-in-time recovery by default, restorable per object but only from code inside it. No export and no recovery after deletion are documented, so a real backup is our own snapshot to R2.
- **Capacity:** D1 is fine at 100 teams (under ~90 queries/s peak) and near its ceiling at 1,000 only if every team is heavy at once. A sync object's 10 GB cap is a slow fuse.
- **Likeliest real failure:** a new editor's catch-up loads every file in one handler against 128 MB of memory.
- **Email:** the 100/day cap is Resend Free's. Pro ($20/month, 50,000 mails, no daily cap) covers an estimated 12,000–48,000 sign-in mails a month at 1,000 teams. There is no DMARC record.
- **Abuse:** Turnstile is free. The Workers rate-limit binding is approximate. WAF rate limiting depends on the zone plan.
- **Deploys:** every deploy restarts Durable Objects and drops sockets. There is no CI.

**Must-have before taking money:**
- An R2 snapshot plus a restore with a restore-epoch marker, so daemons resync.
- Resend Pro, with the daily cap turned into a circuit breaker.
- Turnstile and one WAF rule on sign-in.
- About six alerts: Worker errors, compile\_limit, team\_sync\_never\_idles, cron silence, Resend failures, spend.
- The catch-up fix, tested with a 1 GB project.
- CI and a one-command deploy.

The 19-item checklist with effort guesses is in §9.

**Open for Liam:**
- Which plan the zones are on.
- Retention of removed projects and history pruning (#57).
- Who reads the alerts.
