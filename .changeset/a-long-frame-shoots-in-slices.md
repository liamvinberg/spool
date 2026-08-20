---
"spool.page": patch
---

`spool shot` now writes a frame much taller than a screen as numbered slices, `<frame>.1.png` through `<frame>.N.png`, printing one path per line. One screenshot of a long page spends its whole area on height, and whatever reads it downscales the text into mush; each slice stays near what a vision model actually keeps, with a small overlap so no line is halved by a cut. Device scale follows the frame the same way: 2× for narrow frames, tapering above 800px wide instead of capturing pixels the reader was always going to throw away. A rerun that writes fewer files removes the slices it no longer names.
