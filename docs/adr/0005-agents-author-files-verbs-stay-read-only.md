# Agents author files; project read verbs stay read-only

> Amended by #68. Read-only describes frame authoring and the project read
> verbs, not lifecycle commands that own machine-global registration.
>
> Amended by #253. Hands write frame source too, and only one way: as span
> patches, gated, with the same undo surface geometry already has.
>
> Amended by #260. One of those ops writes a file as well: an image in a frame
> is an import and never a URL, so pointing a `src` at a picture puts the
> picture in the project and writes the import that reaches it.

There is no `spool new` or frame-authoring write verb: a frame is born by writing `frames/<name>/frame.tsx`, and the project read verbs only observe (`selection`, `flows`, `shot`, `logs`, `url`, `skill`) (#6). Lifecycle commands are separate: `init` and `open` register and open a project, while `remove` forgets one registered root without touching its files. Spool serializes those machine-global registry and session writes.

Multi-agent frame safety remains by construction. Agents never write app-owned files, and parallel authors work in separate frame folders without a shared registry. Any future frame-authoring convenience must stay filesystem-first rather than becoming an API agents contend on.

Hands adjust what an agent authored, through one lane and no other (#253). A hand edit is a typed op naming the stamp it acted on and a fingerprint of the file the canvas read; the daemon parses the file fresh, gates the op, and splices the exact characters, leaving every other byte as it was. A mismatched fingerprint refuses rather than clobbering, which is what makes an agent and a human safe in the same file at the same time. The op stores its inverse and joins the undo stack the canvas already keeps for geometry. Authoring stays the agent's: hands change values, never structure.

The asset swap is the one op that reaches beyond the file it splices (#260). A picture dropped on an `<img>` is written beside the frame that draws it, the import is written, and the `src` is pointed at its identifier — because the asset rule makes an image an import, so there is no string a hand could type instead. It is still one op, one gate and one undo; what the undo puts back is the source, and the picture stays in the folder, since a file spool wrote into somebody's repo is theirs to keep or delete.
