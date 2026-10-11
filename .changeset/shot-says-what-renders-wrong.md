---
"spool.page": minor
---

`spool shot` and `spool logs` now tell you more about a frame that renders wrong. An uncaught error shows its stack pointing at your own .tsx files and lines. React errors come in words instead of a number, because the boot runs React's development build. A Tailwind class that no stylesheet built, such as `bg-white` after your tokens reset the colours, is listed in one line. So is a WebGL context that was lost, and WebGL that ran in software. `shot --at` now moves the frame's own clocks to that moment instead of waiting, so the same `--at` gives the same picture every time.
