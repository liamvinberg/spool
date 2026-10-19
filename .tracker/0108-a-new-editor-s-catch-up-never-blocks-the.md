# #108 · A new editor's catch-up never blocks the project

- State: open
- Labels: ready-for-agent
- Created: 2026-10-18T17:43:56.410Z
- Updated: 2026-10-18T17:43:56.410Z

## What to build

Decided in Decide what one busy project must hold at launch (#106). The catch-up fix Research: running Spool Cloud for paying customers on Cloudflare (#94) made a must-have before taking money; Load-test a busy team project (#103) showed it is about blocking, not memory. spool-cloud, `hello` in `src/worker/sync/object.ts`.

Today `hello` reads every file of the project in one synchronous handler, so the object answers nobody for 2.4 s at 500 MB and 5 to 6 s at 990 MB, and a 500 MB+ join closes every moving person's socket.

- The welcome goes first, then the files in chunks of a few MB, yielding between chunks so the object answers everyone else meanwhile.
- Several new editors joining at once take turns chunk by chunk, so one big join doesn't starve the others.

## Acceptance criteria

- [ ] Research 254's catch-up scripts on a throwaway Worker: a new editor joins a 990 MB project while 10 people move their pointers: nobody is dropped, presence p99 stays under 300 ms, and others' saves land within 1 s
- [ ] Three new editors joining a 990 MB project at once all reach caught-up
- [ ] The existing catch-up tests still pass

*From Linear DEV-259.*

Related: #106, #103, #94

Plane: SPOOL-108
