---
"spool.page": patch
---

A slide readied ahead of its key is no longer laid out while it waits. It used to be laid out in the styles of the slide on screen, so a canvas that sizes itself to its box could grow without end, wiping its first frame and stalling the machine until its key. Decks with WebGL slides stepped with dropped frames because of it.
