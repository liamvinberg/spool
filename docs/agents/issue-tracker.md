# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues in `liamvinberg/spool`. Use the GitHub connector when available and the `gh` CLI for operations the connector does not cover.

## Conventions

- Create a spec or ticket as a GitHub issue.
- Read an issue with all comments and labels before acting on it.
- Apply and remove labels without replacing unrelated labels.
- Infer the repository from the local `origin` remote when using `gh`.
- GitHub shares one number space across issues and pull requests, so resolve an ambiguous `#N` before mutating it.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `liamvinberg/spool`.

## When a skill says "fetch the relevant ticket"

Read the GitHub issue body, comments, and labels.

## Wayfinding operations

- A wayfinder map is one issue labelled `wayfinder:map`.
- Decision tickets are child issues using the matching `wayfinder:<type>` label.
- Use GitHub's native sub-issue and dependency relationships where available.
- Fall back to task-list and `Blocked by:` references only when the native relationship is unavailable.
- Claim work by assigning the issue to the driving developer.
