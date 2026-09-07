# Observed source reads

Disposable feasibility probes. No production module imports this directory.

```sh
pnpm exec vitest run --config spikes/hand-edit-targets/vitest.config.ts
pnpm exec tsc -p spikes/hand-edit-targets/tsconfig.json --noEmit
```

The automatic suite runs against both the original wrappers and the new
observer. The original cloning counterexample stays executable. The observed
runtime returns ordinary JSX elements unchanged and registers source locations
in a WeakMap. A separate adapter observes committed hosts through the pinned
React 19.2.7 production renderer's private DevTools/Fiber interface. It adds no
DOM attributes, wrapper components, source IDs or saved document model.

`observed.test.ts` compares rendering, element contracts, refs and stateful
updates, and exercises source syntax, imported images, literal attributes and
writing environments. `property-inventory.test.ts` sends both bounded examples
for every writable `ROWS` entry through a selected mounted shared definition.
The two read-only entries also resolve their source context. These are read
examples, not a production writer, complete cascade engine or inverse proof.

The reader retains original and lowered candidate CSS, shorthand values,
declarations, references, explicit scope, rendered context and dependency
revisions. Compiling the pinned reset and lowering candidates with compiler
theme entries preserves generated fallbacks without trusting arbitrary author
rules as utility declarations.

Set `AUTO_TARGET_EVIDENCE`, `OBSERVED_EVIDENCE` and `PROPERTY_READ_EVIDENCE` to
JSON destinations to retain observations. Reporters can write partial results
on failure; only a successful complete run establishes a passing artifact.

The additional `cascade.test.ts` probes retain a winner per requested effect
from exact emitted rule order and importance. Equal-selector overlaps, logical
writing environments and selected ancestor states now have bounded examples.
Full candidate CSS, shadowed declarations, compiler defaults and rendered
context remain dependencies. `validPropertyRead` rechecks the same source,
owner lease and context; it supplies no semantic rebase or joined lifecycle.

Source-continuity coverage is recorded separately in `continuity.md`. CSS
limits remain executable: unequal-selector competition and unproved
custom/container conditions. Group hover/focus, peer checked and the tested
breakpoint/group combination are finite examples, not approval of every
variant combination. There is no general renderer or hook-coexistence claim.
No performance claim is made.

`ReadAuthority` is an optional admission seam. It captures source-owner handles
before compilation and checks them alongside the mounted generation and source
snapshots. It supplies no transport authentication, semantic rebasing, writer
exclusion or production integration. Reads also carry the committed render they
observed; a render during the read refuses that read. Hashes without an authority
still do not establish source continuity. No performance claim is made.
