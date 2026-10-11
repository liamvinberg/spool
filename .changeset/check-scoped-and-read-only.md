---
"spool.page": minor
---

`spool check` takes the frames to check: name a frame, its folder, its frame.tsx or a page folder, and it type-checks just those and what they import, so one frame on a large canvas can be checked. With no names it checks every frame, as before. It ends with a line saying how many frames and files it checked and how many errors it found.

When the sources are over the offline limit, `spool check` now says so plainly, with the count and the limit, instead of a TS5083 error on whichever file it stopped at. A file the parser can't read shows the parser's own message and place instead of "Source syntax cannot be inspected safely". A `.tsx` file sitting on a page, or a frame inside another frame's folder, is named as not a frame.

Slow frames are spelled out only for frames you name; otherwise `spool check` sums them up in one line after the errors.

`spool check` no longer writes anything. A project that still names frames by folder is left as it is, with a note that `spool open` renames its walks.
