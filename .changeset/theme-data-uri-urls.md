---
"spool.page": patch
---

A theme that draws grain or texture with an SVG data URI keeps its filters now. Spool used to rewrite the `url(#…)` inside the data URI as a file path, which broke the filter.
