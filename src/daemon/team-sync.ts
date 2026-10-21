import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { type Dirent, existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, rmSync, type Stats } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { WebSocket } from "undici";
import { writeAtomic } from "../atomic-write";
import { account, type CloudRequestOptions, CloudSignedOut, type CloudVault, sessionVault } from "../cloud-auth";
import { CloudTeamRefused, cloudTeams } from "../cloud-teams";
import { SpoolError } from "../errors";
import { checkoutOf } from "../git-remote";
import { reconnectBackoff } from "../reconnect-backoff";
import { localCopyOf, type ProjectLink, parseProjectLink, TEAM_GITIGNORE } from "../team-project";
import {
	BUNDLE_BYTES,
	BUNDLE_SAVES,
	bundleParts,
	CANVAS_PATH,
	CLOSE_FORMAT,
	CLOSE_NOT_EDITOR,
	CLOSE_PROTOCOL,
	CLOSE_SIGNED_OUT,
	CLOSE_UNAVAILABLE,
	CLOSE_UNPAID,
	copyFingerprint,
	type DriftCause,
	decodeFrame,
	encodeFrame,
	FILE_LIMIT_BYTES,
	isRecord,
	joinParts,
	type Limited,
	type ListedFile,
	type Moved,
	PRESENCE_IDLE_MS,
	PROJECT_LIMIT_BYTES,
	PROTOCOL_VERSION,
	type Presence,
	type PresenceAgent,
	type PresenceState,
	RESEND_PATHS,
	readListed,
	type RestoreRef,
	readPresence,
	readPresenceHidden,
	readPresences,
	SAVES_PER_MINUTE,
	SAVES_PER_MONTH,
	type TabPresence,
	travels,
} from "../team-sync-protocol";
import { FORMAT_VERSION, SOLO_GITIGNORE } from "../templates";
import { howToUpdate, runningCli, type UpdateHow, updateLineWithHow } from "../update-how";
import { realDesignDir, resolveDesignPath } from "./design-path";
import { guardAgainstGit } from "./git-guard";
import { forgetMarks, recordMark, type SetAsideMark } from "./set-aside";
import { type SyncedCopies, syncedCopies } from "./synced-copies";
import {
	CommentRefused,
	CommentsOffline,
	copyComments,
	type KeptComments,
	keptCommentsFile,
	type NewChange,
	type NewComment,
	type NewReply,
	readKept,
} from "./team-comments";
import { baseOf, keepBase, mergeText, pruneBases } from "./team-merge";
import { movesToSay } from "./team-moved";
import { type AskSeen, classDesign, type DesignClasses } from "./team-seen";
import { rescanAfterWatchStarts, type TreeWatch, watchTree } from "./watch-tree";

/**
 * The daemon's half of team sync: one connection per local copy to the team project's sync object at
 * spool.page, which orders every save and relays it to every other editor.
 *
 * A local save goes up whole, carrying the team version it was built on. A teammate's save comes down and is
 * written atomically as a real file, so the canvas, the photo booth and every agent read it like any other
 * edit. Before writing, the copy records the file as the team's version, which is how the watcher tells a
 * teammate's write from a local save and never sends it back.
 *
 * Only Spool's own layout travels (`travels`), checked here on the way out and again on the way in: regular
 * files reached through real folders, 25 MB at most. What doesn't travel stays here and the copy says so.
 */

/** What a local copy remembers of the team between runs, in `design/.spool`, which never travels. */
interface CopyState {
	project: string;
	/** The newest team version this copy has been sent. */
	head: number;
	/** Each path as this copy last had it from the team: its version, and its hash or null for deleted. */
	files: Record<string, { version: number; hash: string | null }>;
	/** The team project ended for this machine, and the folder is an ordinary project here now. */
	ended?: true;
	/**
	 * The account this copy last synced as. Only that account leaving the team ends the copy: another one signed in
	 * on this machine leaves it waiting for its own account to come back.
	 */
	account?: string;
	/**
	 * The copy has gone local (its team has no paid time left): stopped, not ended, and this is the team's name, said
	 * once. Gone again when the team pays and the copy follows it again.
	 */
	goneLocal?: string;
	/** When this copy last watched design/ for git (ms): whatever git did after it is checked as git's. */
	watched?: number;
	/**
	 * The project moved team since this copy's `spool.json` was written: the addresses that lead to `project`, which
	 * this copy follows until a pull brings the `spool.json` that names it.
	 */
	forwarded?: string[];
	/**
	 * The project was moved out of its team: the team's name, kept with `ended` until git brings `design/` back into
	 * the checkout, while `design/.gitignore` stays the team's so a pull overwrites what it ignores.
	 */
	movedOut?: string;
	/** The project was removed from its team (#197): who removed it, by name, kept with `ended` for whoever reads it. */
	removedBy?: string;
	/** This record was lost and made again, and the copy isn't matched to the team yet: nothing of it goes up till then. */
	unmatched?: true;
}

export interface SyncSocket {
	send(frame: string | Uint8Array): void;
	close(): void;
}

export interface SyncSocketEvents {
	open(): void;
	message(data: string | ArrayBuffer): void;
	/** `code` is the close code the cloud gave, if it gave one. */
	close(code?: number): void;
}

/**
 * Whether this machine still edits a team project, as spool.page says when asked: `not_editor` when the account the
 * copy syncs as was removed or made a viewer or the team or project is gone, `unpaid` while the team has no paid
 * time left, `unknown` when spool.page can't be reached or its answer says nothing sure. `signedInAs` is another
 * account signed in here, one that can't edit the project: the copy waits, as it does signed out, and is never ended.
 */
export type Standing =
	| "editor"
	| "not_editor"
	| "unpaid"
	| "signed_out"
	| "unknown"
	| { signedInAs: string }
	/** The project moved to another team, or was renamed with a move: it lives at this address now. */
	| { movedTo: ProjectLink }
	/** The project was moved out of its team: every copy ends. */
	| "moved_out"
	/** The project was removed to its team's trash (#197), by whom (null once their account is gone): every copy ends. */
	| { removed: Removal };

/** Who removed a project from which team, as spool.page says it. */
export interface Removal {
	/** The team's name. */
	team: string;
	by: string | null;
}

/** The connection itself, swapped by tests for an in-process team. */
export type OpenSyncSocket = (url: string, token: string, events: SyncSocketEvents) => SyncSocket;

export interface LocalCopyOptions {
	root: string;
	/** The spool.page this machine signs in to. A link to any other is refused: the token never goes there. */
	origin: string;
	vault: Pick<CloudVault, "read">;
	openSocket?: OpenSyncSocket;
	notice?: (message: string) => void;
	/** This copy's set-aside marks changed: one of its saves lost a collision, or a mark went. */
	onMarks?: () => void;
	/** Sync paused on a limit, or the pause lifted, or a long wait on the minute's bucket began or ended: `state()` says. */
	onPaused?: () => void;
	/** The team took one of this copy's saves. */
	onSaved?: (path: string) => void;
	/** Another person on this team canvas moved, arrived or left (`state` null). */
	onPresence?: (presence: Presence) => void;
	/** This person's pointer was hidden from the others on their page, or shown again (#107): `pointerHidden()` says. */
	onPointerHidden?: () => void;
	/** Who is here changed as the project's tab shows it: someone arrived, left, or came back from idle. */
	onRoster?: () => void;
	/** Asked when spool.page refused or cut the connection: does this machine still edit the project? */
	standing?: () => Promise<Standing>;
	/** The account a session token signs in to, asked once a connection is caught up: whose copy this is. */
	accountOf?: (token: string) => Promise<string>;
	/** The project ended for this machine. The copy has stopped; ending it is its owner's. */
	ended?: () => void;
	/** The team has no paid time left, so the copy goes local until it pays. The copy has stopped; stopping it is its owner's. */
	goneLocal?: () => void;
	/**
	 * The project lives at another address now: true when the owner follows it there (the copy has stopped, and a new
	 * one follows the new address); false to wait as offline and ask again.
	 */
	moved?: (to: ProjectLink) => boolean;
	/** The project was moved out of its team. The copy has stopped; ending it is its owner's. */
	movedOut?: () => void;
	/** The project was removed from its team, by someone. The copy has stopped; ending it is its owner's. */
	removed?: (removal: Removal) => void;
	/** The copy caught up with the team. */
	caughtUp?: () => void;
	/** The comments this copy knows changed: the team said so, or sent them all again. */
	onComments?: () => void;
	/** Where this machine keeps the comments the copy hears, so they show offline; with none, they aren't kept. */
	commentsFile?: string;
	/**
	 * This machine's record of the copies it has synced (#204): a copy it synced whose own record is lost takes the
	 * team's version and keeps its differences as set-aside marks, instead of sending them as a new copy's work.
	 */
	synced?: SyncedCopies;
	/** How long without a caught-up connection before the copy says it is offline: `OFFLINE_MS`. */
	offlineMs?: number;
	/** How long a copy paused for an update first waits to ask again, doubling up to an hour: `UPDATE_ASK_MS`. */
	updateAskMs?: number;
	/** How this Spool is updated, said with the pause: read off the running CLI unless a test says. */
	updateHow?: UpdateHow;
	/** What the team is called, to say which team an update keeps it syncing with: its address until it answers. */
	teamName?: () => Promise<string>;
	/**
	 * Bring the copy's design/ up to this Spool's format (#206), once it is caught up and before anything it holds goes
	 * up: what it writes, its unsent changes included, goes up as ordinary saves.
	 */
	migrate?: () => void;
	/**
	 * A solo project moving into this team project (DEV-190): it has no `spool.json` until the team has every file,
	 * and everything on disk is the person's own work, git-tracked or not, so git's index is never consulted.
	 */
	moving?: ProjectLink;
	/**
	 * How to ask the team which of this copy's files it has seen (spool#196): a `design/` spool never synced is
	 * classed with it before it first connects, so what is older than the team's comes level instead of going up.
	 * With none, or against a spool.page from before it could answer, such a copy goes up as its own work.
	 */
	seen?: AskSeen;
}

/**
 * What a project's canvas says of its sync for as long as it lasts, wherever it opens: the team the copy was synced
 * with until it ended here, the team that went local while it isn't paid for, the limit sync is paused on, and every
 * file that didn't travel and why.
 */
export interface SyncState {
	ended: string | null;
	goneLocal: string | null;
	paused: string | null;
	/** Changes waiting on the minute's bucket, said only once the wait is long: never a pause. */
	sending: string | null;
	held: { path: string; why: string }[];
	/** The copy ended or went local in a checkout tracking `spool.json`: its notice offers Put design/ back in git. */
	backInGit?: boolean;
	/**
	 * The copy has had no caught-up connection for `OFFLINE_MS` while it is followed and neither ended, gone local nor
	 * paused (#205): its changes wait on this Mac. A shorter drop says nothing.
	 */
	offline: boolean;
	/**
	 * Sync is paused because this Spool is too old for the team project (#206): its protocol, or a teammate's newer
	 * Spool moved the team's format forward. Which team, and how this Spool is updated; it lifts once it is.
	 */
	update: UpdateNeeded | null;
}

/** A copy paused until this Spool is updated: the team's name, and how to update it, from the Mac app or with npm. */
export type UpdateNeeded = { team: string } & UpdateHow;

export interface LocalCopy {
	/** Resolves whenever the copy is caught up and nothing it sent is waiting on an answer. */
	idle(): Promise<void>;
	/** Sync paused, changes waiting on a long wait, what didn't travel, and whether it is offline, now. */
	state(): Pick<SyncState, "paused" | "sending" | "held" | "offline" | "update">;
	/**
	 * Match the team (#205): every travelling path takes the team's version, and each local difference, an addition or
	 * a delete too, becomes a set-aside mark that Put mine back restores. Files that didn't travel stay. Resolves with
	 * how many marks it made once the team's versions are on disk; refused with `MatchOffline` without a caught-up
	 * connection, changing nothing.
	 */
	matchTeam(): Promise<number>;
	/** Where this machine's person is on the canvas, or null once nobody here is looking. Never stored. */
	presence(state: PresenceState | null): void;
	/**
	 * What this machine's agent is doing on the project, or null once no turn of it runs (#378): it rides the
	 * person's presence, so it is said only while they are on the canvas. Never stored.
	 */
	agent(agent: PresenceAgent | null): void;
	/** Everyone else on the canvas now, `still` counted to this moment. */
	people(): Presence[];
	/** This person's pointer is hidden from the others on their page, as the team last said (#107). */
	pointerHidden(): boolean;
	/** Everyone else on the canvas now as the project's tab shows them: who, and how long since they did anything. */
	roster(): TabPresence[];
	/**
	 * The agent this daemon runs on the project finished its turn: said to the team once the turn's saves have gone
	 * up, so the pages they touched settle for outsiders. Offline, nothing is said, and a quiet spell does it.
	 */
	turnEnded(): void;
	/** Every comment on the project this copy knows and when it heard them, kept from the last time when offline. */
	comments(): KeptComments;
	/** Whether a comment written now reaches the team: the copy is caught up with it. */
	online(): boolean;
	/** Write a comment as this machine's person, with the frame's still: its id, once the team took it. */
	comment(comment: NewComment, still?: Uint8Array): Promise<string>;
	/** Reply under a comment as this machine's person: its id, once the team took it. */
	reply(reply: NewReply): Promise<string>;
	/** Change a comment as this machine's person; refused as offline until the copy has caught up. */
	change(change: NewChange): Promise<string>;
	/** The still a comment kept of its frame, asked of the team: undefined when it kept none. */
	still(comment: string): Promise<Uint8Array | undefined>;
	/** Spool renamed or moved frames or pages here: said with the saves that delete their old files. */
	moved(moved: Moved): void;
	/** The team's version of each path, as this copy last heard it: its version and hash, null for a delete. */
	known(): Readonly<Record<string, { version: number; hash: string | null }>>;
	/**
	 * Put paths back as a restore (spool#188): each written here as given (undefined deletes it), and those the team
	 * holds otherwise sent as the restore's saves, on the versions this copy has. Resolves with the team's answers.
	 */
	restore(restore: RestoreRef, files: readonly RestoreFile[]): Promise<RestoreAnswers>;
	close(): void;
}

/** One path a restore puts back: its bytes then, undefined where it didn't exist. */
export interface RestoreFile {
	path: string;
	bytes: Uint8Array | undefined;
}

/** What the team did with a restore's saves: applied (each with its new version), set aside, or refused. */
export interface RestoreAnswers {
	applied: { path: string; version: number }[];
	setAside: string[];
	refused: { path: string; reason: string }[];
}

/** A restore can't be sent now: the copy isn't caught up with its team, or the team can't take one. */
export class RestoreOffline extends SpoolError {}

