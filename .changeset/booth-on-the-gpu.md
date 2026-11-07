---
"spool.page": patch
---

Frame covers on Linux and Windows are drawn on the machine's GPU instead of the CPU, so they come faster, cost the machine far less, and show WebGL and blurred backdrops as a browser window does. Where no GPU can draw, spool check no longer calls a frame slow from a timing taken in software. Set `SPOOL_BOOTH_GPU=0` to keep covers on the CPU.
