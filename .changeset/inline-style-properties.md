---
"spool.page": minor
---

Properties can now edit a value that is written in an inline `style` object or in your own stylesheet, not only in a class.

It works out which of those the element is actually running for that value, and writes back to that one. A member keeps its form: a number stays a number, a quoted value stays quoted, and the members you did not touch keep their exact spelling. A rule in your stylesheet changes only its value. Its selector, its condition, its `!important` and its place in the file all stay where you wrote them. When you pick a theme value, the reference goes in, not the pixels it happens to work out to.

A box like padding opens onto its own sides when they are written in different places, so each side is edited where it lives.

Rows read honestly. A row says what else is written for it under a condition, apart from what the frame is doing right now. A rule for a viewport you are not at, or for a state the element is not in, belongs to that condition and is left alone by the plain row.

Anything that cannot be proved refuses before saving and says why. A getter or a mutated style object. A member React would drop. A row whose sides two different sources own. A rule in a cascade layer or container query whose order cannot be established. A rule a stylesheet spells more than once. A rule that does not apply to the element in front of you.