/** Why a file git put in design/ that the team doesn't have stays on this machine. */
const GIT_ONLY = "git put it here and your team doesn't have it; edit it to send it";
/** Why a file over the size limit stays on the machine that wrote it. */
const TOO_BIG = `it's over ${FILE_LIMIT_BYTES / 1_000_000} MB`;
/** What an agent is told to do about a file too big to travel: Spool never shrinks anything itself. */
const SHRINK = `teammates see it missing; shrink it under ${FILE_LIMIT_BYTES / 1_000_000} MB on this Mac (the skill says how)`;
/** Why a file outside the layout stays on the machine that wrote it. */
const OUTSIDE_LAYOUT = "only canvas.json, AGENTS.md, CLAUDE.md, frames/ and shared/ sync";
/** How sync says each limit it paused on. */
const LIMITS: Record<Limited, string> = {
	project_full: `the team's design/ is at its ${PROJECT_LIMIT_BYTES / 1_000_000_000} GB limit`,
	rate_limited: `spool.page takes this project's saves at ${SAVES_PER_MINUTE} a minute`,
	monthly_limit: `you've made ${SAVES_PER_MONTH.toLocaleString("en")} saves to this project this month`,
	unavailable: "spool.page couldn't check saves just now",
};
/**
 * A one-off sync stopped on a limit: which one, how sync says it, and how long until spool.page may take saves
 * again. A move waits out the ones that lift by themselves.
 */
export class SyncPaused extends SpoolError {
	constructor(
		readonly reason: Limited,
		readonly why: string,
		readonly seconds: number,
	) {
		super(`sync paused: ${why}`);
	}
}

/** A one-off sync lost its connection, or spool.page couldn't take it: worth trying again in a moment. */
export class SyncDropped extends SpoolError {
	constructor(readonly why: string) {
		super(why);
	}
}

/** A one-off sync spool.page won't take until this Mac signs in again or is made an editor: no retry helps. */
export class SyncRefused extends SpoolError {}

/** A one-off sync stopped because its caller is closing. */
export class SyncStopped extends SpoolError {}

/** Match the team needs a caught-up connection to spool.page, which this copy hasn't got: nothing changed. */
export class MatchOffline extends SpoolError {
	constructor() {
		super("Match the team needs a connection to spool.page. Nothing was changed.");
	}
}

/**
 * How long a followed copy goes without a caught-up connection before it says it is offline (#205): a drop shorter
 * than this, a network's hiccup or a Mac waking, says nothing.
 */
export const OFFLINE_MS = 30_000;

/** How long a copy paused for an update first waits before it asks spool.page again (#206). */
export const UPDATE_ASK_MS = 60_000;
/** The longest it waits between asks: an update made outside the app is picked up within the hour. */
export const UPDATE_ASK_MAX_MS = 3_600_000;

/** How long a pause lasts when spool.page can't say when its limit lifts. */
const RETRY_LIMIT_SECONDS = 60;
/**
 * A save refused for the minute is sent again after `retryAfter` and up to this much of it again, at random, so
 * copies refused together don't all come back together.
 */
const RETRY_SPREAD = 0.5;
/** A wait on the minute's bucket longer than this is said, as progress; a shorter one is waited out in silence. */
const SENDING_SAID_MS = 10_000;
/** How often a long wait's count is told again as it goes down. */
const SENDING_RETOLD_MS = 5_000;
/** How long the copy's record waits for more changes before it is written: a catch-up of many files is one write. */
const RECORD_MS = 250;
/** How long the watcher's burst for one save is let settle before the files are read. */
const SETTLE_MS = 50;
/** A file this big must have been still for longer before it is read: it may be being written in many pieces. */
const BIG_FILE_BYTES = 1_000_000;
const BIG_FILE_STILL_MS = 500;
/** How many versions are kept to merge with before those out of the record go. */
const PRUNE_EVERY = 200;
/** What spool.page answers, by name, when an account is out of a project: the only 404s that can end a copy. */
const OUT_OF_PROJECT = new Set(["team_not_found", "project_not_found"]);
/** How long a turn's last writes are given to reach the watcher before its end is said after them. */
const TURN_SETTLE_MS = 500;
/** The longest git may hold its index lock before what it left is looked at anyway: a crashed git leaves one. */
const GIT_WAIT_MS = 10_000;
/** How many moved addresses a copy follows in a row before it waits as offline: forwards never loop it. */
const MAX_HOPS = 5;

/** A local copy kept in step with its team for as long as the daemon runs: it reconnects, and follows the folder. */
export function followLocalCopy(options: LocalCopyOptions): LocalCopy {
	return localCopy(options, true);
}

/** How a verb reaches the team once: this machine's own session unless `request` hands in another vault. */
export interface SyncOnceOptions {
	origin: string;
	request?: CloudRequestOptions;
	openSocket?: OpenSyncSocket;
	moving?: ProjectLink;
	/** The team took one of this copy's saves: how a move counts its files up. */
	onSaved?: (path: string) => void;
	/** The caller is closing: the sync stops where it is, with `SyncStopped`. */
	signal?: AbortSignal;
}

/** How a copy asks its team what it has seen of a never-synced design/, with this machine's session. */
function askSeen(spoolDir: string, link: ProjectLink, request: CloudRequestOptions): AskSeen {
	return (files) => cloudTeams(spoolDir, request).seen(link.team, link.project, files);
}

/**
 * Bring a local copy level with the team once, then disconnect: everything the team has comes down, and
 * everything new here goes up. What `spool init --team` uploads with, what a fetch fills `design/` with, and what a
 * move uploads the whole folder with. Nothing it would say is said: the verb says how it went.
 */
export async function syncLocalCopy(root: string, spoolDir: string, options: SyncOnceOptions): Promise<void> {
	const copy = localCopy(
		{
			root,
			origin: options.origin,
			vault: options.request?.vault ?? sessionVault(spoolDir, options.origin),
			...(options.openSocket === undefined ? {} : { openSocket: options.openSocket }),
			...(options.moving === undefined ? {} : { moving: options.moving }),
			...(options.onSaved === undefined ? {} : { onSaved: options.onSaved }),
			...(options.moving === undefined ? { seen: onceSeen(root, spoolDir, options) } : {}),
			notice: () => {},
		},
		false,
	);
	const { signal } = options;
	let stop = () => {};
	const stopped = new Promise<never>((_, reject) => {
		stop = () => reject(new SyncStopped("spool is closing"));
		if (signal?.aborted === true) stop();
		else signal?.addEventListener("abort", stop, { once: true });
	});
	try {
		await Promise.race([copy.idle(), stopped]);
	} finally {
		signal?.removeEventListener("abort", stop);
		copy.close();
	}
}

/** How a one-off sync asks the team what it has seen, once its folder names the project. */
function onceSeen(root: string, spoolDir: string, options: SyncOnceOptions): AskSeen {
	return (files) => {
		const link = followedLink(root);
		if (link === undefined) return Promise.resolve({ files: [], held: 0 });
		return askSeen(spoolDir, link, { ...options.request, origin: options.origin })(files);
	};
}

/** Why a one-off sync's connection closed, from the close code spool.page gave, if any. */
function closedOnce(code: number | undefined, team?: string): SpoolError {
	if (code === CLOSE_SIGNED_OUT) return new SyncRefused("not signed in; run `spool login`");
	if (code === CLOSE_NOT_EDITOR) return new SyncRefused("you can't edit this team project");
	if (code === CLOSE_UNPAID) return new SyncRefused("the team has gone local; it syncs again once the team pays");
	if (code === CLOSE_UNAVAILABLE) return new SyncDropped("spool.page is unavailable");
	if ((code === CLOSE_PROTOCOL || code === CLOSE_FORMAT) && team !== undefined)
		return new SyncRefused(updateLineWithHow(team, howToUpdate(runningCli())));
	return new SyncDropped("the connection to spool.page dropped");
}

/** The sync socket's address for a team project. */
export function syncUrl(link: ProjectLink): string {
	return `${link.origin.replace(/^https:/u, "wss:")}/api/teams/${link.team}/projects/${link.project}/sync`;
}

