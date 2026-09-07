# Source continuity probes

Disposable follow-up to [observed source reads](observed.md). No production
module imports this directory. Run with the checkout's Node 22+ and pnpm:

```sh
pnpm exec vitest run --config spikes/hand-edit-targets/vitest.config.ts
pnpm exec tsc -p spikes/hand-edit-targets/tsconfig.json --noEmit
```

`continuity.test.ts` adds selected-occurrence checks for direct JSX children
passed through a component, namespace imports and single export-star chains.
The observer retains exact incoming child element identity separately from the
source reader's lexical binding proof. Every intermediate definition and import
remains a dependency. Changing a call can preserve its mounted host while
invalidating the old source read. A repeated source target stays a template
edit, never an individual data-row edit.

The memo counterexample walks the committed root, not the host's possibly old
Fiber. React DOM 19.2.7 production can retain both old props fields after an
equal-prop call switch. Both default and custom comparators refuse attribution.
Clones, cached children, indirect/named slots and unobserved ordinary element
creation retain named refusals. The original lazy and composite-binding gaps are now exercised further in
[the module-binding probes](modules.md). Conditional or transformed lazy
loaders still have no source-origin proof. These refusals are mechanism
limits, not a revised product support boundary.

`plain-runtime.tsx` is the independent ordinary-JSX comparison baseline. It
adds no source attributes. The observed runtime keeps React elements unchanged.
Tests compare host and component props/types, labels, refs, state, native input
and focus; they also preserve committed content during a suspended transition.
The earlier wrapper cloning defect remains executable in `automatic.test.ts`.

The adapter checks the renderer's package, version, reconciler version and
production build marker. It still uses private DevTools/Fiber fields. An existing
DevTools hook disables attribution and stays intact. No other renderer/build,
SSR, hydration or general DevTools coexistence is proved.

Set `CONTINUITY_EVIDENCE` to a JSON path to retain observations. Only a successful
complete run establishes a passing artifact. `ReadAuthority` remains the
existing optional admission seam. No production process admission, write/undo
handover, persistent document tree, source-inserted IDs or performance claim is
added by this work.
