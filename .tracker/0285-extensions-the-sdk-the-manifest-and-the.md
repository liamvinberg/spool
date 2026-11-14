# #285 · Extensions: the SDK, the manifest and the host on the daemon, frame and compile sides

- State: closed (superseded by the ground-up rebuild, map #333)
- Parent: #284
- Blocked by: #261
- Model: anthropic/claude-opus-5-5:xhigh
- Created: 2026-11-11T10:15:03.227Z
- Updated: 2026-11-13T14:47:31.161Z
- Closed: 2026-11-13T14:47:31.161Z

Part of #284 (the spec: read it first, it holds every decision).

## What to build

The skeleton every later ticket stands on: an extension, as a folder with a data manifest and parts, runs in the daemon, in frames and in the compiler, and spool can list it. No window part yet (the new window is another ticket) and no real feature yet (knobs moves next).

Read the spec's "An extension on disk", "Life of an extension", "Slots in this spec" (Frame, Daemon, Compile), "The SDK" and "The daemon". In short:

- **The SDK** as a public surface with explicit exports and one entry per part (`spool/sdk`, `/frame`, `/daemon`, `/compile`; `/window` arrives with the window host), resolvable from `extensions/` in the repo's builds and type checks.
- **The manifest**, `extension.json`: its shape, a reader that runs nothing, and refusals a person can read. Official extensions are found in `extensions/*/` at build time.
- **The host**: the registry, the states (off, waiting with a reason, running, failed with the error), activation that owns everything a part registers plus `effect()`, disposal in reverse that waits, an owner outliving what fills its slot, a piece missing from `adds` refused, a throw contained, lazy loading per part.
- **Daemon side**: one registrar for routes under `/x/<id>/` behind core's checks, verbs declared in the manifest (listed by `--help` with no daemon, run by the daemon part), lifecycle hooks, watches and jobs, all closed when the extension stops. The daemon refuses a part from inside a project or `design/` and loads parts only from spool's own package.
- **Frame side**: a frame part is loaded into the frame runtime, adds calls to the `spool` import with their types (an augmentable `SpoolUi`), gets boot data as a document boots, and declares each call's fallback. The `spool` module served to frames, the player, the HTML export and spool.page's viewer is built from core plus every official frame part; the types a project's frames are checked against too. Today that module leaves the repo by separate doors, and each must carry the parts: the package build (`tsup.config.ts`), the bundle a checkout makes on demand (`src/daemon/vendor.ts`), the import map (`src/daemon/vendor-pins.ts`), the modules embedded in an HTML export (`src/daemon/html-export.ts`), and the strings the cloud serves (`src/vendor-entry-build.ts`, the `spool.page/vendor` export). The types are a file copy today (`src/runtime/spool-public.ts` to `dist/spool-public.d.ts` in `package.json`'s build, and `src/check.ts` maps `spool` to one or the other), so the augmentations have to reach both.
- **Compile side**: a compile part is a pure, versioned transform, run by every compiler. Its id, its version and the order the parts apply in go into the compiler's identity, beside `COMPILE_REVISION` in `src/daemon/design-compile.ts`. That is a different thing from #261 (a cache hit that misses a newly added file), which is fixed before this ticket starts: build on that fix, do not redo it.
- **`spool extensions`**: lists what is there with each one's state and reason.
- **Settings from the manifest**: the registry is a closed, typed list today (`SettingKey = keyof typeof SETTINGS` in `src/settings/registry.ts`; `src/daemon/settings.ts` refuses a key it does not know). It is put together from core's list plus the official manifests at build time and stays typed. Each extension's on/off key is made the same way. Only `spool extensions` reads them in this ticket.
- **Lint**, in `pnpm check`: `extensions/**` imports only the SDK, its own files, npm packages and types from extensions named in `uses`; core never imports `extensions/**`.
- **The test kit** (`spool/sdk/test`): runs a part against a fake core. Start it here with the daemon, frame and compile sides.
- Rename the Chrome extension's folder `extension/` to `browser-extension/` (scripts, tsconfig, `AGENTS.md`, docs), so it does not sit beside `extensions/`. The glossary gains the spec's words.

Prove it with a fixture extension that lives with the tests and is never shipped: one route, one verb, one watch, one job, one frame call with a fallback, one compile transform.

## Decided, and turned down

- Parts are found by file name, never by `() => import()` in the manifest: every host bundles from the manifest, and import thunks drag one part into another's bundle (the spike, #259).
- The manifest is JSON, not TypeScript, so an extension that is off or not trusted can still be listed.
- No cloud part (#262). No veto, no configuration that runs code (#256).

## Where to start

The spike on the local branch `567-wayfinder-map-251-ticket-259-a`, `spikes/extension-core/` (`sdk/`, `core/manifests.ts`, `core/daemon/host.ts`, `core/frame/`, `core/compile.ts`): read it for shape, it was never reviewed. Its manifests are `extension.ts`; the spec chose JSON after it. The `spikes/` folder on main holds other spikes, not this one. Today's code, to be checked: how the daemon mounts routes and closes resources (`src/daemon/app.ts`), the CLI (`src/cli.ts`), the frame runtime and the public `spool` types (`src/runtime/frame-runtime.ts`, `src/runtime/spool-public.ts`), the vendored `spool` module (`src/daemon/vendor.ts`), the compiler and its cache key (`src/daemon/design-compile.ts`, `player-compile.ts`, `compile-host.ts`, the `./compile` package export), the experiments registry for how one declared list reaches every side (`src/settings/experiments.ts`). `~/.brain-archive/core-spec/refresh/scout-base.md` has these paths checked against main at 0.56.0, with line numbers.

## Leave alone

Today's window. Every existing route and frame call: nothing moves in this ticket. Team sync.

## Second review

Beside the standard review, an Opus reviewer (`anthropic/claude-opus-5-5:high`) reads this for the security line, which is not negotiable: nothing from a project or `design/` is ever loaded into the daemon, the compiler or (later) spool's window; a frame part runs only on the render origin and holds no daemon capability; an extension's route can never be reached around core's host, origin and capability checks.

## Done when

- The host's rules are proven as functions; the fixture extension is proven end to end on each of the three sides; the lint fails on a planted private import.
- `spool extensions` lists the fixture in a test and nothing in a shipped build.
- A frame that calls the fixture's call renders its fallback when the extension is off.
- Every existing suite passes untouched. `pnpm test:changed`, `pnpm typecheck`, `pnpm check`.

## Comments

### agent, 2026-11-13T14:47:31.161Z

Superseded on 2026-11-13: Liam decided to rebuild spool from the ground up in a new repo (task 634), so the new window is not built beside today's in this repo. The foundation is being decided on the map #333, and this page stays as evidence for its tickets (above all #350, the extension system on the new foundation). Nothing here was built.
