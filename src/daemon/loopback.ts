/**
 * Where the daemon lives, and which hosts count as this machine.
 *
 * A leaf on purpose. These are three facts, and the modules that need them —
 * the request handler deciding who may read health, the CLI naming an address —
 * should not have to import process spawning and the filesystem to get at them.
 * lifecycle.ts owns starting and stopping a daemon; this owns where one is.
 */

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 7766; // SPOO on a phone keypad

/** The hosts the daemon binds, and the hosts allowed to read health cross-origin. */
export function isLoopbackHost(host: string): boolean {
	return host === "127.0.0.1" || host === "localhost" || host === "::1";
}
