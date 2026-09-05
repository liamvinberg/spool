# Properties foundation audit

Planning evidence, 2026-09-05. This is an implementation audit, not a settled ADR. V1 primarily tweaks existing agent-authored UI. Selection should determine which controls apply; the visual-inspector categories remain provisional. Reuse the existing 145 property rows and tested class writer, rather than require 145 new controls or a broad rewrite. Its family rules, scoped edits, source patches and undo should survive. The missing depth belongs in a shared editing module between the surfaces and those existing mechanisms. Row count verified by importing `ROWS` from [properties-rows.ts](../../src/ui/canvas/properties-rows.ts#L415).

## Seven commitments to settle before production

### 1. Keep authored values and rendered values distinct

**Exists:** `RungRead` carries source classes, location, refusal and fingerprint. `readRow` interprets the authored token. Runtime spacing measurements carry actual geometry and computed margins/gaps. The spacing attribution module already permits an unattributed remainder. See [source reading](../../src/daemon/hand-lane.ts#L302), [row reading](../../src/ui/canvas/properties-rows.ts#L464), [runtime reading](../../src/ui/canvas/protocol.ts#L500), and [attribution](../../src/ui/canvas/measure-spacing.ts#L107).

**Real gap:** there is no joined property reading that says “authored `p-6`, rendered 40px, overridden or unattributed.” Equal pixel values do not prove which declaration won. Preserve source value, rendered value, provenance and attribution certainty separately. Keep applied but unsupported properties visible; unsupported does not mean unset. Dynamic expressions should read explicitly as expressions with their editing refusal. Never reconstruct editable source from computed CSS alone.

**Safe later:** a detailed cascade inspector. Unknown provenance can already produce an honest reading and a specific refusal.

### 2. Make sizing depend on actual layout context

**Exists:** size modes, min/max families and flex-basis exist. Resize checks whether its measured result landed and rolls back when layout clamps it. [Row tests](../../src/ui/canvas/properties-rows.test.ts#L238), [resize rollback test](../../src/ui/canvas/canvas-hand-resize.test.ts#L152).

**Real gap:** rail capability checks infer display from source tokens or tag defaults; their `flex-1` height rule is not a general parent-layout model. Side folding maps logical start/end to physical left/right without writing-mode context, while spacing measurement already reads RTL. A visual “Fill” or padding handle needs the parent layout, axis, direction, writing mode and relevant constraints. Preserve logical property identity when resolving its visual side. See [current verdicts](../../src/ui/canvas/properties-rows.ts#L784), [side folding](../../src/ui/canvas/properties-families.ts#L400), [runtime direction](../../src/daemon/document.ts#L1023).

**Safe later:** richer grid controls and constraint visualizations. Initially return an unavailable capability for unhandled contexts.

### 3. Separate write scope from preview conditions

**Exists:** the rail edits explicit variant chains, keeps scoped defaults, and derives breakpoint choices from the compiled theme. Tests preserve base values under variant edits. [Scope model](../../src/ui/canvas/properties-scope.ts#L65), [scope test](../../src/ui/canvas/properties-sections.test.ts#L299).

**Real gap:** the selected write scope is rail-local state. Drag preview tokens are currently folded into base scope; resize operations also write base. Choosing `hover:` does not itself establish an equivalent runtime preview condition. Bind edits to an explicit write scope and separately carry viewport and forced-state preview context. A measurement from one context must not silently justify an edit in another. [Rail preview and put](../../src/ui/canvas/properties-rail.tsx#L264), [resize operations](../../src/ui/canvas/hand-resize.ts#L190).

**Safe later:** more state controls. Existing breakpoint conflict refusal can stay conservative while their previews are unsupported.

### 4. Preserve instance identity and source ownership

**Exists:** picks identify `(frame, selector)`; writes identify source stamps. The lane rejects a shared definition, explains its reach, and limits a gesture to one file. Mapped class edits deliberately affect every rendered row. [Pick identity](../../src/ui/canvas/protocol.ts#L36), [ownership enforcement](../../src/daemon/hand-lane.ts#L85), [shared-definition test](../../src/daemon/hands-api.test.ts#L573).

**Real gap:** a component example and its definition need explicit edit ownership, not an inferred permission obtained by selecting one rendered instance. Keep instance identity, source identity and affected instances distinct in the shared reading. A future “edit definition” action should change that ownership deliberately.

**Safe later:** shared-definition writes, prop overrides and multi-file transactions. Current local-file refusals remain valid; an example can still invoke the same supported local edits.

### 5. Retain units and token binding through every control

**Exists:** row rules distinguish lengths, colors, modes and other families; lengths preserve signs, fractions and bracket expressions. Theme menus preserve project/default origin. Class rewriting preserves logical spellings and `!`. [Typed-value tests](../../src/ui/canvas/properties-sections.test.ts#L46), [theme menus](../../src/ui/canvas/properties-theme.ts#L19), [writer rules](../../src/daemon/class-write.ts#L12).

**Real gap:** the caller's length intent must distinguish a token binding, an explicit unit and an unresolved expression. A number-only model erases the difference between `w-1/2`, `w-[200px]` and a named token currently resolving to 200px. Also, theme readouts assume 16px for rem conversion while runtime spacing measurements know the actual root font size. [Theme conversion](../../src/ui/canvas/properties-theme.ts#L62), [runtime context](../../src/ui/canvas/protocol.ts#L515).

**Safe later:** more token menus. Decide now whether a drag preserves a binding, moves to another project token, or explicitly unlinks it; callers must not invent that policy independently.

### 6. Bind one preview transaction to the source snapshot shown

**Exists:** daemon gating, fingerprint checks, all-or-nothing span patches, inverse patches, and one canvas undo stack. Resize and text have cancellation paths. [Atomic-write tests](../../src/daemon/hand-write.test.ts#L277), [stale-file test](../../src/daemon/hands-api.test.ts#L527), [shared undo stack](../../src/ui/canvas/canvas.tsx#L640).

**Real gap:** rail class edits are formed from a reading, but `onWrite(frame, selector, ops)` omits that reading's fingerprint. The later gate can accept a newer file as its baseline. Asset writes already carry the read fingerprint. Also, rail writes and resize writes have separate orchestration; only resize attaches a measurement claim. Bind source revision, target and scope at gesture start; preview without disk writes; commit once; cancel on Escape, lost target or invalidated source. Reuse the existing undo stack. [Caller interface](../../src/ui/canvas/properties-rail.tsx#L100), [write orchestration](../../src/ui/canvas/canvas.tsx#L2295), [resize orchestration](../../src/ui/canvas/canvas.tsx#L2411).

**Safe later:** collaborative rebasing. A stale-source refusal is sufficient initially.

### 7. Model capabilities per operation, including mixed selections

**Exists:** text expressions, mapped text, image imports, arbitrary attributes and deletes already have different eligibility rules. Two selected elements can participate in one source patch. [Operation union](../../src/daemon/hand-write.ts#L30), [text refusal tests](../../src/daemon/hand-write.test.ts#L144), [image tests](../../src/daemon/hand-write.test.ts#L424), [multi-element patch test](../../src/daemon/hand-write.test.ts#L286).

**Real gap:** a single `editable` flag or tag-based control list cannot represent these differences. Return operation capabilities with reasons, plus distinct unset, mixed, unresolved and concrete values. Multi-selection should be an explicit aggregation of source targets, including repeated instances sharing one literal. Keep delete, text, style and asset intents distinct.

**Safe later:** rich text, expression rewriting and broad batch property editing. The initial module can refuse those intents without changing its caller contract.

A background image on a `div` is a useful later example: today's `background-image` row represents gradients, and the asset writer specifically requires `img`. This is a real coverage gap, not an absent document kind. Extend the existing paint/resource operation with explicit source ownership and managed import handling when that workflow is chosen. Until then, show the applied background as unsupported; do not route it through an inline URL bypass. [Gradient row](../../src/ui/canvas/properties-rows.ts#L382), [image-only asset planning](../../src/daemon/hand-write.ts#L565).

## A small caller interface

Use one editing module for the rail, handles and component examples. Keep the seam above token spelling and source gating, below presentation categories:

```ts
const reading = await editor.read(selection, context);
// reading: source revision, ownership, authored/rendered values, capabilities
const gesture = editor.begin(reading);
gesture.preview(change);                 // repeatable, temporary
await gesture.finish("commit");           // or "cancel"
```

`change` is a small discriminated union: set a property using a typed value, unset it, choose a contextual size mode, edit text, delete, or replace an asset through the existing asset door. A typed length retains token/unit/expression identity. A compound alignment or linked-padding change carries several property intents in one gesture. A normal field uses one preview and commit; pointer motion repeats preview. Unsupported intents return the same reason to every caller.

Internally, reuse `editsFor`, `writeClass`, runtime readings, the lane and the canvas undo stack. Categories only arrange controls. No plugin registry or persistent duplicate layout tree is needed. Start with a small existing-element editing slice. Its contract tests should cover stale reads during a drag, source/rendered disagreement, preview scope and contextual sizing; unimplemented contexts such as vertical writing or mixed selections should return explicit unsupported answers. Expand controls when selected content needs them. This makes uncertain semantics testable without demanding every advanced control now.