function localCopy(options: LocalCopyOptions, live: boolean): LocalCopy {
	const notice = options.notice ?? ((message: string) => console.error(`spool: ${message}`));
	const openSocket = options.openSocket ?? openWebSocket;
	const link = options.moving ?? followedLink(options.root);
	if (link === undefined) throw new SpoolError(`${options.root} is not a local copy of a team project`);
	if (link.origin !== options.origin)
		throw new SpoolError(
			`${options.root}/spool.json names ${link.origin}, but this machine signs in to ${options.origin}; it is not synced`,
		);
	const designDir = realDesignDir(options.root);
	const stateFile = join(designDir, ".spool", "sync.json");
	const recorded = readRecorded(stateFile, link.url);
	const state: CopyState = recorded ?? { project: link.url, head: 0, files: {} };
	/**
	 * This machine synced this copy before, but its record of the team is gone (`sync.json` deleted, or naming another
	 * project): once caught up it takes the team's version and keeps each local difference as a set-aside mark (#204).
	 * A copy this machine never synced keeps the Get it rule below, and so does one whose spool.page makes no checks.
	 */
	let lostRecord =
		live &&
		(recorded?.unmatched === true ||
			(recorded === undefined && options.synced?.before(options.root, link.url) === true));
	// said in the record, so a restart before it is matched still knows
	if (lostRecord) state.unmatched = true;
	/**
	 * A copy with no record of the team yet holds only its person's own work, as a move does: what git tracks in a
	 * teammate's `design/` after a pull of the move commit that had to merge is frames they made, which go up.
	 */
	let ownWork = Object.keys(state.files).length === 0;

	let closed = false;
	let socket: SyncSocket | undefined;
	let caughtUp = false;
	let failure: Error | undefined;
	const backoff = reconnectBackoff();
	let retry: NodeJS.Timeout | undefined;
	let refs = 0;
	/**
	 * Saves sent and not yet answered, by their ref, with the bytes a set-aside mark keeps and the send they went in:
	 * one message, a lone save or a bundle, which took one save from the minute's bucket.
	 */
	const inflight = new Map<
		string,
		{ path: string; hash: string | null; bytes: Buffer | undefined; batch: string; sent: number }
	>();
	/** How many of each send's saves are still unanswered, by send: what the bucket hasn't answered yet. */
	const sendsOut = new Map<number, number>();
	let sends = 0;
	/** Every path read to go up and not yet answered: in a bundle being made, or in flight. */
	const going = new Set<string>();
	/**
	 * Saves read in this pass over the changes, each send's worth, sent together once the pass is done: a cleanup's
	 * thousands of files go up in a few bundles. A send each, one save in each, to an object that takes no bundles.
	 */
	let outgoing: { saves: { path: string; bytes: Buffer | undefined }[]; size: number }[] = [];
	let shipping: NodeJS.Immediate | undefined;
	/** The object takes bundles: its welcome said so. */
	let bundles = false;
	/** While a connection catches up, everything it sets aside arrives together, as one batch. */
	let burst: string | undefined;
	/** Paths that changed again while their last save was in flight. */
	const dirty = new Set<string>();
	/** Paths whose save was set aside: the team's version that follows overwrites what is here. */
	const yielding = new Set<string>();
	const changed = new Set<string>();
	let settle: NodeJS.Timeout | undefined;
	let watch: TreeWatch | undefined;
	let waiters: { resolve(): void; reject(error: Error): void }[] = [];
	const presence = copyPresence(options.onPresence, options.onRoster, options.onPointerHidden);
	const comments = copyComments(options.commentsFile, options.onComments);
	/** What Spool renamed or moved here, said on the saves that delete the old files (spool#160). */
	const moves = movesToSay();
	/** Whether the team still holds a file under a folder, as this copy last heard. */
	const teamHolds = (folder: string) =>
		Object.entries(state.files).some(([path, file]) => file.hash !== null && path.startsWith(folder));
	/** Paths that didn't travel and why, each said once until it travels or goes. */
	const held = new Map<string, string>();
	/** A limit paused sync: why, and until when nothing is sent. What changes meanwhile waits on disk. */
	let paused: { why: string; until: number } | undefined;
	/** Paths waiting on the minute's bucket: each is read and sent once it has room. */
	const waiting = new Set<string>();
	/** Until when the bucket takes nothing more from this copy: a refusal's `retryAfter`, spread. */
	let holdUntil = 0;
	/** How full spool.page last said the bucket was, and when; unknown from a move, or a spool.page that doesn't say. */
	let pace: { room: number; refill: number; at: number } | undefined;
	let flushing: NodeJS.Timeout | undefined;
	/** What a long wait on the bucket says, while it lasts, and when its listeners were last told. */
	let sending: string | null = null;
	let toldSending = 0;
	let resume: NodeJS.Timeout | undefined;
	let toldSignedOut = false;
	/** The other account signed in here that the copy last said it waits through, said once until it syncs again. */
	let toldOther: string | undefined;
	/** The session token the open connection was made with. */
	let connectedWith: string | undefined;
	/** spool.page makes checks (#204): its welcome said so, so this copy's hello asked for them. */
	let checksOffered = false;
	/** The team's copy being listed, a page at a time, and why: drift a fingerprint found, or matching the team. */
	let checking: { cause: DriftCause | "match"; files: Map<string, ListedFile>; head: number | undefined } | undefined;
	/** Nothing is sent while the copy is being matched to the team: what differs becomes a mark instead. */
	let holding = false;
	/** Match the team asked for and not yet listed: each is answered with how many marks it made. */
	const matching: { resolve(marked: number): void; reject(error: Error): void }[] = [];
	/** A match made, waiting for the team's versions it asked for to be on disk before it is answered. */
	let matched: { marked: number; waiters: { resolve(marked: number): void }[] } | undefined;
	/** No caught-up connection for `OFFLINE_MS`: the canvas says so (#205). */
	let offline = false;
	let offlineTimer: NodeJS.Timeout | undefined;
	/**
	 * spool.page closed the connection because this Spool is too old for the team (#206): sync is paused, its changes
	 * wait on disk, and it asks again, less and less often, until the daemon runs a newer Spool.
	 */
	let outdated: UpdateNeeded | undefined;
	let updateWait = options.updateAskMs ?? UPDATE_ASK_MS;

	// a local copy whose folder went (a worktree removed) is neither read from nor written to: what it lacks is no
	// delete, and nothing comes down into it. Its spool.json going is not that: an old branch checked out has none
	const present = () => existsSync(options.root);
	/** The copy has looked at everything git may have done while it wasn't watching, and watches now. */
	let watching = false;
	/** A change to the record not written yet: a burst of files lands as one write, not one per file. */
	let recording: NodeJS.Timeout | undefined;
	const persist = () => {
		if (recording !== undefined) clearTimeout(recording);
		recording = undefined;
		if (watching) state.watched = Date.now();
		if (present()) writeAtomic(stateFile, `${JSON.stringify(state)}\n`);
	};
	const persistSoon = () => {
		recording ??= setTimeout(persist, RECORD_MS);
		recording.unref?.();
	};
	const isIdle = () =>
		caughtUp &&
		!holding &&
		checking === undefined &&
		inflight.size === 0 &&
		outgoing.length === 0 &&
		yielding.size === 0 &&
		changed.size === 0 &&
		restoring.size === 0 &&
		deferred.size === 0 &&
		waiting.size === 0;
	const wake = () => {
		if (matched !== undefined && restoring.size === 0) {
			const { marked, waiters: asked } = matched;
			matched = undefined;
			for (const waiter of asked) waiter.resolve(marked);
		}
		if (!isIdle()) return;
		for (const waiter of waiters.splice(0)) waiter.resolve();
	};
	const fail = (error: Error) => {
		failure = error;
		for (const waiter of waiters.splice(0)) waiter.reject(error);
	};

	/** What is at a design-relative path, without following a link; nothing when nothing can be there. */
	const statOf = (path: string): Stats | undefined => {
		try {
			return lstatSync(join(designDir, ...path.split("/")), { throwIfNoEntry: false });
		} catch {
			// a file where the path needs a folder
			return undefined;
		}
	};

	/** The bytes of a regular file at a design-relative path, or nothing for a missing file, a folder or a link. */
	const readLocal = (path: string): Buffer | undefined =>
		statOf(path)?.isFile() === true ? readFileSync(join(designDir, ...path.split("/"))) : undefined;

	const stays = (path: string) => whyStays(designDir, path);

	/**
	 * Whether a file was written too recently to be read whole: one may still be being written, and its first part
	 * must not travel as if it were all of it. A big one is let lie longer, since it is written in more pieces.
	 * It is checked again once it has been still that long.
	 */
	const writing = (path: string): boolean => {
		const stat = statOf(path);
		if (stat === undefined) return false;
		const still = stat.size > BIG_FILE_BYTES ? BIG_FILE_STILL_MS : SETTLE_MS;
		const age = Date.now() - stat.mtimeMs;
		if (age < 0 || age >= still) return false;
		changed.add(path);
		if (settle !== undefined) clearTimeout(settle);
		settle = setTimeout(checkChanged, Math.max(still - age, SETTLE_MS));
		return true;
	};

	/** Say once that a file didn't travel and why; it stays here as it is. */
	const hold = (path: string, why: string) => {
		if (held.get(path) === why) return;
		held.set(path, why);
		notice(`${path} didn't travel: ${why}`);
	};

	/** A file the watcher saw outside the layout, said unless it is Spool's own or the system's. */
	const outside = (path: string) => {
		if (path === ".gitignore" || path.startsWith(".spool/") || path.split("/").at(-1) === ".DS_Store") return;
		const stat = statOf(path);
		if (stat?.isFile() === true || stat?.isSymbolicLink() === true) hold(path, OUTSIDE_LAYOUT);
	};

	const isPaused = () => paused !== undefined && Date.now() < paused.until;

	/** A limit was reached: nothing more is sent until it may have lifted, then everything waiting is tried. */
	const pause = (reason: Limited, retryAfter: unknown) => {
		const seconds = typeof retryAfter === "number" && retryAfter > 0 ? retryAfter : RETRY_LIMIT_SECONDS;
		const why =
			reason === "monthly_limit" ? `${LIMITS[reason]}; sync starts again on ${liftsOn(seconds)}` : LIMITS[reason];
		const was = isPaused();
		if (paused?.why !== why) notice(`Sync paused: ${why}. Changes stay on this Mac until it lifts.`);
		const said = paused?.why;
		paused = { why, until: Date.now() + seconds * 1_000 };
		if (!was || said !== why) options.onPaused?.();
		if (resume !== undefined) clearTimeout(resume);
		resume = setTimeout(() => {
			resume = undefined;
			// the limit may have lifted: the pause is over as far as anyone looking can tell, until a save says not
			options.onPaused?.();
			if (caughtUp) checkEverything();
			wake();
		}, seconds * 1_000);
		resume.unref?.();
		if (!live) fail(new SyncPaused(reason, LIMITS[reason], seconds));
	};

	// --- the minute's bucket: a save waits until it has room, and a long wait is said as progress, never a pause ---

	/** What spool.page says of the bucket, on a welcome and on each answer to a save. */
	const hearPace = (value: unknown) => {
		if (typeof value !== "object" || value === null) return;
		const { room, refill } = value as Record<string, unknown>;
		if (typeof room === "number" && Number.isFinite(room) && typeof refill === "number" && refill > 0)
			pace = { room, refill, at: Date.now() };
	};

	/**
	 * How long until the bucket has room for one more save from here, 0 for now: what it last said it held, refilled
	 * since, less the saves sent that it hasn't answered yet.
	 */
	const untilRoom = (): number => {
		const now = Date.now();
		let wait = Math.max(0, holdUntil - now);
		if (pace !== undefined) {
			const room = pace.room + ((now - pace.at) * pace.refill) / 60_000 - sendsOut.size - outgoing.length;
			if (room < 1) wait = Math.max(wait, ((1 - room) * 60_000) / pace.refill);
		}
		return wait;
	};

	/** The waiting paths are being tried again: what waits on is said once they all have been, not one by one. */
	let retrying = false;

	/** A path waits for the bucket, read again when it is sent so only its latest bytes go. */
	const wait = (path: string) => {
		waiting.add(path);
		flushSoon();
		if (!retrying) sayWait();
	};

	const flushSoon = () => {
		if (flushing !== undefined || waiting.size === 0 || closed) return;
		flushing = setTimeout(
			() => {
				flushing = undefined;
				const paths = [...waiting];
				waiting.clear();
				retrying = true;
				try {
					for (const path of paths) check(path);
				} finally {
					retrying = false;
				}
				flushSoon();
				sayWait();
				wake();
			},
			Math.max(untilRoom(), SETTLE_MS),
		);
		flushing.unref?.();
	};

	/** A wait long enough to say: how many changes, to which team, and about how long until the last has gone. */
	const sayWait = () => {
		const refill = pace?.refill ?? SAVES_PER_MINUTE;
		const ms = untilRoom() + ((sendsFor(waiting.size) - 1) * 60_000) / refill;
		// a wait long enough to say is said until its last change has gone, however short what is left becomes
		const long = ms > SENDING_SAID_MS || (sending !== null && (waiting.size > 0 || inflight.size > 0));
		const said =
			waiting.size > 0 && long
				? `Sending ${waiting.size.toLocaleString("en")} ${waiting.size === 1 ? "change" : "changes"} to ${link.team}, ${aboutHowLong(ms)}`
				: null;
		// said as it begins and ends, and again now and then as it counts down
		const tell =
			(said === null) !== (sending === null) || (said !== null && Date.now() - toldSending >= SENDING_RETOLD_MS);
		// a save still out may come back refused and wait again: the wait ends once every save has been answered
		if (said === null && sending !== null && inflight.size > 0) return;
		sending = said;
		if (!tell) return;
		toldSending = Date.now();
		options.onPaused?.();
	};

	/** A save refused for the minute: sent again after `retryAfter`, spread at random, with no word unless it is long. */
	const waitForRoom = (path: string, retryAfter: unknown) => {
		const seconds = typeof retryAfter === "number" && retryAfter > 0 ? retryAfter : RETRY_LIMIT_SECONDS;
		holdUntil = Math.max(holdUntil, Date.now() + seconds * 1_000 * (1 + Math.random() * RETRY_SPREAD));
		wait(path);
	};

	const signedOut = () => {
		if (!toldSignedOut) notice(`${link.url} is not synced while this machine is signed out; run \`spool login\``);
		toldSignedOut = true;
	};

	const otherAccount = (email: string) => {
		if (toldOther !== email)
			notice(
				`${link.url} is not synced while this Mac is signed in as ${email}, who can't edit it; sign in again with the account that synced it`,
			);
		toldOther = email;
	};

	/** Whose copy this is: the account the caught-up connection signed in as, kept in the record. */
	const recordAccount = () => {
		const token = connectedWith;
		if (!live || token === undefined || options.accountOf === undefined) return;
		options.accountOf(token).then(
			(id) => {
				if (closed || connectedWith !== token || state.account === id) return;
				state.account = id;
				persist();
			},
			() => {
				// asked again on the next catch-up
			},
		);
	};

	/** How many sends this many saves take, the most each send carries. */
	const sendsFor = (saves: number) => Math.ceil(saves / (bundles ? BUNDLE_SAVES : 1));

	/** Whether a save of this size fits the send being made, which has taken its save from the bucket already. */
	const fits = (size: number) => {
		const last = outgoing.at(-1);
		return (
			bundles &&
			last !== undefined &&
			size <= BUNDLE_BYTES &&
			last.saves.length < BUNDLE_SAVES &&
			last.size + size <= BUNDLE_BYTES
		);
	};

	/** A save read to go up: in the send being made, or a new one, all sent once this pass is done. */
	const send = (path: string, bytes: Buffer | undefined) => {
		if (socket === undefined) return;
		const size = bytes?.byteLength ?? 0;
		const last = outgoing.at(-1);
		if (last !== undefined && fits(size)) {
			last.saves.push({ path, bytes });
			last.size += size;
		} else outgoing.push({ saves: [{ path, bytes }], size });
		going.add(path);
		shipping ??= setImmediate(ship);
	};

	/** Every send made in this pass, each one message: a lone save, or a bundle of them. */
	const ship = () => {
		shipping = undefined;
		const made = outgoing;
		outgoing = [];
		for (const { saves } of made) {
			if (socket === undefined || closed) {
				for (const { path } of saves) going.delete(path);
				continue;
			}
			const sent = ++sends;
			// what a bundle sets aside is marked together, as one batch
			const batch = burst ?? randomUUID();
			const framed = saves.map(({ path, bytes }) => {
				const ref = String(++refs);
				const hash = bytes === undefined ? null : digest(bytes);
				inflight.set(ref, { path, hash, bytes, batch, sent });
				return { ref, path, base: state.files[path]?.version ?? null, deleted: bytes === undefined, bytes };
			});
			sendsOut.set(sent, framed.length);
			const moved = moves.carried(
				framed.filter((save) => save.deleted).map((save) => save.path),
				teamHolds,
			);
			const saying = moved === undefined ? {} : { moved };
			const [only] = framed;
			if (framed.length === 1 && only !== undefined) {
				const { bytes, ...save } = only;
				socket.send(encodeFrame({ type: "save", ...save, ...saying }, bytes));
				continue;
			}
			socket.send(
				encodeFrame(
					{
						type: "saves",
						saves: framed.map(({ bytes, ...save }) => ({ ...save, size: bytes?.byteLength ?? 0 })),
						...saying,
					},
					joinParts(framed.map(({ bytes }) => bytes)),
				),
			);
		}
		wake();
	};

	// --- restore (spool#188): what a restore puts back is written here and sent as one restore's saves ---

	/** Each restore save out, by its ref: told its answer, or that the connection went first. */
	const restoreWaits = new Map<string, { answer(message: Record<string, unknown>): void; lost(): void }>();

	const restoreFiles = (restore: RestoreRef, files: readonly RestoreFile[]): Promise<RestoreAnswers> => {
		const open = socket;
		if (closed || open === undefined || !caughtUp)
			return Promise.reject(new RestoreOffline(`${link.url} isn't connected to its team just now`));
		if (!bundles) return Promise.reject(new RestoreOffline("spool.page can't take a restore yet"));
		const sending: { path: string; bytes: Buffer | undefined; hash: string | null }[] = [];
		for (const { path, bytes } of files) {
			if (!travels(path) || (bytes?.byteLength ?? 0) > FILE_LIMIT_BYTES) continue;
			const named = join(designDir, ...path.split("/"));
			let target: string;
			try {
				target = resolveDesignPath(designDir, named, path);
				if (target !== named) continue;
			} catch {
				continue;
			}
			const buffer = bytes === undefined ? undefined : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			const hash = buffer === undefined ? null : digest(buffer);
			// marked going first, so the watcher reads the write below as this restore's and sends nothing of its own
			if (hash !== (state.files[path]?.hash ?? null)) {
				going.add(path);
				sending.push({ path, bytes: buffer, hash });
			}
			const local = readLocal(path);
			if ((local === undefined ? null : digest(local)) === hash) continue;
			if (buffer === undefined) {
				rmSync(target, { force: true });
				pruneEmpty(designDir, dirname(target));
			} else writeAtomic(target, buffer);
		}
		const answers: RestoreAnswers = { applied: [], setAside: [], refused: [] };
		if (sending.length === 0) return Promise.resolve(answers);
		return new Promise((resolve, reject) => {
			let left = sending.length;
			const wait = {
				answer: (message: Record<string, unknown>) => {
					const path = String(message.path);
					if (message.type === "saved") answers.applied.push({ path, version: Number(message.version) });
					else if (message.type === "set-aside") answers.setAside.push(path);
					else answers.refused.push({ path, reason: String(message.reason) });
					if (--left === 0) resolve(answers);
				},
				lost: () =>
					reject(new RestoreOffline("the connection to the team dropped before it answered; try again once back")),
			};
			// a bundle's worth at a time, each carrying the restore: together they are one restore in the history
			const chunks: (typeof sending)[] = [];
			let size = 0;
			for (const save of sending) {
				const bytes = save.bytes?.byteLength ?? 0;
				const last = chunks.at(-1);
				if (last !== undefined && last.length < BUNDLE_SAVES && size + bytes <= BUNDLE_BYTES) {
					last.push(save);
					size += bytes;
				} else {
					chunks.push([save]);
					size = bytes;
				}
			}
			for (const chunk of chunks) {
				const sent = ++sends;
				const batch = randomUUID();
				const framed = chunk.map(({ path, bytes, hash }) => {
					const ref = String(++refs);
					inflight.set(ref, { path, hash, bytes, batch, sent });
					restoreWaits.set(ref, wait);
					return { ref, path, base: state.files[path]?.version ?? null, deleted: bytes === undefined, bytes };
				});
				sendsOut.set(sent, framed.length);
				open.send(
					encodeFrame(
						{
							type: "saves",
							saves: framed.map(({ bytes, ...save }) => ({ ...save, size: bytes?.byteLength ?? 0 })),
							restore,
						},
						joinParts(framed.map(({ bytes }) => bytes)),
					),
				);
			}
		});
	};

	/** Send one path if it differs from the team's version this copy last had, unless git made it differ. */
	const check = (path: string) => {
		if (holding) return;
		if (!travels(path) || restoring.has(path) || !present() || isPaused()) return;
		if (!ownWork && guard.busy() && !gitStale) {
			deferred.add(path);
			waitForGit();
			return;
		}
		if (going.has(path)) {
			dirty.add(path);
			return;
		}
		if (writing(path)) return;
		const why = stays(path);
		if (why !== undefined) return hold(path, why);
		const bytes = readLocal(path);
		const hash = bytes === undefined ? null : digest(bytes);
		const known = state.files[path];
		if (hash !== (known?.hash ?? null) && gitWrote(path, bytes)) return restore(path, bytes);
		held.delete(path);
		if (hash === (known?.hash ?? null)) {
			// the team's version, as it is here: kept to merge with, for copies that synced before bases were kept
			if (bytes !== undefined && hash !== null) keep(hash, bytes);
			return;
		}
		if (!fits(bytes?.byteLength ?? 0) && untilRoom() > 0) return wait(path);
		send(path, bytes);
	};

	// --- the git guard: what git writes into design/ never goes up; the team's version comes back over it ---

	/** Paths git wrote over, whose team version has been asked for and not yet put back. */
	const restoring = new Set<string>();
	/** Paths changed while git held its index lock, looked at once it lets go. */
	const deferred = new Set<string>();
	let gitWait: NodeJS.Timeout | undefined;
	let gitWaitSince = 0;
	let gitStale = false;
	let asking: NodeJS.Immediate | undefined;

	/** design/ went whole, as a pull that untracks it or a `git clean` takes it: refilled, never sent as deletes. */
	const vanished = () => !existsSync(join(designDir, "canvas.json"));

	/** Git's doing, or a folder that vanished: neither is a save. */
	const gitWrote = (path: string, bytes: Buffer | undefined) =>
		(bytes === undefined && vanished()) || (!ownWork && guard.wrote(path, bytes));

	/**
	 * Put the team's version back: ask for its bytes. A file the team doesn't have is left as git left it and never
	 * sent: whatever git wrote is in git, but it is never deleted on git's word, since that word can be wrong.
	 */
	const restore = (path: string, bytes: Buffer | undefined) => {
		if (vanished())
			// everything the folder held comes back, not only what the watcher has named so far
			for (const [missing, file] of Object.entries(state.files))
				if (file.hash !== null && readLocal(missing) === undefined) restoring.add(missing);
		const known = state.files[path];
		if (known === undefined || known.hash === null) {
			if (bytes !== undefined) hold(path, GIT_ONLY);
			return;
		}
		// a folder taken away whole takes its .gitignore with it, and the refill must stay out of git too
		if (!existsSync(join(designDir, ".gitignore"))) {
			const refilling = !existsSync(designDir);
			writeAtomic(join(designDir, ".gitignore"), TEAM_GITIGNORE);
			if (refilling && live) follow();
		}
		restoring.add(path);
		askSoon();
	};

	/** One `resend` for everything restoring, once this pass has found it all. */
	const askSoon = () => {
		asking ??= setImmediate(() => {
			asking = undefined;
			if (socket === undefined || !caughtUp) return;
			const paths = [...restoring];
			for (let at = 0; at < paths.length; at += RESEND_PATHS)
				socket.send(encodeFrame({ type: "resend", paths: paths.slice(at, at + RESEND_PATHS) }));
		});
	};

	const waitForGit = () => {
		if (gitWait !== undefined) return;
		if (deferred.size === 1) gitWaitSince = Date.now();
		gitWait = setTimeout(() => {
			gitWait = undefined;
			if (closed) return;
			if (guard.busy() && Date.now() - gitWaitSince < GIT_WAIT_MS) return waitForGit();
			gitStale = guard.busy();
			const paths = [...deferred];
			deferred.clear();
			for (const path of paths) check(path);
			gitStale = false;
			wake();
		}, SETTLE_MS);
		gitWait.unref?.();
	};

	const guard = options.moving
		? { busy: () => false, wrote: () => false, watching: () => {}, close: () => {} }
		: guardAgainstGit(
				designDir,
				(paths) => {
					for (const path of paths) changed.add(path);
					settle ??= setTimeout(checkChanged, SETTLE_MS);
				},
				state.watched,
			);

	/** Every travelling file on disk, and every path the team has that may have gone from it. */
	const checkEverything = () => {
		for (const path of new Set([...filesUnder(designDir, ""), ...Object.keys(state.files)])) check(path);
	};

	/**
	 * A folder watch started somewhere in the daemon, and macOS may have dropped a save meanwhile: every file changed
	 * since then is looked at, and every known path gone from disk. Before it is caught up, the catch-up does it all.
	 */
	const gaps = live
		? rescanAfterWatchStarts((since) => {
				if (closed || !caughtUp) return;
				for (const path of filesUnder(designDir, "")) if ((statOf(path)?.mtimeMs ?? 0) >= since) check(path);
				for (const path of Object.keys(state.files)) if (statOf(path) === undefined) check(path);
				wake();
			})
		: undefined;

	/** What a watcher event names: the path itself, everything under it if it is a folder, and anything that was. */
	const checkChanged = () => {
		settle = undefined;
		const paths = [...changed];
		changed.clear();
		if (!caughtUp) return;
		for (const path of paths) {
			// .spool and every other dot-folder are this machine's alone
			const dotted = path.split("/").some((segment) => segment.startsWith("."));
			if (dotted || !travels(path)) outside(path);
			if (dotted) continue;
			check(path);
			for (const under of filesUnder(designDir, path)) check(under);
			for (const known of Object.keys(state.files)) if (known.startsWith(`${path}/`)) check(known);
		}
		// a design/ removed whole may be named as nothing more than itself
		if (vanished()) checkEverything();
		wake();
	};

	/** A teammate's save, or the team's version of a path in a catch-up. */
	const receive = (message: Record<string, unknown>, bytes: Uint8Array | undefined) => {
		const { path, version, deleted } = message;
		if (typeof path !== "string" || typeof version !== "number" || deleted !== (bytes === undefined)) return;
		if (!present()) return;
		if (version > state.head) state.head = version;
		// a hostile or broken cloud could name anything: only Spool's own layout is ever written
		let target: string;
		try {
			if (!travels(path) || (bytes?.byteLength ?? 0) > FILE_LIMIT_BYTES) throw new Error(path);
			const named = join(designDir, ...path.split("/"));
			target = resolveDesignPath(designDir, named, path);
			// regular files only: never written through a symlink, even one that stays inside design/
			if (target !== named) throw new Error(path);
		} catch {
			notice(`refused a team file outside Spool's layout: ${path}`);
			return;
		}
		const incoming = bytes === undefined ? null : digest(bytes);
		const local = readLocal(path);
		const here = local === undefined ? null : digest(local);
		if (
			here !== incoming &&
			here !== (state.files[path]?.hash ?? null) &&
			!yielding.has(path) &&
			!restoring.has(path)
		) {
			// changed here and not sent yet: it goes up built on the version it was, and the team settles it
			persistSoon();
			return;
		}
		// this copy's save was set aside: where the two changed different lines, both stand, and go up as a new save
		const merged =
			yielding.delete(path) && here !== incoming
				? mergedWith(path, state.files[path]?.hash ?? null, local, bytes)
				: undefined;
		restoring.delete(path);
		// the team's version first, so the watcher reads this write as the team's and never sends it back
		state.files[path] = { version, hash: incoming };
		persistSoon();
		if (bytes !== undefined && incoming !== null) keep(incoming, bytes);
		if (here === incoming) return;
		if (bytes === undefined) {
			rmSync(target, { force: true });
			pruneEmpty(designDir, dirname(target));
			return;
		}
		if (merged === undefined) {
			writeAtomic(target, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
			return;
		}
		writeAtomic(target, merged);
		if (forgetMarks(designDir, { path })) options.onMarks?.();
		notice(`merged your change to ${path} with a teammate's`);
		check(path);
	};

	/** Kept versions taken out of the record go every so often, and at each catch-up. */
	let kept = 0;
	const prune = () => {
		kept = 0;
		pruneBases(designDir, new Set(Object.values(state.files).flatMap(({ hash }) => (hash === null ? [] : [hash]))));
	};
	const keep = (hash: string, bytes: Uint8Array) => {
		keepBase(designDir, hash, bytes);
		if (++kept >= PRUNE_EVERY) prune();
	};

	/** This copy's side of a set-aside file merged onto the team's, from the version both were built on. */
	const mergedWith = (
		path: string,
		built: string | null,
		mine: Buffer | undefined,
		team: Uint8Array | undefined,
	): Buffer | undefined => {
		if (team === undefined || built === null || mine === undefined || path === CANVAS_PATH) return undefined;
		const base = baseOf(designDir, built);
		return base === undefined ? undefined : mergeText(base, mine, team);
	};

	/** A collision this copy lost, kept for the canvas to mark. */
	const mark = (lost: Omit<SetAsideMark, "id" | "at" | "deleted">, bytes: Buffer | undefined) => {
		recordMark(designDir, lost, bytes);
		notice(
			lost.kind === "restored"
				? `${lost.path} is back: a teammate's edit beats your delete`
				: `your change to ${lost.path} was set aside: a teammate's save reached the team first`,
		);
		options.onMarks?.();
	};

	/** The team's answer to one save this copy sent, alone or in a bundle. */
	const answered = (message: Record<string, unknown>) => {
		const sent = typeof message.ref === "string" ? inflight.get(message.ref) : undefined;
		if (sent === undefined || typeof message.ref !== "string") return;
		inflight.delete(message.ref);
		going.delete(sent.path);
		const left = (sendsOut.get(sent.sent) ?? 1) - 1;
		if (left > 0) sendsOut.set(sent.sent, left);
		else sendsOut.delete(sent.sent);
		// once this answer is heard out (a refusal waits again first), a wait said may end
		if (sending !== null) queueMicrotask(sayWait);
		if (message.type === "saved" && typeof message.version === "number") {
			state.files[sent.path] = { version: message.version, hash: sent.hash };
			persistSoon();
			if (sent.bytes !== undefined && sent.hash !== null) keep(sent.hash, sent.bytes);
			options.onSaved?.(sent.path);
			// this copy's own save of a marked file reached the team, and is the answer to the mark
			if (forgetMarks(designDir, { path: sent.path })) options.onMarks?.();
			if (paused !== undefined && !isPaused()) {
				paused = undefined;
				notice("Sync resumed.");
				options.onPaused?.();
			}
		}
		if (message.type === "set-aside") {
			yielding.add(sent.path);
			const version = typeof message.version === "number" ? message.version : 0;
			mark({ path: sent.path, kind: "set-aside", version, by: byOf(message.by), batch: sent.batch }, sent.bytes);
		}
		if (message.type === "refused" && message.reason === "rate_limited" && live)
			waitForRoom(sent.path, message.retryAfter);
		else if (message.type === "refused") refused(sent.path, message.reason, message.retryAfter);
		if (dirty.delete(sent.path)) check(sent.path);
		const restored = restoreWaits.get(message.ref);
		restoreWaits.delete(message.ref);
		restored?.answer(message);
	};

	/** A teammate's bundle: each file in it, in order, as if it had come alone. */
	const receiveAll = (message: Record<string, unknown>, bytes: Uint8Array | undefined) => {
		const { files } = message;
		if (!Array.isArray(files) || !files.every(isRecord)) return;
		const entries = files.map((file) => ({
			file,
			deleted: file.deleted === true,
			size: typeof file.size === "number" ? file.size : -1,
		}));
		const parts = bundleParts(entries, bytes);
		if (parts === null) return;
		for (const [index, { file }] of entries.entries()) receive(file, parts[index]);
	};

	// --- checks (#204): the team's fingerprint after every catch-up, and drift repaired where it differs ---

	/** Ask for the team's copy, a page at a time: what drift a fingerprint found, or a match, is settled against it. */
	const list = (cause: DriftCause | "match") => {
		if (checking !== undefined) {
			// a match asked for while drift is being listed takes the same list
			if (cause === "match") checking.cause = cause;
			return;
		}
		checking = { cause, files: new Map(), head: undefined };
		socket?.send(encodeFrame({ type: "list" }));
	};

	/** The team's fingerprint, said after `caught-up`: one that differs from this copy's record is listed. */
	const compare = (theirs: unknown) => {
		if (typeof theirs !== "string" || checking !== undefined || holding) return;
		const at = socket;
		void copyFingerprint(Object.entries(state.files).map(([path, { hash }]) => ({ path, hash }))).then((mine) => {
			if (!closed && socket === at && caughtUp && mine !== theirs) list("missed");
		});
	};

	/** One page of the team's copy; the last settles what was listed for. */
	const heardList = (message: Record<string, unknown>) => {
		const page = readListed(message);
		if (page === undefined || checking === undefined) return;
		checking.head ??= page.head;
		for (const file of page.files) if (travels(file.path)) checking.files.set(file.path, file);
		if (page.next !== null) {
			socket?.send(encodeFrame({ type: "list", after: page.next }));
			return;
		}
		const { cause, files, head } = checking;
		checking = undefined;
		if (cause === "missed") repairMissed(files, head ?? state.head);
		else settleMatch(files, head ?? state.head, cause);
	};

	/**
	 * The team's version of a path as the list says it, unless this copy heard a newer one since the list was read: a
	 * teammate's save relayed meanwhile is the team's version now. Undefined for a path the team doesn't hold.
	 */
	const teamsNow = (path: string, listed: ListedFile | undefined, since: number) => {
		const known = state.files[path];
		if (known !== undefined && known.version > (listed?.version ?? since))
			return known.hash === null ? undefined : { version: known.version, hash: known.hash };
		return listed;
	};

	/**
	 * Drift a fingerprint found, put right path by path and only where it differs: each path whose record isn't the
	 * team's takes the team's version, unless it changed here and hasn't gone up, which goes up under the collision
	 * rule as any change does. Said to the team as counts, never as paths.
	 */
	const repairMissed = (team: Map<string, ListedFile>, since: number) => {
		let repaired = 0;
		const known = Object.entries(state.files).flatMap(([path, { hash }]) => (hash === null ? [] : [path]));
		for (const path of new Set([...team.keys(), ...known])) {
			if (!travels(path) || going.has(path) || restoring.has(path) || yielding.has(path) || waiting.has(path))
				continue;
			const record = state.files[path];
			const theirs = teamsNow(path, team.get(path), since);
			if ((record?.hash ?? null) === (theirs?.hash ?? null)) continue;
			const bytes = readLocal(path);
			const here = bytes === undefined ? null : digest(bytes);
			// changed here and not sent yet: never overwritten, it goes up built on the version it was
			if (here !== (record?.hash ?? null) || stays(path) !== undefined) continue;
			repaired++;
			if (theirs !== undefined && here === theirs.hash) state.files[path] = { ...theirs };
			else if (theirs !== undefined) restoring.add(path);
			else gone(path, record);
		}
		persistSoon();
		if (restoring.size > 0) askSoon();
		if (repaired > 0) socket?.send(encodeFrame({ type: "drift", repaired, cause: "missed" }));
		wake();
	};

	/** A path the team doesn't hold: it goes from disk, and the record says the team has it deleted. */
	const gone = (path: string, record: { version: number; hash: string | null } | undefined) => {
		if (record !== undefined) state.files[path] = { version: record.version, hash: null };
		const target = join(designDir, ...path.split("/"));
		if (statOf(path) === undefined) return;
		rmSync(target, { force: true });
		pruneEmpty(designDir, dirname(target));
	};

	/**
	 * The copy made the team's (#205), the repair a lost record takes too: every travelling path takes the team's
	 * version, each local difference, an addition or a delete too, becomes one set-aside mark, all in one batch, and
	 * what doesn't travel is left alone. Then sync goes on as after any catch-up.
	 */
	const settleMatch = (team: Map<string, ListedFile>, since: number, cause: "lost_record" | "match") => {
		const batch = randomUUID();
		let marked = 0;
		for (const path of new Set([...team.keys(), ...filesUnder(designDir, ""), ...Object.keys(state.files)])) {
			if (!travels(path) || restoring.has(path) || stays(path) !== undefined) continue;
			const record = state.files[path];
			const theirs = teamsNow(path, team.get(path), since);
			const bytes = readLocal(path);
			const here = bytes === undefined ? null : digest(bytes);
			if (here === (theirs?.hash ?? null)) {
				if (theirs !== undefined) state.files[path] = { ...theirs };
				continue;
			}
			recordMark(designDir, { path, kind: "set-aside", version: theirs?.version ?? 0, by: null, batch }, bytes);
			marked++;
			if (theirs === undefined) gone(path, record);
			// the team's version comes back over what is here, whatever the record says
			else restoring.add(path);
		}
		if (cause === "lost_record") {
			lostRecord = false;
			delete state.unmatched;
			socket?.send(encodeFrame({ type: "drift", repaired: marked, cause }));
		}
		ownWork = false;
		holding = false;
		persist();
		if (marked > 0) options.onMarks?.();
		const asked = matching.splice(0);
		if (asked.length > 0) {
			matched ??= { marked, waiters: [] };
			matched.waiters.push(...asked);
		}
		if (restoring.size > 0) askSoon();
		checkEverything();
		wake();
	};

	const handle = (data: string | ArrayBuffer) => {
		// a frame the socket had in hand when this copy stopped is for nobody: its folder may be gone already
		if (closed) return;
		const framed = decodeFrame(data);
		if (framed === null) return;
		const { message, bytes } = framed;
		if (message.type === "presence") return presence.hear(message);
		if (comments.hear(message, bytes)) return;
		if (message.type === "presences") return presence.tick(message);
		if (message.type === "presence-hidden") return presence.hidden(message);
		if (message.type === "welcome") {
			// a move's connection is paced by nothing
			pace = undefined;
			hearPace(message.pace);
			bundles = message.bundles === true;
			checksOffered = message.checks === true;
		} else if (message.type === "month") {
			const { made, limit } = message;
			if (typeof made === "number" && typeof limit === "number")
				notice(`${made.toLocaleString("en")} of ${limit.toLocaleString("en")} saves to ${link.project} this month`);
		} else if (message.type === "file") receive(message, bytes);
		else if (message.type === "files") receiveAll(message, bytes);
		else if (message.type === "caught-up") {
			if (typeof message.head === "number" && message.head > state.head) state.head = message.head;
			persist();
			caughtUp = true;
			toldSignedOut = false;
			toldOther = undefined;
			online();
			updated();
			if (live) options.synced?.now(options.root, link.url);
			recordAccount();
			prune();
			// a record lost: nothing goes up until the copy is matched to the team, its differences kept as marks
			if (lostRecord && checksOffered) {
				holding = true;
				list("lost_record");
			}
			// caught up, and only now: this Spool's format migration, whose writes go up below with what waited (#206)
			else if (live) migrate();
			checkEverything();
			ownWork = false;
			// what git did while nobody watched has been put back; from here the guard sees git as it goes
			if (live && !watching) {
				watching = true;
				guard.watching();
				persist();
			}
			burst = undefined;
			presence.joined(socket);
			options.caughtUp?.();
			// comments can be written again: a canvas reads that they can
			options.onComments?.();
			// what git wrote over before the connection dropped is still waiting on the team's version
			if (restoring.size > 0) askSoon();
		} else if (message.type === "fingerprint") compare(message.fingerprint);
		else if (message.type === "listed") heardList(message);
		else if (message.type === "restored") {
			const { path, version } = message;
			if (typeof path === "string" && travels(path) && typeof version === "number")
				mark({ path, kind: "restored", version, by: byOf(message.by), batch: burst ?? randomUUID() }, undefined);
		} else if (message.type === "saved" || message.type === "set-aside" || message.type === "refused") {
			hearPace(message.pace);
			answered(message);
		} else if (message.type === "answers" && Array.isArray(message.answers)) {
			hearPace(message.pace);
			for (const answer of message.answers as unknown[]) if (isRecord(answer)) answered(answer);
		}
		wake();
	};

	// --- offline (#205): no caught-up connection for OFFLINE_MS is said; a shorter drop says nothing ---

	const goingOffline = () => {
		if (!live || closed || offline || offlineTimer !== undefined || outdated !== undefined) return;
		offlineTimer = setTimeout(() => {
			offlineTimer = undefined;
			if (closed || caughtUp) return;
			offline = true;
			options.onPaused?.();
		}, options.offlineMs ?? OFFLINE_MS);
		offlineTimer.unref?.();
	};

	/** Bring design/ up to this Spool's format, its unsent changes too, before they are looked at to go up. */
	const migrate = () => {
		try {
			options.migrate?.();
		} catch (error) {
			notice(`could not bring ${link.project} up to this Spool's format: ${(error as Error).message}`);
		}
	};

	const online = () => {
		if (offlineTimer !== undefined) clearTimeout(offlineTimer);
		offlineTimer = undefined;
		if (!offline) return;
		offline = false;
		options.onPaused?.();
	};

	const connect = async () => {
		retry = undefined;
		if (closed) return;
		let token: string | undefined;
		try {
			token = await options.vault.read();
		} catch {
			token = undefined;
		}
		if (closed) return;
		if (token === undefined) {
			if (!live) return fail(new SyncRefused("not signed in; run `spool login`"));
			signedOut();
			return reconnect();
		}
		if (!levelled && !(await level())) {
			if (closed) return;
			if (!live) return fail(new SyncDropped("spool.page couldn't say what the team has of design/"));
			return reconnect();
		}
		if (closed) return;
		let opened = false;
		const presented = token;
		socket = openSocket(syncUrl(link), token, {
			open: () => {
				burst = randomUUID();
				opened = true;
				backoff.connected();
				connectedWith = presented;
				socket?.send(
					encodeFrame({
						type: "hello",
						protocol: PROTOCOL_VERSION,
						format: FORMAT_VERSION,
						since: state.head,
						bundles: true,
						ticks: true,
						...(live ? { checks: true } : {}),
						...(options.moving === undefined ? {} : { moving: true }),
					}),
				);
			},
			message: handle,
			close: (code) => {
				socket = undefined;
				connectedWith = undefined;
				// comments can't be written now: a canvas that could reads that it can't
				if (caughtUp && !closed) options.onComments?.();
				caughtUp = false;
				burst = undefined;
				// what was in flight is settled by the next catch-up: applied saves come back as the team's version
				inflight.clear();
				// a restore's saves still out go up as ordinary saves once caught up again, from what is on disk
				for (const wait of new Set(restoreWaits.values())) wait.lost();
				restoreWaits.clear();
				sendsOut.clear();
				going.clear();
				outgoing = [];
				bundles = false;
				checksOffered = false;
				// a list cut off settles nothing: a match asked for is refused, and a lost record is matched next time
				checking = undefined;
				holding = false;
				for (const waiter of matching.splice(0)) waiter.reject(new MatchOffline());
				dirty.clear();
				yielding.clear();
				presence.lost();
				comments.lost();
				if (closed) return;
				if (!live) return fail(closedOnce(code, link.team));
				if (code === CLOSE_PROTOCOL || code === CLOSE_FORMAT) needsUpdate();
				goingOffline();
				if (code === CLOSE_SIGNED_OUT) signedOut();
				// cut off, or refused before it opened: spool.page says whether this machine still edits the project
				if (code === CLOSE_NOT_EDITOR || code === CLOSE_UNPAID || !opened) return void askStanding();
				reconnect();
			},
		});
	};

	/**
	 * A design/ spool never synced, brought level with the team before it first connects (spool#196): each file the
	 * team had at its path, a delete included, takes the record of a version older than any the team holds, so the
	 * catch-up lands the team's over it and nothing older goes up; what the team never had goes up as before, and
	 * what the team holds its own version of is set aside as before. False when the team couldn't be asked: the
	 * connection waits, as it would offline. A spool.page that can't answer, or won't, leaves it as it was.
	 */
	let levelled = options.seen === undefined || options.moving !== undefined || Object.keys(state.files).length > 0;
	const level = async (): Promise<boolean> => {
		if (levelled || Object.keys(state.files).length > 0) {
			levelled = true;
			return true;
		}
		const paths = filesUnder(designDir, "").filter((path) => path !== CANVAS_PATH && stays(path) === undefined);
		if (paths.length === 0 || options.seen === undefined) {
			levelled = true;
			return true;
		}
		let classes: DesignClasses;
		try {
			classes = await classDesign(designDir, paths, options.seen);
		} catch (error) {
			// down or unreachable, it is asked again; refused, or unable to say, the copy goes on as it always did
			const cannotSay =
				error instanceof CloudSignedOut ||
				(error instanceof CloudTeamRefused && (error.status < 500 || error.code === "invalid_answer"));
			if (!cannotSay) return false;
			levelled = true;
			return true;
		}
		levelled = true;
		if (Object.keys(state.files).length > 0) return true;
		for (const { path, hash, kind } of classes.files) if (kind === "older") state.files[path] = { version: 0, hash };
		return true;
	};

	/** Whether the project ended for this machine, or its team went local; otherwise it keeps trying, as offline. */
	const askStanding = async () => {
		const standing = (await options.standing?.()) ?? "unknown";
		if (closed) return;
		if (standing === "not_editor" && options.ended !== undefined) return options.ended();
		if (standing === "unpaid" && options.goneLocal !== undefined) return options.goneLocal();
		if (standing === "moved_out" && options.movedOut !== undefined) return options.movedOut();
		if (typeof standing === "object" && "removed" in standing && options.removed !== undefined)
			return options.removed(standing.removed);
		if (typeof standing === "object" && "movedTo" in standing && options.moved?.(standing.movedTo) === true) return;
		if (standing === "signed_out") signedOut();
		if (typeof standing === "object" && "signedInAs" in standing) otherAccount(standing.signedInAs);
		reconnect();
	};

	/** A save spool.page wouldn't take: the file stays here, and a limit pauses sync until it lifts. */
	const refused = (path: string, reason: unknown, retryAfter: unknown) => {
		// a restore's save the team says isn't what the path held then: the team's version comes back over it
		if (reason === "restore_mismatch") {
			restoring.add(path);
			askSoon();
		} else if (reason === "too_large") hold(path, TOO_BIG);
		else if (reason === "outside_layout" || reason === "invalid_save") hold(path, OUTSIDE_LAYOUT);
		else if (typeof reason === "string" && Object.hasOwn(LIMITS, reason)) pause(reason as Limited, retryAfter);
		// signed_out and not_editor: the connection closes next, and the close is what is answered
	};

	/**
	 * This Spool is too old for the team (#206): sync pauses as on a limit, never as offline, and is said once until it
	 * lifts. The next ask waits `updateWait`, doubling each time up to an hour.
	 */
	const needsUpdate = () => {
		if (outdated !== undefined) return;
		const asked: UpdateNeeded = { team: link.team, ...(options.updateHow ?? howToUpdate(runningCli())) };
		outdated = asked;
		if (offlineTimer !== undefined) clearTimeout(offlineTimer);
		offlineTimer = undefined;
		offline = false;
		options.onPaused?.();
		// said once the team's name is known: by its address when spool.page can't say
		const say = (name: string) => {
			if (closed || outdated !== asked) return;
			outdated = { ...asked, team: name };
			notice(`Sync paused: ${updateLineWithHow(name, asked)}. Changes stay on this Mac until it is updated.`);
			if (name !== asked.team) options.onPaused?.();
		};
		(options.teamName?.() ?? Promise.resolve(link.team)).then(say, () => say(link.team));
	};

	/** A connection caught up again: a pause for an update has lifted, so this Spool is new enough after all. */
	const updated = () => {
		updateWait = options.updateAskMs ?? UPDATE_ASK_MS;
		if (outdated === undefined) return;
		outdated = undefined;
		notice("Sync resumed.");
		options.onPaused?.();
	};

	const reconnect = () => {
		if (closed || retry !== undefined) return;
		let wait: number;
		if (outdated === undefined) wait = backoff.next();
		else {
			wait = updateWait;
			updateWait = Math.min(updateWait * 2, UPDATE_ASK_MAX_MS);
		}
		retry = setTimeout(() => void connect(), wait);
		retry.unref?.();
	};

	/**
	 * Watch design/ for saves, again after a refill: a design/ removed whole can take its watch with it. A followed
	 * copy is out of git whatever `.gitignore` it came with (a solo one survives a pull of the move commit).
	 */
	const follow = () => {
		const ignore = join(designDir, ".gitignore");
		if (present() && existsSync(designDir) && readLocal(".gitignore")?.toString() !== TEAM_GITIGNORE)
			writeAtomic(ignore, TEAM_GITIGNORE);
		watch?.close();
		watch = watchTree(
			designDir,
			(filename) => {
				if (filename === null) return;
				changed.add(filename.split(sep).join("/"));
				settle ??= setTimeout(checkChanged, SETTLE_MS);
			},
			() => notice(`stopped watching ${designDir}; restart spool to sync it again`),
		);
	};

	if (live) follow();
	goingOffline();
	void connect();

	return {
		idle: () =>
			failure !== undefined
				? Promise.reject(failure)
				: isIdle()
					? Promise.resolve()
					: new Promise<void>((resolve, reject) => waiters.push({ resolve, reject })),
		presence: (state) => presence.say(caughtUp ? socket : undefined, state),
		agent: (agent) => presence.agent(caughtUp ? socket : undefined, agent),
		people: () => presence.people(),
		pointerHidden: () => presence.pointerHidden(),
		roster: () => presence.roster(),
		state: () => ({
			paused: isPaused() && paused !== undefined ? paused.why : null,
			sending,
			held: [...held].map(([path, why]) => ({ path, why })).sort((a, b) => (a.path < b.path ? -1 : 1)),
			// a pause says what to do; offline would only say less
			offline: offline && !isPaused() && outdated === undefined,
			update: outdated ?? null,
		}),
		matchTeam: () => {
			if (!caughtUp || socket === undefined || !checksOffered) return Promise.reject(new MatchOffline());
			return new Promise<number>((resolve, reject) => {
				matching.push({ resolve, reject });
				holding = true;
				list("match");
			});
		},
		comments: () => comments.list(),
		online: () => caughtUp && socket !== undefined,
		comment: (comment, still) => comments.post(caughtUp ? socket : undefined, comment, still),
		reply: (reply) => comments.reply(caughtUp ? socket : undefined, reply),
		change: (change) => comments.change(caughtUp ? socket : undefined, change),
		still: (comment) => comments.still(caughtUp ? socket : undefined, comment),
		moved: (moved) => moves.said(moved),
		known: () => state.files,
		restore: restoreFiles,
		turnEnded: () => {
			const said = setTimeout(() => {
				const waited = isIdle()
					? Promise.resolve()
					: new Promise<void>((resolve, reject) => waiters.push({ resolve, reject }));
				waited.then(
					() => {
						if (!closed && caughtUp) socket?.send(encodeFrame({ type: "turn-ended" }));
					},
					() => {},
				);
			}, TURN_SETTLE_MS);
			said.unref?.();
		},
		close: () => {
			closed = true;
			if (retry !== undefined) clearTimeout(retry);
			if (settle !== undefined) clearTimeout(settle);
			if (gitWait !== undefined) clearTimeout(gitWait);
			if (asking !== undefined) clearImmediate(asking);
			if (shipping !== undefined) clearImmediate(shipping);
			gaps?.close();
			// when this copy stopped watching: whatever git does from now is checked when it is followed again
			if (watching || recording !== undefined) persist();
			guard.close();
			if (resume !== undefined) clearTimeout(resume);
			if (flushing !== undefined) clearTimeout(flushing);
			if (offlineTimer !== undefined) clearTimeout(offlineTimer);
			for (const waiter of matching.splice(0)) waiter.reject(new MatchOffline());
			watch?.close();
			socket?.close();
			socket = undefined;
			comments.lost();
			waiters = [];
		},
	};
}

/** The day a limit `seconds` from now lifts, as a person reads it: `1 June`. */
export function liftsOn(seconds: number): string {
	return new Date(Date.now() + seconds * 1_000).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

/** A wait said roughly: `under a minute`, `about a minute`, `about 3 minutes`. */
function aboutHowLong(ms: number): string {
	const minutes = Math.round(ms / 60_000);
	if (minutes < 1) return "under a minute";
	return minutes === 1 ? "about a minute" : `about ${minutes} minutes`;
}

/** A person's state without what their agent is doing: what they change themselves. */
function ownPart(state: PresenceState | null): string {
	if (state === null) return "null";
	const { agent: _, ...own } = state;
	return JSON.stringify(own);
}

/**
 * One local copy's share of presence. What this machine says goes up only while the copy is caught up, and is
 * said again on every reconnect; who else is here is known only for as long as the connection is up.
 */
function copyPresence(
	onPresence: ((presence: Presence) => void) | undefined,
	onRoster?: () => void,
	onPointerHidden?: () => void,
) {
	let mine: PresenceState | null = null;
	/** the team hides this person's pointer from the others on their page, past the first ones it shows */
	let pointerHidden = false;
	/** this machine's agent, which the daemon says and rides on where the canvas says its person is */
	let working: PresenceAgent | null = null;
	/** what the team was last told, so the same state is never said twice */
	let told = "null";
	/** Everyone else, with when they were heard and when they last did anything of their own. */
	const others = new Map<string, { presence: Presence; heard: number; active: number }>();
	const tell = (state: PresenceState | null) => encodeFrame({ type: "presence", state });
	const standing = (): PresenceState | null =>
		mine === null ? null : working === null ? mine : { ...mine, agent: working };
	const heard = (presence: Presence) => {
		const id = presence.person.accountId;
		const was = others.get(id);
		const now = Date.now();
		if (presence.state === null) {
			others.delete(id);
			onPresence?.(presence);
			if (was !== undefined) onRoster?.();
			return;
		}
		// their agent at work is not them at work (#378): only their own changes keep them from going idle; an outline
		// said again with nothing changed is someone busy on another page, `still` saying how long since they were
		const own = was === undefined || ownPart(was.presence.state) !== ownPart(presence.state);
		const elsewhere = presence.still > 0 ? Math.max(was?.active ?? 0, now - presence.still) : undefined;
		const active = own ? now - presence.still : (elsewhere ?? was?.active ?? now);
		others.set(id, { presence, heard: now, active });
		onPresence?.(presence);
		const back = was !== undefined && now - was.active >= PRESENCE_IDLE_MS && now - active < PRESENCE_IDLE_MS;
		if (was === undefined || back) onRoster?.();
	};
	const sayIfChanged = (socket: SyncSocket | undefined) => {
		const state = standing();
		const text = JSON.stringify(state);
		if (socket === undefined || text === told) return;
		told = text;
		socket.send(tell(state));
	};
	return {
		say(socket: SyncSocket | undefined, state: PresenceState | null): void {
			// what an agent is doing is the daemon's to say, never the canvas's
			if (state === null) mine = null;
			else {
				const { agent: _, ...where } = state;
				mine = where;
			}
			sayIfChanged(socket);
		},
		agent(socket: SyncSocket | undefined, agent: PresenceAgent | null): void {
			working = agent;
			sayIfChanged(socket);
		},
		joined(socket: SyncSocket | undefined): void {
			const state = standing();
			told = JSON.stringify(state);
			if (state !== null) socket?.send(tell(state));
		},
		hear(message: Record<string, unknown>): void {
			const presence = readPresence(message);
			if (presence !== undefined) heard(presence);
		},
		/** A tick: everyone who changed since the last, heard in turn. */
		tick(message: Record<string, unknown>): void {
			for (const presence of readPresences(message) ?? []) heard(presence);
		},
		hidden(message: Record<string, unknown>): void {
			const hidden = readPresenceHidden(message);
			if (hidden === undefined || hidden === pointerHidden) return;
			pointerHidden = hidden;
			onPointerHidden?.();
		},
		pointerHidden: () => pointerHidden,
		/** The connection dropped: everyone it showed is gone until it is back. */
		lost(): void {
			if (pointerHidden) {
				pointerHidden = false;
				onPointerHidden?.();
			}
			for (const { presence } of others.values()) onPresence?.({ ...presence, state: null, still: 0 });
			const had = others.size > 0;
			others.clear();
			if (had) onRoster?.();
		},
		roster: (): TabPresence[] =>
			[...others.values()].map(({ presence, active }) => ({ person: presence.person, quiet: Date.now() - active })),
		people: (): Presence[] =>
			[...others.values()].map(({ presence, heard }) => ({
				...presence,
				still: presence.still + Date.now() - heard,
			})),
	};
}

/**
 * How often a copy that has gone local asks again whether its team pays, besides at start: one GET a minute per
 * stopped copy, so a team paid for from a browser syncs again within the minute.
 */
const GONE_LOCAL_ASK_MS = 60_000;
/** How soon a copy gone local asks again when spool.page couldn't be reached: doubling each time, up to how often it asks. */
const GONE_LOCAL_RETRY_MS = 60_000;

/** A copy's link, and the request that asks spool.page about it. */
interface Linked {
	link: ProjectLink;
	request: CloudRequestOptions & { origin: string; vault: Pick<CloudVault, "read"> };
}

/**
 * Every team project the daemon has registered, followed for as long as it stays registered. A local copy
 * whose `design/` isn't there yet waits for a fetch to fill it, and one whose project ended is never followed. One
 * whose team went local is stopped, not ended: it keeps its link and its files, and asks at start and every minute
 * whether the team pays again, when it follows the team once more and catches up as after any time offline.
 */
export function createTeamSync(deps: {
	spoolDir: string;
	origin: () => string;
	vault: (origin: string) => Pick<CloudVault, "read">;
	fetch?: typeof fetch;
	openSocket?: OpenSyncSocket;
	/** What a local copy has to say, and the root it is about. */
	notice?: (message: string, root?: string) => void;
	/** A local copy's set-aside marks changed. */
	onMarks?: (root: string) => void;
	/** A local copy's sync paused on a limit, or the pause lifted. */
	onSyncChanged?: (root: string) => void;
	/** A local copy went local, or follows its team again: `state(root).goneLocal` says which. */
	onGoneLocal?: (root: string) => void;
	/** A local copy ended because its project was moved out of its team. */
	onEnded?: (root: string) => void;
	/** Who else is in a local copy's project changed as its tab shows it; nobody once the copy stops. */
	onRoster?: (root: string, people: TabPresence[]) => void;
	/** The comments a local copy knows changed. */
	onComments?: (root: string) => void;
	/** How often a copy gone local asks again whether its team pays: a minute, unless a test can't wait that long. */
	goneLocalAskMs?: number;
	/** How soon it asks again when spool.page couldn't be reached, doubling up to `goneLocalAskMs`: a minute. */
	goneLocalRetryMs?: number;
	/** How long a copy goes without a caught-up connection before it says it is offline: `OFFLINE_MS`, unless a test can't wait. */
	offlineMs?: number;
	/** How long a copy paused for an update first waits to ask again: `UPDATE_ASK_MS`, unless a test can't wait. */
	updateAskMs?: number;
	/** How this Spool is updated, unless a test says: read off the running CLI. */
	updateHow?: UpdateHow;
	/**
	 * Bring a team project's design/ up to this Spool's format (#206): asked of each local copy once it has caught up,
	 * never before, so the team's files are migrated rather than an old local read of them.
	 */
	migrate?: (root: string) => void;
}) {
	const copies = new Map<string, LocalCopy>();
	/** Which copies this machine has synced, so one whose record is lost is matched rather than sent (#204). */
	const synced = syncedCopies(deps.spoolDir);
	/** Copies gone local, by root, with the link each keeps. */
	const stopped = new Map<string, ProjectLink>();
	/** Stopped roots whose standing is being asked now. */
	const pending = new Set<string>();
	const askMs = deps.goneLocalAskMs ?? GONE_LOCAL_ASK_MS;
	/** Stopped roots that couldn't reach spool.page when they asked, each with how long it waits to ask again. */
	const retries = new Map<string, { timer: ReturnType<typeof setTimeout>; wait: number }>();
	/** Who listens for presence on each root's canvas. */
	const watchers = new Map<string, Set<(presence: Presence) => void>>();
	/** Who listens on each root's canvas for whether its person's pointer is hidden (#107). */
	const hiddenWatchers = new Map<string, Set<(hidden: boolean) => void>>();
	/**
	 * Where this machine's person is on each root's canvas, as its canvas last said: a copy followed after the canvas
	 * opened (a fetch just filled it, or its team pays again) says it as soon as it is caught up.
	 */
	const canvases = new Map<string, PresenceState>();
	/** How many moved addresses each root has followed since it last caught up: a loop of forwards stops at `MAX_HOPS`. */
	const hops = new Map<string, number>();
	/** Roots this daemon is moving itself: never followed meanwhile, whatever their spool.json says. */
	const held = new Set<string>();
	/** What each root's agent was last told didn't travel, so its next command says only what is new. */
	const toldAgent = new Map<string, Set<string>>();
	let closed = false;
	const say = deps.notice ?? ((message: string) => console.error(`spool: ${message}`));
	/** A copy's link and how to ask spool.page about it, resolved once each time it is followed or asked after. */
	const linked = (link: ProjectLink): Linked => {
		const origin = deps.origin();
		const vault = deps.vault(origin);
		return { link, request: { origin, vault, ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }) } };
	};

	/**
	 * Where this machine stands in a copy's project. Ending a copy can't be undone by waiting, so it takes spool.page
	 * saying, by name, that the very account the copy synced as is out: not in the team, the team deleted, the project
	 * removed, or a viewer now. Any other account signed in here only makes it wait, and so does a 404 that names
	 * nothing, or a copy with no account on record: one never caught up since it was got.
	 */
	const standing =
		(root: string, { link, request }: Linked) =>
		async (): Promise<Standing> => {
			try {
				const found = await cloudTeams(deps.spoolDir, request).project(link.team, link.project);
				if (found.standing === "unpaid") return "unpaid";
				if (found.role !== "viewer") return "editor";
			} catch (error) {
				if (error instanceof CloudSignedOut) return "signed_out";
				if (error instanceof CloudTeamRefused && error.status === 410) {
					if (error.code === "project_moved_out") return "moved_out";
					if (error.code === "project_removed" && typeof error.body.team === "string")
						return {
							removed: { team: error.body.team, by: typeof error.body.by === "string" ? error.body.by : null },
						};
					const movedTo = error.code === "project_moved" ? parseProjectLink(error.body.url) : undefined;
					if (movedTo !== undefined && movedTo.origin === link.origin) return { movedTo };
				}
				if (!(error instanceof CloudTeamRefused && error.status === 404 && OUT_OF_PROJECT.has(error.code)))
					return "unknown";
			}
			try {
				const signedIn = await account(deps.spoolDir, request);
				return copyRecord(root)?.account === signedIn.accountId ? "not_editor" : { signedInAs: signedIn.email };
			} catch (error) {
				return error instanceof CloudSignedOut ? "signed_out" : "unknown";
			}
		};
	const accountOf =
		({ request }: Linked) =>
		async (token: string) =>
			(await account(deps.spoolDir, { ...request, vault: { read: async () => token } })).accountId;

	/** What the team is called, to say the copy went local: its address when spool.page doesn't say. */
	const teamName = async ({ link, request }: Linked) => {
		try {
			const { teams } = await cloudTeams(deps.spoolDir, request).list();
			return teams.find((team) => team.address === link.team)?.name ?? link.team;
		} catch {
			return link.team;
		}
	};

	/** A copy stops being followed: nobody is in it as far as its tab can tell. */
	const drop = (root: string) => {
		const copy = copies.get(root);
		if (copy === undefined) return;
		copy.close();
		copies.delete(root);
		deps.onRoster?.(root, []);
	};

	const end = (root: string, link: ProjectLink) => {
		drop(root);
		hops.delete(root);
		try {
			endLocalCopy(root, link);
			// a copy that followed a move and was never pulled says the team its spool.json names
			say(
				`No longer synced with ${(localCopyOf(root) ?? link).team}. This is now a project on this Mac only.`,
				root,
			);
		} catch (error) {
			say(error instanceof Error ? error.message : String(error), root);
		}
	};

	/**
	 * The project was removed to its team's trash: the copy ends, as for any ending, and says who removed it from which
	 * team, its record keeping who. A moved-out project says it moved out instead, and is never this.
	 */
	const endRemoved = (root: string, link: ProjectLink, removal: Removal) => {
		drop(root);
		stopped.delete(root);
		hops.delete(root);
		try {
			endLocalCopy(root, link, removal.by ?? undefined);
			const project = (localCopyOf(root) ?? link).project;
			say(
				removal.by === null
					? `${project} was removed from ${removal.team}. It's now a project on this Mac only.`
					: `${removal.by} removed ${project} from ${removal.team}. It's now a project on this Mac only.`,
				root,
			);
		} catch (error) {
			say(error instanceof Error ? error.message : String(error), root);
		}
		deps.onEnded?.(root);
	};

	/**
	 * The team has no paid time left: the copy goes local, stopping where it is with its link, its files and git as
	 * they were, and is said once, in its record, so a restart doesn't say it again.
	 */
	const stop = async (root: string, at: Linked) => {
		const { link } = at;
		drop(root);
		stopped.set(root, link);
		if (goneLocalWith(root) === undefined) {
			const name = await teamName(at);
			if (closed || stopped.get(root) !== link) return;
			try {
				recordGoneLocal(root, link, name);
				say(`${name} has gone local. Your copy keeps working here and syncs again once the team pays.`, root);
			} catch (error) {
				// its record is what the canvas and the cover read: with none, nothing says it went local
				return say(error instanceof Error ? error.message : String(error), root);
			}
		}
		deps.onGoneLocal?.(root);
	};

	/**
	 * The project lives at another address now (it moved team, or was renamed with a move): the copy follows it there,
	 * its record naming the new address and keeping everything it had, while `spool.json` waits for the next pull.
	 * More than `MAX_HOPS` moves in a row without catching up, and it waits as offline instead.
	 */
	const forward = (root: string, from: ProjectLink, to: ProjectLink): boolean => {
		const followed = hops.get(root) ?? 0;
		if (followed >= MAX_HOPS || to.url === from.url) return false;
		hops.set(root, followed + 1);
		drop(root);
		try {
			readdressCopy(root, from, to, { forwarded: true });
		} catch (error) {
			say(error instanceof Error ? error.message : String(error), root);
			return false;
		}
		say(
			`${from.team}/${from.project} moved to ${to.team}/${to.project}; this copy syncs there now. Pull to get the spool.json that names it.`,
			root,
		);
		follow(root, to);
		return true;
	};

	/**
	 * The project was moved out of its team: the copy ends, and, in a checkout, keeps its `.gitignore` of everything
	 * until the pull of the move-out commit brings `design/` back into git over it. In no checkout there is nothing to
	 * pull: it ends as any other copy does.
	 */
	const endMovedOut = async (root: string, at: Linked) => {
		const { link } = at;
		drop(root);
		stopped.delete(root);
		hops.delete(root);
		const name = await teamName(at);
		const inRepo = (await checkoutOf(root)) !== undefined;
		if (closed) return;
		try {
			if (!inRepo) {
				endLocalCopy(root, link);
				say(`${link.project} was moved out of ${name}. This is now a project on this Mac only.`, root);
			} else {
				markMovedOut(root, link, name);
				say(
					`${link.project} was moved out of ${name}. This is now a project on this Mac only; pull its repo to bring design/ back into git.`,
					root,
				);
			}
		} catch (error) {
			say(error instanceof Error ? error.message : String(error), root);
		}
		deps.onEnded?.(root);
	};

	const follow = (root: string, link: ProjectLink) => {
		try {
			const at = linked(link);
			copies.set(
				root,
				followLocalCopy({
					root,
					origin: at.request.origin,
					vault: at.request.vault,
					...(deps.openSocket === undefined ? {} : { openSocket: deps.openSocket }),
					notice: (message) => say(message, root),
					standing: standing(root, at),
					seen: askSeen(deps.spoolDir, link, at.request),
					accountOf: accountOf(at),
					ended: () => end(root, link),
					goneLocal: () => void stop(root, at),
					moved: (to) => forward(root, link, to),
					movedOut: () => void endMovedOut(root, at),
					removed: (removal) => endRemoved(root, link, removal),
					caughtUp: () => hops.delete(root),
					...(deps.onMarks === undefined ? {} : { onMarks: () => deps.onMarks?.(root) }),
					...(deps.onSyncChanged === undefined ? {} : { onPaused: () => deps.onSyncChanged?.(root) }),
					onPresence: (presence) => {
						for (const watcher of watchers.get(root) ?? []) watcher(presence);
					},
					onPointerHidden: () => {
						const hidden = copies.get(root)?.pointerHidden() ?? false;
						for (const watcher of hiddenWatchers.get(root) ?? []) watcher(hidden);
					},
					onRoster: () => deps.onRoster?.(root, copies.get(root)?.roster() ?? []),
					...(deps.onComments === undefined ? {} : { onComments: () => deps.onComments?.(root) }),
					commentsFile: keptCommentsFile(deps.spoolDir, link),
					synced,
					...(deps.offlineMs === undefined ? {} : { offlineMs: deps.offlineMs }),
					...(deps.updateAskMs === undefined ? {} : { updateAskMs: deps.updateAskMs }),
					...(deps.updateHow === undefined ? {} : { updateHow: deps.updateHow }),
					...(deps.migrate === undefined ? {} : { migrate: () => deps.migrate?.(root) }),
					teamName: () => teamName(at),
				}),
			);
			const said = canvases.get(root);
			if (said !== undefined) copies.get(root)?.presence(said);
		} catch (error) {
			say(error instanceof Error ? error.message : String(error), root);
		}
	};

	/** A stopped root asks again on the minute, with no sooner try pending. */
	const settle = (root: string) => {
		clearTimeout(retries.get(root)?.timer);
		retries.delete(root);
	};
	/** spool.page couldn't be reached: asked again in a minute, then two, and so on up to the ask's interval. */
	const retry = (root: string) => {
		const was = retries.get(root);
		clearTimeout(was?.timer);
		const wait = was === undefined ? (deps.goneLocalRetryMs ?? GONE_LOCAL_RETRY_MS) : Math.min(was.wait * 2, askMs);
		const timer = setTimeout(() => void ask(root), wait);
		timer.unref?.();
		retries.set(root, { timer, wait });
	};

	/** Whether a stopped copy's team pays again: an editor's copy follows it again, and catches up. */
	const ask = async (root: string) => {
		const link = stopped.get(root);
		if (link === undefined || pending.has(root)) return;
		pending.add(root);
		try {
			const now = await standing(root, linked(link))();
			if (closed || stopped.get(root) !== link) return;
			if (now === "unknown") return retry(root);
			settle(root);
			if (now === "moved_out") return void (await endMovedOut(root, linked(link)));
			if (typeof now === "object" && "removed" in now) return endRemoved(root, link, now.removed);
			if (typeof now === "object" && "movedTo" in now) {
				stopped.delete(root);
				if (!forward(root, link, now.movedTo)) stopped.set(root, link);
				return;
			}
			if (now === "editor") {
				stopped.delete(root);
				try {
					recordGoneLocal(root, link, undefined);
				} catch (error) {
					say(error instanceof Error ? error.message : String(error), root);
				}
				follow(root, link);
				deps.onGoneLocal?.(root);
			} else if (now === "not_editor") {
				stopped.delete(root);
				end(root, link);
			}
			// still unpaid, signed out, or another account signed in: asked again on the minute
		} catch (error) {
			say(error instanceof Error ? error.message : String(error), root);
		} finally {
			pending.delete(root);
		}
	};

	const asking = setInterval(() => {
		for (const root of stopped.keys()) void ask(root);
	}, askMs);
	asking.unref?.();

	return {
		keeping(roots: readonly string[]): void {
			if (closed) return;
			const wanted = roots.filter(
				(root) => followedLink(root) !== undefined && existsSync(join(root, "design", "canvas.json")),
			);
			for (const root of [...copies.keys()]) if (!wanted.includes(root)) drop(root);
			for (const root of stopped.keys())
				if (!wanted.includes(root)) {
					stopped.delete(root);
					settle(root);
				}
			for (const root of wanted) {
				if (copies.has(root) || stopped.has(root) || held.has(root)) continue;
				const link = followedLink(root);
				if (link === undefined) continue;
				if (goneLocalWith(root) === undefined) follow(root, link);
				else {
					// stopped in an earlier run: asked again now, at start, rather than connecting to be refused
					stopped.set(root, link);
					void ask(root);
				}
			}
		},
		/** Every copy of a team gone local asks at once whether the team pays again, as when it is said to. */
		recheck(team: string): void {
			for (const [root, link] of stopped) if (link.team === team) void ask(root);
		},
		/** The local copy at a root, while it is followed. */
		copy: (root: string): LocalCopy | undefined => copies.get(root),
		/**
		 * The daemon moves this copy itself: it stops being followed until the returned release, which follows it again
		 * wherever its record and `spool.json` say it is then, if it is still a copy.
		 */
		hold(root: string): () => void {
			held.add(root);
			drop(root);
			return () => {
				held.delete(root);
				if (closed || copies.has(root) || stopped.has(root)) return;
				const link = followedLink(root);
				if (link !== undefined && existsSync(join(root, "design", "canvas.json"))) follow(root, link);
			};
		},
		/** The copy at a root reads its address again and syncs there now: this Mac just moved its project. */
		refollow(root: string): void {
			if (closed || held.has(root)) return;
			drop(root);
			hops.delete(root);
			const link = followedLink(root);
			if (link !== undefined && !stopped.has(root) && existsSync(join(root, "design", "canvas.json")))
				follow(root, link);
		},
		/**
		 * A copy this Mac puts back in git (#198): one gone local ends now, so it never follows the team again once
		 * it pays; one that ended already stays so.
		 */
		endHere(root: string): void {
			const link = stopped.get(root) ?? followedLink(root);
			stopped.delete(root);
			settle(root);
			drop(root);
			hops.delete(root);
			if (link === undefined) return;
			endLocalCopy(root, link);
			deps.onEnded?.(root);
		},
		/** A copy whose project this Mac moved out of its team: it ends here, as every other copy does. */
		movedOut(root: string, link: ProjectLink): Promise<void> {
			return endMovedOut(root, linked(link));
		},
		/** Who else is in each followed copy's project now, for the tabs: copies nobody else is in are left out. */
		rosters: (): { root: string; people: TabPresence[] }[] =>
			[...copies].map(([root, copy]) => ({ root, people: copy.roster() })).filter(({ people }) => people.length > 0),
		/** Where this machine's person is on a root's canvas, or null once no canvas here shows it. Never stored. */
		presence(root: string, state: PresenceState | null): void {
			if (state === null) canvases.delete(root);
			else canvases.set(root, state);
			copies.get(root)?.presence(state);
		},
		/** What a root's canvas says of its sync now: nothing to say for a solo project. */
		state: (root: string): SyncState => {
			const ended = endedWith(root) ?? null;
			const goneLocal = goneLocalWith(root) ?? null;
			const copy = copies.get(root)?.state() ?? {
				paused: null,
				sending: null,
				held: [],
				offline: false,
				update: null,
			};
			// ended or gone local says why nothing travels; offline would only say less
			return { ended, goneLocal, ...copy, offline: copy.offline && ended === null && goneLocal === null };
		},
		/**
		 * Match the team on a root's local copy (#205): refused with `MatchOffline` when it isn't followed or has no
		 * caught-up connection, changing nothing; otherwise how many set-aside marks it made.
		 */
		matchTeam(root: string): Promise<number> {
			const copy = copies.get(root);
			return copy === undefined ? Promise.reject(new MatchOffline()) : copy.matchTeam();
		},
		/**
		 * What an agent's next command on a root says of its sync (DEV-261): each file that didn't travel and why, and
		 * a pause, each said once until it travels or lifts. A file too big or outside the layout is found on disk now,
		 * so one written a moment ago is named before the watcher has looked at it.
		 */
		untold(root: string): string[] {
			const copy = copies.get(root);
			if (copy === undefined) return [];
			const { paused, held: stuck, update } = copy.state();
			const lines = [...stuck, ...staysOnThisMac(root)]
				.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
				.map(({ path, why }) => `${path} didn't travel: ${why}`);
			if (paused !== null) lines.push(`sync paused: ${paused}`);
			if (update !== null) lines.push(`sync paused: ${updateLineWithHow(update.team, update)}`);
			const now = new Set(lines);
			const before = toldAgent.get(root) ?? new Set();
			toldAgent.set(root, now);
			const told = [...now].filter((line) => !before.has(line));
			if (told.some((line) => line.endsWith(TOO_BIG))) told.push(SHRINK);
			return told;
		},
		/**
		 * A team project's comments as this Mac knows them: what its copy was last told, kept on disk, so they show
		 * offline too; `online` says whether a comment written now reaches the team, and `unpaid` that none can while
		 * the team has gone local: they are read-only until it pays.
		 */
		comments(root: string): { online: boolean; unpaid: boolean } & KeptComments {
			const copy = copies.get(root);
			if (copy !== undefined) return { online: copy.online(), unpaid: false, ...copy.comments() };
			const link = followedLink(root);
			if (link === undefined) return { online: false, unpaid: false, heard: null, comments: [], reads: {} };
			const unpaid = goneLocalWith(root) !== undefined;
			return { online: false, unpaid, ...readKept(keptCommentsFile(deps.spoolDir, link)) };
		},
		/** Write a comment on a root's team project as this Mac's person; refused as offline when it can't reach it. */
		comment(root: string, comment: NewComment, still?: Uint8Array): Promise<string> {
			const copy = copies.get(root);
			return copy === undefined ? Promise.reject(notWritable(root)) : copy.comment(comment, still);
		},
		/** Reply under a comment on a root's team project as this Mac's person. */
		reply(root: string, reply: NewReply): Promise<string> {
			const copy = copies.get(root);
			return copy === undefined ? Promise.reject(notWritable(root)) : copy.reply(reply);
		},
		/** Spool renamed or moved frames or pages in a root: a team project's comments follow them (spool#160). */
		moved(root: string, moved: Moved): void {
			copies.get(root)?.moved(moved);
		},
		/** Resolve, reopen, edit, delete, read or mark unread a comment on a root's team project as this Mac's person. */
		changeComment(root: string, change: NewChange): Promise<string> {
			const copy = copies.get(root);
			return copy === undefined ? Promise.reject(notWritable(root)) : copy.change(change);
		},
		/** The still a comment on a root's team project kept of its frame, asked of the team; offline, refused. */
		still(root: string, comment: string): Promise<Uint8Array | undefined> {
			const copy = copies.get(root);
			return copy === undefined ? Promise.reject(new CommentsOffline()) : copy.still(comment);
		},
		/** Hear who else is on a root's team canvas as it changes. Returns the unsubscribe. */
		watchPresence(root: string, watcher: (presence: Presence) => void): () => void {
			const set = watchers.get(root) ?? new Set();
			watchers.set(root, set.add(watcher));
			return () => {
				set.delete(watcher);
				if (set.size === 0) watchers.delete(root);
			};
		},
		/**
		 * Hear whether this person's pointer is hidden on a root's team canvas (#107): at once if it is now, then each
		 * change. Returns the unsubscribe.
		 */
		watchPointerHidden(root: string, watcher: (hidden: boolean) => void): () => void {
			const set = hiddenWatchers.get(root) ?? new Set();
			hiddenWatchers.set(root, set.add(watcher));
			if (copies.get(root)?.pointerHidden() === true) watcher(true);
			return () => {
				set.delete(watcher);
				if (set.size === 0) hiddenWatchers.delete(root);
			};
		},
		close(): void {
			closed = true;
			clearInterval(asking);
			for (const root of retries.keys()) settle(root);
			for (const copy of copies.values()) copy.close();
			copies.clear();
			stopped.clear();
		},
	};
}

