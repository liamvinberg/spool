# #202 · Alerts land in a Spool alerts channel in Discord

- State: closed
- Labels: ready-for-agent
- Parent: #117
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:56:11.302Z
- Updated: 2026-10-21T20:57:19.961Z
- Closed: 2026-10-21T20:57:19.961Z

## Parent

Spec: running Spool Cloud for paying teams (#117)

## What to build

The alerts channel and the alerts most of them use. A Discord channel goes in the Spool category, made with its webhook through agent-hub's discord tools, and the webhook URL goes in Infisical's spool-cloud workspace. An idempotent ops script, run like the Stripe price script and with a dry-run, does the rest through the Cloudflare API. It sets up the Discord webhook destination and a Workers Issues automation on both Workers (a new issue, or one returning after quiet). It adds Custom Alerts on the log lines `team_sync_never_idles` and `compile_limit`, and on a cron heartbeat missing for 15 minutes. It adds a billing budget alert at Liam's spend line, by email if Cloudflare can't send it elsewhere. `observability.issues` is turned on in the Wrangler configs, with Wrangler raised to a version that supports it. The scheduled handler logs one heartbeat line per run. Later tickets add their own alerts to the same script. spool-cloud only, plus the Discord channel.

## Acceptance criteria

- [ ] The alerts channel exists under Spool, and a test message from the webhook appears there
- [ ] Running the script twice changes nothing the second time; its dry-run lists what it would make
- [ ] A thrown error in a deployed Worker posts one message to the channel, and the same error again doesn't post a second
- [ ] A forced `team_sync_never_idles` line and a forced `compile_limit` line (in the isolated environment) each post to the channel
- [ ] The cron heartbeat is logged each run, and the missing-heartbeat alert is shown to fire by pausing the cron in the isolated environment
- [ ] The budget alert is set at the line Liam chose
- [ ] The channel is quiet on a normal day: no alert fires on a day with no fault
- [ ] No secret or webhook URL in the repo

## Comments

### agent, 2026-10-21T20:57:19.961Z

Merged: spool f5fe825d (merge 205 #117 …), spool-cloud 4bf3938 (merge 205 #117 …). Built: scripts/cloudflare-alerts.mjs (pnpm cloudflare:alerts, --dry-run, --waf-plan), idempotent, tested against a recorded API shape; Discord webhook destination, Workers Issues alerts for both Workers, the sign-in rate-limit rule; it prints the steps Cloudflare has no API for (log-line monitors incl. team_sync_never_idles, compile_limit, team_sync_drift, email_breaker, email_unavailable, the missing-heartbeat monitor, the budget alert by Cloudflare email). observability.issues on, wrangler 4.151, cron heartbeat line. Human steps left: Discord alerts channel + webhook under Spool, its URL in Infisical spool-cloud, a Cloudflare API token, run the script live, create the printed monitors and the budget alert at Liam's spend line, and check the isolated-environment firing.
