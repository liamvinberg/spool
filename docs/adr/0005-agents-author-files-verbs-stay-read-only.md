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

Hands adjust what an agent authored through typed source operations. For admitted literal text and supported literal attributes, including shared source, the daemon owns the complete original source read and an opaque undo receipt. The read binds the original mounted occurrence, compiler publication, source role and edit generation. Completion and inverse revalidate the canonical source boundary, captured bytes and file identity. They replace only the planned spans and deliver acknowledged publications to the existing affected frames. Each publication retains its own captured dependencies and admission. Other current property operations retain their original span-patch gate while their consumers migrate to the same source-owner contract.

Delete uses that same source owner for one original authored structural unit. It preserves the original parent and source scope, including a supplied value whose removal reveals the application's authored fallback. Required carrier inputs, unrelated output and stable surviving identities constrain admission; deleting a larger unit or inventing keys cannot evade those constraints. Rendered verification checks canonical membership under the original attributed parents independently for each affected use. A disappeared selected node alone is not success. Undo restores the source unit through its guarded receipt; ordinary React may remount the restored child.

The bundled agent shares the source owner for its actual file tools. A complete returned Read and the executed matcher spans can preserve independent changes through hand save and Undo/Redo. Whole-file Write is an opaque current-base replacement, including identical bytes; creating source requires checked absence. These records belong to the actual project, persisted thread, model session and supervised host lifetime. They never enter model input or a command environment. Lost observation or acknowledgement requires fresh authority; a lost acknowledgement is never replayed.

Fingerprints are content hashes, not a guarantee against other processes saving. Detected competing source edits refuse without overwriting them. Ordinary files remain directly writable by external editors, shell commands, resource loaders and embedded Claude. Those routes retain their existing access and permissions and remain outside the coordinated source guarantee. A save after the final check, an unobserved outside operation or an editor saving an old buffer remains outside the guarantee. The canvas saves completed edits automatically; another tool can still overwrite those ordinary files. A missing acknowledgement is an unknown outcome and does not trigger a retry.

Hand Undo changes source; it does not restore application state or external effects. A shared source receipt survives its initiating consumer leaving or being deleted while the actual source role, bindings and required dependencies remain valid. Mounted uses are observed again for inverse delivery; with none mounted, source can still be restored without claiming a rendered result. An unavailable source inverse stays at the top of the existing canvas history and is explained instead of silently skipped. These records end with their daemon and canvas lifetimes.

The asset swap is the one op that reaches beyond the file it splices (#260). A picture dropped on an `<img>` is written beside the frame that draws it, the import is written, and the `src` is pointed at its identifier — because the asset rule makes an image an import, so there is no string a hand could type instead. It is still one op, one gate and one undo; what the undo puts back is the source, and the picture stays in the folder, since a file spool wrote into somebody's repo is theirs to keep or delete.