export type TeamSync = ReturnType<typeof createTeamSync>;

/** Why a comment can't be written on a root whose copy isn't running: its team gone local, or it's offline. */
function notWritable(root: string): Error {
	return goneLocalWith(root) === undefined ? new CommentsOffline() : new CommentRefused("unpaid");
}

/**
 * A team project ended for this machine: its local copy becomes an ordinary project here. The solo
 * `design/.gitignore` comes back, so the folder can be committed again; `spool.json` and git are left alone; and
 * the copy's record says it ended (and, for a removed project, who removed it), so the daemon never follows it again.
 * No file is touched.
 */
export function endLocalCopy(root: string, link: ProjectLink, removedBy?: string): void {
	const designDir = realDesignDir(root);
	writeAtomic(join(designDir, ".gitignore"), SOLO_GITIGNORE);
	const stateFile = join(designDir, ".spool", "sync.json");
	// the link the copy was followed by: a branch checked out now may have no spool.json
	const { goneLocal: _, removedBy: __, ...kept } = readState(stateFile, link.url);
	const state: CopyState = { ...kept, ended: true, ...(removedBy === undefined ? {} : { removedBy }) };
	writeAtomic(stateFile, `${JSON.stringify(state)}\n`);
}

/**
 * A copy that ended here is got again, its person an editor once more: it is a local copy again, out of git, and the
 * daemon follows it. What changed here meanwhile goes up as saves built on the versions it last had.
 */
