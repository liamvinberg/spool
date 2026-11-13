# #304 · Exported HTML opens in the player

- State: closed (done: merged to main)
- Labels: ready-for-agent, enhancement
- Parent: #300
- Blocked by: #302, #303
- Created: 2026-11-11T21:22:56.788Z
- Updated: 2026-11-12T18:05:15.495Z
- Closed: 2026-11-12T18:05:15.495Z

## Parent

#300

## What to build

An exported HTML file opens in spool's player.

**In the export dialog**, the HTML choice gets one row: a "With player" switch, on by default, with the line "Anyone can resize it in the browser." under it ("Opens as the frame alone." when off). The choice is remembered the way the dialog remembers its others. The daemon's HTML export takes a player flag; absent means without, so nothing else changes.

**The file, with player:**
- Outer document: the player shell with a new **export host** (fixed geometry baked into the file, no walk reporting, no repair, no recorder). Inner document: the packed composition export builds today, booted the way the live player's inner document is, inside a sandboxed iframe, so the frame has a real viewport and responds to its size.
- The bar is what the live bar is in a browser tab, minus record, close, copy link and comments. Name on the left, size pill in the centre.
- It opens at As drawn, scaled down to fit a smaller window. The pill's menu has the same six rows; "Window" is the viewer's own browser window. The edges pull with the same pill, readout, ticks and snapping. This must be the live player's code, not a copy.
- Links between exported frames walk as they do today, with their transitions. External links open in a new tab.
- When the viewer's primary input is touch, there is no bar and no grips and the frame fills the viewport. This rule is the export host's only; the live player keeps its bar at narrow widths.
- It works opened from disk with the network off, in Chrome, Safari and Firefox, wherever today's export does.
- Keep the file lean: do not carry React twice if one copy can serve both documents without contortions. Report the size with and without the player.

**Without player**, the file is exactly what export produces today.

**The look is decided.** Liam approved it on the canvas. The frames, marked To build, are `design/frames/app/spool-canvas--export*` (the dialog with the switch) and `design/frames/app/spool-exported`, `--size-menu`, `--size-drag`, `--phone`. Build to match them. If the code ends up drawing something they do not show, redraw the frame and say so.

Turned down: always wrapping exports in the player; a separate lighter player for exports; hiding the bar by default.

## Acceptance criteria

- [ ] Exporting HTML with the switch on gives a file that opens from disk, network off, in the player.
- [ ] Picking a preset or pulling an edge changes the frame's own viewport, so a media query in the frame responds.
- [ ] A flow of several frames walks inside the player with its transitions.
- [ ] With a touch primary input there is no bar and the frame fills the screen.
- [ ] No record, close, copy link or comments anywhere in the file.
- [ ] With the switch off, the output is unchanged from today.
- [ ] The existing export browser test is extended to prove the above once each; the shell core is shared with the live player, with no duplicated chrome or sizing code.
- [ ] The canvas frames match what ships and their To build row in design/AGENTS.md is removed.
- [ ] GLOSSARY.md's Player and Edge bar entries are true again (Player still says "without scaling").
- [ ] A changeset.

## Comments

### agent, 2026-11-12T18:05:15.495Z

Merged to main in 4d107b4e (task 619). Done: With player switch (on by default, remembered); the file opens from disk with the network refused in Chromium, Firefox and WebKit, real Safari checked by hand; presets and edge pull change the frame's own viewport; flows walk; touch gets no bar; no record, close, copy link or comments; switch off is byte-identical. File 596 KB with player vs 1.31 MB without (React carried once). After review: an export always opens As drawn and remembers nothing; GLOSSARY's Player and Edge bar entries rewritten; design/AGENTS.md's To build row removed.

Builder's handoff:

# t304: exported HTML opens in the player (spool#304, spec spool#300)

Branch `619-implement-spec-300-when-every-ticket-has--spec-619-t304`, on 36abe3a7. Everything is committed.

## Open questions (none block; each has a recommendation)

1. **When the bar is left out on a phone.** The bar is left out when `(pointer: coarse)` matches, checked once at boot. Then there is no bar and the frame is the whole window. The design only shows "a phone". Viewport width was the other way to decide. It would also strip the bar from a narrow desktop window, where the size list is still useful. Recommendation: keep coarse pointer.
2. **Links out of the exported player open in a new tab** (`noopener`), so the walk keeps its place. The frame alone (no player) still navigates in place, as before. The spec doesn't say. Recommendation: keep it.
3. **The exported file's address carries `?frame=<name>`**, the same as the live tab's history. The frame bar and title follow the walk (`pricing · proj`). This matches the `browser-tab` file address drawn in `spool-exported`.

## What was built

- **The shell's core** is `src/runtime/player-shell.tsx`. `PlayerShellConfig.innerUrl` is now optional, and a new `innerDocument` plays a document from text through `srcdoc`. `PlayerShellHost` gains:
  - `bare?: true`: no bar and no pull, the frame equals the window, `held.id = "window"`.
  - `popups?: true`: the iframe sandbox adds `allow-popups allow-popups-to-escape-sandbox`.
- `Player` in `player-chrome.tsx` takes `bar?: boolean`, and `playRoom(viewport, bar)` in `player-fit.ts` takes the same flag. The shell's core, chrome and sizing stay one copy.
- **The export host** is the new file `src/runtime/player-shell-export.tsx`. Its `bootExportedPlayer()`:
  - reads `window.__SPOOL_EXPORT__` `{project, start, frames}` (sizes baked into the file)
  - reads the `<template id="spool-played">` that holds the played document
  - reads the file's import map
  - has no daemon, no recording, no copy link, no close and no comments.

  It is a tsup entry, and `html-export.ts` (`exportShellJs`) bundles it with esbuild, leaving React to the import map.
