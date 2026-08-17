---
"spool.page": minor
---

The agent rail is now an experiment, and it is off. The canvas opens with the pages rail and your frames, and nothing where the agent used to be. To have it back, add `"experiments": ["agent-panel"]` to `~/.spool/config.json`, beside `updateCheck`, and restart the daemon. The field is a list of names, one per experimental surface, and a name this version of spool does not know is ignored rather than refused, so a config written for a newer spool still boots on an older one.
