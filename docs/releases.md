# Releases

Spool uses Semantic Versioning, Conventional Commits, and Release Please to publish `spool.page`. Commit types describe the effect on people using the published package, not the files changed or the implementation work performed.

## Classify a change

| Type | Use when | Release effect | Changelog |
| --- | --- | --- | --- |
| `feat:` | The published product gains a capability | Minor | Features |
| `fix:` | Published behavior is incorrect and becomes correct | Patch | Bug fixes |
| `polish:` | Published behavior is visibly refined without adding a capability or correcting a defect | None by itself | Polish in the next release |
| `design:` | The change is confined to the `design/` dogfood canvas | None | Omitted |
| `refactor:` | Internal structure changes without changing published behavior | None | Omitted |
| `docs:`, `test:`, `chore:`, `build:`, `ci:` | The published product does not change | None | Omitted |

Add `!` after any type, or a `BREAKING CHANGE:` footer, when the public contract becomes incompatible. Before `1.0.0`, Spool's Release Please configuration treats a breaking change as a minor bump. From `1.0.0` onward, it is a major bump.

Classify the net user-visible result. A scope does not change the release effect, so `feat(design):` is still a minor release. Split mixed changes into atomic commits; if a squash title represents several changes, use the highest release impact among them.

Examples:

```text
feat: add automatic update checks
fix: keep canvas zoom inside entered frames
polish: tighten update toast spacing
design: explore compact update toast
refactor: extract frame label component
```

## Choose the version

Release Please reads commits on `main` since the previous release and applies the highest required bump:

- only fixes produce a patch release
- any feature produces a minor release
- any breaking change produces a major release, except for Spool's pre-`1.0.0` rule above
- commits with no release effect do not open or bump a release by themselves

Do not edit the generated version, manifest, or changelog to counteract a misclassified commit. Correct the classification before merging when possible; use Release Please's explicit `Release-As:` override only when the intended version cannot be expressed by the commit history.

## Publish a release

1. Changes land on `main` with correctly classified commit or squash titles.
2. The publish workflow creates or updates one release PR containing the next version, manifest, and changelog.
3. The release PR stays open while more changes accumulate. Merging it is the human release gate.
4. Release Please creates the Git tag and GitHub release from the merged release PR.
5. The publish job checks out that tag, runs the full gates, and publishes `spool.page` to npm through trusted publishing.

If the publish gates fail, the Git tag and GitHub release may exist while npm remains unpublished. Fix the failure and rerun the publish job for that release rather than creating a new version.