export function resumeLocalCopy(root: string): void {
	const designDir = realDesignDir(root);
	const stateFile = join(designDir, ".spool", "sync.json");
	const { ended: _, removedBy: __, ...state } = JSON.parse(readFileSync(stateFile, "utf8")) as CopyState;
	writeAtomic(stateFile, `${JSON.stringify(state)}\n`);
	writeAtomic(join(designDir, ".gitignore"), TEAM_GITIGNORE);
}

/**
 * Say in a local copy's record that it has gone local, with its team's name, or with none that the team pays again.
 * Only the record changes: the folder, its `.gitignore`, `spool.json` and git stay as they are.
 */
function recordGoneLocal(root: string, link: ProjectLink, team: string | undefined): void {
	const stateFile = join(realDesignDir(root), ".spool", "sync.json");
	const { goneLocal: _, ...state } = readState(stateFile, link.url);
	writeAtomic(stateFile, `${JSON.stringify(team === undefined ? state : { ...state, goneLocal: team })}\n`);
}

/** The team a local copy has gone local with: what its canvas and its cover say meanwhile. Ending a copy drops it. */
export function goneLocalWith(root: string): string | undefined {
	const goneLocal = copyRecord(root)?.goneLocal;
	return typeof goneLocal === "string" ? goneLocal : undefined;
}

