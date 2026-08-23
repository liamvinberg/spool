# Releases

Spool uses Semantic Versioning and Changesets to publish `spool.page`. Release impact and changelog text live in `.changeset/` files; commit messages describe the work and never drive a release.

## Add a changeset

When a change alters what someone running the published package sees, land a changeset in the same commit:

```md
---
"spool.page": minor
---

Added the frame finder: press `/` to search frames by name and jump to one.
```

| Bump | Use when |
| --- | --- |
| `patch` | Published behavior was wrong or rough and is now right |
| `minor` | The published product gains a capability |
| `major` | The public contract becomes incompatible (from `1.0.0`; see below) |

Write the prose for someone reading the changelog, not for a reviewer: what they can do now, or what stopped being broken. Write it the way one person tells another: short plain sentences, no em dashes, no jargon, no flourish. One coherent change per file, and several commits may share one changeset. Name the file after the change (`frame-finder.md`), or let `pnpm changeset` scaffold one.

Work with no published effect ships no changeset: the `design/` canvas, docs, tests, CI, refactors, benchmarks.

History commits stay outside all of this. The daemon saves the `design/` canvas by itself, under a fixed `design:` prefix and a one-line count of what it saved, and a save carries no changeset. Nothing in the release path reads a commit message, and the daemon never pushes, so a save never bumps a version and never reaches a changelog.

## Before 1.0.0

Declare a breaking change as `minor` and open its prose with "Breaking:". `1.0.0` is cut deliberately with a `major` changeset when spool is declared stable, never as a side effect of one change.

## Choose the version

The next version applies the highest bump among pending changesets: any pending minor makes a minor release, otherwise a patch release. No pending changesets, no release PR. Do not edit the generated version or changelog on `main` to counteract a misjudged entry; correct the pending `.changeset/` file instead, on the release PR when it is already open.

## Publish a release

1. Changes land on `main`, each carrying its changeset when published behavior changed.
2. The publish workflow keeps one release PR open ("release: spool.page"); its diff is the version bump and the changelog assembled from pending changesets.
3. The release PR stays open while changes accumulate. Editing the pending changeset files is the editorial pass; merging the PR is the human release gate.
4. The merge run tags `vX.Y.Z` and creates the GitHub release.
5. The publish job checks out that tag, reruns the full gates on macOS, and publishes `spool.page` to npm through trusted publishing.

If the publish gates fail, the Git tag and GitHub release may exist while npm remains unpublished. Fix the failure, then publish that tag by hand with `gh workflow run publish.yml -f tag=vX.Y.Z` rather than creating a new version.