- **`src/daemon/html-export.ts`:**
  - `html(..., { player })` → `playerDocument()`.
  - The chrome CSS is inlined with its italic font faces stripped.
  - The played document is the file without its player, with `__SPOOL_PLAY__` `shell: true, exported: {state}`.
  - React is carried once, as text. A tiny inline script builds the import map from it, so each React specifier points at one `data:` URL; before this, React's data URL was repeated 4×.
  - `player=0` output is byte-identical to the old export.
- **Links in the player:** `frame-runtime.ts` opens a link out with `window.open(..., "_blank", "noopener")` when both `exported` and `shell` are set. `SERVED_SCRIPT` accepts `about:srcdoc`.
- **Route:** `export-routes.ts` takes `player=0|1`; leaving it out means 0, so old callers get the old file.
- **Canvas:** `src/ui/canvas/export-menu.tsx` `PlayerRow`:
  - A `menuitemcheckbox` with a Switch, placed after the scope rows and before Export. Space flips it.
  - The line under it reads "Anyone can resize it in the browser." when on, and "Opens as the frame alone." when off.
  - The choice is remembered (`useRemembered("export.player", true)`), and kept only when exporting HTML.
- **Other:** `PLAYER_SHELL_PAGE_RULES` is named once in `src/daemon/play.ts`. The changeset is `.changeset/export-html-with-player.md` (minor).

## Commits

- 59c78684 player: a host can play its document from text, open tabs, and go without the bar
- 790cc7bb runtime: an exported frame in its player opens links in a new tab
- 86e2a8a5 daemon: name the player shell's page rules once
- 87eabc3e export: html with player, played by the shell's export host
- 55ecdbc6 canvas: export html with player, on by default and remembered
- 9422335b export: carry react once in a file with its player
- 1bcfb20c changeset: html export with its player

## File size

The sample was a two-frame flow: the tidemark landing from the design canvas, plus a small pricing frame. Sizes in bytes:

| scope | without player | with player |
|---|---|---|
| one frame | 1,307,934 | 595,792 |
| flow | 1,315,142 | 603,035 |

The file with the player is *smaller*. This is because it carries React once, rebuilding the map at load, while the plain export repeats React's data URL for each of its 4 specifiers. The plain export is left untouched by design (it stays byte-identical).

What the player adds:
- about 112 KB of chrome CSS, mostly the inlined Instrument Sans and Fragment Mono fonts
- about 74 KB of shell JS
- about 1 KB of glue

The same React-once trick would cut the plain export by about 0.7 MB. That is a candidate follow-up; I left it alone because the ticket asks for the old file unchanged.

## Tests and checks

- `src/daemon/html-export-browser.test.ts` gained one case ("opens in the player with the switch on…"). It runs in Chromium from `file://` with every outward request refused, and checks:
  - the bar name and the readout `1440 × 900 · 89%`
  - that there is no Record, `#spool-close`, `.spool-bar-copy` or comments (real selectors from `player-chrome.tsx`)
  - that choosing Phone sizes the inner `innerWidth` to 390, and its media query fires
  - that a link out opens a new page while the frame stays
  - the walk to the next frame
  - on touch (390×844, coarse pointer): no `.spool-top`, and the inner window is 390×844
  - that `player=0` equals the default output

  All 5 cases in the file pass.
- `context-menu.test.ts` covers the switch's lines, the toggle and the remembered choice.
- `pnpm typecheck`, `pnpm check` and `pnpm build` are clean.
- `pnpm test:changed`: 1204/1205 passed. The one failure was `src/runtime/deck/stage.test.ts` (WebGL slides, which this branch doesn't touch); it passes alone (7/7), so it is the load flake.
- The full `pnpm test` was not run; the brief asked for the touched suites.

## Cross-browser

- **Chromium, Firefox 151 and WebKit (playwright, Linux):**
  - Each opened from `file://` with all requests aborted, with no console errors and nothing asked of the network.
  - Readout 1280 × 720. Phone → `390 × 844 · phone`, inner width 390, the narrow layout shows.
  - Walked to pricing, and the title follows. A link out pops a new page and the frame stays.
  - On touch: no bar, and the frame fills 390×844.
  - Screenshots are in `/tmp/spec619-t304/x/{chromium,firefox,webkit}-{phone,pricing,touch}.png`. The script is `/tmp/spec619-t304/x/xbrowser.mjs`.
- **Real Safari on the m1, by hand:**
  - The file opened from disk with its bar and readout.
  - Picking Phone from the size list resized it to `390 × 844 · phone · 92%` with the phone layout.
  - Screenshots: `/tmp/spec619-t304/x/safari.png` and `safari-phone.png`.
  - The m1's network was **not** turned off, since that would cut the SSH link. Offline is proven by the WebKit run with every request refused.
  - A Safari window titled "landing · proj" (file since deleted) was left open on the m1. Cmd-W through cua-driver did not close it, and an osascript close hung on an automation prompt; I killed it.

## Design

- I compared the code with the frames by rendering:
  - `spool-exported` with `pnpm -s dev shot`
  - the export dialog, on and off, on a lane daemon (`/tmp/spec619-t304/x/dialog-on.png`, `dialog-off.png`)

  Both match `spool-exported` and `spool-canvas--export-choice`: the bar, the readout, the switch row placement, the copy and the switch off state. No frame was redrawn.
- The spool#304 "To build" row is removed from `design/AGENTS.md`. design/ is out of git; the save went to the team.

## Housekeeping

- The lane daemon (`/tmp/spec619-t304/state`, port 7841) is stopped.
- The sample project is in `/tmp/spec619-t304/proj`, registered only in that lane.
