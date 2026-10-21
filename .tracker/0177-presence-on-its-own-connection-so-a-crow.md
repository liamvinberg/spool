# #177 · Presence on its own connection, so a crowd never slows saves

- State: open
- Labels: needs-triage
- Created: 2026-10-20T16:11:42.032Z
- Updated: 2026-10-20T16:11:42.032Z

Left over from Presence stays light in a crowded project (spool#107, merged in agent-hub task 193: spool 25e8df77, spool-cloud 5afb011).

With 100 people on one page moving 20 times a second, sockets no longer close and pointer delay p99 is 147 to 354 ms (median 257 ms, measured from devobee, where 10 movers alone give 264 ms, so most of the tail is network). Saves still slow under that load: median 74 to 84 ms against 69 to 74 ms in an empty project, p90 91 to 110 ms, and 100 people over 5 pages push saves to median 159 ms, p90 397 ms. Even with the cloud dropping presence on arrival, 2,000 presence messages a second on the sync object push save p99 to about 360 ms, because they share the object and its sockets.

The ticket's fallback: presence on its own Durable Object, reached by its own connection, so saves never queue behind it. A protocol change, so older Spools keep the current path.

Not urgent: a launch team is a handful of people, far below this load. Load-test scripts from the run: ~/.cache/dev-193-107/scripts (copy them into spool-cloud research/ if this is picked up).
