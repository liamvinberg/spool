# #219 · Research: try other engines for frames, Blitz first, and whether to build our own

- State: open
- Labels: ready-for-agent
- Created: 2026-10-31T09:20:34.258Z
- Updated: 2026-10-31T10:09:57.071Z

## Why

Cata, task 323 (2026-10-31): try different engines for frames instead of assuming Chromium and TSX, and find out whether spool should build its own. Blitz first (his idea), but every angle. Task 323 ruled native renderers out on paper (partial CSS, frames would stop matching the app they port to), and this ticket tests that by running it rather than believing it.

## The question

For frames agents write and people feel, which engine gives the best mix of: how good the designs agents make are, how faithfully a frame matches what ships in a real app, how alive and fast it feels with many frames live, and how easily it ports into a product.

## Angles to try (at least)

- **Blitz / Dioxus Native** (Rust, wgpu via Vello): no JavaScript engine, so agents write RSX or plain HTML and CSS. Can agents design as well in it, and how much CSS that design/ frames use does it draw right?
- **Servo** embedded: a whole browser engine with JavaScript, so TSX could stay. Fidelity and speed against Chromium.
- **Our own engine**: React's reconciler driving our own GPU renderer for a subset of CSS (the React Native and react-native-skia shape), so agents keep writing TSX. What subset would design/ actually need, and what would it cost to own.
- **Chromium as it is**, as the baseline, with the best of what the loop (#218) finds.
- Anything else research turns up that fits.

## How to measure

- **Agent design quality**: the same briefs, given to the same designer agent in each medium, a few each. Screenshots side by side for Liam to judge blind; he is the measure here, not a number.
- **Fidelity**: real frames from spool's own design/ canvas rendered in each engine and diffed against Chromium.
- **Feel and cost**: frames per second and memory with many live animating frames, cold start, time from an edit to pixels.
- **Porting**: how a frame gets into a React app, a Rust app, a native app.

## Rules

- Throwaway spikes under `spikes/` on a spike branch; nothing touches the shipped core or merges to main. A winner becomes a proposal for Liam, then a candidate for #218's loop.
- Research before building: primary sources, current versions, what each engine supports today.
- Ends with a short report and a recommendation: stay, switch, or build our own, and why, with the screenshots.

Related: #218

## Comments

### agent, 2026-10-31T09:32:12.818Z

**Cata, task 323:** a frame isn't a whole browser, so our own engine may only need part of one, and Rust is interesting to him. For the own-engine angle, measure that subset from the real design/ frames: which layout, text, input, scroll, animation and CSS features they actually use and how often, and what a Rust engine covering that set would take.

### agent, 2026-10-31T10:09:57.071Z

Spike done (task 325), branch `325-research-task-for-spool-219-cata-s-idea`, report in `spikes/engines/README.md`.

Recommendation: stay on Chromium + TSX. Watch Blitz (1-2 MB per document against Chromium's hundreds, but no `overflow: auto`, sticky in progress, and Boa leaves 4 of 17 frames empty). Don't build our own engine (about 7 fps at 10 cards, and every CSS feature would have to be rebuilt). Blind design boards are waiting on Cata's pick. The key is in /tmp/s219/blind-key.json.
