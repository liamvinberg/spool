---
"spool.page": minor
---

Shared components edit from any frame that renders them. Selecting an element whose file lives outside the frame's folder shows the file name and "used in N frames" at the top of the properties rail, and its text, classes, attributes and pictures edit exactly as the frame's own do — as do hiding it and taking it out — saved once into that file. The frame you edited keeps its document and shows the change at once; every other frame that renders the file reloads behind its last paint, with no white flash and no still of the old design in between, and a frame off screen comes up with the change when it next mounts. A label passed to a component at the call edits that call alone; the component's own words edit every frame. Undo puts the shared file back and every frame that renders it follows.
