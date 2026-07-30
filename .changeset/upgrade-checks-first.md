---
"spool.page": patch
---

`spool upgrade` no longer reinstalls and restarts when there is nothing to install.

It used to run the package manager and bounce the daemon every time you asked, whether or not a new release existed. Every canvas lost its connection and everything running under the daemon died, for no change at all. Now it asks the registry first, and when the answer is not newer it tells you so and stops there.

It also will not move you backwards. The target has to be newer than both the cli and the running daemon, so an upgrade run in the ten minutes before a release reaches npm can no longer install the older build over a daemon that is already ahead of it. If the registry cannot be reached, the upgrade you asked for still runs.

A real upgrade now says what it is about to cost and waits for a yes, because stopping the daemon takes every process under it down too. Only a terminal is asked. Scripts, agents, and the upgrade button in the canvas are unaffected, and `spool upgrade --yes` skips the question.
