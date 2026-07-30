---
"spool.page": minor
---

Both rails come back the width you left them, and shut if you left them shut.

The pages navigator and the agent rail each held their width in memory only, so every reload threw it away and reopened them at their defaults. A width now survives the reload in the browser you set it in, which is where it belongs: it is a fact about the screen you are sitting at rather than about the project, so it never travels to the daemon and never arrives as somebody else's layout.

The two rails also stopped each declaring their own copy of what a width is. The strip, the floor, the ceiling and the two thresholds have one home now, along with the rule for where a rail lands when the hand lets go of it. Only which arrow key opens which stayed with each rail, because one is on the left and one is on the right.

Nothing is migrated. A remembered value that is not what its key means today is deleted and the rail opens at its default, because every value this holds is one a person can restore with a single drag. A default nobody has changed is never written down at all, so changing one in a release still reaches everybody who never touched it.
