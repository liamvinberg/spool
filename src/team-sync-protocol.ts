/**
 * The sync protocol between a team project's sync object and each editor's daemon: the contract, versioned.
 * This is its one copy: spool-cloud's sync object imports it as `spool.page/sync-protocol`.
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
	/** Whose save stands, and from which machine. */
	by: { accountId: string; device: string };
}

/** Object → daemon: a save that can't be taken at all, such as a path outside the layout. */
export interface Refused {
	type: "refused";
	ref: string;
	path: string;
	reason: "outside_layout" | "invalid_save" | "too_large" | Unauthorized | Limited;
	/** For a limit: seconds until it may lift, when the object can say. */
	retryAfter?: number;
}

/**
 * Daemon → object: send the team's version of these paths again. A local copy asks when git wrote over them (a
 * checkout, pull, reset or merge), so it can put the team's version back instead of sending git's. Answered with a
 * `file` for each path the team has; a path it never had is left out.
 */
export interface Resend {
	type: "resend";
	paths: string[];
}

/** The most paths one `resend` may name; a local copy asks for more in several. */
export const RESEND_PATHS = 500;

/**
 * Daemon → object: the agent this daemon runs on the project finished its turn. The pages its person saved to
 * settle for outsiders (unless someone else is saving to them too); an agent the daemon did not start never says
 * this, and its pages settle after a quiet spell instead.
 */
export interface TurnEnded {
	type: "turn-ended";
}

export type DaemonMessage = Hello | Save | Resend | TurnEnded;
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

// Guarded sync: who may write, and the fair-use limits. The object enforces them; the daemon says why.

/**
 * Why a save from this connection is refused before anything else is looked at. `signed_out`: its device
 * session was revoked or has expired. `not_editor`: its account is no longer an editor or admin of the team,
 * or the team or the project is gone. The object closes the connection after either.
 */
export type Unauthorized = "signed_out" | "not_editor";

/**
 * A fair-use limit the save would pass, or the object couldn't check the save at all. Sync pauses until it
 * lifts, and the file stays where it was written.
 */
export type Limited = "project_full" | "rate_limited" | "monthly_limit" | "unavailable";

/** The largest file that travels; a bigger one is refused as `too_large` and stays on its machine. */
export const FILE_LIMIT_BYTES = 25_000_000;
/** The most a team project's design/ may hold. */
export const PROJECT_LIMIT_BYTES = 1_000_000_000;
/** Saves a team project takes in any minute, from everyone together. */
export const SAVES_PER_MINUTE = 120;
/** Saves one editor makes to a team project in a calendar month (UTC). */
export const SAVES_PER_MONTH = 30_000;

/*
 * Why the object closed a connection, every code it closes with. A daemon answers each as it says.
 */

/** A message the object can't take: outside the layout, malformed, or before `hello`. A broken peer; no retry helps. */
export const CLOSE_INVALID = 4400;
/** Its device session was revoked or has expired. */
export const CLOSE_SIGNED_OUT = 4401;
/** The account no longer edits this team project, or it is gone. A browser watching a canvas: no longer a member. */
export const CLOSE_NOT_EDITOR = 4403;
/** The daemon speaks another `PROTOCOL_VERSION`. */
export const CLOSE_PROTOCOL = 4406;
/** The object couldn't check who may sync just now: the daemon reconnects, as after any dropped line. */
export const CLOSE_UNAVAILABLE = 1011;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/*
 * Collisions. First to reach the team stands and a later save built on an older version is set aside, with two
 * exceptions: an edit beats a delete, and canvas.json is merged key by key instead of colliding.
 */

/**
 * Object → the daemons of the machine whose delete was undone: a teammate's edit, built on a version from before
 * the delete, reached the team after it, and an edit beats a delete. The file itself comes back to everyone as an
 * ordinary `file`; this tells the machine that deleted it why. A machine that was away is told when it catches up.
 */
export interface Restored {
	type: "restored";
	path: string;
	/** The team version the edit made. */
	version: Version;
	by: { accountId: string; device: string };
}

/** The one file that never collides. */
export const CANVAS_PATH = "canvas.json";

/** canvas.json's keys whose own keys are merged one at a time: each page's place. */
const MERGED_PER_ENTRY = new Set(["places"]);

/**
 * canvas.json as it is once a save built on `base` meets the team's version: each top-level key, and each page's
 * place, is taken from the save where the save changed it from `base` and from the team's version otherwise, so
 * the last write to each key wins. Null when the team's version or the save isn't a JSON object, which then
 * collides like any other file. A base the team no longer has, or never had, counts as empty.
 */
export function mergeCanvas(base: Uint8Array | null, team: Uint8Array, mine: Uint8Array): Uint8Array | null {
	const theirs = canvasObject(team);
	const ours = canvasObject(mine);
	if (theirs === null || ours === null) return null;
	const was = (base === null ? null : canvasObject(base)) ?? {};
	const merged = mergeKeys(was, theirs, ours, (key, before, after, now) =>
		MERGED_PER_ENTRY.has(key) ? mergeEntries(before, after, now) : after,
	);
	return new TextEncoder().encode(`${JSON.stringify(merged, null, "\t")}\n`);
}

type Entries = Record<string, unknown>;

