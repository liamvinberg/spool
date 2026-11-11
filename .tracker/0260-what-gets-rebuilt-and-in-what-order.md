# #260 · What gets rebuilt, and in what order

- State: closed
- Labels: wayfinder:grilling
- Parent: #251
- Blocked by: #253, #254, #256, #257, #259, #262
- Tasks: task 557 (Spool presentations and extension core)
- Created: 2026-11-10T08:20:58.607Z
- Updated: 2026-11-10T17:59:35.145Z
- Closed: 2026-11-10T17:59:35.145Z

## Question

What gets rebuilt, and in what order?

The last decision before specs are written. Settle:

- Sync and compile: keep, rework or rebuild, from the audit.
- The engine changes from the engine research, and which come first.
- The order: Liam leans to presenting first (the player gets modes), then the new window proven with knobs, record and the deck, then the rest moves over, easiest first, the agent pane last.
- How the new window lives beside the old one, how parity is proven, and when the old one is deleted.
- Which specs come out of this map and what each holds.

## Comments

### agent, 2026-11-10T17:59:35.145Z

## Resolution (task 557, 2026-11-10)

Liam agreed the order, with one change he made himself: presenting ships now, on today's code under an experiment, and the rebuild follows as one bigger piece.

1. **Present, now.** Spec #265 with tickets #266 to #273: decks behind the experiment `deck`, built on today's spool in modules of their own so they lift onto the core later. Not on an extension host: that was the earlier plan and is dropped, since Liam has a user waiting.
2. **The core and the new window.** One spec, written next: the SDK and extension host on every side (window, frame, daemon, compile), the canvas core written new behind an experiment (surface, selection, pages, hand edit, undo, slots), with Pages, Properties, knobs, flows and the deck moved onto it first. The compile rework (shared dependency analysis, one cache witness, cache budgets, #254) and the sync rework (lifecycle split from disk and socket effects, comments pulled out of the sync object, per-entry merge for new `canvas.json` keys, #254 and #262) belong to this stage. Inputs: #256 with its amendments and the deepseek-harness notes, #257, #259's branch, #253.
3. **Move the rest**, easiest first: find, export, record, history, references, then presence and comments, the agent pane last; plus the extensions screen, the onboarding step and the notice from the window designs (#258). The new window becomes the default when every feature has moved and the old tests pass against it; the old window is deleted one release later. Nobody loses a feature on update.
4. **Decks on spool.page:** the cloud follows spool's releases, the viewer plays decks, following a presenter by link (#262).

Specs are written by the brain thread (Fable), built by Opus, and each stage is judged before the next starts. Every stage is tested on the m1.
