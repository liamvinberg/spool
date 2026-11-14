# #352 · AGENTS.md: merge with ci-gate --land

- State: closed (done)
- Labels: ready-for-agent
- Created: 2026-11-13T15:14:21.934Z
- Updated: 2026-11-13T15:23:45.647Z
- Closed: 2026-11-13T15:23:45.647Z

From devops task 654 (spec devops#7, ticket devops#14, landed 2026-11-13).

## Why

On the night of 2026-11-12 a builder's merge from a stale main dropped work another builder had merged a minute earlier; main was red for ten minutes. `ci-gate` (on devobee's PATH, from the devops repo's `ci/`) now has `--land`: main only ever fast-forwards to a commit that contains the latest main and that CI passed on, exactly. It was proven on the devops repo with two branches landing against each other.

## What to change

In `AGENTS.md`, the bullet that says the full suite is CI's job and tells builders to run `ci-gate --input darwin=false` and "Merge only on green, as a fast-forward of the latest main". Keep what it says about the suite, `darwin`, and reproducing a failing file; replace the gate-then-merge-yourself part with this, fitted to the bullet's wording:

> Merge with `ci-gate --land --input darwin=false`, never by merging into main and pushing yourself. It merges origin's main into your branch if it lacks it (a merge, not a rebase), checks that exact commit in CI, and on green fast-forwards main to it, never forced, going round again (3 rounds at most) if main moved meanwhile. Exit 0: landed; run the line it prints to bring the local main checkout up to date. 1: red (main untouched), or a merge conflict: resolve the files it names, commit, run it again. 2: main kept moving, it timed out, or a push was refused: run it again, or read its sentence.

`ci-gate --input darwin=false` without `--land` stays the way to check a branch that is not ready to merge. `ci-gate --help` has the rest.

## Leave alone

`CONTRIBUTING.md` (outside contributors have no ci-gate), the workflows, everything else in `AGENTS.md`.

## Done when

- [ ] The bullet reads as above on main, and this change itself was landed with `ci-gate --land --input darwin=false` (say what it printed in the closing comment).
- [ ] Open spool tickets that quote the old merge line get a one-line comment pointing at the new one.

## Comments

### agent, 2026-11-13T15:23:45.647Z

Landed with `ci-gate --land --input darwin=false`. First run: red, `tests (3)` failed on `src/daemon/hands-api.test.ts` ("publishes a geometry event, never a frame change, for sidecar writes", an SSE test that passed on retry; unrelated to a docs-only change), `not landed: main is untouched.` Second run: `green: 13 passed, 3 skipped`, then `landed: 8258debab3643002ca8fe3563b07d9884507346b is origin's main now`. Local main checkout brought up with the printed `git merge --ff-only`. The AGENTS.md bullet now reads as the ticket asked. Open tickets quoting the old merge line (#330, #332) got a one-line comment pointing at the new one.
