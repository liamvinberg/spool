/**
 * The command a person or agent runs this CLI with, for hints that name a verb to run. The checkout entry
 * (`src/dev.ts`) marks itself, since under it a bare `spool` is a different instance on a different version.
 */
let invokedAs = "spool";

/** Called by the checkout entry before the CLI loads. */
export function markCheckoutCli(): void {
	invokedAs = "pnpm -s dev";
}

/** `spool`, or the checkout's own command. */
export function cliName(): string {
	return invokedAs;
}
