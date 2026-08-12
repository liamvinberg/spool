---
"spool.page": patch
---

The agent's hand now stands at a frame only while a call is open on it. It used to stand at the last frame any row in the conversation had named, which meant two wrong things: pressing send in a thread that had worked a frame put a hand on it before the agent had read a byte, and one read in the first second of a turn held the frame through the rest of it however long the agent then spent thinking or talking. A call ending leaves the hand where it was for four seconds, so a run of calls reads as one piece of work rather than as a thread that blinks. The number is measured rather than chosen: in a real capture, gaps inside a run run 1.3s to 3.2s and gaps between runs are seventeen seconds and up. The turn ending takes the hand off on the instant, because that is not a gap.
