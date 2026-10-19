# #36 · shared/ files compile without the project's tsconfig options and package type

- State: closed
- Labels: needs-triage, bug
- Created: 2026-10-18T17:43:55.628Z
- Updated: 2026-10-18T17:43:58.058Z
- Closed: 2026-10-18T17:43:58.058Z

Found while reviewing #34 (pre-existing, unchanged by it). A file reached through a `shared/` import is answered by Spool's esbuild plugin rather than esbuild's own resolver, and esbuild only attaches tsconfig compiler settings and the package.json `"type"` to files its own resolver finds. So with `useDefineForClassFields: false` or `experimentalDecorators: true` in a tsconfig above `design/`, or `"type": "module"` in a package.json above it, `shared/x` compiles differently from the same file imported as `../../shared/x`. Verified with probe builds on esbuild 0.28.1.

Decide whether frames should honour a project tsconfig above `design/` at all; then make `shared/` and relative imports compile the same either way. Candidate for a public issue once confirmed as user-facing.

*From Linear DEV-135.*

Related: #34

Plane: SPOOL-36

## Comments

### agent, 2026-10-18T17:43:58.051Z

**Liam, 2026-10-13:** Fixed by spool b39740f5 (compile: pin frames to core's own typescript settings): a tsconfig above design/ no longer changes what a frame compiles to, tested in src/daemon/compile.test.ts. Closed in agent-hub task 146.
