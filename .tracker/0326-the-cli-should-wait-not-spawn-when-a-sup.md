# #326 · The CLI should wait, not spawn, when a supervisor owns the checkout dev daemon

- State: open
- Labels: needs-triage, enhancement
- Created: 2026-11-12T19:56:09.281Z
- Updated: 2026-11-12T19:56:09.281Z

From devops task 654 (the dev environment work, spec devops#7).

The shared checkout dev daemon on devobee (state `~/.spool-dev`, port 7767) is becoming a systemd user service, `spool-dev.service`, at normal priority (devops#8). Until now the first agent command that needed it spawned it detached, so it ran at the lowest CPU priority on the box (inside agent-hub's command slice, SCHED_IDLE) and died with every agent-hub deploy; that is a large part of why it stopped answering under load (#324).

What is left on spool's side: `ensureDaemon` (`src/daemon/lifecycle.ts`) spawns a competing daemon whenever the health probe fails, and there is no way to say "a supervisor owns this daemon, never spawn, wait for it". The service works around it (it stops any unmanaged daemon before it starts, and a competitor cannot take the port while the service's daemon holds it), but during the service's restart window an agent's CLI can still win the port with an idle-priority daemon for a moment, and under load every slow health answer costs a pointless spawn attempt.

Wanted: a switch (an environment variable, or a marker file in the state directory that the service writes) that makes the CLI wait for the daemon to answer, with a clear sentence when it does not, instead of spawning. Linux has no built-in autostart support in spool today (`src/autostart.ts` is macOS only); this would be its first piece.

Not urgent: devops#8 stands on its own.
