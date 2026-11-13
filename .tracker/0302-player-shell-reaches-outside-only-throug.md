# #302 · Player shell reaches outside only through its host

- State: closed (done: merged to main)
- Labels: ready-for-agent, enhancement
- Parent: #300
- Created: 2026-11-11T21:22:56.753Z
- Updated: 2026-11-12T18:05:14.433Z
- Closed: 2026-11-12T18:05:14.433Z

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

## Comments

### agent, 2026-11-12T18:05:14.433Z

Merged to main in 4d107b4e (task 619). Done: the shell core (src/runtime/player-shell.tsx) reaches outside only through its host; the live host is player-shell-runtime.tsx; parity and play suites pass unchanged. After review the start size and its memory became the host's.

Builder's handoff:

# t302 — spool#302 the player shell reaches outside only through its host

Commit: `8f6065e2 player: the shell core reaches outside only through its host, the live host boots it` (one commit; no changeset, internals only).

## Files

- **Shell core: `src/runtime/player-shell.tsx`** (was most of `player-shell-runtime.tsx`). Holds `createPlayerShell` (the port protocol, reveal gates, geometry revisions, played box, controller, recorder wiring), the iframe + `Arrival` + error page, and `mountPlayerShell(root, config, host)`. It also owns the window `resize` replay now. Imports only react, `../brand`, clipboard-host/protocol, player-chrome, player-fit, player-page (type only), player-recorder, player-size-model, record-protocol. I checked with an esbuild metafile: its whole import graph has no daemon module and nothing that fetches.
- **Live host: `src/runtime/player-shell-runtime.tsx`** (still the vendor/tsup entry served as `/player-assets/player-shell.js`, still exports `bootPlayerShell(config)`). Holds `ShellConfig` (the served `window.__SPOOL_SHELL__` JSON, which extends `PlayerShellConfig` with `scenario`, `controlToken`, `record`), and `liveHost(config)`. That covers the bridge geometry (the `spool-player-geometry[-pending|-request]` window events of the inline bridge in `src/daemon/app.ts`), walks (the `spool-player-walked` event), close (`window.close`, then `/p/<project>`), handoff repair (sessionStorage cooldown reload), the bare player URL, recording against `/api/p/<project>/record` with the control token, and `deskWindow()` (the Mac window bridge, shape unchanged: `restored`, `reset`).
- `src/runtime/player-chrome.tsx`: `Player` takes the desk as a prop (`desk?: DeskWindow`) and no longer calls `deskWindow()` itself. `PlayerController.close` is optional: without it there is no close button and the leave chord does nothing.
- `src/runtime/frame-runtime.ts`: the bare render-origin player passes `desk: deskWindow() ?? undefined`, so it behaves as before.
- `src/ui/viewer/viewer-player.tsx`: types its controller as having `close` (type only).
- The inline geometry bridge in `src/daemon/app.ts` is unchanged. It is the live host's daemon half, and spool#303 is where it changes.

## Host interface as it now stands (`src/runtime/player-shell.tsx`)

```ts
interface PlayerShellConfig {          // the live config extends this; `frames` is rewritten in place to played boxes
	project: string;                   // names the bar and the iframe
	start: string;                     // the screen it opens on
	frames: Record<string, { w: number; h: number }>; // authored boxes known at boot
	innerUrl: string;                  // the played document (iframe src, sandbox="allow-scripts")
}

interface PlayerShellHost {
	geometry: PlayerGeometrySource;    // required; nothing is revealed before the first `applied`
	close?(): void;                    // absent: no close button, leave chord/“player-key leave” ignored
	walked?(from: string, to: string): void; // absent: walks unreported
	repair?: PlayerShellRepair;        // absent: a rejected handoff shows as the load error
	barePlayer?: string;               // absent: the load error offers no “open the bare player”
	record?: PlayerShellRecording;     // absent: no Record on the bar, no recorder
	desk?: DeskWindow;                 // the Mac play window; absent: the tab bar
}

interface PlayerGeometrySource {
	follow(sink: PlayerGeometrySink): () => void; // called once at create; the returned stop runs on destroy
	refresh(): void;                   // called when the played document connects; answer via the sink at a newer revision
}
interface PlayerGeometrySink {
	pending(revision: number): void;
	applied(revision: number, frames: { name: string; w: number; h: number }[]): void; // authored boxes
}
interface PlayerShellRepair { attempt(): boolean; settled(): void; }
interface PlayerShellRecording {
	opening: "ready" | "arm" | { start: ClipAspect };
	scenario: string;
	reopen(frame: string, aspect: ClipAspect): void;
	render(body: object, progress: (done: number) => void): Promise<Blob>;
	download(clip: Blob, name: string): void;
}

createPlayerShell(config, host, played: () => HTMLIFrameElement | null): PlayerShell
mountPlayerShell(root: HTMLElement, config: PlayerShellConfig, host: PlayerShellHost): PlayerShell
PlayerShell = { controller, recorder?, shaped(), view(), loaded(), destroy() }
```

For spool#304, the export host is: `geometry` with fixed frames, where `follow` keeps the sink and `refresh` calls `sink.applied(++n, frames)`. It offers no `close`, `walked`, `repair`, `barePlayer`, `record` or `desk`. It boots with `mountPlayerShell(root, { project, start, frames, innerUrl }, exportHost)`. The bar then shows the name and the size pill, with no record and no close. Copy link is already off in the shell (`linkable` is never passed), and the player has no comments.

## Deviations, and notes for the next tickets

- `geometryPending`, `geometryApplied` and `geometryReplay` are no longer public on `PlayerShell`. Geometry now comes in only through `host.geometry`, and the resize replay is internal.
- The bare player URL used to be worked out when the boot deadline fired. Now the live host works it out once, at boot. The input is the same and so is the result.
- Not built, left for spool#304:
  - The touch rule (no bar, no grips, the frame fills the viewport). The natural shape is a `Player` / `mountPlayerShell` option that drops the bar, plus `playRoom` without the 30px bar.
  - A `srcdoc` inner document. `innerUrl` is a URL today; an export can use a blob URL or widen this field.
- The parity tests read `window.__SPOOL_SHELL__.frames` to see the played boxes. That still works because the live host hands the served config object itself to the core, which rewrites `frames` in place, as before.
- Possible merge with spool#301: mark call sites that 301 adds in the old `player-shell-runtime.tsx` (reveal or paint) now belong in `player-shell.tsx` (`reconcileVisibility` and `mountPlayerShell`). A desk-only mark goes through `host.desk` / `deskWindow()` in the live host.

## Checks

- `pnpm typecheck`: passes. `pnpm check`: passes.
- `pnpm test:changed`: 23 files and 193 tests pass, `player-parity-browser`, `player-runtime` and `player-page` among them.
- `pnpm vitest run` on these 14 files (108 tests in the first 13, 37 in verbs), all passing unchanged: play-tab-browser, play-serve, security-matrix, geometry-browser, frame-themes-browser, clipboard-browser, security-browser, record-browser, record-sound-browser, html-export-browser, viewer-browser, phone-browser, viewer-outsider-browser, verbs.
- Not run: the full `pnpm test`, and anything under desktop/ (not touched).

## Open questions

None.
