# spool#219: other engines for frames

Throwaway spike. Nothing here merges into spool.

**Answer: stay on Chromium and TSX.** Blitz is worth watching, and could later render cheap stills of frames that aren't live. Don't build our own engine.

## What was tried

- **Chromium**: today's engine, the baseline.
- **Servo 0.7**: a whole browser engine in Rust, run as `servoshell` and driven by WebDriver.
- **Blitz** (the engine under Dioxus Native, 0.3.0-beta.4), tried three ways:
  - **Blitz + Boa**: Boa is a small JavaScript engine in Rust. This runs the same TSX frame as Chromium does (`blitz/s219_js_shot.rs`).
  - **Blitz static**: draws Chromium's DOM snapshot of a frame, with no JS. This shows whether Blitz can draw a frame when running it isn't the problem (`blitz/s219_shot.rs`).
  - **Blitz RSX**: RSX is Dioxus's markup, written in Rust (`blitz/s219_rsx.rs`).
- **Own engine**: React with a custom reconciler (the part of React that applies changes to a target), Yoga layout and Skia painting through CanvasKit. Frames are written with React Native-style primitives such as `View` and `Text` (`own/`).

## Fidelity

`capture.mjs` and `compare.mjs` measure fidelity: the share of pixels that differ from live Chromium, across 17 real `design/` frames rendered as stills. The raw numbers are in `shots/fidelity.json`.

The control is Chromium re-drawing its own snapshot. Wherever the control is off too (spool-home, project-entry, site/card), the difference comes from the frame itself, not the engine.

- **App frames**: all three engines are within 1% on 11 of 13.
- **Servo**:
  - Drops scaled mini-frames: spool-phone is 18.8% off.
  - Times out on site/landing.
  - Throws `uncaught exception: undefined` on every page.
- **Blitz static**: draws what it's given nearly as well as Chromium.
- **Blitz + Boa**: renders 13 of 17 frames. Four die with an empty root:
  - card, project-entry, fair-now and landing.
  - The errors are silent: `Image is not defined` (shimmed) and Boa's `not a callable function`.
  - The scenario fetch also fails on every frame.
- **CSS that design/ uses**: Blitz can't do all of it yet, so a still hides gaps that a live frame would show.
  - Used by all 17 frames: `color-mix`, `@property`, `:is`/`:where`, `@supports`.
  - Used by 14 of 17: `:has`, `overflow: auto` (unsupported in Blitz), `backdrop-filter` (only on Blitz's Skia backend).
  - Used by 9 of 17: `position: sticky` (still in progress in Blitz).

## Feel and cost

`feel.mjs` and `blitz/s219_feel.rs` measure feel and cost. The test card is `anim.html`: a spinner, a pulsing bar, a bar that changes width every frame (forcing layout) and bobbing dots. It ran 1, 10 and 30 times, with CPU rendering everywhere, on devobee.

| Engine | Cards | CPU (cores) | Memory | Notes |
| --- | --- | --- | --- | --- |
| Chromium | 1 | 0.38 | 241 MB | iframes |
| Chromium | 10 | 5.6 | 366 MB | iframes |
| Chromium | 30 | 11.4 | 499 MB | iframes |
| Servo | 1 | 0.25 | 94 MB | frame rate not measured, may be throttled headless |
| Servo | 10 | 0.85 | 108 MB | |
| Servo | 30 | 1.4 | 127 MB | |
| Blitz | 1 | 0.8 | 21 MB | 6.7 ms per tick, one thread |
| Blitz | 10 | 2.5 | 32 MB | 48 ms per tick, so about 20 fps |
| Blitz | 30 | 2.1 | 53 MB | 213 ms per tick, so about 5 fps |
| Own engine | 10 | 3.7 | 536 MB | about 7 fps, the whole tree re-laid out every frame |

Notes on the table:

- Blitz costs 1.2 to 1.9 MB per extra document.
- Blitz is single-threaded and CPU-painted here. Its GPU painter and threads would change the frame times, not the memory.

Cold start:

- **Chromium**: loads a frame in 90 to 1400 ms.
- **Servo**: loads a frame in 100 to 1100 ms.
- **Blitz static**: about 15 ms per document in a warm process.
- **Blitz + Boa**: 0.2 to 1.3 s of script work before the root fills, and 9 to 16 s the first time the modules are fetched.

## Agent design quality

Two briefs went to designer agents in three media:

- Hush, a Now Playing screen at 1440x900.
- Skärgårdsbåt, a ferry check-in on a 390x844 phone.

The media were TSX in spool, RSX in Blitz, and the own engine. The blind boards are in `shots/board-*.png`, lettered A, B and C, with the letters shuffled per brief. The key stays out of the repo.

Problems each medium caused, as the agents reported them:

- **TSX in spool**:
  - `shot` can't click, so interactions needed Playwright.
  - The two frames shared `tokens.css` and overwrote each other's styles.
- **RSX in Blitz**:
  - Only system fonts were available.
  - `filter: blur`, `backdrop-filter` and `background-clip: text` don't draw.
  - Gradient masks band.
  - An invisible overlay swallowed clicks.
- **Own engine**:
  - With no transitions, every animation is hand-written per frame.
  - Dashed borders came out solid.
  - Animation ran at 7 to 9 fps.
  - React only resolved through a symlink.

## Porting a frame into a product

- **TSX on Chromium**: the frame is already React and DOM, the same as the web products. It ports by copying.
- **Blitz + Boa**: ports the same way, because it runs the same TSX. RSX ports only into Dioxus or other Rust apps.
- **Own engine**: ports almost directly into React Native. For the web it needs react-native-web or a rewrite. Every CSS feature design/ leans on would have to be rebuilt first, such as transitions, `:has`, sticky and backdrop blur.

## Reproduce

These scripts need the isolated daemon on 7891, Servo, and the Blitz checkout under `/tmp/s219`.

- **Fidelity**: `node capture.mjs <frames>`, then `node compare.mjs`.
- **Feel**: `node feel.mjs <chromium|servo|own> <N>`.
- **Blitz examples**: copy `blitz/*.rs` into Blitz's `examples/` and add `blitz-test-harness` to its dev-dependencies.
