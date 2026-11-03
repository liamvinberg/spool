# Knobs: a hand tunes the values an agent declares

A frame may declare **knobs** with `ui.knobs({...})`: named values, each with a type and a literal `value`, that a person tunes from the properties rail. Dragging updates the running frame; letting go writes the literal back into the TSX through the write lane, addressed by the call's stamp, as one more op. The file stays the only record of the frame (#220).

**What this amends.** [ADR-0009](./0009-hand-edits-write-the-tsx-where-it-is-written.md) rejected "controls a component has to declare before a hand may touch it". That still stands: knobs are opt-in, nothing requires them, and every existing frame keeps the hand edits it had. What changes is that an agent may now offer values for a hand to tune, and a hand may write those literals and nothing else beyond the four ops. Class editing stays the agent's; a knob reaches a class only because the agent wrote the class to read it.

**Why in the source and not a sidecar or a database.** A literal in the frame is already what syncs to the team, what the history keeps, what undo reverses and what an agent reads when it ports the design into the product. A sidecar would be a second record of what the frame draws, which 0009 refused, and a database would keep the tuned values somewhere the code can't see them.

**Why the agent declares them.** Which values need taste is a judgement about the design, the same kind the agent already makes when it writes the frame. A schema the agent writes gives each value the control that suits it (a curve for an easing, swatches for a colour, pictures for a variation) instead of one generic field.

**Accepted trades.** A knob whose value the agent computed can't be written and shows read-only. A tuned value replaces the agent's in the file, so there is no Reset beyond undo and history. An agent rewriting a frame has to keep values a person tuned.
