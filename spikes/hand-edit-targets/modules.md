# Lazy and composite module probes

Disposable source-read evidence, extending [source continuity](continuity.md).
No production module imports this directory.

```sh
pnpm exec vitest run --config spikes/hand-edit-targets/vitest.config.ts --maxWorkers=1 --testTimeout=30000
pnpm exec tsc -p spikes/hand-edit-targets/tsconfig.json --noEmit
```

`modules.test.ts` exercises multiple star-export routes, valid cycles, nested
namespace exports, three bounded lazy-loader forms, suspended and abandoned
candidates, changed relationships, and pre-publication dependency discovery.
Set `MODULE_EVIDENCE` to a JSON path to retain observations. Require a successful
complete run; a reporter can write partial evidence after a failure.

An export binding is a module's actual named slot. Two different slots can hold
the same function value without becoming the same export binding. The resolver
keeps that distinction until it follows the component value. Explicit exports
win over stars, stars exclude default, and a cycle contributes no definition
on its own. Every traversed module remains a dependency.

```text
original JSX call -> exact lazy element type -> committed resolved component
       |                                             |
verified loader -> export binding chain -> original source definition
```

The runtime reads the pinned React DOM 19.2.7 production commit, lazy payload
status and original element identity. The pinned renderer stores its lazy
resolution in `Fiber.type`. The observer does not call the loader, initializer,
or namespace getter again. It does not mutate elements, props, refs or Fibers.
This relies on private renderer fields and the existing exclusive DevTools hook;
other versions, builds and hook coexistence have no new proof.

Literal dynamic-import paths enter the source-owner capture before compilation.
If the compiler discovers additional modules, that build is discarded. The
expanded inputs receive a new capture through the existing `ReadAuthority`
interface, then a fresh build must stabilize before any document is published.
A dynamic import pattern also retains a conservative design-directory membership
snapshot, so a new matching file retires the read. This is temporary compile
input evidence, not a persistent document model. Its scan cost is unmeasured.

In the original observation modes, the three bounded lazy forms are a literal `import()` default, a direct named
export projection through `.then`, and `Promise.resolve` of a verified imported
namespace. Conditional modules, dynamic specifiers, transformed projections,
and arbitrary loader functions still refuse attribution. Glob discovery proves
admission of the compiler's input set, not the origin of a dynamic loader's
chosen component. Stateful parameter text and cloning retain their source-reader refusals;
the original observation mode still refuses memo. The separate reconciled
renderer mode and its committed-call tests remain intact. A successful source read is not a writer,
inverse, live handover, complete reach count, or production admission proof.

`lazy-choices.test.ts` adds the opt-in `lazy-observed` and `lazy-reconciled`
compiler probes. Run it with the same commands above; `LAZY_CHOICE_EVIDENCE`
retains its observations. These modes keep executed module/export records for
conditional and computed loaders. They do not change the original observation
or reconciled-renderer tests or their support boundaries. Neither mode is
imported by production code.