/** Every key the save changed from its base, taken onto the team's version; `take` says what a changed key becomes. */
function mergeKeys(
	was: Entries,
	theirs: Entries,
	ours: Entries,
	take: (key: string, before: unknown, after: unknown, now: unknown) => unknown,
): Entries {
	const merged: Entries = { ...theirs };
	for (const key of new Set([...Object.keys(was), ...Object.keys(ours)])) {
		if (JSON.stringify(ours[key]) === JSON.stringify(was[key])) continue;
		const value = take(key, was[key], ours[key], theirs[key]);
		if (value === undefined) delete merged[key];
		else merged[key] = value;
	}
	return merged;
}

/** One map of entries merged entry by entry; a map left empty is no key at all, as canvas.json writes it. */
function mergeEntries(before: unknown, after: unknown, now: unknown): unknown {
	if (after !== undefined && !isRecord(after)) return after;
	const merged = mergeKeys(entries(before), entries(now), entries(after), (_key, _before, value) => value);
	return Object.keys(merged).length === 0 ? undefined : merged;
}

function entries(value: unknown): Entries {
	return isRecord(value) ? value : {};
}

function canvasObject(bytes: Uint8Array): Entries | null {
	try {
		const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/*
 * Presence: where each person is on the team canvas, as it happens. It rides the same connection as ephemeral
 * messages that are relayed to the other people connected and never stored, never in history, never on disk.
 * One person is one account, however many local copies they hold open.
 */

/** Where one person is on a team canvas, and what they're doing there. */
export interface PresenceState {
	/** The page they're on. */
	page: string;
	/** Their pointer in the page's world coordinates, or null while it's off the canvas. */
	pointer: { x: number; y: number } | null;
	/** Pressing, so their name shows. */
	pressed: boolean;
	/** The frames they're moving now. */
	dragging: string[];
	/** The frame they're inside live. */
	inside: string | null;
	/** The world rectangle their canvas shows: what following them shows. */
	view: { x: number; y: number; w: number; h: number } | null;
	/** How many presses they've made inside live frames: each new one is a click the others see land. */
	clicks?: number;
	/**
	 * How far they've scrolled inside the frame they're in, every scroller in it added up, in the frame's own
	 * pixels: a change is a scroll the others see, and which way it went. Only its changes mean anything.
	 */
	scrolled?: { x: number; y: number } | null;
}

/** Daemon → object: this local copy's person is here, or has left (null). Sent only once caught up. */
export interface PresenceUpdate {
	type: "presence";
	state: PresenceState | null;
}

/** Who a person is to the team canvas: their account, the name their pill says, and their colour in the team. */
export interface PresencePerson {
	accountId: string;
	name: string;
	color: string;
}

/**
 * Object → daemon: where another person is now, or that they've left (null). `still` is how many milliseconds
 * ago that changed: 0 as it happens, more in the catch-up a newcomer is sent.
 */
export interface Presence {
	type: "presence";
	person: PresencePerson;
	state: PresenceState | null;
	still: number;
}

/** What a name in a presence message may be: a page or a frame. Small, so a person's whole state stays small. */
const PRESENCE_NAME = 160;
/** The frames a dragging pointer names, at most. */
export const PRESENCE_DRAGGING = 4;

/** A well-formed presence message, as a daemon or a browser hears it; undefined for anything else. */
export function readPresence(message: Record<string, unknown>): Presence | undefined {
	const { person, still } = message;
	const state = readPresenceState(message.state);
	if (message.type !== "presence" || state === undefined || typeof still !== "number" || !isRecord(person))
		return undefined;
	const { accountId, name, color } = person;
	if (typeof accountId !== "string" || typeof name !== "string" || typeof color !== "string") return undefined;
	return { type: "presence", person: { accountId, name, color }, state, still };
}

/** A well-formed presence state, copied field by field; null for "left"; undefined for anything else. */
export function readPresenceState(value: unknown): PresenceState | null | undefined {
	if (value === null) return null;
	if (!isRecord(value)) return undefined;
	const { page, pointer, pressed, dragging, inside, view, clicks, scrolled } = value;
	if (!isPresenceName(page) || typeof pressed !== "boolean" || !(inside === null || isPresenceName(inside)))
		return undefined;
	if (!Array.isArray(dragging) || dragging.length > PRESENCE_DRAGGING || !dragging.every(isPresenceName))
		return undefined;
	if (!(pointer === null || (isRecord(pointer) && finite(pointer.x) && finite(pointer.y)))) return undefined;
	if (!(view === null || (isRecord(view) && finite(view.x) && finite(view.y) && finite(view.w) && finite(view.h))))
		return undefined;
	if (!(clicks === undefined || (typeof clicks === "number" && Number.isSafeInteger(clicks) && clicks >= 0)))
		return undefined;
	if (
		!(scrolled === undefined || scrolled === null || (isRecord(scrolled) && finite(scrolled.x) && finite(scrolled.y)))
	)
		return undefined;
	return {
		...(clicks === undefined ? {} : { clicks }),
		...(scrolled === undefined
			? {}
			: { scrolled: scrolled === null ? null : { x: scrolled.x as number, y: scrolled.y as number } }),
		page,
		pointer: pointer === null ? null : { x: pointer.x as number, y: pointer.y as number },
		pressed,
		dragging: [...dragging],
		inside,
		view:
			view === null ? null : { x: view.x as number, y: view.y as number, w: view.w as number, h: view.h as number },
	};
}

function isPresenceName(value: unknown): value is string {
	return typeof value === "string" && value.length <= PRESENCE_NAME;
}

function finite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}