/** Whether a local copy's team project ended for this machine. */
export function hasEnded(root: string): boolean {
	return copyRecord(root)?.ended === true;
}

/** The team project a copy that ended here followed, by its record: the one its Get it may take it back into. */
export function endedFrom(root: string): string | undefined {
	const record = copyRecord(root);
	return record?.ended === true ? record.project : undefined;
}

/** The team a copy that ended here was synced with: what its canvas and its cover go on saying. */
export function endedWith(root: string): string | undefined {
	const record = copyRecord(root);
	// a copy that followed a move and was never pulled was its spool.json's team's, as far as its person knows
	return record?.ended === true ? (localCopyOf(root) ?? parseProjectLink(record.project))?.team : undefined;
}

/** The team (by name) a copy's project was moved out of, until git brings its `design/` back into the checkout. */
export function movedOutOf(root: string): string | undefined {
	const record = copyRecord(root);
	return record?.ended === true && typeof record.movedOut === "string" ? record.movedOut : undefined;
}

/**
 * A copy's record names another address for its project, keeping everything it had of the team: the project moved
 * team (or was renamed with a move). Followed by a forward, the address `spool.json` names is kept as one that leads
 * here, until a pull brings the new `spool.json`; rewritten with `spool.json` on the Mac that moved it, none is.
 */
