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
import { COMMENT_REFUSAL_STATUS } from "./team-sync-comments";

export const PROTOCOL_VERSION = 2;

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
	/**
	 * This connection moves a project in (DEV-232): its saves count against neither the minute's bucket nor the
	 * month while the team project holds nothing but the move's files. An object that doesn't know it counts them.
	 */
	moving?: true;
	/** The daemon reads `files`: what a teammate sent as one bundle comes down as one. */
	bundles?: true;
	/** The daemon reads `presences`: everyone who changed comes down a tick at a time, in one message (#107). */
	ticks?: true;
}

/**
 * How full the team project's minute bucket is, on a welcome and on every answer to a save, so a daemon holds its
 * next save until it fits rather than uploading a file to be refused. Absent for a move, and from an older object.
 */
export interface Pace {
	/** Whole saves the bucket holds now. */
	room: number;
	/** Saves it refills a minute. */
	refill: number;
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
	/** Frames and pages Spool moved, said on the save that deletes their old files: their comments follow them. */
	moved?: Moved;
}

/** Object → daemon: the answer to `hello`, before any catch-up. */
export interface Welcome {
	type: "welcome";
	protocol: number;
	/** The format the team project was started in. */
	format: number;
	/** The newest team version. */
	head: Version;
	pace?: Pace;
	/** The object takes `saves`. An older one doesn't say, and its daemons send each save alone. */
	bundles?: true;
}

/**
 * Daemon → object: saves made together, as a cleanup or an agent's turn makes them, sent as one message and
 * answered with one `answers`. Each is ordered, checked against its own base and applied or set aside on its own, as
 * a lone `save` is; together they take one save from the minute's bucket and count as one of the month's. Their
 * bytes ride the binary frame one after another, each `size` long; a bundle of deletes alone is a text frame.
 */
export interface Saves {
	type: "saves";
	saves: BundledSave[];
	/** Frames and pages Spool moved, said on the bundle that deletes their old files: their comments follow them. */
	moved?: Moved;
}

export interface BundledSave {
	ref: string;
	path: string;
	base: Version | null;
	deleted: boolean;
	/** Its bytes in the frame; 0 for a delete. */
	size: number;
}

/** The most saves one bundle carries. */
export const BUNDLE_SAVES = 1_000;
/** The most bytes one bundle carries, well under the 32 MiB a message to spool.page may be; a bigger file goes alone. */
export const BUNDLE_BYTES = 16_000_000;

/** Object → the saving daemon: the answer to each save in a bundle, in its order, and how full the bucket is now. */
export interface Answers {
	type: "answers";
	answers: (Omit<Saved, "pace"> | Omit<SetAside, "pace"> | Omit<Refused, "pace">)[];
	pace?: Pace;
}

/**
 * Object → a daemon whose hello said `bundles`: a teammate's bundle, every applied save in it, in order. Their
 * bytes ride the binary frame as a bundle's do.
 */
export interface TeamFiles {
	type: "files";
	files: (Omit<TeamFile, "type"> & { size: number })[];
}

/**
 * The bytes of each entry of a bundle, cut from its frame's bytes in order: undefined for a delete. Null when the
 * sizes don't account for the bytes exactly, which no well-formed bundle does.
 */
export function bundleParts(
	entries: readonly { deleted: boolean; size: number }[],
	bytes: Uint8Array | undefined,
): (Uint8Array | undefined)[] | null {
	const parts: (Uint8Array | undefined)[] = [];
	let at = 0;
	for (const { deleted, size } of entries) {
		if (!Number.isSafeInteger(size) || size < 0 || (deleted && size !== 0)) return null;
		if (deleted) {
			parts.push(undefined);
			continue;
		}
		if (bytes === undefined || at + size > bytes.byteLength) return null;
		parts.push(bytes.subarray(at, at + size));
		at += size;
	}
	return at === (bytes?.byteLength ?? 0) ? parts : null;
}

/** A bundle's bytes, each file's after the last: undefined when every entry is a delete. */
export function joinParts(parts: readonly (Uint8Array | undefined)[]): Uint8Array | undefined {
	const files = parts.filter((part): part is Uint8Array => part !== undefined);
	if (files.length === 0) return undefined;
	const joined = new Uint8Array(files.reduce((sum, part) => sum + part.byteLength, 0));
	let at = 0;
	for (const part of files) {
		joined.set(part, at);
		at += part.byteLength;
	}
	return joined;
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
	pace?: Pace;
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
	pace?: Pace;
}

/** Object → daemon: a save that can't be taken at all, such as a path outside the layout. */
export interface Refused {
	type: "refused";
	ref: string;
	path: string;
	reason: "outside_layout" | "invalid_save" | "too_large" | Unauthorized | Limited;
	/** For a limit: seconds until it may lift, when the object can say. */
	retryAfter?: number;
	pace?: Pace;
}

