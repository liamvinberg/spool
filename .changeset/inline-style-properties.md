---
"spool.page": minor
---

Edit properties that an inline `style={{...}}` object or your own stylesheet owns. Properties now works out which source actually wins for the value you are looking at — an important utility, an important project rule, the element's own member, a project rule, an ordinary utility — and writes back to that one, live in every use, with one Undo. A member keeps its form: a number stays a number, a quoted value stays quoted, and the members you did not touch keep their exact spelling. A project declaration changes only its value: its selector, its condition, its `!important` and its place in the file all stay where you wrote them. Where you pick a theme value, the reference goes into the member or the declaration rather than the pixels it happens to resolve to.

Scopes read honestly. The scope you have open says what it is written to apply under, separately from what the frame is doing right now, so you can edit a `hover:` or a breakpoint rule while it is inactive. Each use then reports inactive instead of claiming to be verified, and the rule is measured as written once its real condition arrives. A member an important rule overrides says so, and names the rule.

Anything that cannot be proved refuses before saving and says why: a getter or a mutated style object, a member React would drop, a control whose sides two different sources own, a declaration in a cascade layer or container query whose order cannot be established, a declaration its stylesheet spells more than once, and a rule that does not apply to the element in front of you.
