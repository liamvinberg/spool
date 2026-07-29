---
"spool.page": patch
---

A walk spool cannot read is reported once, where it is real. Passing a target down as a prop is how shared navigation is written, and leaving that prop out renders no link at all. Spool used to report every one of those as a walk it could not read, once for every frame mounting the component. On this repo's own canvas that was 173 reports over 4 lines of source, and now it is none. A frame that rendered and produced no link has no walk there to read. A frame nothing has rendered yet still reports, because that question has not been asked.
