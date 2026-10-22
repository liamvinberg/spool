# #203 · Sign-in behind Turnstile and a WAF rule, and the mail cap becomes an alerting breaker

- State: closed
- Labels: ready-for-agent
- Parent: #117
- Blocked by: #202
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:56:11.320Z
- Updated: 2026-10-21T20:57:19.969Z
- Closed: 2026-10-21T20:57:19.969Z

## Parent

Spec: running Spool Cloud for paying teams (#117)

## What to build

Sign-in is guarded, and mail failing is something we hear about. The Turnstile check that already exists for the waitlist takes its action as an argument. Sign-in gets its own action and widget on the server-rendered sign-in pages at spool.page and on link-share hosts. `/sign-in/code`, `/sign-in/code/resend` and the link-share code request check the token server-side before the send budget runs. A failed check sends nothing and shows the widget again. The global 100-a-day cap in the send budget becomes a 1,000-a-day breaker; every per-mailbox and per-address budget stays. A refusal by the breaker logs `email_breaker`, once an hour at most. A Resend refusal or a failure after retries logs `email_unavailable` with status and kind, never the address. The ops script gains alerts on both lines and one WAF rate-limit rule on `/sign-in/*`, as wide as the zone's plan allows. spool-cloud only. Needs from Liam first: Resend Pro bought, and the zone plan known.

## Acceptance criteria

- [ ] A code request without a valid Turnstile token is refused with no mail sent and no budget spent, on spool.page and on a link-share host
- [ ] With a valid token, sign-in works as before, and so do the Mac app's browser handover and passkeys
- [ ] The sign-in pages' CSP allows Turnstile and nothing more
- [ ] The 101st mail of a day goes out; the 1,001st is refused and logs `email_breaker` once
- [ ] Per-mailbox (1 a minute of a kind, 5 an hour, 10 a day) and per-address (20 an hour) budgets are unchanged
- [ ] A Resend 429, 5xx or rejection logs `email_unavailable` without the address
- [ ] Both lines post to the alerts channel, as shown in the isolated environment
- [ ] The WAF rule is in place, and a burst of sign-in requests from one address is blocked at the edge
- [ ] Turnstile and Resend are never called for real in tests

## Blocked by

- #202

## Comments

### agent, 2026-10-21T17:46:27.229Z

Built on spool-cloud branch `205-b117-ops` (agent-hub task 205). What still needs a person, in order:

**Runbook: the live WAF step (Liam, once the Cloudflare token exists)**
1. Check the zone plan of spool.page and onspool.page (Overview > Plan). The rule's width follows it: free = one rule per zone, 10 s period, block 10 s, counted by colo + IP; pro / business allow longer periods and timeouts.
2. Dry run: `CLOUDFLARE_API_TOKEN=… SPOOL_ALERTS_WEBHOOK_URL=… pnpm cloudflare:alerts --dry-run --waf-plan <free|pro|business>` in spool-cloud. It prints what it would change and leaves every other rate-limit rule as it is.
3. Run it again without `--dry-run`. It writes rule `spool_sign_in_rate_limit`: `/sign-in/*` on spool.page and `/_spool/sign-in/*` on onspool.page (the link hosts' code request), block for the plan's timeout.
4. Check it: from one address, `for i in $(seq 1 30); do curl -s -o /dev/null -w "%{http_code}\n" -X POST https://spool.page/sign-in/code; done`. Once past the threshold the edge answers 429 before the Worker. Security > Events shows the rule matching.
5. To undo: delete `spool_sign_in_rate_limit` in Security > WAF > Rate limiting rules on each zone. The script never touches any other rule.

**The breaker stays at 100 a day for now.** `MAIL_BREAKER_PER_DAY` in `src/worker/auth/challenges.ts` is the one constant. Raising it to 1,000 waits on Resend Pro and is a one-line follow-up: the constant, plus the test name and count in `account-app.worker.test.ts` "the mail breaker", which already reads the constant.

**Link hosts: Turnstile is built but off** (`LINK_SIGN_IN_TURNSTILE = false` in `src/worker/shares/link-sign-in.ts`). The link host's code dialog belongs to spool.page's viewer bundle, which stays pinned at 0.45.1, so it can't show a widget yet. Turning the check on today would break email-code sign-in on every link share. With it on (covered by the tests), a request without a token gets `400 {error:"turnstile", siteKey}` and nothing is sent; the link page's CSP adds Turnstile's script and frame. To turn it on: (a) the spool viewer's sign-in dialog renders the widget (action `sign-in`) from that `siteKey` and sends `turnstile` with `/_spool/sign-in/code` and `/resend`; (b) spool-cloud bumps the pin; (c) flip the constant; (d) add `TURNSTILE_SECRET_KEY` (secret) and `TURNSTILE_SITE_KEY` (var) to `wrangler.serving.jsonc` and the serving Worker; (e) add `onspool.page` to the Turnstile widget's hostnames. Until then the WAF rule above, plus the per-mailbox and per-address budgets, guard link hosts.

**Turnstile widget:** sign-in reuses the landing's widget and secret (`TURNSTILE_SITE_KEY` var in `wrangler.jsonc`, same key as `.env.production`) and tells the two apart by action (`waitlist` vs `sign-in`). The widget's hostname spool.page already covers beta.spool.page. Checked in a real browser with Cloudflare's test keys: the widget renders under the new sign-in CSP with no console errors.

**Alerts:** `email_breaker` and `email_unavailable` are already in `scripts/cloudflare-alerts.mjs` (#202) as Monitors to create by hand. The isolated-environment check that both reach the channel is still to do.

### agent, 2026-10-21T20:57:19.969Z

Merged: spool f5fe825d (merge 205 #117 …), spool-cloud 4bf3938 (merge 205 #117 …). Built: Turnstile check takes its action; sign-in widget and server check on /sign-in/code and /resend before the send budget; CSP adds only challenges.cloudflare.com; breaker constant MAIL_BREAKER_PER_DAY kept at 100 (today's cap) with email_breaker at most hourly; email_unavailable with status and kind. Link-host Turnstile is built but off (LINK_SIGN_IN_TURNSTILE=false) until spool's viewer link dialog shows the widget and the spool.page pin moves. Human steps: buy Resend Pro then raise the breaker to 1,000; check zone plan and apply the WAF rule via the ops script (runbook in the earlier comment); verify alerts in the isolated environment.
