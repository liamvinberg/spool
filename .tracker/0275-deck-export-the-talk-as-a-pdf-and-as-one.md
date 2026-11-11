# #275 · Deck: export the talk, as a PDF and as one HTML file that plays

- State: closed (landed on main)
- Labels: ready-for-agent
- Parent: #265
- Blocked by: #271, #269
- Created: 2026-11-10T18:08:54.191Z
- Updated: 2026-11-11T00:17:23.440Z
- Closed: 2026-11-11T00:17:23.440Z

## Parent

#265 (the spec; read it first). Added after the spec was published. Liam approved both halves in task 557: "can you send me the slides?" is the first thing a presenter hears, and he asked for a file people can step through themselves, full screen.

## What to build

On a deck page, the talk can be exported two ways. Both sit where export already sits: in the export menu when a deck page is open ("talk", with the format switch reading pdf or html, above the selection's own export) and in the deck page's row menu in Pages. No new surface and no dialog; follow the existing export steps and progress. The file is named after the page.

**As a PDF.** One page per slide, in the talk's order, each slide complete (its last beat), each page the slide's own size. spool already exports selected frames as a PDF, one page per frame, captured in the window (`src/ui/canvas/export-menu.tsx`, `frame-export.ts`, `frame-pdf.ts`). This is that export fed the talk's slides in order instead of a selection. A slide outside a talk already reads as its last beat, so the capture needs nothing new. A slide that fails to capture does not stop the export: its page is left out and the export's message names it.

**As one HTML file.** The talk as a single file that opens from disk with nothing behind it and plays like the room's screen: the stage from #269, scaled to fit the window on black, with the talk's keys (next, back, skip, Home, End, digits then Enter, restart), beats, carry between slides, and live slides that work. spool already exports a frame and the frames its links reach as one HTML file with React, the runtime, every stylesheet, font and image inside (`src/daemon/html-export.ts`, spool#239). This is that export composing the talk in deck mode instead of a flow.

- It opens on the first slide's first beat, showing that slide's still until the live slide replaces it, as the existing export does.
- In the file F toggles full screen (there is no room to freeze, so the key is free), and Esc leaves full screen. Black (B) stays. Swap, freeze, the presenter view and Tab's cue are not in the file; Tab still hands the keyboard to a live slide and Esc takes it back.
- A quiet line under the first slide, "→ next · F full screen", fades on the first key and never returns. Use the player's existing type and colours; nothing else of ours is ever drawn.
- The two hard requirements hold in the file: the next slide is ready before the key, and a broken slide never shows an error (it keeps the last picture and the next key moves on). A slide that does not compile at export time stops the HTML export with a message naming it, as the existing export does for a broken frame.
- The notes are not in the file. They are the presenter's own.
- Loose frames are never in either file.

## Decided, and turned down

- PDF: one page per slide, not one per beat: a build of five beats would be five nearly identical pages. Can be added later as a choice if asked for. No notes in it for now. Pictures, not live text: it uses the capture spool has.
- HTML: no presenter view and no second window in the file. It is for the person who was sent the slides, not for giving the talk; presenting is spool's job. No link or hosting either: playing a deck on spool.page is its own rollout (#262).

## Leave alone

Exporting a selection, a frame's flow, and a project, which must behave as today.

## Done when

- PDF, in a browser, on a fixture deck with a slide that has three beats and one loose frame: one page per slide in the talk's order, the three-beat slide shows its last beat, the loose frame is absent.
- HTML, in a browser, the exported file opened from disk with the network blocked: every key walks the talk, beats play, a shared element carries, the live slide takes clicks, the broken-on-mount slide of the hard fixture never shows an error, and no request leaves the page.
- With the experiment off both actions are absent.
- `pnpm test:changed`, `pnpm typecheck` and `pnpm check` pass.

## Comments

### agent, 2026-11-11T00:17:23.440Z

Landed on main at 01250faf, behind the experiment `deck`. The PDF has one page per slide at its last beat, and leaves out (and names) any slide that fails to capture. The HTML file is the stage composed into the one-file export: it plays from disk with the network blocked, F toggles full screen, and the hint fades on the first key. Open: files are named project-page, like every spool export, while the ticket says "named after the page" (a one-line change); the talk row has no design frame. Screenshots: /tmp/pi-orch/spec-575/handoffs/t275/.
