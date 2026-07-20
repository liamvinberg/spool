# canvas bake-off

Throwaway spike for [Test: canvas library vs home-built](https://github.com/devosurf/spool/issues/9): does spool's canvas ride on **tldraw with custom chrome**, or a **small home-built DOM canvas**? Same minimal scene on both, judged by feel. Deletable without ceremony.

## Run

```sh
cd spikes/canvas-bakeoff
pnpm install
pnpm dev
```

- `?variant=tldraw` — tldraw 5.2.5, stock UI stripped (`hideUi`), custom live-frame shape (the Make Real pattern), built-in bound arrows, snap mode forced on.
- `?variant=home` — everything hand-rolled: camera, wheel semantics, marquee, snap guides, corner resize, bound arrows, counter-scaled labels. `src/variant-home.tsx` (~600 lines) *is* the cost estimate for "no library".

Flip variants with `[` / `]` or the bottom bar. The **checklist** button opens the Figma-feel checklist with a tick column per variant. Ticks are in-memory; flipping variants resets the scene itself.

## What's identical by construction

Both variants render the same five frames (a fake habit app: three phone screens, one desktop screen, one component sheet) as **sandboxed null-origin `srcdoc` iframes** — the spool frame model — with pointer events blocked. Interacting *inside* frames is [Test: live frames at scale](https://github.com/devosurf/spool/issues/8), not this ticket. Resizing changes the frame's intrinsic box so content reflows (never CSS-scales pixels — sidesteps the WebKit blur bug by construction). Chrome (toolbar, zoom pill, tag) is deliberately the same component on both so the judgment lands on canvas feel, not chrome.

## The checklist

1. **Trackpad pan** — two-finger scroll pans; no zoom, no page scroll
2. **Zoom to cursor** — pinch or ⌘-scroll zooms toward the pointer
3. **Space / middle-mouse pan** — grab cursor, drag pans
4. **Zoom keys** — `+`/`−` step · `⇧1` fit · `⇧2` selection · `⌘0` 100%
5. **Click select** — bounds + handles; empty click deselects
6. **Shift-click** — add/remove from selection
7. **Marquee** — drag empty canvas, frames select live
8. **Drag a frame** — sticks to cursor at any zoom
9. **Snapping** — red edge/center guides, natural engage/release
10. **Arrows re-route live** — move a connected frame, the noodle follows
11. **Draw an arrow** — `A`, drag frame → frame
12. **Corner resize** — content reflows, no blur
13. **Frame labels** — constant size above frame; click selects, drag moves
14. **The wrist test** — after two minutes: tool, or webpage?

## Known asymmetries (don't let them ambush the judgment)

- **Gap snapping** (equal-spacing guides) — tldraw ships it; home-built only does edge/center alignment. Building it is real work; that gap is part of the price being measured.
- **Multi-select resize** — tldraw yes; home-built resizes single frames only.
- **Edge-handle resize and snap-while-resizing** — tldraw yes; home-built has corner handles only, no resize snapping.
- **Undo/redo** — tldraw has a full history stack built in (not key-wired in this spike's chrome); home-built has none, and a real home-built canvas needs a command stack eventually.
- **Arrow authoring** — tldraw's arrow tool is fully general (bendable, reroutable, labels); home-built arrows are fixed nearest-side noodles.
- **Arrow styling** differs slightly (tldraw palette blue vs Figma blue) — cosmetic.
- **Watermark** — the tldraw variant shows "made with tldraw" because it runs unlicensed, which is exactly how a free spool would have to ship (see below).
- Chrome-first on purpose: WebKit blurs transformed iframes (open since 2014), already a decision on the bank page.

## The license facts the verdict must weigh (research/04-substrate.md §1)

- tldraw is **free for local development only**. Production needs a license: **Trial** (100 days, one per entity, no grace period), **Commercial** (paid, "value-based pricing" — the official pricing page contains zero dollar figures), or **Hobby** (non-commercial only, discretionary approval, **watermark mandatory**).
- The commonly cited ~$6k/yr startup figure is press/HN secondhand from the 2025 relicensing, not confirmed current.
- npm license field: `SEE LICENSE IN LICENSE.md`. Not open source.
- Bundle observation from this spike: production build is **~567 KB gzipped**, essentially all tldraw; the home-built variant's logic is a few KB.

## What this spike deliberately ignores

Persistence, canvas.json, agent CLI, flow player, in-frame interaction, performance at scale (ticket #8), touch/pen input.
