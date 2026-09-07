# Automatic source reads

The [observed source-read extension](observed.md) preserves the original
counterexamples and runs this suite against a second observation mechanism.
The account below describes the original 2026-09-06 evidence.

Disposable read-only probe, 2026-09-06. Selection plus an operation resolves a
source slot without the test providing a source snippet. No product code imports
these files, and no production support or performance claim follows from them.

```sh
pnpm exec vitest run --config spikes/hand-edit-targets/vitest.config.ts
pnpm exec tsc -p spikes/hand-edit-targets/tsconfig.json --noEmit
```

Set `AUTO_TARGET_EVIDENCE` to a JSON output path to retain automatic observations.
The reporter can write partial output on failure; require a successful test exit.
Tests use temporary projects, the real Spool module compiler and stylesheet
loader, pinned Tailwind and React, and isolated Playwright Chromium documents.

`automatic.test.ts` provides ten end-to-end tests. `automatic-source.ts` resolves
bounded module bindings. `automatic-browser.ts` joins committed DOM observations,
compiled source snapshots and CSS declarations. The previous runtime is retained
unchanged so its limitations remain reproducible.

```text
selected DOM node + document generation + mounted call chain
                     |
             verify source bindings
                     |
        operation-specific source slot + snapshot witnesses
                     |
    property declaration / reference / chosen scope / rendered value
```

The executed cases distinguish identical labels at two call sites, same-named
exports in different files, shared aliases, nested direct prop forwarding, an
inner definition literal, literal children, authored deletion and sibling reorder.
Unkeyed rows remain template uses, never independently editable data.

Property reads cover physical padding sides, color/background color, gap axes and
top border width, in the demonstrated base, `wide:` and `hover:` scopes. They
require one verified utility declaration in the chosen scope or an explicitly
absent declaration. An inherited value does not become the edit target. Token
references remain separate from computed values. Matching author CSS, duplicate
or competing declarations, important mixtures, inline styles, class expressions,
unproved conditions and other effect families refuse. The literal source and
token definitions are never mutated. A supported read is not a writer/inverse.

The CSS reader compares the loaded CSSOM with the compiled sheet, maps utility
rules to compiled class candidates, and verifies baseline rules against the
pinned reset. It does not infer ownership from equal pixels. Its effect list is
bounded, not a complete shorthand or cascade implementation.

Reads retain canonical paths and hashes for callers, definitions and imported
stylesheets, missing import-resolution candidates, the toolchain lockfile, and
discovered opening/enclosing ranges. Stylesheet revisions are checked against the
bytes returned by the actual loader. Byte/path changes invalidate the whole proof. These
hashes and ranges supply no history of replacements and no continuity across a
source edit; semantic rebasing and atomic write ordering require separate proof.
An executed counterexample replaces a file with identical bytes without detection
by this reader. Production needs server-owned epochs and operation provenance to
retire such proofs, even when a compile cache would keep the same content hash.

Ordinary rerenders and keyed reorder retain the tested mounted identity. Remount,
recompile, changed call ancestry and replacement by a cloned DOM node invalidate
it. Multiple roots share call ancestry but have different host identities. Null
output supplies no host observation. Source dependency candidates, binding-aware
JSX references and observations from named documents remain separate reach facts;
unopened frames and future state are unknown.

**The runtime cannot ship as-is.** A `cloneElement` fixture renders `Cloned` with
normal React but `Original` with the wrappers: they changed the component element's
props/type contract. The tested DOM ref survives and the portal renders; memo and
forwardRef ancestry refuse. Class/lazy components, Suspense, transitions, slot
cloning and general imperative DOM behavior have no compatibility proof. The
source reader also refuses indirect/re-exported/namespace bindings, arrow
component definitions, possible local shadowing, spreads and transformed data.

The experimental IDs follow mounted hook lifetime, not application data identity.
React documents that distinction for [useId](https://react.dev/reference/react/useId).
The tests supply the evidence for this pinned client-only runtime; that API does
not promise a general component-attribution mechanism.
