---
"spool.page": minor
---

An element you have selected can now be resized by dragging it. The ring wears the full handle set: a cube on each corner, bare grab strips along the edges, and a rotate zone just outside each corner. A corner writes width and height together, and one press of undo takes both back. Rotating writes a turn in whole degrees, with shift snapping to 15°.

The size lands as the class the frame's author would have written. A whole step on the project's own spacing scale becomes `w-56`; anything else stays absolute, `w-[347px]`, because the drag meant pixels.

A handle is only drawn where the file will honestly carry the change, so there is no drag that turns out to do nothing. An expression for a className, an inline style, spread props with no literal, an element a shared file defines, a width a breakpoint already pins: each of those leaves that handle off the ring, and the properties rail says why.

Two things no reading of the source can promise, so the size is measured after it is written: a rule outside Tailwind's layer can beat the class, and layout can ignore it. Where the box does not follow what was written, the edit is put back and the canvas says so.

While you drag, the readout rides beside the ring and the matching field in the properties rail ticks with it. Nothing reaches the file until you let go.
