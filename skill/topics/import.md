---
summary: work brought in from another tool (Figma): imports/, its outlines, rebuilding them
---

Work brought in from another design tool (Figma today) waits in imports/<name>/ beside design/, never inside it. It is the reference you rebuild from: read it, never write in it.

  README.md      its pages and their frames in the tool's order: each frame's size, outline file and the frames it links to
  <page>/*.txt   one outline per frame
  images/        its pictures, named in the outlines
  icons/*.svg    its vectors and small groups of shapes, one SVG each

An outline is one line a layer, indented two spaces under its parent: `kind "name" W×H @x,y`, then only what the layer sets.
  @x,y                where it sits in its parent, left out where auto layout places it; pin right / pin left+right / pin center-y say how it holds when the parent resizes
  row | column        auto layout, which is flex: gap N (gap auto is justify-between), pad T R B L, justify and align, wrap, hug (sized by its content); a child's grow is flex-1, its stretch is self-stretch
  fill                colours as #rrggbb or #rrggbb/alpha, gradients, `image images/x.png` (cover unless it says fit, tile or stretch)
  border W colour, radius, round (an ellipse), shadow x y blur [spread] colour, blur, opacity, clip (overflow hidden)
  text "words"        family, style, size, line height, tracking, colour, alignment; mixed styles means some words differ from the rest
  instance of "X"     a use of component X, drawn out with this use's own words
  svg "name" … icons/x.svg   an icon: use the file
  → "Frame" (click)   a prototype link: walk there with data-go; → back is ui.back()

Rebuilding: give each page of the import a page of its own (frames/<page>/<frame>) when it has more than one, keep the tool's frame names, and write each frame.json from its W×H. Make each component once in shared/ui/ and use it wherever an outline has an instance of it. Colours and fonts used across frames become the project's tokens (shared/tokens.css) and fonts (shared/fonts.css, from Google Fonts where the family is there). Copy each image or icon beside the frame that uses it, into shared/assets/ when several do, and import it. Lay out with flex where the outline says row or column, and position absolutely only where it gives @x,y. Shoot each frame when it is written and compare it with its outline. A large import splits well: one designer per page.
