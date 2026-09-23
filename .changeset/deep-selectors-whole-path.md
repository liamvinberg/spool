---
"spool.page": patch
---

Selecting an element deep in a frame that draws the same markup more than once, like a card repeated down a page, now selects the copy you clicked instead of the first one. To tell the copies apart, an element's selector now runs all the way up to the top of the frame instead of stopping after eight steps. So selectors for deep elements are longer than before, including the ones agents read from the selection. Selectors for elements near the top are unchanged.
