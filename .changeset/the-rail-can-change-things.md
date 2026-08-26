---
"spool.page": minor
---

The properties rail has its rows now, so you can change what you are pointing at instead of only reading it. Position, size, layout, appearance, fill, stroke and text, each with the CSS name on the left and one control on the right. Every field holds the Tailwind class and says what it means beside it: the box reads `4` and the grey half reads `16px`.

Numbers take a sign, a fraction and a unit. Type `-4` for a negative margin, `50%` for a half width, `347px` for an exact one, `12deg` for a turn. Drag the row's label to scrub it, or use the arrows: one step each, ten with shift held.

Padding, margin and gap start as one box and open into two and then four with the caret beside them. The radius opens into four corners and the border into four edges. Whatever you write comes back as the fewest classes that say it, and if you wrote `ps-4` rather than `pl-4` it stays that way.

Colours have a swatch, a name and an alpha. The name menu is your project's own colours first and Tailwind's underneath, with a line to type into, and you can type a raw colour like `#ff0044` straight into the same menu. Gradients are three rows, `from`, `via` and `to`, each with its own colour, alpha and position, under a menu for the shape and the direction. `none` takes the whole gradient off at once.

`font-variant-numeric`, `filter` and `scroll-snap-type` are rows of chips you press on and off, and turning one on turns its opposite off.

At the foot there is `+ class` for anything with no row of its own. Type a class and spool's own compiler says whether it lands: what compiles shows you the CSS it produces, what does not stays grey with the reason, like `no utility foo-bar`. `[mask-type:luminance]`, `md:hidden` and `mt-3.5!` all go in. Press any class on the line below to take it off again.

Editing no longer loses the element you are editing. A change used to reload the frame and drop your selection, so the rail emptied under your hands; it keeps the element and picks it up again in the fresh document.
