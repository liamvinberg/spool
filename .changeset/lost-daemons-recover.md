---
"spool.page": patch
---

Stop a health probe that times out from deleting a live daemon's credential. `statusDaemon` and `stopDaemon` swept `daemon.json` by re-reading it, so state a successor wrote during the one-second probe — the window an upgrade's restart lands in — was deleted as if it were stale, stranding a healthy daemon that no verb could reach and no successor could bind beside. The sweep now clears only the state the probe itself read.

`spool stop --force` stops a daemon holding the address that no state file accounts for, the way back from an install already in that state — the control token dies with `daemon.json` and cannot be written back by hand. `serve` and the auto-start path now name that daemon and point at the flag instead of asking for a file nobody can restore.

A daemon reached through a forwarded port — an ssh tunnel to another machine — is no longer reported stopped when it is not: its pid names a process that does not exist here, and `stop --force` says so.
