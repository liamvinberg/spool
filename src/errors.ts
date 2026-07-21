/** A user-facing failure: the CLI prints its message and exits 1, no stack. */
export class SpoolError extends Error {
	override readonly name = "SpoolError";
}
