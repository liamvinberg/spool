/**
 * The terminal navigation escape (#42): a term.tsx signals a walk by printing
 * one private OSC over its own stdout — in-band, so it needs no side channel
 * and no daemon awareness in the app. The daemon filters the PTY stream
 * through this parser: spool's sequence is consumed into a nav event, every
 * other byte — other OSCs included — passes through exactly as written.
 * Edges are never minted here; a nav can only verify what the static parse
 * already claimed (the flow-map law).
 */

const ESC = 0x1b;
const BEL = 0x07;
const OPEN = 0x5d; // "]"
const BACKSLASH = 0x5c;
const PREFIX = "\x1b]7770;go;";

/** A sequence longer than any frame name is noise — flush it as output. */
const MAX_SEQUENCE = 1024;

/** The escape the runtime helper prints for a target. */
export function navSequence(target: string): string {
	return `${PREFIX}${target}\x07`;
}

export interface OscResult {
	out: Uint8Array;
	navs: string[];
}

/**
 * A stateful stream filter: push PTY output chunks, receive passthrough bytes
 * plus any completed spool navs. Sequences may split across chunks.
 */
export function createOscFilter(): { push(chunk: Uint8Array): OscResult } {
	const prefix = new TextEncoder().encode(PREFIX);
	/** Bytes held back because they may open a spool nav; [] when passing through. */
	let held: number[] = [];

	function isNavPrefix(length: number): boolean {
		for (let i = 0; i < length && i < prefix.length; i++) {
			if (held[i] !== prefix[i]) return false;
		}
		return true;
	}

	function push(chunk: Uint8Array): OscResult {
		const out: number[] = [];
		const navs: string[] = [];
		for (const byte of chunk) {
			if (held.length === 0) {
				if (byte === ESC) held.push(byte);
				else out.push(byte);
				continue;
			}
			held.push(byte);
			if (held.length === 2 && byte !== OPEN) {
				out.push(...held.splice(0));
				continue;
			}
			if (!isNavPrefix(Math.min(held.length, prefix.length))) {
				out.push(...held.splice(0));
				continue;
			}
			const terminated =
				byte === BEL ? held.length - 1 : byte === BACKSLASH && held[held.length - 2] === ESC ? held.length - 2 : -1;
			if (terminated >= 0) {
				if (terminated > prefix.length) {
					const target = new TextDecoder().decode(new Uint8Array(held.slice(prefix.length, terminated)));
					navs.push(target);
				}
				held = [];
				continue;
			}
			if (held.length > MAX_SEQUENCE) out.push(...held.splice(0));
		}
		return { out: new Uint8Array(out), navs };
	}

	return { push };
}