export function readdressCopy(root: string, from: ProjectLink, to: ProjectLink, how: { forwarded: boolean }): void {
	const stateFile = join(realDesignDir(root), ".spool", "sync.json");
	// a copy may have followed the forward already, as this Mac's own copy can while its move is answered
	const { forwarded = [], ...state } = readState(stateFile, copyRecord(root)?.project === to.url ? to.url : from.url);
	const leading = [...new Set([...forwarded, from.url])].filter((url) => url !== to.url);
	const next: CopyState = {
		...state,
		project: to.url,
		...(how.forwarded && leading.length > 0 ? { forwarded: leading } : {}),
	};
	writeAtomic(stateFile, `${JSON.stringify(next)}\n`);
}

/** A copy's project was moved out of its team: it ends, its `.gitignore` of everything kept until git brings design/ back. */
function markMovedOut(root: string, link: ProjectLink, team: string): void {
	const stateFile = join(realDesignDir(root), ".spool", "sync.json");
	const { goneLocal: _, ...kept } = readState(stateFile, link.url);
	writeAtomic(stateFile, `${JSON.stringify({ ...kept, ended: true, movedOut: team } satisfies CopyState)}\n`);
}

/**
 * A copy moved out of its team, its checkout pulled: once `spool.json` is gone from the working tree and git tracks
 * files in `design/` again, the team's `.gitignore` of everything goes (only if it is still exactly that) and the
 * moved-out mark is forgotten. True when it settled.
 */