/** Object → the saving daemon: its editor has made `made` of the month's `limit` saves to the project. Said once, at 80%. */
export interface MonthCount {
	type: "month";
	made: number;
	limit: number;
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
 * Whether the team has seen a file (spool#193), asked over HTTP at
 * `POST /api/teams/<team>/projects/<project>/history/seen` with `{ files: [{ path, hash }] }` before a `design/`
 * spool never synced first connects. `seen` is `current` for the team's version of the path now, `had` for one of
 * its applied versions before, `never` otherwise; `team` is what the team holds there now, a delete being a version
 * too. `held` is how many paths the team holds a file at. An editor's read, counted against no save limit.
 */
export interface SeenFile {
	path: string;
	hash: string;
	seen: "current" | "had" | "never";
	team: "file" | "deleted" | "none";
}

export interface SeenAnswer {
	files: SeenFile[];
	held: number;
}

/** The most files one history lookup names; a big design/ asks in several. */
export const SEEN_FILES = 1_000;

/**
 * Daemon → object: the agent this daemon runs on the project finished its turn. The pages its person saved to
 * settle for outsiders (unless someone else is saving to them too); an agent the daemon did not start never says
 * this, and its pages settle after a quiet spell instead.
 */
export interface TurnEnded {
	type: "turn-ended";
}

export type DaemonMessage =
	| Hello
	| Save
	| Saves
	| Resend
	| TurnEnded
	| CommentPost
	| CommentReplyPost
	| CommentChange
	| CommentStillAsk;
export type ObjectMessage =
	| Welcome
	| TeamFile
	| TeamFiles
	| CaughtUp
	| Saved
	| SetAside
	| Refused
	| Answers
	| MonthCount
	| CommentsMessage;

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
 * A fair-use limit the save would pass, or the object couldn't check the save at all. `rate_limited` is a wait: the
 * daemon sends the save again after `retryAfter`. On the others sync pauses until it lifts, and the file stays where
 * it was written.
 */
export type Limited = "project_full" | "rate_limited" | "monthly_limit" | "unavailable";

/** The largest file that travels; a bigger one is refused as `too_large` and stays on its machine. */
export const FILE_LIMIT_BYTES = 25_000_000;
/** The most a team project's design/ may hold. */
export const PROJECT_LIMIT_BYTES = 1_000_000_000;
/** Saves a team project's minute bucket refills a minute, from everyone together, unless a maintainer raised it. */
export const SAVES_PER_MINUTE = 120;
/** Saves the bucket holds: a burst this big goes through at once, and it starts full. */
export const SAVE_BUCKET = 2_000;
/** Saves one editor makes to a team project in a calendar month (UTC). */
export const SAVES_PER_MONTH = 30_000;

/*
 * Why the object closed a connection, every code it closes with. A daemon answers each as it says.
 */

/** A message the object can't take: outside the layout, malformed, or before `hello`. A broken peer; no retry helps. */
export const CLOSE_INVALID = 4400;
/** Its device session was revoked or has expired. */
export const CLOSE_SIGNED_OUT = 4401;
/**
 * The team has no paid time left and has gone local: its copies stop without ending, keep their link, and ask again
 * later. A new connection to such a team is refused before it opens, with 402.
 */
export const CLOSE_UNPAID = 4402;
/** The account no longer edits this team project, or it is gone. A browser watching a canvas: no longer a member. */
export const CLOSE_NOT_EDITOR = 4403;
/** The daemon speaks another `PROTOCOL_VERSION`. */
export const CLOSE_PROTOCOL = 4406;
/** The object couldn't check who may sync just now: the daemon reconnects, as after any dropped line. */
export const CLOSE_UNAVAILABLE = 1011;

export function isRecord(value: unknown): value is Record<string, unknown> {
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
	/** How many clicks they've made inside live frames, a click being a press let go about where it began. */
	clicks?: number;
	/**
	 * How far they've scrolled inside the frame they're in, every scroller in it added up, in the frame's own
	 * pixels: a change is a scroll the others see, and which way it went. Only its changes mean anything.
	 */
	scrolled?: { x: number; y: number } | null;
	/**
	 * Their agent, while a turn of it runs on this project (#378): absent otherwise, and absent from anyone whose
	 * spool is older. Set by their daemon, never by their canvas.
	 */
	agent?: PresenceAgent;
	/** The account whose view they follow: that person's pointer is always shown to them (#107). */
	following?: string;
}

/** What a person's agent is doing, small enough to ride every presence message. */
export interface PresenceAgent {
	/** At work; false while it waits on its person to answer it. */
	running: boolean;
	/** The turn's one line, `3 designers working`; null when it has none yet. */
	status: string | null;
	/** Each of its agents at a frame or at its placeholder frame, at most `PRESENCE_AGENT_WORK`. */
	work: PresenceAgentWork[];
}

/** One agent at work on the canvas: where, and what it is doing there. */
export interface PresenceAgentWork {
	/** The frame it is at, or the placeholder frame it holds, by path under frames/. */
	frame: string;
	/**
	 * What it is doing, in a word: in its placeholder `reading` or `drawing`; at a frame that stands `new`,
	 * `landed`, `read`, `edit`, `shot`, `delete`, `ask` or `idle`. A word a reader doesn't know is `idle`.
	 */
	act: string;
	/** The step it says it is on, in its own words; null for none. */
	detail: string | null;
	/** Lines of the frame's source it has written so far, or the file holds. */
	lines: number;
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

/**
 * Object → daemon or browser, to a connection whose hello said `ticks` (#107): everyone who changed since the last
 * tick, each as a `Presence` would say them. Someone on another page, or past the cap, comes as an outline: their
 * page and their agent, nothing they point at. A connection that didn't say `ticks` hears the same, one `Presence`
 * each.
 */
export interface Presences {
	type: "presences";
	people: Presence[];
}

/**
 * Object → daemon or browser: this person's pointer is hidden from the others on their page, past the first
 * `PRESENCE_SHOWN`, or shown again. While hidden, their canvas stops sending its pointer; its page still goes.
 * An older daemon never hears it as anything.
 */
export interface PresenceHidden {
	type: "presence-hidden";
	hidden: boolean;
}

/** How often the sync object tells everyone who changed, and so how often a canvas need say where it is. */
export const PRESENCE_TICK_MS = 100;
/** The pointers shown on one page at most, editors first, then by who came first; someone followed doesn't count. */
export const PRESENCE_SHOWN = 50;

/**
 * How long a person has to change nothing of their own to be idle: an agent of theirs at work doesn't count. Long
 * enough that reading a frame or thinking isn't idle, short enough that someone who walked away reads as gone soon.
 */
export const PRESENCE_IDLE_MS = 60_000;

/**
 * Daemon → window: who else is in one team project, for its tab while another is focused. `quiet` is how many
 * milliseconds ago they last did anything of their own, counted to the moment it was said.
 */
export interface TabPresence {
	person: PresencePerson;
	quiet: number;
}

/** What a name in a presence message may be: a page or a frame. Small, so a person's whole state stays small. */
export const PRESENCE_NAME = 160;
/** The frames a dragging pointer names, at most. */
export const PRESENCE_DRAGGING = 4;
/** The agents at work a presence names, at most. */
export const PRESENCE_AGENT_WORK = 6;
/** How long an agent's status line or a work's detail may be. */
export const PRESENCE_AGENT_WORDS = 80;
/** How long an act's word may be. */
const PRESENCE_ACT = 16;

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

/** Everyone a tick holds, each entry that isn't well formed left out; undefined for a message that isn't a tick. */
export function readPresences(message: Record<string, unknown>): Presence[] | undefined {
	if (message.type !== "presences" || !Array.isArray(message.people)) return undefined;
	return message.people.flatMap((entry) => {
		const presence = isRecord(entry) ? readPresence(entry) : undefined;
		return presence === undefined ? [] : [presence];
	});
}

/** Whether this person's pointer is hidden now; undefined for anything but a well-formed `presence-hidden`. */
export function readPresenceHidden(message: Record<string, unknown>): boolean | undefined {
	return message.type === "presence-hidden" && typeof message.hidden === "boolean" ? message.hidden : undefined;
}

/** A well-formed presence state, copied field by field; null for "left"; undefined for anything else. */
export function readPresenceState(value: unknown): PresenceState | null | undefined {
	if (value === null) return null;
	if (!isRecord(value)) return undefined;
	const { page, pointer, pressed, dragging, inside, view, clicks, scrolled, agent, following } = value;
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
		...withAgent(readPresenceAgent(agent)),
		...(isPresenceName(following) ? { following } : {}),
	};
}

function withAgent(agent: PresenceAgent | undefined): { agent?: PresenceAgent } {
	return agent === undefined ? {} : { agent };
}

/**
 * A person's agent, copied field by field; undefined for none, and for anything not well formed or past its
 * bounds, which leaves the rest of where they are standing: an agent is never worth losing their pointer over.
 */
export function readPresenceAgent(value: unknown): PresenceAgent | undefined {
	if (!isRecord(value)) return undefined;
	const { running, status, work } = value;
	if (typeof running !== "boolean" || !(status === null || isAgentWords(status))) return undefined;
	if (!Array.isArray(work) || work.length > PRESENCE_AGENT_WORK) return undefined;
	const read: PresenceAgentWork[] = [];
	for (const one of work) {
		if (!isRecord(one)) return undefined;
		const { frame, act, detail, lines } = one;
		if (!isPresenceName(frame) || typeof act !== "string" || act.length > PRESENCE_ACT) return undefined;
		if (!(detail === null || isAgentWords(detail))) return undefined;
		if (!(typeof lines === "number" && Number.isInteger(lines) && lines >= 0)) return undefined;
		read.push({ frame, act, detail, lines });
	}
	return { running, status, work: read };
}

function isAgentWords(value: unknown): value is string {
	return typeof value === "string" && value.length <= PRESENCE_AGENT_WORDS;
}

function isPresenceName(value: unknown): value is string {
	return typeof value === "string" && value.length <= PRESENCE_NAME;
}

function finite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/*
 * Comments (ADR 0011): what people leave on a team project's canvas for each other. They live in the project's sync
 * object, in tables of their own outside the save path, and ride the sockets that are already open: a daemon that
 * has caught up, and a member's browser looking at the canvas, is sent a snapshot of every comment it may read, then
 * each change as it happens. Nothing here is a save: a comment takes nothing from the bucket or the month, makes no
 * history and wakes no compile. A daemon writes on its socket; the object answers the writer by its `ref`.
 */

/** Who reads a comment: the team, or one share of the page it stands on, by the share's id. Replies keep it. */
export type CommentAudience = "team" | { share: string };

/**
 * Where a comment stands now. `placed`: where it was put, on its frame or on its page's field. `deleted-frame`: its
 * frame was deleted, so it dropped onto the field at the frame's last place. `deleted-page`: its page was deleted,
 * so it is off the canvas.
 */
export type CommentStanding = "placed" | "deleted-frame" | "deleted-page";

/** A person as comments name them: the same as presence does, resolved by Cloud from the account when it is read. */
export type CommentPerson = PresencePerson;

/** A pin's point: in its frame's own pixels from the frame's top-left, or a world point on the page's field. */
export interface CommentPoint {
	x: number;
	y: number;
}

/**
 * The element under the pin when it was placed, as the selection names one: its four handles (the frame is the
 * comment's own, then the source path and lines, the selector, the excerpt) and what spool calls it. Context for
 * agents only: the pin never follows the element.
 */
export interface CommentElement {
	name: string;
	path: string;
	lines: [number, number];
	selector: string;
	excerpt: string;
	/** The stamp is an ancestor's: JS-created DOM. */
	generated?: true;
}

/** One reply under a comment, one level deep, in the order they were made. */
export interface CommentReply {
	id: string;
	author: CommentPerson;
	/** Written by the author's agent through `spool comments`. */
	agent: boolean;
	body: string;
	/** Milliseconds since the epoch. */
	created: number;
	edited: number | null;
	/** An agent's reply on a share's comment waits for this account to send it; null for a reply that went out. */
	draftFor: string | null;
	/** The members its words @mention, named as they are now; absent when it mentions nobody. */
	mentions?: CommentPerson[];
	/** Written by someone outside the team, through the comment's share (spool#174). */
	outsider?: true;
}

/**
 * The share a comment's audience is, as a member reads it (spool#174): what kind, who reads it outside the team
 * (their names for a people share, none for a link share), who made it, and whether it has ended. Never told to
 * an outsider.
 */
export interface CommentShare {
	kind: "people" | "link";
	/** The people a people share names, by name as each is known to spool.page; empty for a link share. */
	who: string[];
	/** The account that made the share; null once that account is gone. */
	by: string | null;
	/** Stopped or gone: its comments stay readable by members, and nobody posts to it any more. */
	ended?: true;
}

/** One comment as a reader gets it: its first message, where it stands, and every reply. */
export interface Comment {
	/** Short and printable, so a person and an agent can name it in a terminal. */
	id: string;
	audience: CommentAudience;
	/** The page it stands on, by its path; "" for the root page. */
	page: string;
	/** The frame it is pinned to, by its path under frames/; null for the page's empty field. */
	frame: string | null;
	at: CommentPoint;
	element: CommentElement | null;
	/** The frame's source revision when the comment was made (`frameRevision`); null on the field. */
	revision: string | null;
	/** Cloud keeps the frame's still from when the comment was made. */
	still: boolean;
	author: CommentPerson;
	agent: boolean;
	body: string;
	created: number;
	edited: number | null;
	/** Who resolved it and when; `agent` when their agent did, through `spool comments resolve`. */
	resolved: { by: CommentPerson; at: number; agent?: true } | null;
	standing: CommentStanding;
	/** Off its frame (`deleted-frame`, or `deleted-page` after it was on one): the frame it was on, and when it went. */
	dropped?: { frame: string; at: number };
	/**
	 * Its frame's source is no longer what it was when the comment was made: the team's copy of the frame has another
	 * `frameRevision` now. Said only of a comment standing on its frame; absent otherwise.
	 */
	editedSince?: true;
	replies: CommentReply[];
	/** The members its first message @mentions, named as they are now; absent when it mentions nobody. */
	mentions?: CommentPerson[];
	/** Its audience's share, for a member (spool#174); absent for a Team comment, and for an outsider. */
	share?: CommentShare;
	/** Written by someone outside the team, through its share: its pin is hollow (spool#174). */
	outsider?: true;
}

/**
 * Daemon → object: a new comment, made by the person whose connection it is. The frame's still from the moment it
 * was made rides the binary frame, when the daemon has one.
 */
export interface CommentPost {
	type: "comment-post";
	/** The daemon's own reference, echoed in the answer. */
	ref: string;
	page: string;
	frame: string | null;
	at: CommentPoint;
	element: CommentElement | null;
	revision: string | null;
	body: string;
	/** Written by the person's agent rather than by them. */
	agent?: true;
	/** The members its words @mention, by account; the object keeps only the team's members. */
	mentions?: string[];
	/** Who reads it: the team when absent, or one live share of its page (spool#174). */
	audience?: CommentAudience;
}

/** Daemon → object: a reply to a comment, by the person whose connection it is. */
export interface CommentReplyPost {
	type: "comment-reply";
	ref: string;
	comment: string;
	body: string;
	agent?: true;
	mentions?: string[];
}

/*
 * Daemon → object: a change to a comment that is there, by the person whose connection it is, each with a `ref` the
 * answer echoes. Who may make it is the object's to say (the spec's "who may do what"): anyone who reads a comment
 * resolves and reopens it; only its author edits it; its author, or an admin or editor, deletes it, and deleting the
 * first message deletes the comment with its replies. Reading is the person's own: it marks the comment read for
 * them, or unread again.
 */

/**
 * Resolve a comment, or reopen one that was resolved. `agent` when the person's agent does it (`spool comments`): a
 * resolve keeps it, so it shows as theirs.
 */
export interface CommentResolve {
	type: "comment-resolve" | "comment-reopen";
	ref: string;
	comment: string;
	agent?: true;
}

/** New words for the author's own comment, or with `reply`, one of its replies. Marked edited. */
export interface CommentEdit {
	type: "comment-edit";
	ref: string;
	comment: string;
	reply?: string;
	body: string;
	mentions?: string[];
}

/** Delete a comment with its replies, or with `reply`, only that reply. */
export interface CommentDelete {
	type: "comment-delete";
	ref: string;
	comment: string;
	reply?: string;
}

/** The person opened the comment: read for them now. Or, `comment-unread`, Mark unread: as if they never had. */
export interface CommentReadMark {
	type: "comment-read" | "comment-unread";
	ref: string;
	comment: string;
}

/**
 * Send a draft (spool#174): the agent's reply waiting for this person goes out as theirs, with new words when they
 * edited it. Only the person it waits for sends it.
 */
export interface CommentSend {
	type: "comment-send";
	ref: string;
	comment: string;
	reply: string;
	body?: string;
	mentions?: string[];
}

export type CommentChange = CommentResolve | CommentEdit | CommentDelete | CommentReadMark | CommentSend;

/**
 * Daemon → object: the still a comment kept of its frame, which its person's agent is shown when the frame was edited
 * since, so it sees what the commenter saw. Answered to this socket alone, by `ref`.
 */
export interface CommentStillAsk {
	type: "comment-still-ask";
	ref: string;
	comment: string;
}

/**
 * Object → reader: every comment it may read, in the order they were made, in parts. The part that is `first`
 * replaces whatever the reader held; the one that is `last` ends it.
 */
export interface CommentsSnapshot {
	type: "comments";
	comments: Comment[];
	first: boolean;
	last: boolean;
	/** When the reader's person last read each of this part's comments they have read, by id. */
	reads?: Record<string, number>;
}

/** Object → every reader of its audience: a comment was made. */
export interface CommentAdded {
	type: "comment-added";
	comment: Comment;
}

/** Object → every reader of its comment's audience: a reply was made. */
export interface CommentReplied {
	type: "comment-replied";
	comment: string;
	reply: CommentReply;
}

/**
 * Object → every reader of its audience: a comment changed (resolved, reopened, edited, a reply deleted, or moved
 * with its frame), sent whole as it now is, replies and all, in place of what the reader held.
 */
export interface CommentChanged {
	type: "comment-changed";
	comment: Comment;
}

/** Object → every reader of its audience: a comment was deleted, with its replies. */
export interface CommentRemoved {
	type: "comment-removed";
	id: string;
}

/**
 * Object → every socket of one person, Macs and browsers: when they last read a comment, or null once they marked it
 * unread. A comment is unread for them while it or a reply that isn't theirs came after it.
 */
export interface CommentSeen {
	type: "comment-seen";
	comment: string;
	read: number | null;
}

/**
 * Object → the writer: its comment, reply or change was taken, under this id: the new comment's or reply's, or the
 * changed comment's. Readers hear what changed first.
 */
export interface CommentPosted {
	type: "comment-posted";
	ref: string;
	id: string;
}

/**
 * Object → the asker: a comment's still, riding the binary frame as the image's bytes. With no bytes, the comment kept
 * none. A comment that isn't there, or that the asker can't read, is refused as `comment_not_found`.
 */
export interface CommentStill {
	type: "comment-still";
	ref: string;
	comment: string;
}

/**
 * Why a comment or reply was not taken. `invalid_comment`: malformed, or its words empty or past
 * `COMMENT_BODY_LIMIT`. `still_too_large`: its still is past `COMMENT_STILL_BYTES`, or no image.
 * `comment_not_found`: a reply to a comment that isn't there, or that this person can't read.
 */
export type CommentRefusal =
	| "invalid_comment"
	| "still_too_large"
	| "comment_not_found"
	| Unauthorized
	| "unpaid"
	| "unavailable"
	| CommentLimited
	| "not_author"
	| CommentShareRefusal;

/**
 * Why a share's comments refused a post (spool#174). `blocked`: the share's editors blocked this person from its
 * comments. `share_ended`: the share was stopped, so nothing new is posted to it. `share_limited`: a link share's
 * outsiders together posted `LINK_SHARE_COMMENTS_PER_DAY` within 24 hours.
 */
export type CommentShareRefusal = "blocked" | "share_ended" | "share_limited";

/**
 * A limit a comment or reply would pass. `too_long`: its words are past `COMMENT_BODY_LIMIT`. `rate_limited`: its
 * person posted `COMMENTS_PER_MINUTE` in the project within the minute (`retryAfter` says when one fits).
 * `too_many_open`: the project holds `COMMENTS_OPEN` open comments; a reply still goes. `not_author`: an edit of
 * someone else's words, or a delete of them by someone who neither wrote them nor edits the project.
 */
export type CommentLimited = "too_long" | "rate_limited" | "too_many_open";

/** Object → the writer: its comment or reply was not taken. */
export interface CommentRefused {
	type: "comment-refused";
	ref: string;
	reason: CommentRefusal;
	/** For `rate_limited`: seconds until one fits. */
	retryAfter?: number;
}

export type CommentsMessage =
	| CommentsSnapshot
	| CommentAdded
	| CommentReplied
	| CommentChanged
	| CommentRemoved
	| CommentSeen
	| CommentPosted
	| CommentRefused
	| CommentStill;

/** The most a comment's or a reply's words may be; they are never empty. */
export const COMMENT_BODY_LIMIT = 4_000;
/** The largest still a comment keeps of its frame: a booth's cover is far smaller. */
export const COMMENT_STILL_BYTES = 4 * 1024 * 1024;
/**
 * How many comments and replies one person may post in a project a minute: a bucket that holds this many and
 * refills at this rate. Cloud's default, which a maintainer can raise for one project.
 */
export const COMMENTS_PER_MINUTE = 30;
/** How many open comments a project may hold before a new one is refused. Cloud's default, which a maintainer can raise. */
export const COMMENTS_OPEN = 5_000;
/**
 * How many comments and replies a link share's outsiders post together in any 24 hours (spool#174). Cloud's default,
 * which a maintainer can raise.
 */
export const LINK_SHARE_COMMENTS_PER_DAY = 300;
/** The most members one message may @mention. */
export const COMMENT_MENTIONS = 50;
/** How many comments one part of a snapshot carries. */
export const COMMENTS_PER_PART = 200;
/** The most a page's, a frame's or an element handle's name or path may be. */
const COMMENT_NAME = 512;
/** The most an element's selector or excerpt may be. */
const COMMENT_HANDLE = 4_000;
/** An id or a ref. */
const COMMENT_ID = 64;
/** A source revision: `frameRevision`'s, hex. */
const REVISION = /^[0-9a-f]{64}$/u;

/** Whether words may be a comment's or a reply's: not blank, and within the limit. */
export function isCommentBody(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "" && value.length <= COMMENT_BODY_LIMIT;
}

/** A well-formed `comment-post`, copied field by field; undefined for anything else. */
export function readCommentPost(message: Record<string, unknown>): CommentPost | undefined {
	const { type, ref, page, frame, at, element, revision, body, agent, mentions, audience } = message;
	if (type !== "comment-post" || !isId(ref) || !isCommentName(page) || !(frame === null || isFrameName(frame)))
		return undefined;
	const heard = audience === undefined ? "team" : readAudience(audience);
	if (heard === undefined) return undefined;
	const point = readPoint(at);
	const handles = element === null ? null : readCommentElement(element);
	if (point === undefined || handles === undefined || !isCommentBody(body)) return undefined;
	if (!(revision === null || (typeof revision === "string" && REVISION.test(revision)))) return undefined;
	// a pin on the field stands on no frame, so takes no element and no revision
	if (frame === null && (handles !== null || revision !== null)) return undefined;
	if (!(agent === undefined || agent === true)) return undefined;
	const named = readMentionIds(mentions);
	if (named === undefined) return undefined;
	return {
		type,
		ref,
		page,
		frame,
		at: point,
		element: handles,
		revision,
		body,
		...(agent === true ? { agent } : {}),
		...(named.length > 0 ? { mentions: named } : {}),
		...(heard === "team" ? {} : { audience: heard }),
	};
}

/** A well-formed `comment-reply`, copied field by field; undefined for anything else. */
export function readCommentReplyPost(message: Record<string, unknown>): CommentReplyPost | undefined {
	const { type, ref, comment, body, agent, mentions } = message;
	if (type !== "comment-reply" || !isId(ref) || !isId(comment) || !isCommentBody(body)) return undefined;
	if (!(agent === undefined || agent === true)) return undefined;
	const named = readMentionIds(mentions);
	if (named === undefined) return undefined;
	return {
		type,
		ref,
		comment,
		body,
		...(agent === true ? { agent } : {}),
		...(named.length > 0 ? { mentions: named } : {}),
	};
}

/** A well-formed change to a comment, copied field by field; undefined for anything else. */
export function readCommentChange(message: Record<string, unknown>): CommentChange | undefined {
	const { type, ref, comment, reply, body, mentions, agent } = message;
	if (!isId(ref) || !isId(comment)) return undefined;
	switch (type) {
		case "comment-resolve":
		case "comment-reopen":
			if (!(agent === undefined || agent === true)) return undefined;
			return { type, ref, comment, ...(agent === true ? { agent } : {}) };
		case "comment-read":
		case "comment-unread":
			return { type, ref, comment };
		case "comment-send": {
			if (!isId(reply) || !(body === undefined || isCommentBody(body))) return undefined;
			const named = readMentionIds(mentions);
			if (named === undefined) return undefined;
			return {
				type,
				ref,
				comment,
				reply,
				...(body === undefined ? {} : { body }),
				...(named.length > 0 ? { mentions: named } : {}),
			};
		}
		case "comment-delete":
			if (!(reply === undefined || isId(reply))) return undefined;
			return { type, ref, comment, ...(reply === undefined ? {} : { reply }) };
		case "comment-edit": {
			if (!(reply === undefined || isId(reply)) || !isCommentBody(body)) return undefined;
			const named = readMentionIds(mentions);
			if (named === undefined) return undefined;
			return {
				type,
				ref,
				comment,
				...(reply === undefined ? {} : { reply }),
				body,
				...(named.length > 0 ? { mentions: named } : {}),
			};
		}
		default:
			return undefined;
	}
}

/**
 * Why words can't be a comment's or a reply's, said apart: `too_long` past the limit, `invalid_comment` when they are
 * no words at all; undefined when they can.
 */
export function commentBodyRefusal(body: unknown): "too_long" | "invalid_comment" | undefined {
	if (isCommentBody(body)) return undefined;
	return typeof body === "string" && body.length > COMMENT_BODY_LIMIT ? "too_long" : "invalid_comment";
}

/** Mentioned accounts as a message names them: none, or distinct ids within bounds; undefined when malformed. */
function readMentionIds(value: unknown): string[] | undefined {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length > COMMENT_MENTIONS || !value.every(isId)) return undefined;
	return [...new Set(value)];
}

/** A well-formed `comment-still-ask`, copied field by field; undefined for anything else. */
export function readCommentStillAsk(message: Record<string, unknown>): CommentStillAsk | undefined {
	const { type, ref, comment } = message;
	return type === "comment-still-ask" && isId(ref) && isId(comment) ? { type, ref, comment } : undefined;
}

/**
 * A well-formed comments message from the object, as a daemon or a browser hears it, copied field by field;
 * undefined for anything else, and for a message that isn't about comments.
 */
export function readCommentsMessage(message: Record<string, unknown>): CommentsMessage | undefined {
	switch (message.type) {
		case "comments": {
			const { comments, first, last, reads } = message;
			if (!Array.isArray(comments) || typeof first !== "boolean" || typeof last !== "boolean") return undefined;
			const read = comments.map(readComment);
			if (!read.every((comment): comment is Comment => comment !== undefined)) return undefined;
			if (reads === undefined) return { type: "comments", comments: read, first, last };
			if (!isRecord(reads)) return undefined;
			const seen: Record<string, number> = {};
			for (const [id, at] of Object.entries(reads)) {
				if (!isId(id) || !isTime(at)) return undefined;
				seen[id] = at;
			}
			return { type: "comments", comments: read, first, last, reads: seen };
		}
		case "comment-changed": {
			const comment = readComment(message.comment);
			return comment === undefined ? undefined : { type: "comment-changed", comment };
		}
		case "comment-removed":
			return isId(message.id) ? { type: "comment-removed", id: message.id } : undefined;
		case "comment-seen": {
			const { comment, read } = message;
			if (!isId(comment) || !(read === null || isTime(read))) return undefined;
			return { type: "comment-seen", comment, read };
		}
		case "comment-added": {
			const comment = readComment(message.comment);
			return comment === undefined ? undefined : { type: "comment-added", comment };
		}
		case "comment-replied": {
			const reply = readCommentReply(message.reply);
			if (!isId(message.comment) || reply === undefined) return undefined;
			return { type: "comment-replied", comment: message.comment, reply };
		}
		case "comment-posted": {
			const { ref, id } = message;
			return isId(ref) && isId(id) ? { type: "comment-posted", ref, id } : undefined;
		}
		case "comment-still": {
			const { ref, comment } = message;
			return isId(ref) && isId(comment) ? { type: "comment-still", ref, comment } : undefined;
		}
		case "comment-refused": {
			const { ref, retryAfter } = message;
			const reason = commentRefusal(message.reason);
			if (!isId(ref) || reason === undefined) return undefined;
			if (!(retryAfter === undefined || isTime(retryAfter))) return undefined;
			return { type: "comment-refused", ref, reason, ...(retryAfter === undefined ? {} : { retryAfter }) };
		}
		default:
			return undefined;
	}
}

/** The refusal a reason names, if it names one: as a socket says it, or spool.page's comments API answers it. */
export function commentRefusal(reason: unknown): CommentRefusal | undefined {
	return typeof reason === "string" && isCommentRefusal(reason) ? reason : undefined;
}

function isCommentRefusal(reason: string): reason is CommentRefusal {
	return Object.hasOwn(COMMENT_REFUSAL_STATUS, reason);
}

/** A well-formed comment, copied field by field; undefined for anything else. */
export function readComment(value: unknown): Comment | undefined {
	if (!isRecord(value)) return undefined;
	const { id, audience, page, frame, at, element, revision, still, author, agent, body, created, edited } = value;
	const { resolved, standing, dropped, editedSince, replies, mentions, share, outsider } = value;
	if (!isId(id) || !isCommentName(page) || !(frame === null || isFrameName(frame))) return undefined;
	const who = readCommentPerson(author);
	const point = readPoint(at);
	const handles = element === null ? null : readCommentElement(element);
	const heard = readAudience(audience);
	if (who === undefined || point === undefined || handles === undefined || heard === undefined) return undefined;
	if (!(revision === null || (typeof revision === "string" && REVISION.test(revision)))) return undefined;
	if (typeof still !== "boolean" || typeof agent !== "boolean" || typeof body !== "string") return undefined;
	if (!isTime(created) || !(edited === null || isTime(edited))) return undefined;
	if (standing !== "placed" && standing !== "deleted-frame" && standing !== "deleted-page") return undefined;
	let closed: Comment["resolved"] = null;
	if (resolved !== null) {
		if (!isRecord(resolved) || !isTime(resolved.at)) return undefined;
		const by = readCommentPerson(resolved.by);
		if (by === undefined) return undefined;
		const { agent: byAgent } = resolved;
		if (!(byAgent === undefined || byAgent === true)) return undefined;
		closed = { by, at: resolved.at, ...(byAgent === true ? { agent: byAgent } : {}) };
	}
	let off: Comment["dropped"];
	if (dropped !== undefined) {
		if (!isRecord(dropped) || !isFrameName(dropped.frame) || !isTime(dropped.at)) return undefined;
		off = { frame: dropped.frame, at: dropped.at };
	}
	if (!(editedSince === undefined || typeof editedSince === "boolean")) return undefined;
	if (!Array.isArray(replies)) return undefined;
	const read = replies.map(readCommentReply);
	if (!read.every((reply): reply is CommentReply => reply !== undefined)) return undefined;
	const named = readMentioned(mentions);
	if (named === undefined) return undefined;
	const through = share === undefined ? undefined : readCommentShare(share);
	if ((share !== undefined && through === undefined) || !(outsider === undefined || outsider === true))
		return undefined;
	return {
		id,
		audience: heard,
		page,
		frame,
		at: point,
		element: handles,
		revision,
		still,
		author: who,
		agent,
		body,
		created,
		edited,
		resolved: closed,
		standing,
		...(off === undefined ? {} : { dropped: off }),
		...(editedSince === true ? { editedSince } : {}),
		replies: read,
		...(named.length > 0 ? { mentions: named } : {}),
		...(through === undefined ? {} : { share: through }),
		...(outsider === true ? { outsider } : {}),
	};
}

/** A comment's share as a member reads it, copied field by field; undefined for anything else. */
function readCommentShare(value: unknown): CommentShare | undefined {
	if (!isRecord(value)) return undefined;
	const { kind, who, by, ended } = value;
	if (kind !== "people" && kind !== "link") return undefined;
	if (!Array.isArray(who) || who.length > COMMENT_MENTIONS || !who.every(isCommentName)) return undefined;
	if (!(by === null || isId(by)) || !(ended === undefined || ended === true)) return undefined;
	return { kind, who: [...who], by, ...(ended === true ? { ended } : {}) };
}

/** A well-formed reply, copied field by field; undefined for anything else. */
export function readCommentReply(value: unknown): CommentReply | undefined {
	if (!isRecord(value)) return undefined;
	const { id, author, agent, body, created, edited, draftFor, mentions, outsider } = value;
	const who = readCommentPerson(author);
	if (!isId(id) || who === undefined || typeof agent !== "boolean" || typeof body !== "string") return undefined;
	if (!isTime(created) || !(edited === null || isTime(edited))) return undefined;
	if (!(draftFor === null || isId(draftFor))) return undefined;
	const named = readMentioned(mentions);
	if (named === undefined || !(outsider === undefined || outsider === true)) return undefined;
	return {
		id,
		author: who,
		agent,
		body,
		created,
		edited,
		draftFor,
		...(named.length > 0 ? { mentions: named } : {}),
		...(outsider === true ? { outsider } : {}),
	};
}

/** The people a message mentions, as a reader gets them: none, or each well formed. */
function readMentioned(value: unknown): CommentPerson[] | undefined {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length > COMMENT_MENTIONS) return undefined;
	const people = value.map(readCommentPerson);
	return people.every((person): person is CommentPerson => person !== undefined) ? people : undefined;
}

