# Agents author files; project read verbs stay read-only

> Amended by #68. Read-only describes frame authoring and the project read
> verbs, not lifecycle commands that own machine-global registration.

There is no `spool new` or frame-authoring write verb: a frame is born by writing `frames/<name>/frame.tsx`, and the project read verbs only observe (`selection`, `flows`, `shot`, `logs`, `url`, `skill`) (#6). Lifecycle commands are separate: `init` and `open` register and open a project, while `remove` forgets one registered root without touching its files. Spool serializes those machine-global registry and session writes.

Multi-agent frame safety remains by construction. Agents never write app-owned files, hands never write source, and parallel authors work in separate frame folders without a shared registry. Any future frame-authoring convenience must stay filesystem-first rather than becoming an API agents contend on.
