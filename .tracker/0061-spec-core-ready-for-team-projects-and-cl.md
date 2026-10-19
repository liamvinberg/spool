# #61 · Spec: core ready for team projects and cloud compile

- State: closed
- Labels: ready-for-agent
- Parent: #3
- Created: 2026-10-18T17:43:55.874Z
- Updated: 2026-10-18T17:43:58.703Z
- Closed: 2026-10-18T17:43:58.703Z

## Problem Statement

Spool Cloud for teams needs things from core before it can ship. Today:

- A frame can fetch, script and load images from any plain-http address, including `localhost` and the LAN. Frames are served from loopback, so Chrome's local-network prompt never protects against them. Once a teammate's files arrive on your machine with no pull you chose, a frame a teammate's agent wrote can reach services on your machine and network.
- The daemon's font fetch follows any `http(s)` URL in `shared/fonts.css` from Node, including loopback and private addresses. It's a gap under today's trust model already.
- Core's compile can't run anywhere but in the daemon. It runs things at module load, reads files directly, imports native esbuild and Tailwind's native Oxide scanner, and lets a `tsconfig.json` above `design/` change what a frame compiles to (18 of 863 frames on Liam's canvases). Spool Cloud can't compile with core's own code, so sharing has kept a second pipeline (the beta's exporter) with its own extra rules, and that pipeline refuses frames that play fine on the canvas.

## Solution

Core makes frames https-only everywhere, closes the font fetch to local addresses, and makes its compile something a Cloudflare Worker can import and run with the same output as the daemon:

- A Content Security Policy on every frame document (canvas, player, `spool shot`, photo booth, export) limits network, script and image sources to `https:`, `data:`, `blob:` and Spool's own vendored libraries. Prototypes that called `http://localhost:3000` break, and the skill points them at scenarios and mocks instead.
- The font fetch takes only `https:` URLs and refuses any that resolve to loopback, link-local or private addresses.
- Core's class scanner is a JS scanner, in the daemon too, replacing Oxide, so the canvas and the cloud can't disagree about which Tailwind classes a frame uses.
- Frames compile with core's own pinned TypeScript settings, never a `tsconfig.json` found above `design/`.
- Core's compile is factored into a compile-only entry with injected esbuild, scanner, stylesheet runner and file access, and nothing run at module load, so a Worker imports it from the published `spool.page` package.

Nothing the person sees on the canvas changes, apart from frames that reached plain-http addresses.

## User Stories

1. As a member of a team, I want a frame a teammate's agent wrote to be unable to reach `http://localhost` or my LAN, so that a hijacked agent can't use my canvas to probe my machine.
2. As a solo Spool user, I want the same https-only rule on my own frames, so that the rule doesn't depend on whether a project is a team project.
3. As an author, I want a frame to keep loading `https:` APIs, `data:` and `blob:` URLs and Spool's vendored libraries, so that nothing a normal prototype does breaks.
4. As an author whose frame called a local dev server over plain http, I want the refusal to be visible in the frame's logs with the address it refused, so that I know why the request failed.
5. As an agent, I want `spool skill` to say frames are https-only and that scenarios and mocks are the way to fake a backend, so that I don't write frames that call local servers.
6. As an agent running `spool shot`, I want the same CSP as the canvas, so that a shot never reaches what a frame on the canvas can't.
7. As a person playing a frame in the player, I want the same CSP there, so that the player can't be the gap.
8. As a member, I want the photo booth to photograph frames under the same CSP, so that taking a still never reaches a local address.
9. As a member, I want the daemon's font fetch to refuse `http:` URLs, so that a teammate's `shared/fonts.css` can't make my daemon call a plain-http server.
10. As a member, I want the font fetch to refuse hosts that resolve to loopback, link-local or private addresses, including after redirects, so that DNS tricks can't reach my network through Node.
11. As an author with a font on a public https URL, I want the font fetch to keep working, so that fonts don't regress.
12. As an author whose font URL was refused, I want the daemon to say which URL and why, so that I can fix `fonts.css`.
13. As a person on the canvas, I want class scanning to give the same stylesheet as today on my frames, so that switching scanners changes nothing I can see.
14. As the maintainer, I want a parity test between the JS scanner and Oxide over real frame sources, so that any difference is caught before release.
15. As the maintainer, I want the parity check to run again whenever the pinned Tailwind version moves, so that Spool keeps owning its scanner safely.
16. As a person on the canvas, I want class scanning to stay fast, so that a save still reaches the canvas in about the same time.
17. As a person whose repo has a `tsconfig.json` above `design/`, I want my frames to compile with Spool's own settings, so that what plays on my canvas plays the same in the cloud.
18. As a person whose frame changed output under the old tsconfig behaviour, I want `spool check` or the canvas to show the real error if pinning breaks it, so that I can fix the frame.
19. As Spool Cloud, I want to import core's compile from the published package and pass it esbuild-wasm, the JS scanner, a stylesheet runner and a file reader, so that I compile with core's own code rather than a copy.
20. As Spool Cloud, I want importing core's compile entry to run nothing at module load, so that a Worker starts within its limits.
21. As Spool Cloud, I want the compile to read only through the file access it's given, so that it compiles from source held in a Durable Object.
22. As Spool Cloud, I want the compile output for the same inputs to be byte-identical to the daemon's, so that "if it plays on your canvas, it plays in the cloud" holds by construction.
23. As Spool Cloud, I want both the publication compile and the canvas's frame-document compile available from the compile entry, so that members' live frames and outsiders' frames come from one pipeline.
24. As Spool Cloud, I want to know which `FORMAT_VERSION` the compile entry supports, so that the newest release plays older formats and refuses newer ones clearly.
25. As a member, I want my daemon's compile to keep using native esbuild, so that local speed doesn't regress.
26. As the maintainer, I want the frame CSP, the font-fetch rule and the pinned tsconfig noted in the changelog, so that people upgrading know what changed.
27. As the maintainer, I want `SECURITY.md` unchanged until team projects ship, so that it doesn't describe a product that doesn't exist yet.

## Implementation Decisions

- **Frame CSP.** Every document that runs frame code gets `connect-src`, `script-src` and `img-src` limited to `https:`, `data:`, `blob:` and the daemon's own vendored-library path. The import map's libraries are already https. Frames stay `sandbox="allow-scripts"` on `run.spool.localhost` with an opaque origin. The policy is the same for solo and team projects, and the parity law holds: a frame behaves as its bare document under the same policy, so exported documents carry it too.
- **Font fetch.** The daemon's web font fetch accepts `https:` only, resolves the host and refuses loopback, link-local, private and unique-local ranges (v4 and v6), checks each redirect hop the same way, and logs the refused URL with a reason. Relative `url()` fonts stay assets and are untouched.
- **One class scanner.** The JS class extractor proven in `spool-cloud/research/117-cloud-compile-recheck/` (missed nothing Oxide found across 2,383 files, one harmless extra candidate) moves into core and replaces Oxide in the daemon. It scans what core scans today, including stylesheets and JSON. Tailwind's own compile still builds the stylesheet. Local timing on canvases other than Liam's is checked before switching.
- **Pinned TypeScript settings.** Core passes its own compiler options to esbuild and never resolves a `tsconfig.json` from the file system above `design/`.
- **Compile-only entry.** A new export of the `spool.page` package. It takes injected dependencies (esbuild implementation, class scanner, stylesheet runner, file access, `importmap.json` library fetch) and returns compiled output plus its input hash. It covers the publication compile and the canvas's frame-document compile (dev dialect). Nothing runs at import. The daemon calls it with native esbuild and disk access; the Worker calls it with esbuild-wasm and Durable Object storage. This follows §6, items 1 to 7, of the recheck.
- **No change to the agent surface.** No new verb. The skill gains one paragraph on https-only frames and phone frames padding themselves with `env(safe-area-inset-*)` (Prototype a shared link on a phone (#16)).
- **Changesets.** The CSP, the font rule, the scanner swap and the pinned tsconfig change published behaviour, so each lands with a changeset per `docs/releases.md`.
- **Public or private.** This is work on the published product. It's written here first. Whether it moves to public GitHub issues is decided before anything is posted.

## Testing Decisions

- Test what a frame, a person or the cloud can observe, never how the scanner or compile is put together inside.
- **Frame CSP:** browser tests that load a frame on the canvas, in the player and through `spool shot` against a local plain-http server and assert the request never arrives, while an https request, a `data:` image and a vendored library still load. Prior art: the daemon's security browser tests and security matrix.
- **Font fetch:** daemon tests that point `shared/fonts.css` at `http:`, loopback, private and redirect-to-private URLs and assert nothing is fetched and the reason is logged. Prior art: the existing web fonts tests.
- **Scanner parity:** a test that runs both scanners over the repo's own `design/` and the fixtures and asserts the same candidate set (allowing the documented extra), and the same stylesheet bytes. Prior art: the Tailwind tests.
- **Pinned tsconfig:** a compile test with a hostile `tsconfig.json` above `design/` that asserts output equals output with none. Prior art: compile and player-compile tests.
- **Compile entry:** a test that imports only the compile entry with injected in-memory file access and wasm esbuild, compiles fixture frames and asserts byte equality with the daemon's compile of the same files. The Worker-side run is covered in the cloud compile spec.
- Run `pnpm test`, `pnpm typecheck` and `pnpm check`.

## Out of Scope

- Anything in spool-cloud: the compile Durable Object and serving are in the cloud compile spec.
- Signed saves and end-to-end encryption (Idea: signed saves on team projects (#40)).
- Changes to agent permissions. Spool's spawned agent keeps what it has.
- Spool's player giving phone frames iOS push, pop and edge swipe by default.
- The `SECURITY.md` team-project paragraph, which ships with team projects.

## Further Notes

- Sources: Decide what a teammate's files may do on your machine (#21), Decide what the cloud builds and serves (#18), Decide where the cloud compile runs (#56), Research: cloud compile on Cloudflare itself (#41).
- #56 left these unchecked, and this spec must check them: the JS scanner's local speed, whether it holds on canvases other than Liam's, and the frame-document compile running in a Worker.
- Part of Wayfinder map: Spool Cloud for teams (#3).

*From Linear DEV-175.*

Related: #56, #41, #40, #21, #18, #16

Plane: SPOOL-61

## Comments

### agent, 2026-10-18T17:43:58.696Z

**Liam, 2026-10-06:** Done. #66 and #67 shipped in spool.page 0.28.0. Frames are https-only, and core's compile runs in a Worker as spool.page/compile. The scanner timing and the two open choices (no library fetch for now, scanner cost accepted) are on #67.
