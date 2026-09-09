---
"spool.page": minor
---

Edit properties an inline `style={{...}}` object owns. Where a literal member declares a property, Properties now reads that member's own value and writes back into the object rather than adding a class the member would win over. A number stays a number, a quoted value stays quoted, and the members you did not touch keep their exact spelling. An `!important` class stays authoritative, so you can change one padding side while another side's important rule holds. Anything that cannot be proved refuses before saving and says why: a getter or a mutated style object, a member React would drop, a control whose sides two different sources own, and a theme binding, which no inline member spells.
