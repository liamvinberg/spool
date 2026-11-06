# #223 · Two local copies of one team project break every read verb

- State: open
- Labels: bug, needs-triage
- Created: 2026-11-05T18:38:10.551Z
- Updated: 2026-11-05T18:38:10.551Z

Found in task 435 (2026-11-05). Two agent-hub worktrees of sandbox each ran `spool open` on `lab/`, both local copies of the team project devosurf/lab. After that, `spool shot` (and the other read verbs) failed in both, whichever copy they ran from:

```
harness/harness-sprout: failed
  "lab" names 2 registered projects:
  .../433-research-shwn-design-for-spool-sandbox/lab
  .../435-explore-a-canvas-based-agent-harness-cat/lab
```

The skill says a lane is "one more local copy of the same live canvas", so two lanes at once should work. Resolution should go by the cwd's walk-up root, not the project's name. Workaround used: `spool remove` one copy and work in the other.
