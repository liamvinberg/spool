# spool canvas

This folder is a [spool](https://spool.page) project: live TSX frames on an infinite canvas — agents author the files, humans arrange and play them.

Run `spool skill` before working here. It is the complete contract: if it isn't in there, spool doesn't do it. Topics: `spool skill frames|flows|scenarios|mock|styling|verbs`.

- A frame is born by writing `frames/<page>/<name>/frame.tsx` default-exporting one React component — no registration, no `spool new`. Variants are `--`-named siblings (`checkout--empty/`).
- The one law: never write app-owned files — `canvas.json` and `.spool/` are spool's.
- Commit completed design work atomically before handoff.

## The pages

Every frame lives on a page; the root page stays empty on purpose.

| Page | What it holds |
| --- | --- |
| `app` | Spool as it shipped — home, the canvas, its context menu, the empty project, the player, the system sheet. Six frames, the core and nothing else. Walk it end to end: it is a working model of the product. |
| `agent` | The agent chat (#114), unbuilt and still being decided. A wayfinder map is resolving it one ticket at a time, so the page holds rejected variants next to canonical ones on purpose. Canonical so far: `agent-play--plan-pinned`, `agent-play--shot-open`, `agent-play--model-menu`, `agent-play--edit-run`. |
| `site` | spool.page (#31), unbuilt. The hub and its four sections. |
| `directing` | The directing toolset (#56, #65), unbuilt. `directing--annotate` is the canonical frame the spec is written against. |

`app` is the baseline. A new prototype starts by copying the frame it changes,
not from nothing — so the thing being proposed is legible as a diff against
what exists.

Keeping it honest is the whole job. Every frame on `app` must match the code
in `src/ui/` and `src/runtime/`; when a design ships, the frame here becomes
what shipped. Read the implementation before trusting a frame — that is how
"design mode" survived here for months after select became the only pointer
tool. What the chrome is today: one 44px bar (brand lockup, project tabs, "+",
then threads toggle and zoom), the Pages rail at 248px, the Inspector rail at
300px with its elements and connections tabs, and the tool bar floating over
the bottom of the viewport. No mode switch. Play lives on the selection.

Explorations live until the work they decided is built. Making the decision is
not that moment: while a page is still being resolved, the rejected frames are
what the next session reads to see what was already argued and why, and a
component only the loser references dies with it. When the work ships, the
winner moves onto `app` as what shipped and the rest are deleted then. Git
history is the archive, and `git log --diff-filter=D --stat -- design/frames`
finds them.
