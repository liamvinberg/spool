/** A user-facing failure: the CLI prints its message and exits 1, no stack. */
export class SpoolError extends Error {
	override readonly name = "SpoolError";
}

/** The serve port is already bound — a sibling daemon, or a stranger. */
export class PortBusyError extends SpoolError {}
