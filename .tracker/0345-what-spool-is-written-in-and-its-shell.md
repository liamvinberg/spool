# #345 · What spool is written in, and its shell

- State: closed (moved to spool-next)
- Labels: wayfinder:grilling
- Parent: #333
- Blocked by: #335, #339, #344
- Created: 2026-11-13T14:47:11.090Z
- Updated: 2026-11-14T10:28:43.235Z
- Closed: 2026-11-14T10:28:43.235Z

## Question

Which languages, and which shell?

From the measurements, the engine research and the drawing decision: the engine (files, compile, sync, the CLI), the window, the renderer if it is separate, and the app around them. One language or two, and where the line between them is. Liam asked about Rust: answer it part by part, with what each part would gain in numbers and what it would cost in how fast agents can build and change it.

## Comments

### agent, 2026-11-14T09:54:46.381Z

For the shell and UI part of this choice: spool-next's design system (spool#353) has a candidate behaviour layer, UI SDK (https://github.com/vercel-labs/ui), which has adapters for React, Vue, Svelte, Solid and Web Components. It only applies if the UI is web tech. Details in the comment on #353.

### agent, 2026-11-14T10:28:43.235Z

Moved to spool-next#1, where it is recorded as decided by Liam on 2026-11-14: a browser shell (Electron plus a browser tab), Rust for the engine, sync and command line, TypeScript for the window, frames, extensions and the SDK. The Rust engine is measured in spool-next#6.