/** An element's handles, copied field by field; undefined for anything not well formed or past its bounds. */
export function readCommentElement(value: unknown): CommentElement | undefined {
	if (!isRecord(value)) return undefined;
	const { name, path, lines, selector, excerpt, generated } = value;
	if (!isCommentName(name) || !isCommentName(path) || !isHandle(selector) || !isHandle(excerpt)) return undefined;
	if (!Array.isArray(lines) || lines.length !== 2) return undefined;
	const [from, to] = lines;
	if (!isLine(from) || !isLine(to)) return undefined;
	if (!(generated === undefined || generated === true)) return undefined;
	return { name, path, lines: [from, to], selector, excerpt, ...(generated === true ? { generated } : {}) };
}

function readCommentPerson(value: unknown): CommentPerson | undefined {
	if (!isRecord(value)) return undefined;
	const { accountId, name, color } = value;
	if (typeof accountId !== "string" || typeof name !== "string" || typeof color !== "string") return undefined;
	return { accountId, name, color };
}

/** A comment's audience, as a post names it: undefined for anything else. */
export function readAudience(value: unknown): CommentAudience | undefined {
	if (value === "team") return "team";
	return isRecord(value) && isId(value.share) ? { share: value.share } : undefined;
}

function readPoint(value: unknown): CommentPoint | undefined {
	return isRecord(value) && finite(value.x) && finite(value.y) ? { x: value.x, y: value.y } : undefined;
}