export async function settleMovedOut(root: string): Promise<boolean> {
	if (movedOutOf(root) === undefined || localCopyOf(root) !== undefined) return false;
	const designDir = realDesignDir(root);
	if (!(await tracksDesign(designDir))) return false;
	const ignore = join(designDir, ".gitignore");
	try {
		if (readFileSync(ignore, "utf8") === TEAM_GITIGNORE) rmSync(ignore);
	} catch {
		// no .gitignore of the team's left to take away
	}
	const stateFile = join(designDir, ".spool", "sync.json");
	const { movedOut: _, ...state } = JSON.parse(readFileSync(stateFile, "utf8")) as CopyState;
	writeAtomic(stateFile, `${JSON.stringify(state)}\n`);
	return true;
}

/** Whether git tracks any file in a design folder. */
function tracksDesign(designDir: string): Promise<boolean> {
	return new Promise((resolve) => {
		execFile(
			"git",
			["ls-files", "-z", "--", "."],
			{ cwd: designDir, env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined }, timeout: 10_000 },
			(error, stdout) =>
				resolve(error === null && stdout.split("\0").some((path) => path !== "" && path !== ".gitignore")),
		);
	});
}

/**
 * The team project a root is a local copy of, for as long as it is one: the link its `spool.json` holds, or, while a
 * branch with no `spool.json` is checked out, the link its copy was followed by. A copy stays one whatever branch is
 * out: it keeps syncing, and git keeps no history of it. Nothing for a solo project, or a copy whose project ended.
 */
export function followedLink(root: string): ProjectLink | undefined {
	const record = copyRecord(root);
	if (record?.ended === true) return undefined;
	const named = localCopyOf(root);
	// spool.json names an address the project moved from: the copy follows it where it is now, until a pull
	if (named !== undefined && record?.forwarded?.includes(named.url) === true)
		return parseProjectLink(record.project) ?? named;
	return named ?? parseProjectLink(record?.project);
}

/** What a local copy's record in `design/.spool` says, unchecked, if it has one. */
function copyRecord(root: string): Partial<CopyState> | undefined {
	try {
		return JSON.parse(readFileSync(join(root, "design", ".spool", "sync.json"), "utf8")) as Partial<CopyState>;
	} catch {
		return undefined;
	}
}

/** How the sync socket tells a live connection from a dead one. */
export interface SocketTiming {
	/** How often an open connection is asked whether it is still there. */
	pingMs: number;
	/** How long a connection may stay silent after being asked before it is taken for dead. */
	silentMs: number;
	/** How long the handshake may take before the try is given up. */
	handshakeMs: number;
}

/**
 * Asked every 15 seconds (spool.page's sync object answers "pong" without waking), and given 10 to answer: a
 * connection that died without a close, as one does when the Mac sleeps or the network changes, is found within
 * about 25 seconds rather than the minutes TCP takes to give up on it.
 */
const SOCKET_TIMING: SocketTiming = { pingMs: 15_000, silentMs: 10_000, handshakeMs: 15_000 };

/**
 * The sync socket over a real WebSocket. A connection that goes silent, or a handshake that never finishes, is
 * closed here and said closed at once, without waiting on a close the other end will never send; nothing it says
 * after that is passed on.
 */
export function openWebSocketWith(timing: SocketTiming): OpenSyncSocket {
	return (url, token, events) => {
		const socket = new WebSocket(url, { headers: { authorization: `Bearer ${token}` } });
		socket.binaryType = "arraybuffer";
		let over = false;
		let ping: ReturnType<typeof setInterval> | undefined;
		let deadline: ReturnType<typeof setTimeout> | undefined;
		const end = (code?: number) => {
			if (over) return;
			over = true;
			clearInterval(ping);
			clearTimeout(deadline);
			events.close(code);
		};
		const dead = () => {
			end();
			try {
				socket.close();
			} catch {
				// already closing
			}
		};
		const wait = (ms: number) => {
			deadline = setTimeout(dead, ms);
			deadline.unref?.();
		};
		const heard = () => {
			clearTimeout(deadline);
			deadline = undefined;
		};
		wait(timing.handshakeMs);
		socket.addEventListener("open", () => {
			if (over) return;
			heard();
			ping = setInterval(() => {
				if (socket.readyState !== WebSocket.OPEN) return;
				socket.send("ping");
				// anything heard answers it, the pong or any other frame
				if (deadline === undefined) wait(timing.silentMs);
			}, timing.pingMs);
			ping.unref?.();
			events.open();
		});
		socket.addEventListener("message", (event) => {
			if (over) return;
			heard();
			events.message(event.data as string | ArrayBuffer);
		});
		// a failed handshake or a dropped line is an error and then a close; the close is what is answered
		socket.addEventListener("error", () => {});
		socket.addEventListener("close", (event) => end(event.code));
		// a socket still handshaking throws on send, where a closed one drops it; what matters is said again on catch-up
		return {
			send: (frame) => {
				if (!over && socket.readyState === WebSocket.OPEN) socket.send(frame);
			},
			close: () => {
				clearInterval(ping);
				clearTimeout(deadline);
				socket.close();
			},
		};
	};
}

export const openWebSocket: OpenSyncSocket = openWebSocketWith(SOCKET_TIMING);

function byOf(value: unknown): SetAsideMark["by"] {
	if (typeof value !== "object" || value === null) return null;
	const { accountId, device } = value as Record<string, unknown>;
	return typeof accountId === "string" && typeof device === "string" ? { accountId, device } : null;
}

function readState(file: string, project: string): CopyState {
	// a copy with no record yet starts from nothing: the catch-up brings the whole team copy
	return readRecorded(file, project) ?? { project, head: 0, files: {} };
}

/** A copy's record of the team, if it has one for this project. */
function readRecorded(file: string, project: string): CopyState | undefined {
	try {
		const state = JSON.parse(readFileSync(file, "utf8")) as CopyState;
		if (state.project === project && typeof state.head === "number" && typeof state.files === "object") return state;
	} catch {
		// none, or none that can be read
	}
	return undefined;
}

/**
 * Why a file on disk stays on this machine though its path is in the layout: it is a symlink or reached through
 * one, or it is too big. Nothing when it may travel, or isn't there.
 */
function whyStays(designDir: string, path: string): string | undefined {
	const segments = path.split("/");
	let at = designDir;
	for (const [index, segment] of segments.entries()) {
		at = join(at, segment);
		const stat = lstatSync(at, { throwIfNoEntry: false });
		if (stat?.isSymbolicLink() === true) return "symlinks stay on this Mac";
		if (stat === undefined || (index < segments.length - 1 && !stat.isDirectory())) return undefined;
		if (index === segments.length - 1 && stat.isFile() && stat.size > FILE_LIMIT_BYTES) return TOO_BIG;
	}
	return undefined;
}

/**
 * Every file in a project's `design/` that would stay on this Mac as a local copy, and why: outside Spool's layout,
 * a symlink, or over 25 MB. Spool's own files (`.spool/`, `.gitignore`) and the system's aren't named.
 */
export function staysOnThisMac(root: string): { path: string; why: string }[] {
	const designDir = realDesignDir(root);
	const found: { path: string; why: string }[] = [];
	const walk = (dir: string) => {
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			const path = relative(designDir, full).split(sep).join("/");
			if (path === ".spool" || path === ".gitignore" || entry.name === ".DS_Store") continue;
			if (entry.isDirectory()) walk(full);
			else if (!travels(path)) found.push({ path, why: OUTSIDE_LAYOUT });
			else {
				const why = whyStays(designDir, path);
				if (why !== undefined) found.push({ path, why });
			}
		}
	};
	walk(designDir);
	return found.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/**
 * What a move must wait for (DEV-190): every file on disk that travels whose bytes the team hasn't confirmed to this
 * copy yet, design-relative. What stays on this Mac never travels, so it is never waited for.
 */
export function unconfirmedFiles(root: string, link: ProjectLink): string[] {
	const designDir = realDesignDir(root);
	const { files } = readState(join(designDir, ".spool", "sync.json"), link.url);
	return travellingFiles(root).filter(
		(path) => files[path]?.hash !== digest(readFileSync(join(designDir, ...path.split("/")))),
	);
}

/**
 * Whether a project's `design/` has synced with this team project here before: its record names the team's files.
 * One that hasn't is classed against the team's history before it first connects (spool#196).
 */
export function syncedBefore(root: string, link: ProjectLink): boolean {
	try {
		const { files } = readState(join(realDesignDir(root), ".spool", "sync.json"), link.url);
		return Object.keys(files).length > 0;
	} catch {
		return false;
	}
}

/** Every file on disk in a project's `design/` that goes to its team, design-relative: what a move uploads. */
export function travellingFiles(root: string): string[] {
	const designDir = realDesignDir(root);
	return filesUnder(designDir, "")
		.filter((path) => whyStays(designDir, path) === undefined)
		.sort();
}

function digest(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/** Every regular file under a design-relative folder that could travel, never through a dot-folder. */
function filesUnder(designDir: string, path: string): string[] {
	const found: string[] = [];
	const walk = (dir: string) => {
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile()) found.push(relative(designDir, full).split(sep).join("/"));
		}
	};
	walk(path === "" ? designDir : join(designDir, ...path.split("/")));
	return found.filter(travels);
}

/** Folders a teammate's deletes emptied go too, so an emptied frame is no page; `frames/` and `shared/` stay. */
export function pruneEmpty(designDir: string, dir: string): void {
	for (let at = dir; relative(designDir, at).includes(sep); at = dirname(at)) {
		try {
			if (readdirSync(at).length > 0) return;
			rmdirSync(at);
		} catch {
			return;
		}
	}
}
