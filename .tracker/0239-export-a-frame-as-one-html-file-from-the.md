# #239 · Export a frame as one HTML file from the right-click menu

- State: closed (built and merged in task 452)
- Labels: ready-for-agent
- Created: 2026-11-07T18:59:34.283Z
- Updated: 2026-11-07T20:10:03.843Z
- Closed: 2026-11-07T20:10:03.843Z

## What

Export a frame as one self-contained HTML file from the right-click menu, through a new menu step: Export… turns the right-click menu itself into the export choice at the pointer, then into building, then into saved. Decided with Cata in task 452; design in the spool canvas `app/spool-canvas--export`, `--export-choice`, `--export-building`, `--export-saved`, `--export-single` (code `design/shared/ui/spool/export-menu/export-menu.tsx`).

## Decisions

1. The right-click item is **Export…** for one frame and **Export N frames…** for several, with the last format as its meta (`png`, `pdf`, `html`). It always opens the choice; the old one-frame instant PNG and the PNG/PDF dialog go. The bare export key opens the same step at the selection.
2. The choice is the menu box itself, morphing (width and height ease, content cross-fades): a png/pdf/html segmented switch, then for html and a frame that links to others two radio rows, "This frame and the 4 it links to" / "Only this frame", and under them which frames need the internet ("card needs the internet to work"). Last row: **Export** with the file name as meta (its extension slides when the format changes) and ↵. Enter exports, Esc closes. The format is remembered per browser.
3. An HTML file holds what Play from here would play: the frame plus every frame its links reach (transitive, over the flow map's edges), or only the frame. Several frames selected: one file per frame, as PNG gives one image each; PDF stays one document.
4. The file opens as the bare frame filling the page at its authored width like the player's screen, no spool chrome, no watermark; `<meta name="generator" content="Spool">` in its head. It opens offline with nothing installed: React, spool's runtime, CSS, fonts, images and the default scenario are all inlined. Walks between the included frames work; a walk to a frame not in the file does nothing. The start frame's still shows first, and the live frame replaces it once it paints, so a preview that runs no scripts (Slack's) is never blank.
5. Frames that call a real API or load from the web only work online; the export goes ahead and the choice names them. It never refuses.
6. Building: the same box shrinks to one line, "Building kaffe-checkout.html", with a spinner and progress; it shows only what is true. Saved: a check, "Saved to Downloads", `kaffe-checkout.html · 420 KB`, and **Show in Finder** ↵ in the Mac app; a 6 s drain closes it, paused while hovered. In a plain browser it says Downloaded and has no Finder row. An error stays in the box with the message and Try again.
7. Mac canvas only (the daemon builds the file); free on every project.

## Contracts between the parts

- Daemon: `GET /api/p/:project/export/plan?frame=<name>` → `{ reach: string[] /* frames beyond the start, in walk order */, online: string[] /* frames among the start and its reach that need the internet */ }`. `GET /api/p/:project/export/html?frame=<name>&scope=flow|one` → `text/html` with `Content-Disposition: attachment; filename="<project>-<frame with / as ->.html"`.
- Mac app: canvas downloads of .png, .pdf and .html go straight to Downloads without a prompt, renamed `name (1).html` on a clash, and are reported over the bridge as `spoolCanvasWindow.onExportDownload(listener)` with `{ status: "completed", requested, filename, path } | { status: "failed", requested, message }` (`requested` is the file name the canvas asked for). `spoolCanvasWindow.revealDownload(path)` shows it in Finder, only for a path it saved.

## Acceptance

- [ ] An exported file opened from disk with the network off shows the frame and walks to the frames it links to
- [ ] Only this frame leaves the others out; a frame with no links shows no scope rows
- [ ] Frames needing the internet are named in the choice
- [ ] The still is in the file and shows before scripts run
- [ ] The menu step is a primitive in `src/ui/primitives/overlays.tsx` and the export menu is built on it
- [ ] Several frames give one HTML file each; PNG and PDF still work
- [ ] In the Mac app the file lands in Downloads and Show in Finder reveals it
- [ ] A changeset

## Comments

### agent, 2026-11-07T20:10:03.843Z

Built and merged in task 452 (main 1086297b): daemon export routes and one-file HTML (src/daemon/html-export.ts, export-routes.ts), the StepMenu primitive and export menu (src/ui/primitives/overlays.tsx, src/ui/canvas/export-menu.tsx), and the Mac app saving to Downloads with Show in Finder (desktop/src/project-download.ts). Checked on a real canvas, and the file in Safari on the m1. Open: the Mac app's smoke test on a Mac; a broken frame in the flow fails the whole export; PNG names are now <project>-<frame>.png.
