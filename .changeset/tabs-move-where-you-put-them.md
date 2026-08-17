---
"spool.page": patch
---

Project tabs drag sideways into the order you want, the way a browser's do: the tab follows the pointer, the others step aside for it, and the arrangement is written to the machine session so it survives a reload. `PUT /api/session/order` is how a page says it, and it opens and closes nothing — a tab the list never names stays exactly where it is.
