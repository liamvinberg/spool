# Hand-edit source probes

Disposable feasibility evidence, 2026-09-06. No product module imports this directory.
Source reviewed at `2072758ec1c77ccb79a6424b11a4dc4bfb25653e`; the probes run against the current checkout.

The existing literal writer can edit shared definitions and call-site strings as
separate source targets. The production lane still refuses shared definitions.
These probes demonstrate ingredients for a resolver, not a complete resolver or
approval to ship the experimental React runtime.

The later [automatic read probe](automatic.md) starts at a selected mounted
element and verifies bounded source bindings. It also reproduces a React
composition defect in this experimental runtime. The original results below
remain evidence for the earlier, manually paired mechanisms.

## Reproduce

Use the checkout's Node 22+ and pnpm dependencies, including its pinned
Playwright Chromium headless shell. The suite creates temporary projects,
compiles them through Spool's compiler, and bundles the pinned React and JSX
runtime into isolated browser pages. It does not start a daemon or touch an
existing canvas. No external packages or pages are loaded by the fixtures.

```sh
HAND_TARGET_EVIDENCE=spikes/hand-edit-targets/results.json pnpm exec vitest run --config spikes/hand-edit-targets/vitest.config.ts
pnpm exec tsc -p spikes/hand-edit-targets/tsconfig.json --noEmit
```

`results.json` is the recorded observation set. A successful test exit is required
before treating it as complete: the reporter also writes partial results on failure.
The custom test config deliberately replaces the root test selection.

Files:

- `fixtures.ts`: local JSX, a component shared by two frames, nested components,
  unused imports/exports, conditional output, zero/two roots, transformed text,
  literal children, and keyed/unkeyed mapped rows.
- `probe.test.ts`: nine executable probes, including source mutation followed by
  fresh React renders, actual computed CSS, dependency invalidation, and path gates.
- `runtime.tsx`: experimental call ancestry using React context boundaries and
  mounted IDs. No private React fields, DOM wrapper elements or persistent tree.
- `targets.ts`: tiny source readers, a deliberately bounded direct-parameter check,
  adjacent authored-sibling swap, and a shared write/inverse source-boundary gate.

## Supported, refused, unknown

**Supported** means executed for the stated form, not generally supported by the
product. **Refused** names a deliberate boundary. **Unknown** needs further proof;
it must not appear as an editable control merely because a span can be patched.

| Case | Verdict and evidence | Limit |
| --- | --- | --- |
| Local JSX literal class/text/attribute | Supported by existing planner; nearest production tests also pass | File revision and operation-specific eligibility remain required |
| Shared Button styling | Supported by pure planner plus fresh renders: all eight observed Button hosts in two frames carry the new class | Shipped `patchSite` refuses; production shared preview/commit/undo not exercised |
| One literal call-site label | Supported for the manually verified direct `{label}` binding; only the Mac label changes, Windows and the second frame retain theirs | The probe does not automatically join import/export binding, mounted ancestry and source revisions |
| Nested forwarding and literal children | Supported pieces: two direct parameter reads through Shell/Button; direct `{children}` to literal JSX child patch | Callee matching is a precondition, not implemented by `directParameter`; arbitrary forwarding remains unknown |
| Transformed or mapped data text | Refused: uppercase expression, data-backed label and shadowed/mutated parameters are not inverted | No matching by current displayed text, invented props or row-data writer |
| Shared inner literal/style | The same definition stamp identifies its exact authored element; literal writer can target it | Every governed use changes; selecting one host does not make it local |
| Multiple/absent component roots | Experiment carries one call ancestry to two `<b>` roots; null output has no selectable host | No synthetic DOM root; absent output is source context, never an observed element count |
| Repeated mounted occurrences | Keyed row keeps mounted ancestry through reorder; unkeyed row retains an ID while its displayed data changes | Mounted ID is not data identity, not durable across documents, and never authority to delete one data item |
| Template styling and deletion | Mapped style is a template edit; direct mapped root deletion is refused; deleting an authored inner child removes it from every row | `mapped=false` does not prove single use: a separately invoked helper has no map ancestor |
| Authored deletion/reorder | Existing delete removes one Button call site; disposable swap exchanges adjacent complete authored JSX siblings; exact-snapshot inverse restores bytes | No generated-row reorder, expression-wrapped child, reparenting or concurrent-edit undo proof |
| Source offsets | Counterexample: removing Mac makes its old line/column identify Windows | Offset alone is unsafe even if it still parses as the same tag |
| Absent supported declaration | Existing class writer adds `border-2` without flattening inherited content | Whether that declaration wins is a separate question |
| Color, spacing, type, radius references | Compiler accepts project aliases/default tokens; scoped class edits preserve other units/scopes and do not change token definitions | Compiled theme has no declaration ranges and no named-spacing list; arbitrary bindings are preserved, not guessed |
| Gap shorthand | Setting `gap-x-rhythm` preserves the other axis as `gap-y-4` | Numeric token stepping and gesture semantics belong to transaction probes |
| Authored units and conditions | Browser: `1.5rem` is 30px at a 20px root; spacing step is 5px while current theme read says 4; base/wide/hover yield 20/40/60px | Measurements cannot substitute for authored units or chosen write scope |
| Inheritance and aliases | Inherited color differs from explicit token override; changing a conditional alias changes rendered color while reference stays `var(--brand)` | Token definition is not the selected property's owning declaration |
| Inline and competing CSS | Inline class editing is refused; unlayered CSS wins at 37px while a `p-4` class remains patchable | Winning-declaration attribution is unknown; patchable is not proof of property ownership |
| Write/inverse boundaries | Disposable common gate permits shared/sibling source and rejects external, metadata and dependency paths after realpath resolution | Not integrated into production; write-time races and inverse revalidation still require transaction proof |

