# #328 · The beta build should retry by itself: no macOS runner, and the update cover's 5 s smoke

- State: open
- Labels: needs-triage, bug
- Created: 2026-11-13T06:07:10.404Z
- Updated: 2026-11-13T06:07:10.404Z

Reported by task 557, looked at by devops task 654 (2026-11-13).

On the evening of 2026-11-12 the beta workflow (`.github/workflows/beta.yml`, macos-15) was cancelled by GitHub several times after 15 minutes with "The job was not acquired by Runner" (GitHub had no macOS machine free), and failed the Mac app's smoke twice with "The update cover did not respond" (the 5 s deadline in `desktop/src/update-cover.ts`), passing on a rerun. Each time a fix reached Liam's Spool Beta late, until someone reran it by hand. The run list for that evening shows five cancelled and one failed run between 21:16 and 21:55 UTC.

**Recommendation from devops:**
- **Rerun once by itself.** A small workflow triggered by `workflow_run` of beta, which, when the run ended failed or cancelled on its first attempt and was not superseded by a newer push, reruns its failed jobs (`gh run rerun --failed`, `actions: write`). One retry only, so a real failure still shows red.
- **The smoke's deadline**: 5 s is tight on GitHub's shared Macs. Find out whether the cover is slow or the smoke starts measuring too early, then lengthen or retry inside the smoke; that is spool's call.
- **Not its own runner.** Our runners refuse public repos by design (anyone can open a pull request against one), the m1 is the busiest machine we have, and this job signs and notarises, so its secrets would sit on a shared Mac.

**Also asked of spool, from the same night:** a builder's merge from a stale main dropped another's work for ten minutes. devops#14 adds `ci-gate --land` (main only fast-forwards to a commit CI passed on). Beside it, switch on a rule for main that refuses force pushes and deletion: the "Main ruleset" on the repo exists but is disabled; check what it holds first, and if it also demands pull requests or required checks, make a separate one with only those two rules, so direct pushes by builders keep working.
