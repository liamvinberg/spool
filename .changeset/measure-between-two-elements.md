---
"spool.page": minor
---

Hold ⌥ with an element selected and point at the neighbour beside it: the canvas draws the distance between them, and says what the distance is made of. The number breaks into the parent's gap, the two facing margins and whatever is left over, and each part is named with the class that produced it and the element that class is written on — `gap-4 on parent ul`, `mr-2 on li`, a `space-y-6` on the section even though the child is what carries the margin.

A distance a stylesheet produced shows its pixels and says no class, rather than naming one that did not cause it. A margin that block flow collapsed away is listed with no pixels at all, because editing it would move nothing. Anything the classes do not account for is called residual. Only a neighbour measures: across a skipped element the same three parts would name one gap for a distance made of two and a whole box.

It is read-only. Changing a distance is a field in the properties rail, and this is how you find out which field.
