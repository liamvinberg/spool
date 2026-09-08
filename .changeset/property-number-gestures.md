---
"spool.page": patch
---

Numeric property fields keep the number you wrote. Fractional values and explicit units survive instead of rounding into the nearest theme token, arrow keys step by one and Shift by ten in the unit on screen, and a value the field cannot count, such as `normal` or a calculation, is read out as it stands instead of leaving the box empty.

Repeated steps stay one preview and save once when the gesture ends. Escape cancels without writing, an interrupted label scrub stops without saving, and a token reference is kept when stepping has no proven scale to follow. Typing a custom value still steps from there, and Undo restores the original reference.

Color alpha and gradient angles, stop positions and stop opacity follow the same gesture, and every frame sharing that source updates as you go. A compiler reply that arrives after Escape no longer overrides the value you kept.
