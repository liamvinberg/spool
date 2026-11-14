# #338 · How a design can be written: formats that agents and people can both work in

- State: closed
- Labels: wayfinder:research
- Parent: #333
- Created: 2026-11-13T14:47:11.011Z
- Updated: 2026-11-13T15:01:57.010Z
- Closed: 2026-11-13T15:01:57.010Z

## Question

If a frame were not TSX, what could it be? What have others built, and what do agents write well?

Liam: "Maybe it isnt tsx, maybe we write our own language ive been considering this"; "probably fully agent native ... but ... you can like atleast edit text"; "something people from figma can port to"; and the kinds of work he names: apps, websites, slides, posters, illustration boards.

Cover, from primary sources: plain HTML and CSS; JSX/TSX as today; scene formats (Figma's node tree and its REST/plugin model, Penpot's file format, tldraw's shapes and store, Excalidraw's JSON); declarative UI languages (SwiftUI, Compose, Flutter widgets, QML, Slint, Typst for documents); formats made for models to write (json-render, Vercel's AI SDK UI schemas, Open-UI style DSLs, Subframe, Onlook, Pencil's `.pen`, Paper's format, anything measured on how reliably models write them); Rive and Lottie for motion. For each: can it hold real interaction and state, can a person edit text or move a thing by hand and have it written back, how it is drawn (needs a browser or not), how it diffs and merges, how it would import from Figma, and what is known about how well models write it against how well they write React.

End with the two or three candidates worth putting beside TSX in a spike, and say plainly what each would give up.

Notes to `~/.brain-archive/spool-foundation/research/frame-formats.md`.

## Comments

### agent, 2026-11-13T14:47:31.876Z

Being researched by a worker of task 634 since 2026-11-13; its notes land in ~/.brain-archive/spool-foundation/research/.

### agent, 2026-11-13T15:01:57.010Z

Notes: `~/.brain-archive/spool-foundation/research/frame-formats.md`.

**What it found.** What a frame is written in and what draws it are two separate choices: a JSON scene can still be drawn by React (tldraw), and a markup can compile to a native runtime (Rive's RML). No one has published a controlled comparison of how well today's models write these formats against React on work like spool's; the nearest (DesignBench, 2025 models) found plain HTML and CSS reproduces a screenshot better than React, and says nothing about interactive apps. Editing by hand does not need a new language: Onlook maps drawn elements back to React source, and it gets hard exactly where text is computed or layout is generated. Scene formats (Figma, Penpot, Excalidraw, Pencil) give explicit objects a hand can move, but not working apps, and open JSON does not merge by itself (Pencil's own docs say pick a version and redo the edits). Catalog languages made for models (json-render, OpenUI) now hold state and actions, bounded by their catalog of components. Rive's RML is the closest precedent for a source format with scenes, motion and state machines plus a CLI an agent can test with.

**Candidates for the spike (#341), beside TSX:** plain HTML and CSS with a small behaviour layer; a catalog-based declarative format (OpenUI or json-render); Rive RML. And, added by the map because it is what Liam asked: a small language of our own, shaped from what these three teach.
