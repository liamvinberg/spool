# #355 · Prior art for the frame language: what to take from where

- State: closed
- Labels: wayfinder:research
- Parent: #333
- Created: 2026-11-14T09:22:09.106Z
- Updated: 2026-11-14T09:56:23.822Z
- Closed: 2026-11-14T09:56:23.822Z

## What this decides
What our frame language takes from the languages and tools that came before, so it is not invented from nothing. Liam, 2026-11-14: "there are many languages so make sure you understand them internally and so we can take pieces from the best things into our language"; "explore deep dive so we actually dont just start from scratch, we can probably use things to make our language, which is made for showing things live on a creative canvas"; "we probably dont have to overengineer things so go with what you recommend".

Three parts, one researcher each, notes in `~/.brain-archive/spool-foundation/research/`:
- **A** `language-prior-art-ui.md`: what to take from interface, design and motion languages and tools, feature by feature (components, states, hover, motion, time, layout, text, paint, data, dragging, navigation, tokens, frames inside frames), ending in a feature map and a leave-out list.
- **B** `language-prior-art-engineering.md`: how to build a small language well (not general-purpose by design, types for units and colours, error messages, syntax trees that keep every character, one formatter, merging by meaning, incremental work, one Rust implementation for the command line and the browser, evolving without breaking files, models learning it, releasing it).
- **C** `language-prior-art-drawing.md`: who draws frames written in our language, the browser or a renderer of our own in Rust, now that frames need not be web code; ends in the spikes worth measuring.

## Where it lands
Feeds #342 (what a frame is), #344 (how the canvas is drawn) and #345 (language and shell). Likely next after it: a written design of the language's first version proven on Liam's own landing page and the `sys-alive` deck, and a measured spike of drawing the language natively against the browser.

## Standing so far (Liam, 2026-11-14)
- Our own language is the direction, with porting and redoing things to fit it; the typed-and-braced look in the style of Rust and Swift is the starting point, the syntax still open to what this research finds; the line-based look is dropped.
- It may be released for others later, so it is kept as its own piece from the start.
- The landing pages of #354 were all poor in his eyes, TSX included: the language did not make design worse, and good design has to come from direction, the design system and the model, not the syntax.

## Comments

### agent, 2026-11-14T09:36:02.104Z

**Part D added, 2026-11-14** (worker lang-D-634, notes `research/native-app.md`): should the app itself be native in Rust, and on what. Liam: "maybe we need to rethink the wayfinder and do a grilling session on it, if we should built our app in rust, or like native. maybe we should research this, something like https://github.com/anomalyco/rune or if there is something else?" Rune is Anomaly's Rust UI framework (own renderer on wgpu, Parley text, Taffy layout, springs, runs headless for agents, targets macOS, Windows, Linux and the web; MIT, pre-release, about three weeks public). The researcher reads its source and its research folder, compares GPUI, Slint, Makepad, Blitz, Tauri and Electron with Rust inside, and ends in the spikes worth measuring.

**Also from Liam, same message:** move this work to the spool-next channel, with an orchestrator that starts tasks to resolve the map, and rethink the map with a grilling session on it. Plan: when A to D are in, re-chart the map in spool-next's own tracker around the new premise (frames in our own language), hand this thread over to a brain task there, and let the map's autopilot start its research and spike tickets.

### agent, 2026-11-14T09:56:23.822Z

**Judged and closed by task 634, 2026-11-14.** Four notes in `~/.brain-archive/spool-foundation/research/`: `language-prior-art-ui.md`, `language-prior-art-engineering.md`, `language-prior-art-drawing.md`, `native-app.md`.

What I take from them:
- **The language (A).** Keep it typed, named data; never executable UI code. A 13-row feature map says what goes in first and whose design each part follows: parts with named slots and typed events (Compose, Svelte, SwiftUI, Slint); local state, derived values, variants and flat state machines (Elm, XState's rules without its actors); hover, pressed and focus as looks the runtime owns; interruptible transitions and springs, enter and exit, seekable timelines (Compose, Theatre, Remotion); owned delays and repeats with no timer API; stacks, grids, free placement, scroll and sticky in Figma's hug and fill words; styled text runs; gradients, side borders, masks, blur; keyed data and fixtures; declared slider, drag, resize and reorder; navigation; tokens and modes; one live frame inside another. The code box is for arbitrary algorithms, canvas and WebGL, 3D, media and libraries, not for "everything hard". Blood has only an author's announcement; nothing to build on.
- **Building it (B).** A checked data language, not a smaller Rust. One Rust core (hand-written recovering parser, Rowan lossless tree so a hand edit rewrites only that property's bytes, checker with structured fixes) for the command line and, as WebAssembly, the browser; one formatter; merge by stable names and properties; plain caching first; meaning before syntax; an eight-step build order with gates.
- **Who draws (C) and what the app is built on (D).** Both researchers, separately, lean to the browser's DOM for live frames plus GPU pictures far out, in Electron and the hosted browser, with Rust for the language core, engine and tools. A renderer or native app of our own is possible now that frames are not web code, and its real costs are text editing in many scripts, accessibility, code boxes in z-order and matching the React export, not drawing rectangles. Rune (Kit Langton's, MIT, pre-release, three weeks public, no outside pull requests) is real code and immature: learn from it and measure one bounded slice; do not build on it blind.
- **Spikes they propose,** on the m1 against the budget: the DOM baseline with frames of real weight; HTML-in-Canvas for frames in our language; far pictures drawn straight from the language's model by a Rust and WebAssembly renderer; a native slice on a pinned Rune with a real code box and a hosted counterpart.

Nothing here is decided: it is the input to the re-charted map in spool-next (handoff: `~/.brain-archive/spool-foundation/handoff-to-spool-next.md`).
