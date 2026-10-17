---
"spool.page": patch
---

The first play of a big project opens on its frame in about two seconds instead of waiting for every frame's styles to build. The other frames' styles keep building behind it, and walking to one that is not ready yet builds it first.