function isId(value: unknown): value is string {
	return typeof value === "string" && value !== "" && value.length <= COMMENT_ID;
}

/** A page's path: "" is the root page. */
function isCommentName(value: unknown): value is string {
	return typeof value === "string" && value.length <= COMMENT_NAME;
}

function isFrameName(value: unknown): value is string {
	return isCommentName(value) && value !== "";
}

function isHandle(value: unknown): value is string {
	return typeof value === "string" && value.length <= COMMENT_HANDLE;
}

function isLine(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTime(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/*
 * Comments over time (spool#160): the sync object keeps each comment standing where it belongs as saves change the
 * frames and pages under it. A rename or move Spool makes, said on the save that deletes the old files, and a delete
 * and an add of the same source within one bundle (an agent's `mv`), carry a frame's comments to its new name; a copy
 * takes none. A frame deleted drops its comments onto its page's field where they stood, and one brought back at its
 * name stands them on it again; a page deleted takes its comments off the canvas. The rules are here, pure, so the
 * sync object and spool's stand-in for it keep the same ones.
 */

/** One rename or move: a frame's name, or a page's path, before and after. */
export interface MovedPath {
	from: string;
	to: string;
}

/**
 * Frames and pages Spool renamed or moved on a Mac. It is said on the save or bundle that deletes their old files,
 * since the new ones may be sent apart from them, and walk targets rewritten in a moved frame change its source.
 */
export interface Moved {
	frames?: MovedPath[];
	pages?: MovedPath[];
}

/** One path as a save changed the team's copy: its content hash before and after, null where there was none. */
export interface CopyChange {
	path: string;
	was: string | null;
	now: string | null;
}

/** What the team's copy holds once saves are applied, as comments need to know it. */
export interface DesignNow {
	/** Whether a frame is there: its folder holds `frame.tsx`. */
	frame(name: string): boolean;
	/** Whether a page is there. The root page always is. */
	page(path: string): boolean;
	/** Where a frame stood, from its `frame.json`, now or, deleted, as it last stood; undefined if it never said. */
	geometry(name: string): { x: number; y: number; w: number; h: number } | undefined;
}

/** Where a comment stands, as the sync object keeps it: what readers are told, and the frame it belongs to. */
export interface CommentPlace {
	page: string;
	frame: string | null;
	at: CommentPoint;
	standing: CommentStanding;
	/** The frame it was put on and its point there, kept while it is off it; null for a comment put on the field. */
	home: { frame: string; at: CommentPoint } | null;
	/** When it dropped off its frame; null while it is on it, and for a comment put on the field. */
	dropped: number | null;
}

/** The frame a design/-relative path is the entry of: `frames/shop/checkout/frame.tsx` is `shop/checkout`. */
export function frameOfEntry(path: string): string | undefined {
	const match = /^frames\/(.+)\/frame\.tsx$/u.exec(path);
	return match?.[1];
}

/** The page a frame or a page stands on: its path's parent, "" for the root page. */
export function pageOf(name: string): string {
	const cut = name.lastIndexOf("/");
	return cut < 0 ? "" : name.slice(0, cut);
}

/**
 * A frame's name or a page's path after moves: the move naming it, or one of a page that holds it. A page is only
 * moved by a page's move; a frame by its own or its page's.
 */
export function movedName(name: string, moved: Moved, kind: "frame" | "page"): string {
	if (kind === "frame") {
		const own = moved.frames?.find((move) => move.from === name);
		if (own !== undefined) return own.to;
	}
	for (const move of moved.pages ?? [])
		if (name === move.from || name.startsWith(`${move.from}/`)) return `${move.to}${name.slice(move.from.length)}`;
	return name;
}

/**
 * Whether saves may change where comments stand: a frame's entry came or went, something under frames/ was
 * deleted (a page may have gone with it), or Spool said it moved something. An edit in place changes nothing.
 */
export function movesComments(changes: readonly CopyChange[], moved?: Moved): boolean {
	if ((moved?.frames?.length ?? 0) > 0 || (moved?.pages?.length ?? 0) > 0) return true;
	return changes.some(
		({ path, was, now }) =>
			path.startsWith("frames/") &&
			((was !== null && now === null) || (was === null && now !== null && frameOfEntry(path) !== undefined)),
	);
}

/**
 * Frames saves deleted and added with the same source: a frame whose `frame.tsx` went is the one whose `frame.tsx`
 * came with the very same bytes, when exactly one of each has them. What a copy adds with no delete takes nothing.
 */
export function sameSourceMoves(changes: readonly CopyChange[]): MovedPath[] {
	const first = new Map<string, CopyChange>();
	const last = new Map<string, CopyChange>();
	for (const change of changes) {
		if (frameOfEntry(change.path) === undefined) continue;
		if (!first.has(change.path)) first.set(change.path, change);
		last.set(change.path, change);
	}
	const gone = new Map<string, string[]>();
	const came = new Map<string, string[]>();
	for (const [path, { was }] of first) {
		const now = last.get(path)?.now ?? null;
		const frame = frameOfEntry(path);
		if (frame === undefined) continue;
		if (was !== null && now === null) gone.set(was, [...(gone.get(was) ?? []), frame]);
		else if (was === null && now !== null) came.set(now, [...(came.get(now) ?? []), frame]);
	}
	const moves: MovedPath[] = [];
	for (const [source, from] of gone) {
		const to = came.get(source);
		const [one] = from;
		const [other] = to ?? [];
		if (from.length === 1 && to?.length === 1 && one !== undefined && other !== undefined)
			moves.push({ from: one, to: other });
	}
	return moves;
}

/**
 * Where a comment stands once saves are applied, `moved` being what Spool said and what the saves paired by source.
 * A comment whose frame moved follows it, there yet or not; one whose frame is there stands on it, at its point; one
 * whose frame just went drops onto the field where it stood, its point held inside the frame as it last stood, and
 * stays there; a page that is gone takes its comments off the canvas, and one back puts them back.
 */
export function placeAfter(place: CommentPlace, moved: Moved, design: DesignNow, now: number): CommentPlace {
	if (place.home === null) {
		const page = movedName(place.page, moved, "page");
		return { ...place, page, standing: design.page(page) ? "placed" : "deleted-page" };
	}
	const frame = movedName(place.home.frame, moved, "frame");
	const home = { frame, at: place.home.at };
	const page = pageOf(frame);
	// a frame moved goes on standing on it before its new files are all there; one already gone stays gone
	if (design.frame(frame) || (frame !== place.home.frame && place.standing === "placed"))
		return { page, frame, at: home.at, standing: "placed", home, dropped: null };
	let { at, dropped } = place;
	if (place.standing === "placed") {
		// it was on its frame until now: it drops where it stood, held inside the frame as the frame last stood
		const stood = design.geometry(frame);
		at =
			stood === undefined
				? home.at
				: { x: stood.x + within(home.at.x, stood.w), y: stood.y + within(home.at.y, stood.h) };
		dropped = now;
	}
	return { page, frame: null, at, standing: design.page(page) ? "deleted-frame" : "deleted-page", home, dropped };
}

/** A pin's offset held inside a frame's side: a frame made smaller keeps its pins on it. */
export function within(offset: number, side: number): number {
	return Math.min(Math.max(offset, 0), Math.max(side, 0));
}

/** A rename or move, if well formed: frames and pages by their paths, at most a bundle's worth of each. */
export function readMoved(value: unknown): Moved | undefined {
	if (!isRecord(value)) return undefined;
	const paths = (list: unknown): MovedPath[] | undefined => {
		if (list === undefined) return [];
		if (!Array.isArray(list) || list.length > BUNDLE_SAVES) return undefined;
		const read: MovedPath[] = [];
		for (const move of list) {
			if (!isRecord(move) || !isFrameName(move.from) || !isFrameName(move.to)) return undefined;
			read.push({ from: move.from, to: move.to });
		}
		return read;
	};
	const frames = paths(value.frames);
	const pages = paths(value.pages);
	if (frames === undefined || pages === undefined) return undefined;
	return { ...(frames.length > 0 ? { frames } : {}), ...(pages.length > 0 ? { pages } : {}) };
}

/**
 * Whether a design/-relative path is part of a frame's own source: a file in its folder that travels, other than
 * `frame.json`, which says only where the frame stands and how big it is.
 */
export function isFrameSource(frame: string, path: string): boolean {
	return path.startsWith(`frames/${frame}/`) && path !== `frames/${frame}/frame.json` && travels(path);
}

/**
 * A frame's source revision (spool#160): a hash of what its own source files hold and nothing else, made from each
 * file's content hash (SHA-256, hex, as the team's copy names a file's bytes). Not their paths, nor the spool that
 * made it, nor anything it compiles with: a rename, a move, a release or a Mac on another version leave it as it was,
 * and only a change to what the frame's files say makes another. A Mac reads the hashes off its disk, spool.page off
 * its copy, a browser off what it was sent; all three agree.
 */
export async function frameRevision(hashes: readonly string[]): Promise<string> {
	const said = new TextEncoder().encode([...hashes].sort().join("\n"));
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", said));
	return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export { APP_PATH_SEGMENTS } from "./app-paths";
export * from "./team-sync-comments";
