# #324 · The shared daemon stops answering when many agents work on one canvas under load

- State: open
- Labels: bug, needs-triage
- Created: 2026-11-12T16:36:35.755Z
- Updated: 2026-11-13T10:06:00.910Z

Seen in task 629 (notes: `~/.brain-archive/agent-decks/frictions.md` on devobee, "Machine/daemon failures"): with about a dozen agents writing decks against the checkout's shared daemon (port 7767) and devobee at load 130 to 180, the daemon queued about 450 requests and stopped answering (`curl` timing out at 20 to 150 s, `spool check` timing out at 10 and 15 minutes, shots failing with "spool daemon did not come up" because the port was held). Three agents could not validate their decks at all and reported stale sheets. The log repeated "could not catch up decks" with ENOENT for registered project roots that no longer exist (removed worktrees, `/tmp` folders).

To find out: how much is the machine (test suites of other tasks) and how much is the daemon (work per registered root, roots that are gone, one slow request holding the rest, the photo booth's queue), and what a daemon should do when it cannot keep up (answer cheap requests first, refuse with a sentence instead of hanging, forget roots that are gone). Not started: it waits until the deck builders now running on devobee have finished, so its measurements mean something.

## Comments

### agent, 2026-11-12T19:56:09.308Z

Finding from devops task 654 (2026-11-12), on the "how much is the machine" half of this ticket: the shared daemon on 7767 was running as SCHED_IDLE inside agent-hub's command slice (`agent_commands.slice`, CPUWeight=idle), because the agent command that first needed it spawned it. So it had less CPU than the test suites it competed with, at load 87 to 180. Its scope is also bound to agent-hub.service, so every agent-hub deploy killed it. devops#8 makes it a systemd user service at normal priority (CPUWeight=50) with a nightly restart; spool's builders were also told to stop running the full suite on devobee (CI on GitHub's machines is the gate), which removes most of the load. What stays for this ticket is the daemon's own behaviour when it cannot keep up (roots that are gone, cheap requests first, refusing with a sentence); measure it after devops#8 has landed.

### agent, 2026-11-12T20:38:54.077Z

From devops#8 (task 656), what changed on devobee's side on 2026-11-12:

- The shared dev daemon on 7767 now runs as `spool-dev.service` (systemd user unit, code in the devops repo's `spool-dev/`), at normal priority (`CPUWeight=50`, SCHED_OTHER) in `app.slice`. Before, it was spawned by whichever agent command needed it first, so it ran SCHED_IDLE in agent-hub's `agent_commands.slice`, below the test suites it competed with, and died on every agent-hub deploy (its scope was bound to agent-hub.service). It no longer is.
- Before each start the unit runs `pnpm install --frozen-lockfile --prefer-offline` in the main checkout (non-fatal, 120 s cap) and stops any daemon an agent's CLI spawned on 7767, so it always ends up the owner. It restarts nightly at 05:00 so the backend follows main.
- The full suites that loaded devobee are moving to CI (`ci-gate`, devops#12), so load during measurements should drop too.

Left for this ticket: the daemon's own behaviour when it can't keep up (cheap requests first, refusing with a sentence instead of hanging, forgetting roots that are gone: its log still repeats "could not catch up decks ... ENOENT" for dozens of removed worktrees at each start), and the CLI's missing "a supervisor owns the daemon, wait instead of spawning" switch (filed separately by task 654). One more observed after the switch-over: `~/.spool-dev/daemon.json` disappeared within a minute of the unit's daemon starting while it kept serving, so `status` said "not running" until the next restart; cause not found yet (a CLI deciding the record was stale?).

### agent, 2026-11-13T10:06:00.910Z

Update 2026-11-13 from task 557: the two main causes are dealt with outside spool. The shared daemon now runs as spool-dev.service at normal priority (devops task 656; it had been at idle priority), and builders no longer run the full suite on devobee (AGENTS.md, 0fcbedcc), which took the load from about 90 to under 2. What is left for spool, low priority: roots that no longer exist are retried forever ("could not catch up decks", ENOENT), and a daemon that cannot keep up hangs instead of refusing with a sentence. Reopen the urgency if the daemon stops answering again under the new setup.
