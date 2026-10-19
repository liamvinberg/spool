# #165 · Cold play waits for every frame's stylesheet: paint the start frame first

- State: closed
- Labels: needs-triage
- Created: 2026-10-18T17:43:57.051Z
- Updated: 2026-10-18T17:44:02.423Z
- Closed: 2026-10-18T17:44:02.423Z

A cold play waits for every frame in the project to compile before the first frame shows. Measured in task 166 on a copy of spool's own 454-frame canvas (devobee, 22 cores):

- warm play (canvas open a while): about 0.25s to the frame
- play right after an edit: about 0.7s (esbuild context and kept styles make it incremental)
- cold play (first since the daemon started, or before keepPlayerWarm has composed): **13 to 21s**

Where the cold time goes (`compilePlayer`, `src/daemon/player-compile.ts`):

- the composition itself (esbuild, split): about 0.85s
- every frame's stylesheet (`buildFrameStyleClosure`: a per-frame esbuild then Tailwind on the stylesheet workers): the rest. It is bound by the stylesheet workers: 2 workers 17.5s, 4 workers 11s, 8 workers 9s. Four workers cost about +300MB RSS, so raising the count was not taken.

The document only needs the start frame's stylesheet to paint. Proposal: on a cold compile, serve the composition plus the start frame's stylesheet (about 1s), and give every other frame a deferred style name whose chunk request waits on a background compile of the rest. Walks and idle prefetch then wait only for the frame they need. The provisional bundle is never cached; the background compile fills the cache as today. Touches `play.ts` (compileOrReuse, getChunk, the `/play/:project/-/*` route, which becomes async) and `player-compile.ts`. The runtime already fetches a frame's style by name before mounting it (`loadFrameStyle` in frame-runtime.ts).

Also worth a look: `keepPlayerWarm` defers composing while the booth is busy, up to 30s (`PLAYER_BOOTH_PATIENCE_MS`), so a play soon after opening a project in the app lands on a cold compile.

Loader for the wait itself shipped in task 166 (the spool mark winding after 800ms).

Plane: SPOOL-165

## Comments

### agent, 2026-10-18T17:44:02.415Z

**Liam, 2026-10-17:** Merged in e3340ebc (commit 3466b3f7). A cold play is served a partial player once the composition and the start frame's stylesheet are built; the other frames get names that answer when their stylesheet is, and a walk to one builds it ahead of the pool. Under heavy load on devobee, the 454-frame project's cold document went from 32.6s to 1.9s.
