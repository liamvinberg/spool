# Agents author files; project read verbs stay read-only

> Amended by #68. Read-only describes frame authoring and the project read
> verbs, not lifecycle commands that own machine-global registration.
>
> Amended by #253. Hands write frame source too, and only one way: as span
> patches addressed by the compile-time stamp, gated, with the same undo
> surface geometry already has.
>
> Amended by #260. One of those ops writes a file as well: an image in a frame
> is an import and never a URL, so pointing a `src` at a picture puts the
> picture in the project and writes the import that reaches it.
>
> Amended by #317. A hand takes an element out of the file and hides one too,
> so the lane's ops are seven rather than four. Adding an element and moving
> one are still nobody's but the agent's.
>
> Amended by #320. The retained source owner that #305 put between the hand
> and the file is gone, and with it the source observers, per-use
> verification and the agent's coordinated file tools. The stamp-addressed
> lane below is the one path again; the bundled agent's file tools write
> ordinary files directly, as every other agent's do.

There is no `spool new` or frame-authoring write verb: a frame is born by writing `frames/<name>/frame.tsx`, and the project read verbs only observe (`selection`, `flows`, `shot`, `logs`, `url`, `skill`) (#6). Lifecycle commands are separate: `init` and `open` register and open a project, while `remove` forgets one registered root without touching its files. Spool serializes those machine-global registry and session writes.

Multi-agent frame safety remains by construction. Agents never write app-owned files, and parallel authors work in separate frame folders without a shared registry. Any future frame-authoring convenience must stay filesystem-first rather than becoming an API agents contend on.

Hands adjust what an agent authored, through one lane and no other (#253). A hand edit is a typed op naming the stamp it acted on and a fingerprint of the file the canvas read; the daemon parses the file fresh at that stamp, gates the op, and splices the exact characters, leaving every other byte as it was. A mismatched fingerprint refuses rather than clobbering, which is what makes an agent and a human safe in the same file at the same time. Fingerprints are content hashes, not a guarantee against other processes saving: ordinary files stay directly writable by editors, shell commands and agents, and a history entry whose fingerprint has moved is dropped with a note rather than written over the newer content. The op carries its inverse and joins the undo stack the canvas already keeps for geometry. Authoring stays the agent's: a hand changes what is already written and takes what is written away, and nothing in the lane adds an element or moves one.

The asset swap is the one op that reaches beyond the file it splices (#260). A picture dropped on an `<img>` is written beside the frame that draws it, the import is written, and the `src` is pointed at its identifier, because the asset rule makes an image an import, so there is no string a hand could type instead. It is still one op, one gate and one undo; what the undo puts back is the source, and the picture stays in the folder, since a file spool wrote into somebody's repo is theirs to keep or delete.
