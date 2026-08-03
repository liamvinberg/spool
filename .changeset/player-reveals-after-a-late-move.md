---
"spool.page": patch
---

Moving frames on the canvas while a play tab is mid-walk no longer leaves that tab stuck on a blank screen. The player holds the screen back until the frame is laid out at its new size, and it was waiting for a report about one particular move. A second move landing a moment later retired that report before it arrived, so nothing ever released the screen and the tab had to be reloaded.
