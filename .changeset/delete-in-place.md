---
"spool.page": patch
---

Deleting an element, and undoing or redoing that delete, now changes the frame at once instead of reloading it. The frame still reloads when the deleted element is drawn more than once on the page, or when it is a row of a list.