## Reach is four different observations

```text
selected mounted occurrence + document generation
       |
       +-- definition element ------------> shared style / literal
       |
       +-- verified call ancestry --------> literal prop / authored child

source target
       +-- file dependencies       potential affected frame set
       +-- bound JSX references    source sites, with conditions/repetition
       +-- committed observations  what actually rendered, in named documents
       +-- unknown coverage        unopened frames, other state, unresolved code
```

The fixture has five direct `<Button>` sites in the first frame: two literal uses,
one conditional use and two repeated templates. Shell contributes another
transitive site. This renders seven Button hosts in that frame's initial state,
one in the second frame, and zero in the unused-import frame. `Unused` is imported
from the same file but has zero JSX references and zero rendered hosts.

The existing flow graph reports all three frames for **relative** imports,
including the unused one. It reports no entry for the fixture's supported
`shared/...` aliases; the compiler resolves those and renders the buttons. The
compiler omits the unused import from that frame's build inputs. Thus neither
graph representation is an exact rendered-use count or an interchangeable index.
Removing an import and rebuilding the same flow graph updates its relative-import
reach correctly.

Minimal truthful context can start with the known source target, observed uses in
identified documents, and conservatively described potential frames. An unopened
frame is not a zero. Incomplete graph coverage must broaden invalidation and say
unknown, never narrow it to no affected frames. Reveal can name an observed use
or open a potential frame and inspect its current render. No comprehensive
per-export library index is required for that account. The small syntactic
reference reader is not binding-aware and is not such an index.

## Minimal read and target proposal

These are proposed records, not a new product API implemented by this spike.
One operation resolves one target; a selection-wide `editable` boolean is insufficient.

```ts
type Target = {
  file: string;                // canonical project-source path
  revision: string;            // hash of the exact bytes read
  element: { start: number; end: number };
  role: "definition" | "call-site";
  slot: "class" | "text" | "attribute" | "child" | "asset";
  property?: string;
  scope: readonly string[];    // explicit write condition, including base []
  expected: string | null;     // authored slot value; null is genuinely absent
};
type Capability =
  | { kind: "supported"; target: Target; proof: string }
  | { kind: "refused" | "unknown"; reason: string };
```

A read also needs the project, frame, document generation and mounted occurrence;
definition and verified call ancestry; an operation-specific capability; and
source revisions for **every file used in the proof**, not just the file to write.
For example, changing Button's prop mapping invalidates a proposed label write
even when the caller file is unchanged. The wire target is revalidated by the
daemon; runtime stamps and client-supplied paths are evidence, not authorization.

