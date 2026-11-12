# #302 · Player shell reaches outside only through its host

- State: open
- Labels: ready-for-agent, enhancement
- Parent: #300
- Created: 2026-11-11T21:22:56.753Z
- Updated: 2026-11-11T21:22:56.753Z

## Parent

#300

## What to build

A refactor with no change anyone can see: the player shell stops assuming a daemon.

The shell already names what it needs from outside in a host interface, but its boot still wires in the live pieces directly (daemon geometry and its stream, verified walks, handoff repair, recording, the Mac window bridge, config that assumes a daemon URL and token). Split it so that:
- the **shell core** holds the chrome, sizing, fit, and the port protocol with the played document, and reaches outside only through its host;
- the **live host** holds everything daemon, recording and Mac window specific;
- what a host does not offer, the bar does not draw (recording is already optional this way; close, copy link and comments become so too).

This is the seam the export host plugs into in the next ticket, so shape the host interface for a host that has fixed geometry, no walks to report, nothing to repair and no recorder. Do not build that host here.

Leave alone: how the player looks and moves, the reveal gates, the port protocol's messages.

## Acceptance criteria

- [ ] The live player behaves exactly as before in a browser tab and in the Mac app; the existing player parity and play tests pass unchanged.
- [ ] The shell core imports nothing that needs a daemon.
- [ ] The handoff lists the host interface as it now stands.
- [ ] No changeset (internals only).
