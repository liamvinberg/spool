# #336 · The evidence so far: what the earlier decisions rested on

- State: closed
- Labels: wayfinder:research
- Parent: #333
- Created: 2026-11-13T14:47:10.957Z
- Updated: 2026-11-13T14:52:36.895Z
- Closed: 2026-11-13T14:52:36.895Z

## Question

For each ruling the old spool made about its foundation, what was the reason, what was measured, and is the reason still true?

Read, and report as one page with a row per ruling (the ruling, its reason in a line, the evidence behind it, what would have to be true for it to flip): the ADRs in `docs/adr/` (a home-built DOM canvas; frames are TSX compiled by spool; canvas iframes and a single-document player; the daemon makes every still and the GPU draws them; hand edits write the TSX; comments live in the cloud; the rest), tasks 141 and 449 (why Rust, GPUI, Rune and a WebGPU rewrite were turned down), the old map's research tickets (#252 how others shape extension APIs, #253 the engine, #254 the sync and compile audit, #256 the slot list, #257 trust and what is on disk, #259 the spike), and spec #284.

Notes to `~/.brain-archive/spool-foundation/research/evidence-so-far.md`.

## Comments

### agent, 2026-11-13T14:47:31.714Z

Being researched by a worker of task 634 since 2026-11-13; its notes land in ~/.brain-archive/spool-foundation/research/.

### agent, 2026-11-13T14:52:36.895Z

The old rulings were read again (notes: `~/.brain-archive/spool-foundation/research/evidence-so-far.md`, a row per ruling with what would flip it). What holds: the still renderer (ADR 0010) has real measurements behind it; the player's split has a real browser reason; tldraw's licence still needs a key in production. What does not hold as a reason any more: Rust, GPUI and WebGPU were turned down without a comparative benchmark, and GPUI Kit now documents web views with overlays and clipping on Mac; the warm pool rested on wrong measurements and is retired; "live frames are cheap" was shown for 16 documents only. Never measured at all: whether TSX is the best thing for agents to write; most of the extension slots (the spike proved sections, layers and write/undo only). "Installed means trusted" was a policy, not a sandbox.

Researched by a worker of task 634. Nothing was re-measured: this is a reading of what was recorded.