For each property retain four separate things: its authored declaration and
conditions; token reference or authored unit/expression; compiled binding and
project/default origin; and rendered value under an explicit viewport/state/root
font/layout context. Keep inheritance, absent declaration and unknown winner
distinct. Preserve aliases and default bindings. An explicit custom value is an
intentional reference replacement, never permission to rewrite token definitions.
Existing imported-image replacement remains its own operation through `assetSite`.

Reach attaches to the target: potential files/frames with coverage, bound source
sites with conditional/repeated flags, and currently observed occurrences with
document generations. The later library may browse these records and request
additional source-index detail. It must use the same target and writer.

## Lifetime, invalidation and remaining proof

- Parse/cache source by canonical path and content hash. Offsets are snapshot
  addresses only. Re-read at commit; do not recover a moved target by matching
  identical text. Semantic revalidation and inverses remain transaction work.
- Retire mounted observations on unload/remount, source recompilation or failed
  observation. Reconcile them after a committed render. Ancestry is ephemeral;
  it is not a persistent document mirror and does not track application data IDs.
- Invalidate binding proof when any definition/caller/import resolution changes.
  Invalidate potential reach on import edits, renames, deletes, resolution changes,
  and frame discovery. Missing events must be repaired by a fresh read.
- Invalidate theme/binding reads on stylesheet bytes, import additions/removals,
  toolchain/default changes and real-path changes. Current theme cache checks
  stylesheet mtimes; it is not a sufficient transaction revision. Rendered values
  additionally change with state, media conditions, inheritance and layout.
- The current lane's lexical frame-prefix check admits an in-frame symlink to
  `design/.spool/hidden.tsx`; its inverse gate also accepts `frame.json` and rejects
  ordinary shared source. The probe plans but never writes through these rejected
  roles. A production gate must check both authored and canonical roles, identically
  for commit and inverse, immediately before access. Realpath containment alone
  excludes external files, not app-owned files or in-tree dependencies.
- The experimental runtime adds a React boundary for every host/function call.
  It does not prove compatibility with refs, class/memo/lazy/forwardRef components,
  Suspense, portals, slot cloning, imperative DOM, transitions, or source hot reload.
  Function call identity and data identity remain different. Do not ship it as-is.
- Automatic binding-aware joining of call ancestry to the selected property's
  target, and a truthful winner/refusal rule under competing CSS, remain unproved.
  These are prerequisites for approving those first-version operations, not silent
  scope cuts. The direct-parameter helper is only a bounded ingredient whose callee
  matching precondition is supplied manually by the fixtures.

The added work is an ephemeral attribution mechanism, on-demand binding/capability
proof and richer read records over the existing writer. A library and a persistent
element tree do not address these gaps. Compilation, class folding, parse walks,
theme compilation and source boundaries remain reusable. No latency, scale,
off-screen refresh cost or production performance claim was measured here.

## Current source pointers

- [JSX definition stamping](../../src/runtime/jsx-dev-runtime.ts), [compiler and build inputs](../../src/daemon/compile.ts)
- [Source parser/import traversal](../../src/daemon/nav-sites.ts), [file-use index](../../src/daemon/flows.ts)
- [Literal operations and source reads](../../src/daemon/hand-write.ts), [lane and inverse gate](../../src/daemon/hand-lane.ts), [real-path containment](../../src/daemon/design-path.ts)
- [Theme bindings](../../src/daemon/theme.ts), [stylesheet loading](../../src/daemon/tailwind.ts), [class operations](../../src/daemon/class-write.ts), [explicit scopes](../../src/ui/canvas/properties-scope.ts)
- [DOM selection and computed context](../../src/daemon/document.ts), [property readings](../../src/ui/canvas/properties-rows.ts)

Validation: nine probes passed; 175 nearest tests across hand-write, hands-api,
class-write, theme, compile, JSX runtime and property scope passed. Repository
`pnpm typecheck` and `pnpm check` passed; this excluded spike also has its own
strict TypeScript and Biome checks. The first custom-config attempt accidentally
included the root suite and was interrupted; it is not counted as a full-suite
pass. No product behavior changed, so no changeset or production integration is
included. Transaction cancellation/concurrency and the approved UI are not tested
by this artifact.
