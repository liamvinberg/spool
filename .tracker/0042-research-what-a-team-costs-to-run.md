# #42 · Research: what a team costs to run

- State: closed
- Labels: wayfinder:research
- Parent: #3
- Blocked by: #41
- Created: 2026-10-18T17:43:55.692Z
- Updated: 2026-10-18T17:43:58.214Z
- Closed: 2026-10-18T17:43:58.214Z

## Question

What does one team project cost Spool to run per month, at two to eight members: storage of source, history and set-aside saves, sync connections (Durable Objects or equivalent), compile on open, covers, and serving to members and outsiders? Use the real save cadence in `spool-cloud/research/117-agent-save-cadence/` and the production figures from Research: cloud compile on Cloudflare itself. Feeds the price: Decide what a team pays for (#20) set $16 per editor per month billed yearly ($20 monthly), free for a team with one editor, and fair-use limits on storage and history instead of a meter. Price compile on open two ways: in Workers, at the production figures, and as a long-lived native compile service (the Coolify box or Cloudflare Containers). Check the margin at $16 per editor and propose those fair-use limits.

*From Linear DEV-156.*

Related: #57, #62, #65, #83, #20, #18

Plane: SPOOL-42

## Comments

### agent, 2026-10-18T17:43:58.208Z

**Liam, 2026-10-04:** ## Resolution

Modelled from the real save records in research/117 and the production figures in research/155, with prices fetched live. The report is `spool-cloud/research/156-team-running-cost/README.md`, commits `5ddc8a5` and `7943b9e` on spool-cloud main. All prices and assumptions are in `scripts/model.mjs`; `scripts/run.sh` reproduces the tables.

- **A team costs cents to a few dollars a month** at list prices, not counting Cloudflare's included allowances.

| Editors | Typical | Heavy |
| --- | --- | --- |
| 1 (free) | $0.04 | $1.52 |
| 2 | $0.07 | $1.97 |
| 4 | $0.12 | $2.87 |
| 8 | $0.23 | $4.68 |

Typical is the median canvas's busiest month (687 saves per editor). Heavy is the largest canvas's busiest month (3,110 saves per editor), and it also compiles every frame each `shared/` save touches.
- **The margin at $16 is 86 to 97%.** Stripe costs more than Cloudflare for most teams: $0.88 to $2.55 a month on a 2-editor yearly team. Billing at $20 monthly moves the margin by less than a point.
- **The cost that matters most is whether the sync Durable Object can go idle.** If it hibernates, it costs fractions of a cent. If it can't, it costs $1.01 a month at 8 connected hours a day and $4.15 always on. At 1,000 free projects that is about $1,050 a month instead of $39.
- **Compile CPU comes second.** It is 20% of a typical team's cost and 41% of a heavy 8-editor team's ($1.91). Storage stays under $0.35 a month after a year of heavy history.
- **Outsiders cost their sign-in email, not serving.** Serving is about $0.005 per 1,000 frame views, and one email code is $0.0009.
- **Native compile uses about a fifth of the CPU but doesn't pay for itself.**
- The Hetzner EX44 ($64.32 a month) pays off at 49 heavy 8-editor teams.
- One always-on Cloudflare Container ($6.93 a month) pays off at 7 heavy teams.
- Moving compile would be for latency, not money. A per-project compile Durable Object costs about 40% of the Workers figure.
- **Fixed costs fall under 5% of revenue at 4 paying teams** for Workers alone, 16 with Resend Pro for sign-in email, and 56 with the box.
- **Proposed fair-use limits:**
- `design/` up to 1 GB per project.
- History up to 5 GB compressed on a paid project, which keeps source and history inside one Durable Object's 10 GB.
- History on a free project: 1 GB and 90 days.
- Set-aside saves kept for 90 days.
- 30,000 saves per editor a month (10 times the heavy editor), 120 saves per project a minute, and 25 MB per file.
- The monthly save cap is the limit that actually bounds cost.
- **Three costs have no natural ceiling:**
- A runaway agent: $3.54 and 3.4 GB of history per million saves. The save cap stops it.
- A sync object that never goes idle: use the hibernation API and alert on Durable Object usage.
- Outsider sign-ins: limit how often codes are sent, offer Google, keep sessions long.
- **A heavy 2-editor team crosses 25% of revenue** with any one of these: a sync object that never idles, 8 times the heavy compile volume, about 88,000 new-outsider views a month, or an agent saving 0.6 times a second all month. A typical team sits about 80 times below that.

Not verified:
- Every save rate comes from Liam's own agents.
- Viewer and outsider behaviour are assumptions. The beta saw only 1,584 requests in 30 days.
- Hibernation of the sync object is untested.
- Whether Stripe's percentage applies to the VAT-inclusive total is unconfirmed; the worst case assumes it does.
- The box price excludes Hetzner's IPv4 charge.
