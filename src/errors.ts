/** A user-facing failure: the CLI prints its message and exits 1, no stack. */
export class SpoolError extends Error {
	override readonly name: string = "SpoolError";
}

/** The serve port is already bound — a sibling daemon, or a stranger. */
export class PortBusyError extends SpoolError {
	override readonly name = "PortBusyError";
}

/**
 * The daemon would not take this cli's control token. Carries the daemon it
 * asked so the boundary can ask health — which needs no token — what version
 * answered: a skew refuses exactly like a bad token and must not be left
 * diagnosed as one (#155).
 */
export class RefusedError extends SpoolError {
	override readonly name = "RefusedError";
	readonly daemonUrl: string;

	constructor(message: string, daemonUrl: string) {
		super(message);
		this.daemonUrl = daemonUrl;
	}
}
