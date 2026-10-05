/**
 * The sync protocol between a team project's sync object and each editor's daemon: the contract, versioned.
 * spool-cloud's `src/worker/sync/protocol.ts` is the other copy of this file and the two change together.
 *
 * A daemon opens one WebSocket per local copy, says `hello` with the last team version it has applied, and is
 * sent every path the team changed since. After that each side sends what happens as it happens: the daemon
 * every local save, whole, and the object every teammate's save, in the order the object gave them.
 *
 * Control messages are JSON text frames. A message carrying a file's bytes is a binary frame: a 4-byte
 * big-endian length, that many bytes of JSON header, then the file's bytes exactly as they are on disk.
 */
export const PROTOCOL_VERSION = 1;

/** A team version: the number the object gave the save that made it. Versions only grow. */
export type Version = number;

/** Daemon → object: the first message on a connection. */
export interface Hello {
	type: "hello";
	protocol: number;
	/** The design/ format the daemon writes (core's FORMAT_VERSION). */
	format: number;
	/** The newest team version this local copy has applied; 0 for none. */
	since: Version;
}

/**
 * Daemon → object: one saved file, whole, or its deletion. `base` is the team version the save was built on, null
 * for a path the local copy never had from the team. The bytes ride the binary frame; a delete is a text frame.
 */
export interface Save {
	type: "save";
	/** The daemon's own reference, echoed in the answer. */
	ref: string;
	path: string;
	base: Version | null;
	deleted: boolean;
}

/** Object → daemon: the answer to `hello`, before any catch-up. */
export interface Welcome {
	type: "welcome";
	protocol: number;
	/** The format the team project was started in. */
	format: number;
	/** The newest team version. */
	head: Version;
}

/** Object → daemon: one path as the team has it now, bytes in the binary frame unless it was deleted. */
export interface TeamFile {
	type: "file";
	path: string;
	version: Version;
	deleted: boolean;
	/** Whose save it was, and from which machine. Absent in a catch-up. */
	by?: { accountId: string; device: string };
}

/** Object → daemon: every change since `hello`'s version has been sent. */
export interface CaughtUp {
	type: "caught-up";
	head: Version;
}

/** Object → the saving daemon: its save is the team's version now. */
export interface Saved {
	type: "saved";
	ref: string;
	path: string;
	version: Version;
}

/**
 * Object → the saving daemon: the save was built on a version the team has moved past, so it was kept in history
 * and not applied. The team's version of the path follows as a `file` message.
 */
export interface SetAside {
	type: "set-aside";
	ref: string;
	path: string;
	/** The team's version, which stands. */
	version: Version;
}

/** Object → daemon: a save that can't be taken at all, such as a path outside the layout. */
export interface Refused {
	type: "refused";
	ref: string;
	path: string;
	reason: "outside_layout" | "invalid_save";
}

export type DaemonMessage = Hello | Save;
export type ObjectMessage = Welcome | TeamFile | CaughtUp | Saved | SetAside | Refused;

/** A message and the bytes riding with it, if any. */
export interface Framed<T> {
	message: T;
	bytes?: Uint8Array;
}

/** Text for a control message, a binary frame for one with bytes. */
export function encodeFrame(message: object, bytes?: Uint8Array): string | Uint8Array {
	const header = JSON.stringify(message);
	if (bytes === undefined) return header;
	const head = new TextEncoder().encode(header);
	const frame = new Uint8Array(4 + head.byteLength + bytes.byteLength);
	new DataView(frame.buffer).setUint32(0, head.byteLength);
	frame.set(head, 4);
	frame.set(bytes, 4 + head.byteLength);
	return frame;
}

/** The message in a frame and its bytes; null for anything that isn't a well-formed frame. */
export function decodeFrame(data: string | ArrayBuffer | Uint8Array): Framed<Record<string, unknown>> | null {
	try {
		if (typeof data === "string") {
			const message: unknown = JSON.parse(data);
			return isRecord(message) ? { message } : null;
		}
		const frame = data instanceof Uint8Array ? data : new Uint8Array(data);
		if (frame.byteLength < 4) return null;
		const length = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(0);
		if (4 + length > frame.byteLength) return null;
		const message: unknown = JSON.parse(new TextDecoder().decode(frame.subarray(4, 4 + length)));
		return isRecord(message) ? { message, bytes: frame.slice(4 + length) } : null;
	} catch {
		return null;
	}
}

/**
 * Whether a design/-relative path is Spool's own layout, the only files a sync carries: `canvas.json`,
 * `AGENTS.md`, `CLAUDE.md`, and anything under `frames/` or `shared/` that passes through no dot-folder.
 * `design/.gitignore`, `.spool/` and every foreign dot-folder stay on the machine that wrote them.
 */
export function travels(path: string): boolean {
	if (path === "canvas.json" || path === "AGENTS.md" || path === "CLAUDE.md") return true;
	const segments = path.split("/");
	if (segments.length < 2 || (segments[0] !== "frames" && segments[0] !== "shared")) return false;
	return segments.every((segment) => segment !== "" && !segment.startsWith(".") && !/[\\\0]/u.test(segment));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
