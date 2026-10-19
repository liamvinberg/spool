# #134 · follow the agent: a camera mode that tracks the working agent

- State: open
- Labels: ready-for-human
- Created: 2026-10-18T17:43:56.703Z
- Updated: 2026-10-18T17:43:56.703Z

Moved from liamvinberg/spool#216 (closed there; GitHub issues are no longer where this work is tracked).

The agent's hand (liamvinberg/spool#214) draws only on frames already in view and deliberately never moves the camera. This ticket is the other half: a mode where the camera follows the agent while it works, so you can watch a run unfold instead of chasing it.

Sketch, undesigned:

- **Follow**: the camera tracks the frame the agent is working. When the agent moves to another frame, the camera goes with it.
- **Entrances**: when the agent creates a new frame, the frame gets an arrival — it enters rather than pops into existence.
- **Enter and exit**: how you start following (from the rail? from the hand's thread?) and how you leave it — any manual camera move probably breaks the follow, the way scroll-following works in a terminal.
- **Subagents**: a run can fan out. Following needs an answer for which hand you're following when there are several, and how you see the others and switch.

Needs a design round before anything else: how it behaves, how it feels to enter and leave, what it does at the zoom thresholds (a followed frame should presumably be brought above the live threshold so you see the real document, not the photograph). Depends on the vocabulary landed in liamvinberg/spool#214.

*From Linear DEV-285.*

Plane: SPOOL-134
