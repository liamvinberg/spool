---
"spool.page": minor
---

The daemon can now run your own installed Claude Code and stream a turn back as it happens. It spawns the `claude` already on your PATH and reuses the login you already have, so there is no second sign-in and no key to paste anywhere. Writing under `design/` runs without asking. Everything outside it needs your say-so, and until the chat panel exists to ask you, the agent is simply refused there and stops. Your own settings, skills, connectors and hooks come along with it. The project's settings file does not, so opening someone else's design cannot change what your agent is allowed to do. Nothing draws any of this yet: the canvas rail that talks to it comes next.
