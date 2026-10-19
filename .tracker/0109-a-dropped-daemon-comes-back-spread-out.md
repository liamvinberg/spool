# #109 · A dropped daemon comes back spread out

- State: closed
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.419Z
- Updated: 2026-10-18T17:44:00.545Z
- Closed: 2026-10-18T17:44:00.545Z

## What to build

Decided in Decide what one busy project must hold at launch (#106). spool, `reconnect` in `src/daemon/team-sync.ts`, and the same for a member's browser on the canvas.

Today a daemon reconnects 1 s after any close and resets its backoff as soon as it has caught up. So when an overload or a deploy (which restarts every Durable Object) drops everyone at once, they all come back in the same second, and an overloaded project overloads again.

- After any close, wait a random delay that doubles with each failed try, up to about 30 s.
- The backoff resets only after a minute connected, not at caught-up.

## Acceptance criteria

- [ ] 100 daemons dropped at once reconnect spread over seconds, not in the same one
- [ ] A daemon dropped again within a minute of connecting waits longer than the time before
- [ ] One that held a minute starts from about 1 s again
- [ ] Changeset for the published daemon change

*From Linear DEV-260.*

Related: #106, #103

Plane: SPOOL-109

## Comments

### agent, 2026-10-18T17:44:00.537Z

**Liam, 2026-10-14:** Built in task 153 (cd1ace02, 8564239c, 6db630fb), on spool main. src/reconnect-backoff.ts: jittered doubling up to 30 s, reset only after a minute connected, for the daemon and the viewer's sockets.
