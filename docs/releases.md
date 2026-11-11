# Releases

Spool uses Semantic Versioning and Changesets to publish `spool.page`. Release impact and changelog text live in `.changeset/` files; commit messages describe the work and never drive a release.

## Add a changeset

When a change alters what someone running the published package sees, land a changeset in the same commit:

```md
---
"spool.page": minor
---

**Frame finder.** Press `/` to search frames by name and jump to one.
```

| Bump | Use when |
| --- | --- |
| `patch` | Published behavior was wrong or rough and is now right |
| `minor` | The published product gains a capability |
| `major` | The public contract becomes incompatible (from `1.0.0`; see below) |

Write the prose for someone reading the changelog, not for a reviewer: what they can do now, or what stopped being broken. Write it the way one person tells another: short plain sentences, no em dashes, no jargon, no flourish. One coherent change per file, and several commits may share one changeset. Name the file after the change (`frame-finder.md`), or let `pnpm changeset` scaffold one.

A `minor` opens with its name in bold, two to four words ending in a period, as above: spool.page/changelog lists it under that name, and its first sentence follows. A `patch` needs none; the changelog shows its first sentence alone, so let that sentence say what is fixed.

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
4. The merge run tags `vX.Y.Z`.
5. The workflow resolves the tag to a commit and requires that commit’s full Linux CI to pass. The publish job checks out that frozen commit, runs the macOS-only cases, and publishes `spool.page` to npm through trusted publishing.
6. The dmg job builds the Mac app on that version, puts it and the app's update feed on `updates.spool.page` (an R2 bucket, where the app updates from and the site links the dmg), then creates the GitHub release with the changelog and the same files. Each feed names a version only once its files are there.

If the publish gates fail, the Git tag may exist while npm remains unpublished and no GitHub release has been created. Fix the failure, then publish that tag by hand with `gh workflow run publish.yml -f tag=vX.Y.Z` rather than creating a new version. Recovery also requires full CI on the tag’s commit. If it has no successful full run, run `gh workflow run ci.yml --ref vX.Y.Z` first; a design-only check does not qualify.

## Try main first: Spool Beta

Every push to `main` whose full CI passed also builds Spool Beta, a second Mac app installed beside Spool that updates itself from `https://updates.spool.page/beta/` and is announced in Discord (`desktop/README.md` says how). Use it before merging the release PR. Everything it ships lives under `beta/` in the bucket; npm, the GitHub release and the bucket's root stay the release's.

Its version is the next patch with the workflow's run number, `X.Y.(Z+1)-beta.N`, so `.github/workflows/beta.yml` keeps its name: GitHub restarts the run number for a renamed workflow, and the installed betas would stop seeing newer builds as newer.
