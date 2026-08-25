# Agents author files; project read verbs stay read-only

> Amended by #68. Read-only describes frame authoring and the project read
> verbs, not lifecycle commands that own machine-global registration.
>
> Amended by #253. Hands write frame source too, and only one way: as span
> patches, gated, with the same undo surface geometry already has.

There is no `spool new` or frame-authoring write verb: a frame is born by writing `frames/<name>/frame.tsx`, and the project read verbs only observe (`selection`, `flows`, `shot`, `logs`, `url`, `skill`) (#6). Lifecycle commands are separate: `init` and `open` register and open a project, while `remove` forgets one registered root without touching its files. Spool serializes those machine-global registry and session writes.

Multi-agent frame safety remains by construction. Agents never write app-owned files, and parallel authors work in separate frame folders without a shared registry. Any future frame-authoring convenience must stay filesystem-first rather than becoming an API agents contend on.

Hands adjust what an agent authored, through one lane and no other (#253). A hand edit is a typed op naming the stamp it acted on and a fingerprint of the file the canvas read; the daemon parses the file fresh, gates the op, and splices the exact characters, leaving every other byte as it was. A mismatched fingerprint refuses rather than clobbering, which is what makes an agent and a human safe in the same file at the same time. The op stores its inverse and joins the undo stack the canvas already keeps for geometry. Authoring stays the agent's: hands change values, never structure.
