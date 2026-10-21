import { createHash } from "node:crypto";
import type { CloudRequestOptions } from "./cloud-auth";
import type { OpenSyncSocket, SyncSocketEvents } from "./daemon/team-sync";
import {
	bundleParts,
	CANVAS_PATH,
	CLOSE_NOT_EDITOR,
	CLOSE_SIGNED_OUT,
	CLOSE_UNPAID,
	COMMENTS_OPEN,
	COMMENTS_PER_MINUTE,
	COMMENTS_PER_PART,
	type Comment,
	type CommentPerson,
	type CommentPlace,
	type CommentReader,
	type CommentRefusal,
	type CommentReply,
	type CommentsMessage,
	type CopyChange,
	changeRefusal,
	commentBodyRefusal,
	type DesignNow,
	decodeFrame,
	draftFor,
	encodeFrame,
	FILE_LIMIT_BYTES,
	forReader,
	frameGeometry,
	frameRevisionOf,
	isCommentChange,
	isCommentStill,
	isOpenComment,
	joinParts,
	type Limited,
	type Moved,
	memberPostRefusal,
	mergeCanvas,
	movesComments,
	PROTOCOL_VERSION,
	type PresenceState,
	placeAfter,
	readCommentChange,
	readCommentPost,
	readCommentReplyPost,
	readCommentStillAsk,
	readMoved,
	readPresenceState,
	replyForReader,
	SEEN_FILES,
	samePlace,
	sameSourceMoves,
	takeFromBucket,
	travels,
} from "./team-sync-protocol";

/**
 * A fake spool.page for team projects: the team API a CLI calls and a sync object a daemon connects to, in
 * process. It keeps the rules the real object keeps (order, set-aside, an edit beating a delete, canvas.json
 * merged key by key, relay to everyone else, who may write, the file size limit) and records every save it is
 * sent, so a test can say what reached the team and what never did. A test changes who is in the team, revokes a
 * machine or holds saves to a limit as an admin or spool.page would.
 */
export const TEAM_ORIGIN = "https://cloud.test";

type Role = "admin" | "editor" | "viewer" | null;

interface Person {
	accountId: string;
	device: string;
	/** Their role in the first team, the one every test starts with. */
	role: Role;
	/** Their role in every other team, by address. */
	roles: Map<string, Role>;
	/** Their colour on the team canvas, by when they joined. */
	color: string;
	/** The machine's device session was revoked. */
	revoked?: boolean;
}

/** The colours the fake team hands out, one per person in the order they arrive. */
export const TEAM_COLORS = ["#7aa7ff", "#eaa94a", "#4cc495", "#b896ff", "#f28cbc"];

interface Project {
	/** Kept through a move: the sync object, history and shares go with it. */
	id: string;
	team: string;
	name: string;
	files: Map<string, TeamVersion>;
	/** Every save it took, and whether it was a move's, which counts against no limit. */
	saves: { path: string; base: number | null; deleted: boolean; by: string; outcome: string; moved: boolean }[];
	/** Every save it refused, and why. */
	refused: { path: string; reason: string }[];
	/** How many saves each message that carried saves held: 1 for a lone save, more for a bundle. */
	sends: number[];
	/** Whose move the project holds nothing but, while it does: undefined before its first save, null once it holds more. */
	mover?: string | null;
	/** Every applied version's bytes and who made it, which a canvas.json merge reads its base from. */
	versions: Map<number, TeamVersion>;
	sockets: Set<Connected>;
	version: number;
	/** Every path a local copy asked to have resent. */
	resent: string[];
	/** Whose agents said their turn ended, and how many saves the project had then. */
	turns: { by: string; saves: number }[];
	/** Where its code lives, as `host/path`. */
	repo: string | null;
	/** Every comment made on it, in order, with its replies: kept outside the save path, as the sync object keeps them. */
	comments: Comment[];
	/** The still each comment kept of its frame, by the comment's id. */
	stills: Map<string, Uint8Array>;
	/** When each person last read each comment they have read: by account, then by comment. */
	reads: Map<string, Map<string, number>>;
	/** Each person's comment bucket: its level when last taken from, and when. */
	buckets: Map<string, { level: number; at: number }>;
	/** Where each comment stands, with the frame it belongs to, by the comment's id: what saves move (spool#160). */
	places: Map<string, CommentPlace>;
	/** The project's shares a comment may speak to, by id: the pages each shows, and whether it ended. */
	shares: Map<string, { pages: string[]; by: string; ended: boolean }>;
	/** What each message that carried saves said Spool moved, in order: undefined where it said nothing. */
	moved: (Moved | undefined)[];
	/** Every path's last bytes, kept after it is deleted: where a deleted frame last stood. */
	last: Map<string, Uint8Array>;
	/** Every hash each path was applied at, a delete's null included: what the history lookup answers from. */
	had: Map<string, Set<string | null>>;
}

/** One save as the object reads it, alone or out of a bundle. */
interface Entry {
	ref: string;
	path: string;
	base: number | null;
	deleted: boolean;
	bytes: Uint8Array | undefined;
}

/** What taking saves says: the answers, what follows them to the writer, and what is relayed to everyone else. */
interface Told {
	answers: Record<string, unknown>[];
	after: (string | Uint8Array)[];
	relayed: { path: string; version: number; deleted: boolean; content: Uint8Array | undefined; restores?: Person }[];
	changes: CopyChange[];
}

interface TeamVersion {
	version: number;
	bytes: Uint8Array | null;
	by?: Person;
}

interface Connected {
	person: Person;
	live: boolean;
	/** Its hello said it moves a project in. */
	moving?: boolean;
	/** Its hello said it reads `files`. */
	bundles?: boolean;
	/** Its hello said it reads `presences`, and the object sends them. */
	ticks?: boolean;
	/** Where this connection's person last said they were: kept only while it's connected. */
	presence?: { state: PresenceState; at: number };
	deliver(frame: string | Uint8Array): void;
	/** Closed in turn, after everything already on its way, with the close code the object would give. */
	close(code?: number): void;
	/** Gone this instant: nothing sent from now on arrives, and the daemon hears of it in turn. */
	cut(): void;
}

export function fakeTeam(team = "devosurf", teamName = "Devosurf") {
	const people = new Map<string, Person>();
	/** Every project, by `<team>/<name>`: where it lives now. */
	const projects = new Map<string, Project>();
	/** Every team, by address: the first, and any a test adds to move projects between. */
	const teams = new Map<string, { name: string; lapsed: boolean }>([[team, { name: teamName, lapsed: false }]]);
	/** Old addresses (`<team>/<name>`) that lead on to a project that moved, wherever it is now. */
	const forwards = new Map<string, Project>();
	/** Addresses whose project was moved out of its team (`DELETE ?out=1`). */
	const movedOut = new Set<string>();
	/** Projects waiting in their team's trash (#197), by the address they hold: who removed each, and when. */
	const trash = new Map<string, { at: Project; by: string; when: number }>();
	/** Every move spool.page took, in order. */
	const moves: { from: string; to: string; by: string }[] = [];
	let ids = 0;
	let commentIds = 0;
	/** The comment limits every project here keeps: core's, unless a test raised or lowered them as a maintainer. */
	let commentLimits = { perMinute: COMMENTS_PER_MINUTE, open: COMMENTS_OPEN };
	/** Machines that can't reach the team right now, by account. */
	const away = new Set<string>();
	/** While set, spool.page doesn't answer at all: every request fails as a network that is down does. */
	let down = false;
	/** While set, every sync connection is closed as it opens, with this code: a Worker that can't take it. */
	let refusing: number | undefined;
	/** How many times a machine asked where it stands in a project, as a daemon does after a close. */
	let asked = 0;
	/** How many files each history lookup asked about, in order. */
	const seenAsks: number[] = [];
	/** Solo projects whose shares moved into a team project, as spool.page was asked. */
	const soloMoves: { solo: string; team: string; project: string; by: string }[] = [];
	/** A project by its name in the first team, or by `<team>/<name>` in any. */
	const project = (name: string) => projects.get(name.includes("/") ? name : `${team}/${name}`);
	const lapsed = (address: string) => teams.get(address)?.lapsed === true;
	const roleIn = (person: Person, address: string): Role =>
		address === team ? person.role : (person.roles.get(address) ?? null);
	let limited: { reason: Limited; retryAfter: number } | undefined;
	/** The object takes bundles, as spool.page does since it learned them; off, it is an older one. */
	let takesBundles = true;
	/** The object sends presence a tick at a time to a connection that reads them, as spool.page does since #107. */
	let ticks = true;
	/** The object answers what the team has seen of a Mac's files, as spool.page does since spool#193. */
	let seenAnswers = true;
	/** Saves taken per window on a clock the test turns, as spool.page's per-minute limit counts them. */
	let rate: { saves: number; windowMs: number; now: () => number; start: number; taken: number } | undefined;
	/** The minute's bucket, on a clock the test turns: its level when last taken from, and how fast it refills. */
	let bucket: { level: number; at: number; refill: number; now: () => number } | undefined;
	/** The bucket's level now. */
	const level = () =>
		bucket === undefined
			? Number.POSITIVE_INFINITY
			: Math.min(2_000, bucket.level + ((bucket.now() - bucket.at) * bucket.refill) / 60_000);
	/** Whether a save on this connection is a move's: the project holds nothing but this mover's saves. */
	const movesIn = (at: Project, from: Connected) =>
		from.moving === true && (at.mover === undefined ? at.saves.length === 0 : at.mover === from.person.accountId);
	/** How full the bucket is, for a connection it paces. */
	const pace = (at: Project, from: Connected) =>
		bucket === undefined || movesIn(at, from)
			? {}
			: { pace: { room: Math.max(0, Math.floor(level())), refill: bucket.refill } };
	/** Whether the rate lets one more save through now; when it doesn't, the seconds until it may. */
	const overRate = (): number | undefined => {
		if (rate === undefined) return undefined;
		if (rate.now() >= rate.start + rate.windowMs) Object.assign(rate, { start: rate.now(), taken: 0 });
		if (rate.taken < rate.saves) {
			rate.taken++;
			return undefined;
		}
		return Math.max(1, Math.ceil((rate.start + rate.windowMs - rate.now()) / 1_000));
	};
	const edits = (person: Person, address = team) => {
		const role = roleIn(person, address);
		return role === "admin" || role === "editor";
	};
	const sockets = () => [...projects.values()].flatMap((each) => [...each.sockets]);

	function answer(request: Request, person: Person | undefined): Response | Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		if (person === undefined || person.revoked)
			return Response.json({ error: "account_session_required" }, { status: 401 });
		if (path === "/auth/account/session")
			return Response.json({
				accountId: person.accountId,
				email: `${person.accountId}@devosurf.com`,
				// named as presence names them
				name: person.accountId,
				sessionId: `${person.accountId}-session`,
				expiresAt: Date.now() + 86_400_000,
			});
		if (path === "/api/teams")
			return Response.json({
				teams: [...teams]
					.filter(([address]) => roleIn(person, address) !== null)
					.map(([address, about], at) => ({
						id: `t${at + 1}`,
						address,
						name: about.name,
						role: roleIn(person, address),
						logo: null,
						people: [...people.values()].filter((one) => roleIn(one, address) !== null).length,
						billing: { state: about.lapsed ? "lapsed" : "paying", hadTime: true },
					})),
				invites: [],
				mayCreateTeam: false,
			});
		const solo = /^\/api\/solo\/projects\/([0-9a-f]{32})\/move$/u.exec(path);
		if (solo !== null && request.method === "POST")
			return request.json().then((body: { team: string; project: string }) => {
				if (!teams.has(body.team) || roleIn(person, body.team) === null)
					return Response.json({ error: "team_not_found" }, { status: 404 });
				soloMoves.push({ solo: solo[1] ?? "", ...body, by: person.accountId });
				return Response.json({ shares: 1 });
			});
		// an old address says where the project is now to anyone in either team, before anything else
		const old = /^\/api\/teams\/([^/]+)\/projects\/([^/]+)(?:\/|$)/u.exec(path);
		const moved = old === null ? undefined : forwards.get(`${old[1]}/${old[2]}`);
		if (old !== null && moved !== undefined && !projects.has(`${old[1]}/${old[2]}`)) {
			if (roleIn(person, old[1] ?? "") !== null || roleIn(person, moved.team) !== null)
				return Response.json(
					{
						error: "project_moved",
						team: moved.team,
						name: moved.name,
						url: `${TEAM_ORIGIN}/${moved.team}/${moved.name}`,
					},
					{ status: 410 },
				);
			return Response.json({ error: "team_not_found" }, { status: 404 });
		}
		const inTeam = /^\/api\/teams\/([^/]+)\//u.exec(path)?.[1];
		if (inTeam === undefined || !teams.has(inTeam) || roleIn(person, inTeam) === null)
			return Response.json({ error: "team_not_found" }, { status: 404 });
		const address = inTeam;
		const role = roleIn(person, address);
		if (path === `/api/teams/${address}/people`)
			return Response.json({
				members: [...people.values()]
					.filter((one) => roleIn(one, address) !== null)
					.map((one) => ({
						accountId: one.accountId,
						name: one.accountId,
						email: `${one.accountId}@devosurf.com`,
						role: roleIn(one, address),
						you: one === person,
					})),
				invites: [],
			});
		// who is inside each project now, as the sync objects say from their sockets: never the asker
		if (path === `/api/teams/${address}/here`)
			return Response.json({
				projects: inside(address).map((at) => ({
					name: at.name,
					url: `${TEAM_ORIGIN}/${address}/${at.name}`,
					people: [...new Set([...at.sockets].map((socket) => socket.person))]
						.filter((one) => one !== person && standing(at, one) !== undefined)
						.map((one) => ({ name: one.accountId, color: one.color })),
				})),
			});
		// the team's trash, its admins' alone
		const binned = /^\/api\/teams\/[^/]+\/removed(?:\/([^/]+)(\/restore)?)?$/u.exec(path);
		if (binned !== null) {
			if (role !== "admin") return Response.json({ error: "admin_required" }, { status: 403 });
			if (binned[1] === undefined)
				return Response.json({
					projects: [...trash.entries()]
						.filter(([key]) => key.startsWith(`${address}/`))
						.map(([, { at, by, when }]) => ({
							name: at.name,
							removedBy: by,
							removedAt: when,
							purgeAt: when + 30 * 86400,
							shares: at.shares.size,
						})),
				});
			const key = `${address}/${binned[1]}`;
			const held = trash.get(key);
			if (held === undefined) return Response.json({ error: "project_not_found" }, { status: 404 });
			if (binned[2] === undefined && request.method === "DELETE") {
				trash.delete(key);
				movedOut.delete(key);
				return Response.json({});
			}
			if (lapsed(address)) return Response.json({ error: "unpaid" }, { status: 402 });
			restore(key);
			return Response.json(described(held.at));
		}
		const match =
			/^\/api\/teams\/([^/]+)\/projects(?:\/([^/]+))?(\/repo|\/move|\/shares|\/history\/seen|\/comments\/count|\/comments\/[^/]+\/still)?$/u.exec(
				path,
			);
		if (match === null) return Response.json({ error: "team_not_found" }, { status: 404 });
		const named = match[2];
		const at = named === undefined ? undefined : projects.get(`${address}/${named}`);
		if (named !== undefined && at === undefined && movedOut.has(`${address}/${named}`))
			return Response.json({ error: "project_moved_out" }, { status: 410 });
		const binnedHere = named === undefined ? undefined : trash.get(`${address}/${named}`);
		if (at === undefined && binnedHere !== undefined)
			return Response.json(
				{
					error: "project_removed",
					team: teams.get(address)?.name ?? address,
					by: binnedHere.by,
					at: binnedHere.when,
				},
				{ status: 410 },
			);
		if (request.method === "GET" && named === undefined)
			return Response.json({ projects: inside(address).map(described) });
		if (request.method === "POST" && named === undefined)
			return request.json().then((body: { name: string; repo?: string }) => {
				if (role === "viewer") return Response.json({ error: "editor_required" }, { status: 403 });
				// a lapsed team takes no new work that would sync
				if (lapsed(address)) return Response.json({ error: "unpaid" }, { status: 402 });
				const name = body.name.toLowerCase();
				if (projects.has(`${address}/${name}`)) return Response.json({ error: "project_taken" }, { status: 409 });
				const holds = trash.get(`${address}/${name}`);
				if (holds !== undefined)
					return Response.json({ error: "name_in_trash", frees: holds.when + 30 * 86400 }, { status: 409 });
				const made: Project = {
					id: `p${++ids}`,
					team: address,
					name,
					files: new Map(),
					saves: [],
					refused: [],
					sends: [],
					versions: new Map(),
					sockets: new Set(),
					version: 0,
					resent: [],
					turns: [],
					repo: body.repo ?? null,
					comments: [],
					stills: new Map(),
					reads: new Map(),
					buckets: new Map(),
					places: new Map(),
					shares: new Map(),
					moved: [],
					last: new Map(),
					had: new Map(),
				};
				arrive(made);
				return Response.json(described(made), { status: 201 });
			});
		if (at === undefined) return Response.json({ error: "project_not_found" }, { status: 404 });
		if (request.method === "PUT" && match[3] === "/repo")
			return request.json().then((body: { repo: string }) => {
				if (role === "viewer") return Response.json({ error: "editor_required" }, { status: 403 });
				at.repo = body.repo;
				return Response.json(described(at));
			});
		// whether the team has, had or never had each of a Mac's files: an editor's read, counted against no limit
		if (match[3] === "/history/seen" && !seenAnswers) return new Response("404 Not Found", { status: 404 });
		if (match[3] === "/history/seen" && request.method === "POST")
			return request.json().then((body: { files: { path: string; hash: string }[] }) => {
				if (role === "viewer") return Response.json({ error: "editor_required" }, { status: 403 });
				if (!Array.isArray(body.files) || body.files.length > SEEN_FILES)
					return Response.json({ error: "invalid_input" }, { status: 400 });
				seenAsks.push(body.files.length);
				const files = body.files.map(({ path, hash: asked }) => {
					const now = at.files.get(path);
					const team = now === undefined ? "none" : now.bytes === null ? "deleted" : "file";
					const seen =
						now !== undefined && hash(now.bytes) === asked
							? "current"
							: at.had.get(path)?.has(asked) === true
								? "had"
								: "never";
					return { path, hash: asked, seen, team };
				});
				const held = [...at.files.values()].filter((file) => file.bytes !== null).length;
				return Response.json({ files, held });
			});
		// how many comments the project holds, and the still one kept: any member's to read
		if (match[3] === "/shares" && request.method === "GET")
			return Response.json({
				shares: [...at.shares]
					.filter(([, share]) => !share.ended)
					.map(([id, share]) => ({
						id,
						kind: "link",
						pages: share.pages,
						people: [],
						by: share.by,
						at: 0,
						opens: 0,
					})),
			});
		if (match[3] === "/comments/count" && request.method === "GET")
			return Response.json({ comments: at.comments.length });
		if (match[3]?.endsWith("/still") === true && request.method === "GET") {
			// a lapsed team's stills are its admins' in a browser, and every caller here is a Mac
			if (lapsed(address)) return Response.json({ error: "unpaid" }, { status: 402 });
			const still = at.stills.get(match[3].split("/")[2] ?? "");
			if (still === undefined) return Response.json({ error: "still_not_found" }, { status: 404 });
			return new Response(arrayBuffer(still), { headers: { "content-type": "image/png" } });
		}
		if (match[3] === "/move" && request.method === "GET") {
			const to = url.searchParams.get("to") ?? "";
			const name = url.searchParams.get("name") ?? at.name;
			return Response.json({ losing: losing(at, to, person), refusal: moveRefusal(at, person, to, name) });
		}
		if (match[3] === "/move" && request.method === "POST")
			return request.json().then((body: { to?: unknown; name?: unknown }) => {
				const to = typeof body.to === "string" ? body.to : "";
				const name = body.name === undefined ? at.name : body.name;
				const refusal = typeof body.to !== "string" ? "invalid_input" : moveRefusal(at, person, to, name);
				if (refusal !== null) return Response.json({ error: refusal }, { status: REFUSAL_STATUS[refusal] ?? 400 });
				const gone = losing(at, to, person);
				const from = `${at.team}/${at.name}`;
				projects.delete(from);
				forwards.set(from, at);
				at.team = to;
				at.name = name as string;
				arrive(at);
				moves.push({ from, to: `${to}/${at.name}`, by: person.accountId });
				// every connection asks its standing again, and meets the old address's answer
				for (const socket of at.sockets) socket.close(CLOSE_NOT_EDITOR);
				return Response.json({ ...described(at), losing: gone });
			});
		if (request.method === "DELETE" && match[3] === undefined) {
			if (role !== "admin") return Response.json({ error: "admin_required" }, { status: 403 });
			// to the team's trash, its comments and shares with it
			remove(at, url.searchParams.get("out") === "1", person.accountId);
			return Response.json({});
		}
		asked++;
		return Response.json({ ...described(at), role, ...(lapsed(address) ? { standing: "unpaid" } : {}) });
	}

	/** Today's described project, at its team and name now. */
	function described(at: Project) {
		return { id: at.id, name: at.name, team: at.team, url: `${TEAM_ORIGIN}/${at.team}/${at.name}`, repo: at.repo };
	}

	/** A team's projects, by name. */
	function inside(address: string): Project[] {
		return [...projects.values()].filter((at) => at.team === address).sort((a, b) => a.name.localeCompare(b.name));
	}

	/** A project takes an address: a forward or a moved-out mark there goes, since a real project lives there now. */
	function arrive(at: Project): void {
		const key = `${at.team}/${at.name}`;
		projects.set(key, at);
		forwards.delete(key);
		movedOut.delete(key);
	}

	/**
	 * A project removed to its team's trash, by whom, its forwards going; moved out, its address says so to the team
	 * from then on, and otherwise that it was removed.
	 */
	function remove(at: Project, out: boolean, by: string): void {
		const key = `${at.team}/${at.name}`;
		projects.delete(key);
		trash.set(key, { at, by, when: Math.floor(Date.now() / 1000) });
		for (const [old, to] of forwards) if (to === at) forwards.delete(old);
		if (out) movedOut.add(key);
		for (const socket of at.sockets) socket.close(CLOSE_NOT_EDITOR);
	}

	/** A project restored from its team's trash: it lives at its address again, with everything it kept. */
	function restore(key: string): void {
		const held = trash.get(key);
		if (held === undefined) return;
		trash.delete(key);
		arrive(held.at);
	}

	/** Editors and admins of the project's team who aren't in the target, the asker never among them, by name. */
	function losing(at: Project, to: string, asker: Person) {
		return [...people.values()]
			.filter((one) => one.accountId !== asker.accountId && edits(one, at.team) && roleIn(one, to) === null)
			.map((one) => ({ name: one.accountId, email: `${one.accountId}@devosurf.com` }))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	/** What a move would be refused with now, in spool.page's order, or null. */
	function moveRefusal(at: Project, person: Person, to: string, name: unknown): string | null {
		if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/u.test(name)) return "invalid_input";
		if (roleIn(person, at.team) !== "admin") return "admin_required";
		if (to === at.team) return "same_team";
		if (!teams.has(to) || roleIn(person, to) === null) return "target_not_found";
		if (roleIn(person, to) === "viewer") return "target_editor_required";
		if (lapsed(to)) return "unpaid";
		if (projects.has(`${to}/${name}`)) return "name_taken";
		return null;
	}

	function receive(at: Project, from: Connected, data: string | Uint8Array): void {
		const framed = decodeFrame(data);
		if (framed === null) return;
		const { message, bytes } = framed;
		if (message.type === "hello") {
			if (message.protocol !== PROTOCOL_VERSION) {
				from.close();
				return;
			}
			from.moving = message.moving === true;
			from.bundles = message.bundles === true;
			from.ticks = ticks && message.ticks === true;
			if (!from.moving && at.mover === from.person.accountId) at.mover = null;
			from.deliver(
				encodeFrame({
					type: "welcome",
					protocol: PROTOCOL_VERSION,
					format: 2,
					head: at.version,
					...pace(at, from),
					...(takesBundles ? { bundles: true } : {}),
				}),
			);
			const since = Number(message.since);
			for (const [path, file] of [...at.files].sort((a, b) => a[1].version - b[1].version))
				if (file.version > since) from.deliver(fileFrame(path, file));
			from.deliver(encodeFrame({ type: "caught-up", head: at.version }));
			from.live = true;
			greet(at, from);
			const reads = at.reads.get(from.person.accountId) ?? new Map<string, number>();
			const theirs = at.comments.flatMap((comment) => forReader(comment, readerOf(from)) ?? []);
			for (let start = 0; start === 0 || start < theirs.length; start += COMMENTS_PER_PART) {
				const comments = theirs.slice(start, start + COMMENTS_PER_PART);
				const seen: Record<string, number> = {};
				for (const comment of comments) {
					const read = reads.get(comment.id);
					if (read !== undefined) seen[comment.id] = read;
				}
				from.deliver(
					encodeFrame({
						type: "comments",
						comments,
						first: start === 0,
						last: start + COMMENTS_PER_PART >= theirs.length,
						reads: seen,
					}),
				);
			}
			return;
		}
		if (message.type === "comment-post" || message.type === "comment-reply") {
			commented(at, from, message, bytes);
			return;
		}
		if (message.type === "comment-still-ask") {
			const ask = readCommentStillAsk(message);
			if (ask === undefined || !from.live) {
				from.close();
				return;
			}
			if (!at.comments.some((comment) => comment.id === ask.comment)) {
				from.deliver(encodeFrame({ type: "comment-refused", ref: ask.ref, reason: "comment_not_found" }));
				return;
			}
			from.deliver(
				encodeFrame({ type: "comment-still", ref: ask.ref, comment: ask.comment }, at.stills.get(ask.comment)),
			);
			return;
		}
		if (isCommentChange(message.type)) {
			changed(at, from, message);
			return;
		}
		if (message.type === "presence") {
			const state = readPresenceState(message.state);
			if (!from.live || state === undefined) return;
			if (state === null) delete from.presence;
			else from.presence = { state, at: Date.now() };
			relayPresence(at, from.person);
			return;
		}
		if (message.type === "resend") {
			for (const path of new Set(message.paths as string[])) {
				const file = at.files.get(path);
				if (file !== undefined) from.deliver(fileFrame(path, file));
			}
			at.resent.push(...(message.paths as string[]));
			return;
		}
		if (message.type === "turn-ended") {
			if (from.live) at.turns.push({ by: from.person.accountId, saves: at.saves.length });
			return;
		}
		const lone = message.type === "save";
		if (!lone && message.type !== "saves") return;
		let entries: Entry[];
		if (lone) {
			const { ref, path, base, deleted } = message as Omit<Entry, "bytes">;
			entries = [{ ref, path, base, deleted, bytes }];
		} else {
			const saves = Array.isArray(message.saves)
				? (message.saves as (Omit<Entry, "bytes"> & { size: number })[])
				: [];
			const parts = takesBundles ? bundleParts(saves, bytes) : null;
			if (parts === null || saves.length === 0) {
				from.close();
				return;
			}
			entries = saves.map(({ ref, path, base, deleted }, index) => ({
				ref,
				path,
				base,
				deleted,
				bytes: parts[index],
			}));
		}
		at.sends.push(entries.length);
		const said = readMoved(message.moved);
		at.moved.push(said);
		follow(at, take(at, from, entries, lone), said);
	}

	/**
	 * Saves sent alone or together, as spool.page takes them: each checked and ordered on its own, the bundle taking
	 * one save from the bucket, answered in one message, and relayed as one to every copy that reads bundles.
	 */
	function take(at: Project, from: Connected, entries: Entry[], lone: boolean): CopyChange[] {
		const told: Told = { answers: [], after: [], relayed: [], changes: [] };
		const refuse = ({ ref, path }: Entry, reason: string, retryAfter?: number) => {
			at.refused.push({ path, reason });
			told.answers.push({ type: "refused", ref, path, reason, ...(retryAfter === undefined ? {} : { retryAfter }) });
		};
		const moved = movesIn(at, from);
		const revoked = from.person.revoked || !edits(from.person, at.team);
		if (revoked) for (const entry of entries) refuse(entry, from.person.revoked ? "signed_out" : "not_editor");
		const taking = revoked
			? []
			: entries.filter((entry) => {
					if (!travels(entry.path)) refuse(entry, "outside_layout");
					else if ((entry.bytes?.byteLength ?? 0) > FILE_LIMIT_BYTES) refuse(entry, "too_large");
					else return true;
					return false;
				});
		if (taking.length > 0) {
			let held: { reason: string; retryAfter: number } | undefined;
			if (limited !== undefined) held = limited;
			else {
				const wait = overRate();
				const room = level();
				if (wait !== undefined) held = { reason: "rate_limited", retryAfter: wait };
				else if (bucket !== undefined && !moved && room < 1)
					held = {
						reason: "rate_limited",
						retryAfter: Math.max(1, Math.ceil(((1 - room) * 60) / bucket.refill)),
					};
				else if (bucket !== undefined && !moved) Object.assign(bucket, { level: room - 1, at: bucket.now() });
			}
			for (const entry of taking) {
				if (held !== undefined) {
					refuse(entry, held.reason, held.retryAfter);
					continue;
				}
				const current = at.files.get(entry.path);
				if (current !== undefined && hash(current.bytes) === hash(entry.bytes ?? null))
					told.answers.push({ type: "saved", ref: entry.ref, path: entry.path, version: current.version });
				else apply(at, from, entry, current, moved, told);
			}
		}
		const [only] = told.answers;
		if (lone && only !== undefined) from.deliver(encodeFrame({ ...only, ...pace(at, from) }));
		else from.deliver(encodeFrame({ type: "answers", answers: told.answers, ...pace(at, from) }));
		for (const frame of told.after) from.deliver(frame);
		if (revoked) from.close(from.person.revoked ? CLOSE_SIGNED_OUT : CLOSE_NOT_EDITOR);
		if (told.relayed.length === 0) return told.changes;
		const by = { accountId: from.person.accountId, device: from.person.device };
		for (const other of at.sockets) {
			if (other === from || !other.live) continue;
			if (!lone && other.bundles === true)
				other.deliver(
					encodeFrame(
						{
							type: "files",
							files: told.relayed.map(({ path, version, deleted, content }) => ({
								path,
								version,
								deleted,
								by,
								size: content?.byteLength ?? 0,
							})),
						},
						joinParts(told.relayed.map(({ content }) => content)),
					),
				);
			else
				for (const { path, version, deleted, content } of told.relayed)
					other.deliver(encodeFrame({ type: "file", path, version, deleted, by }, content));
			for (const { path, version, restores } of told.relayed)
				if (restores !== undefined && other.person === restores && restores !== from.person)
					other.deliver(encodeFrame({ type: "restored", path, version, by }));
		}
		return told.changes;
	}

	/**
	 * Saves changed the team's copy: every comment stands where it now belongs, by core's rules as the sync object
	 * keeps them, and every live copy is told of each that changed (spool#160).
	 */
	function follow(at: Project, changes: CopyChange[], said: Moved | undefined): void {
		place(at, changes, said);
		if (changes.length > 0) void editedNow(at);
	}

	/** Each project's latest look at which comments' frames were edited since: an older one that ends later is dropped. */
	const editing = new WeakMap<Project, number>();

	/**
	 * Which comments stand on a frame whose source isn't what it was when they were made, by the revision spool.page
	 * reads its copy with: every live copy is told of each that changed (spool#160).
	 */
	async function editedNow(at: Project): Promise<void> {
		const turn = (editing.get(at) ?? 0) + 1;
		editing.set(at, turn);
		const revisions = new Map<string, Promise<string | null>>();
		const revisionOf = (frame: string) => {
			let found = revisions.get(frame);
			if (found === undefined) {
				const files = [...at.files].flatMap(([path, file]) =>
					file.bytes === null ? [] : [{ path, hash: hash(file.bytes) ?? "" }],
				);
				found = frameRevisionOf(frame, files);
				revisions.set(frame, found);
			}
			return found;
		};
		const looked = await Promise.all(
			at.comments.map(async ({ id, frame, standing, revision }) => {
				if (frame === null || standing !== "placed" || revision === null) return { id, edited: false };
				const now = await revisionOf(frame);
				return { id, edited: now !== null && now !== revision };
			}),
		);
		if (editing.get(at) !== turn) return;
		for (const { id, edited } of looked) {
			const index = at.comments.findIndex((comment) => comment.id === id);
			const comment = at.comments[index];
			if (comment === undefined || (comment.editedSince === true) === edited) continue;
			const { editedSince: _, ...rest } = comment;
			const now: Comment = edited ? { ...rest, editedSince: true } : rest;
			at.comments[index] = now;
			tellComment(at, "comment-changed", now);
		}
	}

	/** Where every comment stands once saves are applied, by core's rules as the sync object keeps them. */
	function place(at: Project, changes: CopyChange[], said: Moved | undefined): void {
		if (!movesComments(changes, said)) return;
		const holds = (path: string) => (at.files.get(path)?.bytes ?? null) !== null;
		const design: DesignNow = {
			frame: (name) => holds(`frames/${name}/frame.tsx`),
			page: (page) =>
				page === "" ||
				[...at.files].some(([path, file]) => file.bytes !== null && path.startsWith(`frames/${page}/`)),
			geometry: (name) => {
				const bytes = at.last.get(`frames/${name}/frame.json`);
				return bytes === undefined ? undefined : frameGeometry(bytes);
			},
		};
		const moved = {
			frames: [...(said?.frames ?? []), ...sameSourceMoves(changes)].filter(({ from }) => !design.frame(from)),
			pages: (said?.pages ?? []).filter(({ from }) => !design.page(from)),
		};
		for (const [index, comment] of at.comments.entries()) {
			const was = at.places.get(comment.id);
			if (was === undefined) continue;
			const place = placeAfter(was, moved, design, Date.now());
			if (samePlace(place, was)) continue;
			at.places.set(comment.id, place);
			// off its frame, it says nothing of the frame's edits: as spool.page sends it, in the same word
			const { dropped: _, editedSince, ...rest } = comment;
			const now: Comment = {
				...rest,
				page: place.page,
				frame: place.frame,
				at: place.at,
				standing: place.standing,
				...(place.frame === null && place.home !== null && place.dropped !== null
					? { dropped: { frame: place.home.frame, at: place.dropped } }
					: {}),
				...(editedSince === true && place.standing === "placed" && place.frame !== null ? { editedSince } : {}),
			};
			at.comments[index] = now;
			tellComment(at, "comment-changed", now);
		}
	}

	/** Who a copy reads comments as: its person, a member, who reads every audience. */
	const readerOf = (connected: Connected): CommentReader => ({ accountId: connected.person.accountId, share: null });

	/** A comment message to every live copy, each as its reader may hear it, as the object tells them. */
	function tell(at: Project, heard: (reader: CommentReader) => CommentsMessage | undefined): void {
		for (const socket of at.sockets) {
			if (!socket.live) continue;
			const message = heard(readerOf(socket));
			if (message !== undefined) socket.deliver(encodeFrame(message));
		}
	}

	/** A comment made or changed, to each reader as they read it: a draft only to its person. */
	function tellComment(at: Project, type: "comment-added" | "comment-changed", comment: Comment): void {
		tell(at, (reader) => {
			const seen = forReader(comment, reader);
			return seen === undefined ? undefined : { type, comment: seen };
		});
	}

	/** A comment or a reply from a caught-up copy: kept, sent to every reader, and its writer answered. */
	function commented(at: Project, from: Connected, message: Record<string, unknown>, bytes?: Uint8Array): void {
		const ref = typeof message.ref === "string" ? message.ref : "-";
		const refuse = (reason: CommentRefusal, retryAfter?: number) =>
			from.deliver(
				encodeFrame({ type: "comment-refused", ref, reason, ...(retryAfter === undefined ? {} : { retryAfter }) }),
			);
		if (!from.live) {
			from.close();
			return;
		}
		if (from.person.revoked || !edits(from.person, at.team)) {
			refuse("not_editor");
			return;
		}
		const author = personOf(from.person);
		const now = Date.now();
		if (message.type === "comment-post") {
			const post = readCommentPost(message);
			if (post === undefined) {
				refuse(commentBodyRefusal(message.body) ?? "invalid_comment");
				return;
			}
			if (bytes !== undefined && !isCommentStill(bytes)) {
				refuse("still_too_large");
				return;
			}
			const audience = post.audience ?? "team";
			const share = audience === "team" ? undefined : at.shares.get(audience.share);
			const refused = memberPostRefusal(post, share === undefined ? undefined : share.ended ? "ended" : share);
			if (refused !== undefined) {
				refuse(refused);
				return;
			}
			const limited = postLimited(at, from.person, true);
			if (limited !== undefined) {
				refuse(limited.reason, limited.retryAfter);
				return;
			}
			const { type: _type, ref: _ref, agent, mentions, audience: _audience, ...where } = post;
			const id = `c${++commentIds}`.padEnd(8, "x");
			const named = mentioned(at, mentions);
			const comment: Comment = {
				id,
				audience,
				...where,
				still: bytes !== undefined,
				author,
				agent: agent === true,
				created: now,
				edited: null,
				resolved: null,
				standing: "placed",
				replies: [],
				...(named.length > 0 ? { mentions: named } : {}),
				// a share's comment as a member reads it (spool#174): every share here is a link share
				...(share === undefined ? {} : { share: { kind: "link" as const, who: [], by: share.by } }),
			};
			at.comments.push(comment);
			at.places.set(id, {
				page: comment.page,
				frame: comment.frame,
				at: comment.at,
				standing: "placed",
				home: comment.frame === null ? null : { frame: comment.frame, at: comment.at },
				dropped: null,
			});
			if (bytes !== undefined) at.stills.set(id, bytes);
			tellComment(at, "comment-added", comment);
			from.deliver(encodeFrame({ type: "comment-posted", ref, id }));
			// made at a revision the team's copy hasn't reached, or has passed, it says so at once
			void editedNow(at);
			return;
		}
		const post = readCommentReplyPost(message);
		const comment = post === undefined ? undefined : at.comments.find((comment) => comment.id === post.comment);
		if (post === undefined || comment === undefined) {
			refuse(post === undefined ? (commentBodyRefusal(message.body) ?? "invalid_comment") : "comment_not_found");
			return;
		}
		// a share that ended takes no more words
		if (comment.audience !== "team" && at.shares.get(comment.audience.share)?.ended !== false) {
			refuse("share_ended");
			return;
		}
		const limited = postLimited(at, from.person, false);
		if (limited !== undefined) {
			refuse(limited.reason, limited.retryAfter);
			return;
		}
		const id = `c${++commentIds}`.padEnd(8, "x");
		const named = mentioned(at, post.mentions);
		const reply: CommentReply = {
			id,
			author,
			agent: post.agent === true,
			body: post.body,
			created: now,
			edited: null,
			draftFor: draftFor(comment.audience, post.agent === true, from.person.accountId),
			...(named.length > 0 ? { mentions: named } : {}),
		};
		comment.replies.push(reply);
		tell(at, (reader) => {
			const heard = replyForReader(reader, comment, reply);
			return heard === undefined ? undefined : { type: "comment-replied", comment: comment.id, reply: heard };
		});
		from.deliver(encodeFrame({ type: "comment-posted", ref, id }));
	}

	/** A person as comments name them here: by account, in their colour. */
	const personOf = (person: Person): CommentPerson => ({
		accountId: person.accountId,
		name: person.accountId,
		color: person.color,
	});

	/** The members among the accounts a message mentions, as readers get them: nobody else is mentioned. */
	function mentioned(at: Project, accounts: readonly string[] | undefined): CommentPerson[] {
		return (accounts ?? []).flatMap((account) => {
			const person = [...people.values()].find((one) => one.accountId === account);
			return person === undefined || roleIn(person, at.team) === null ? [] : [personOf(person)];
		});
	}

	/** The project's open comments, then the person's minute, as the object holds a post to them. */
	function postLimited(
		at: Project,
		person: Person,
		opens: boolean,
	): { reason: CommentRefusal; retryAfter?: number } | undefined {
		if (opens && at.comments.filter(isOpenComment).length >= commentLimits.open) return { reason: "too_many_open" };
		const taken = takeFromBucket(at.buckets.get(person.accountId), commentLimits.perMinute, 60_000, Date.now());
		if ("retryAfter" in taken) return { reason: "rate_limited", retryAfter: taken.retryAfter };
		at.buckets.set(person.accountId, taken.bucket);
		return undefined;
	}

	/** A change to a comment from a caught-up copy, by the rules the object keeps (`changeRefusal`). */
	function changed(at: Project, from: Connected, message: Record<string, unknown>): void {
		const ref = typeof message.ref === "string" ? message.ref : "-";
		const refuse = (reason: CommentRefusal) => from.deliver(encodeFrame({ type: "comment-refused", ref, reason }));
		if (!from.live) {
			from.close();
			return;
		}
		if (from.person.revoked || !edits(from.person, at.team)) {
			refuse("not_editor");
			return;
		}
		const change = readCommentChange(message);
		if (change === undefined) {
			refuse(commentBodyRefusal(message.body) ?? "invalid_comment");
			return;
		}
		const index = at.comments.findIndex((comment) => comment.id === change.comment);
		const comment = at.comments[index];
		const named = "reply" in change && change.reply !== undefined ? change.reply : undefined;
		const reply = named === undefined ? undefined : comment?.replies.find((one) => one.id === named);
		const target = named === undefined ? comment : reply;
		const account = from.person.accountId;
		// a connection that may still sync edits the project: only editors and admins hold a local copy
		const refused = changeRefusal(
			change,
			{ accountId: account, share: null, edits: true },
			comment === undefined || target === undefined
				? undefined
				: {
						audience: comment.audience,
						author: target.author.accountId,
						draftFor: reply?.draftFor ?? null,
					},
		);
		if (comment === undefined || refused !== undefined) {
			refuse(refused ?? "comment_not_found");
			return;
		}
		if (
			change.type === "comment-send" &&
			comment.audience !== "team" &&
			at.shares.get(comment.audience.share)?.ended !== false
		) {
			refuse("share_ended");
			return;
		}
		const now = Date.now();
		const answered = () => from.deliver(encodeFrame({ type: "comment-posted", ref, id: comment.id }));
		switch (change.type) {
			case "comment-read":
			case "comment-unread": {
				const reads = at.reads.get(account) ?? new Map<string, number>();
				at.reads.set(account, reads);
				if (change.type === "comment-read") reads.set(comment.id, now);
				else reads.delete(comment.id);
				const seen = { type: "comment-seen", comment: comment.id, read: reads.get(comment.id) ?? null };
				for (const socket of at.sockets)
					if (socket.live && socket.person.accountId === account) socket.deliver(encodeFrame(seen));
				answered();
				return;
			}
			case "comment-resolve":
				if (comment.resolved === null)
					comment.resolved = {
						by: personOf(from.person),
						at: now,
						...(change.agent === true ? { agent: change.agent } : {}),
					};
				break;
			case "comment-reopen":
				comment.resolved = null;
				break;
			case "comment-edit": {
				const words = reply ?? comment;
				words.body = change.body;
				words.edited = now;
				const mentions = mentioned(at, change.mentions);
				if (mentions.length > 0) words.mentions = mentions;
				else delete words.mentions;
				break;
			}
			case "comment-send": {
				if (reply === undefined) return;
				// it goes out as its person last left its words, as new as it is sent
				reply.draftFor = null;
				reply.created = now;
				reply.edited = null;
				if (change.body !== undefined) reply.body = change.body;
				break;
			}
			case "comment-delete": {
				if (reply !== undefined) {
					comment.replies = comment.replies.filter((one) => one !== reply);
					break;
				}
				at.comments.splice(index, 1);
				at.stills.delete(comment.id);
				for (const reads of at.reads.values()) reads.delete(comment.id);
				tell(at, () => ({ type: "comment-removed", id: comment.id }));
				answered();
				return;
			}
		}
		tellComment(at, "comment-changed", comment);
		answered();
	}

	/**
	 * A save that changes something: applied on the team's current version, set aside on any other, except that an
	 * edit beats a delete and canvas.json is merged onto the team's version key by key.
	 */
	function apply(
		at: Project,
		from: Connected,
		{ ref, path, base, deleted, bytes }: Entry,
		current: TeamVersion | undefined,
		moved: boolean,
		told: Told,
	): void {
		const stale = current !== undefined && current.version !== base;
		const merged =
			stale && path === CANVAS_PATH && bytes !== undefined && current.bytes !== null
				? mergeCanvas(base === null ? null : (at.versions.get(base)?.bytes ?? null), current.bytes, bytes)
				: null;
		if (merged !== null && current !== undefined && hash(merged) === hash(current.bytes)) {
			told.answers.push({ type: "saved", ref, path, version: current.version });
			told.after.push(fileFrame(path, current));
			return;
		}
		const beatsDelete = stale && current.bytes === null && bytes !== undefined;
		const applies = !stale || merged !== null || beatsDelete;
		at.version += 1;
		at.saves.push({
			path,
			base,
			deleted,
			by: from.person.accountId,
			outcome: applies ? "applied" : "set_aside",
			moved,
		});
		at.mover = moved ? from.person.accountId : null;
		if (!applies) {
			const by = current.by ?? from.person;
			told.answers.push({
				type: "set-aside",
				ref,
				path,
				version: current.version,
				by: { accountId: by.accountId, device: by.device },
			});
			told.after.push(fileFrame(path, current));
			return;
		}
		const content = merged ?? bytes ?? null;
		told.changes.push({ path, was: hash(current?.bytes ?? null), now: hash(content) });
		if (content !== null) at.last.set(path, content);
		const file = { version: at.version, bytes: content, by: from.person };
		at.files.set(path, file);
		at.versions.set(file.version, file);
		at.had.set(path, (at.had.get(path) ?? new Set()).add(hash(content)));
		told.answers.push({ type: "saved", ref, path, version: file.version });
		if (merged !== null) told.after.push(fileFrame(path, file));
		told.relayed.push({
			path,
			version: file.version,
			deleted,
			content: content ?? undefined,
			...(beatsDelete && current.by !== undefined ? { restores: current.by } : {}),
		});
	}

	/** Where a person stands: the latest of their connections' states, as the sync object keeps it. */
	function standing(at: Project, person: Person) {
		let latest: Connected["presence"];
		for (const socket of at.sockets)
			if (socket.person === person && socket.live && socket.presence !== undefined)
				if (latest === undefined || socket.presence.at >= latest.at) latest = socket.presence;
		return latest;
	}

	function presenceFrame(person: Person, stood: Connected["presence"]) {
		return encodeFrame({
			type: "presence",
			person: { accountId: person.accountId, name: person.accountId, color: person.color },
			state: stood?.state ?? null,
			still: stood === undefined ? 0 : Date.now() - stood.at,
		});
	}

	function relayPresence(at: Project, person: Person): void {
		const frame = presenceFrame(person, standing(at, person));
		for (const other of at.sockets)
			if (other.live && other.person !== person) other.deliver(other.ticks === true ? tickOf([frame]) : frame);
	}

	/** Presence frames as one tick: each entry as it would go alone. */
	function tickOf(frames: (string | Uint8Array)[]): string | Uint8Array {
		const people = frames.map((frame) => decodeFrame(frame)?.message);
		return encodeFrame({ type: "presences", people });
	}

	function greet(at: Project, to: Connected): void {
		const told = new Set<Person>([to.person]);
		const frames: (string | Uint8Array)[] = [];
		for (const socket of at.sockets) {
			if (told.has(socket.person)) continue;
			const stood = standing(at, socket.person);
			if (stood === undefined) continue;
			told.add(socket.person);
			frames.push(presenceFrame(socket.person, stood));
		}
		if (to.ticks === true && frames.length > 0) to.deliver(tickOf(frames));
		else for (const frame of frames) to.deliver(frame);
	}

	const openSocket =
		(token: () => string): OpenSyncSocket =>
		(url, presented, events: SyncSocketEvents) => {
			const person = presented === token() ? people.get(presented) : undefined;
			const [, address, name] = /\/api\/teams\/([^/]+)\/projects\/([^/]+)\/sync$/u.exec(new URL(url).pathname) ?? [];
			// an old address takes no connection: its answer is the 410 asking where it stands meets
			const at = name === undefined ? undefined : projects.get(`${address}/${name}`);
			let open = true;
			// every frame arrives later and in order, as it would over a network
			let queue = Promise.resolve();
			const later = (work: () => void) => {
				queue = queue.then(
					() =>
						new Promise<void>((done) =>
							setImmediate(() => {
								work();
								done();
							}),
						),
				);
			};
			const shut = () => {
				if (!open) return false;
				open = false;
				at?.sockets.delete(connected);
				if (at !== undefined && connected.presence !== undefined) relayPresence(at, connected.person);
				return true;
			};
			const connected: Connected = {
				person: person ?? { accountId: "", device: "", role: null, roles: new Map(), color: "" },
				live: false,
				deliver: (frame) =>
					later(() => {
						if (open) events.message(typeof frame === "string" ? frame : arrayBuffer(frame));
					}),
				close: (code) =>
					later(() => {
						if (shut()) events.close(code);
					}),
				cut: () => {
					if (shut()) later(() => events.close());
				},
			};
			// refused at the handshake, as the Worker refuses: no code reaches the daemon
			if (
				person === undefined ||
				person.revoked ||
				at === undefined ||
				!edits(person, at.team) ||
				away.has(person.accountId) ||
				lapsed(at.team)
			)
				connected.close();
			else if (refusing !== undefined) connected.close(refusing);
			else {
				at.sockets.add(connected);
				later(() => events.open());
			}
			return {
				send: (frame) => {
					if (open && at !== undefined && frame !== "ping") later(() => receive(at, connected, frame));
				},
				close: connected.close,
			};
		};

	return {
		origin: TEAM_ORIGIN,
		/** One person signed in on one machine: what a CLI and a daemon there are handed. */
		machine(name: string, role: Person["role"] = "editor") {
			const tokenOf = (account: string) => `${account}-token`.padEnd(43, "x");
			let token = tokenOf(name);
			const color = TEAM_COLORS[people.size % TEAM_COLORS.length] as string;
			people.set(token, { accountId: name, device: `${name}'s Mac`, role, roles: new Map(), color });
			const fetch: typeof globalThis.fetch = async (input, init) => {
				if (down) throw new TypeError("fetch failed");
				const request = new Request(input, init);
				const presented = request.headers.get("authorization")?.replace(/^Bearer /u, "");
				return answer(request, presented === token ? people.get(token) : undefined);
			};
			const vault = { read: async () => token };
			const request: CloudRequestOptions = { origin: TEAM_ORIGIN, vault, fetch };
			const socket = openSocket(() => token);
			return {
				request,
				openSocket: socket,
				/** The daemon's whole boundary to this fake spool.page. */
				cloud: { origin: TEAM_ORIGIN, vault, fetch, openSocket: socket },
				/**
				 * The machine signs in to another account, outside this team unless it is in it already: the connections
				 * made with the last one are cut off, as signing out revokes them.
				 */
				signIn(account: string) {
					const was = people.get(token);
					token = tokenOf(account);
					if (!people.has(token))
						people.set(token, {
							accountId: account,
							device: `${name}'s Mac`,
							role: null,
							roles: new Map(),
							color,
						});
					for (const socket of sockets()) if (socket.person === was) socket.close(CLOSE_SIGNED_OUT);
				},
			};
		},
		/** What the team holds at a path now, as text. */
		file(name: string, path: string): string | null | undefined {
			const file = project(name)?.files.get(path);
			return file === undefined ? undefined : file.bytes === null ? null : Buffer.from(file.bytes).toString("utf8");
		},
		bytes: (name: string, path: string) => project(name)?.files.get(path)?.bytes,
		paths: (name: string) => [...(project(name)?.files.keys() ?? [])].sort(),
		saves: (name: string) => project(name)?.saves ?? [],
		/** Every save the project refused, and why. */
		refused: (name: string) => project(name)?.refused ?? [],
		/** How many saves each message that carried saves held, in order. */
		sends: (name: string) => project(name)?.sends ?? [],
		/** The object is an older spool.page, which takes each save alone and never says it takes bundles. */
		withoutBundles() {
			takesBundles = false;
		},
		resent: (name: string) => project(name)?.resent ?? [],
		turns: (name: string) => project(name)?.turns ?? [],
		/** Set the comment limits every project here keeps, as a maintainer raises one project's. */
		commentLimits(limits: Partial<{ perMinute: number; open: number }>) {
			commentLimits = { ...commentLimits, ...limits };
		},
		/**
		 * A link share of a project's pages, made by an account, that its comments may speak to; `ended` ends it, as
		 * its maker revoking it does.
		 */
		share(name: string, id: string, share: { pages: string[]; by: string; ended?: boolean }) {
			project(name)?.shares.set(id, { pages: share.pages, by: share.by, ended: share.ended === true });
		},
		/** When an account last read each comment, as the team keeps it. */
		reads: (name: string, account: string) => new Map(project(name)?.reads.get(account) ?? []),
		/** Every comment the project holds, as the team keeps them. */
		comments: (name: string) => project(name)?.comments ?? [],
		/** The still a comment kept of its frame, if it kept one. */
		still: (name: string, comment: string) => project(name)?.stills.get(comment),
		/** What each message that carried saves said Spool moved, where it said anything. */
		moved: (name: string) => (project(name)?.moved ?? []).filter((said) => said !== undefined),
		/** The object is an older spool.page, which tells each person's presence in a message of its own. */
		withoutTicks() {
			ticks = false;
		},
		/** A message the team never sends: what a compromised cloud might. */
		forge(name: string, message: object, bytes?: Uint8Array) {
			for (const socket of project(name)?.sockets ?? []) socket.deliver(encodeFrame(message, bytes));
		},
		/** One machine loses the team until it comes back: what it saves waits, and it catches up on reconnect. */
		offline(accountId: string) {
			away.add(accountId);
			// at once: a save the machine makes after this line must never reach the team
			for (const project of projects.values())
				for (const socket of project.sockets) if (socket.person.accountId === accountId) socket.cut();
			return () => away.delete(accountId);
		},
		soloMoves,
		/** How many files each ask of what the team has seen named. */
		seenAsks,
		/** The cloud is an older spool.page, which can't say what the team has seen: the route isn't there. */
		withoutSeen() {
			seenAnswers = false;
		},
		/** The repo spool.page has recorded for a project. */
		repo: (name: string) => project(name)?.repo,
		/**
		 * An admin changes someone's role, or removes them with null, in the first team or the one named; their
		 * connections are cut off at once.
		 */
		role(accountId: string, role: Role, address = team) {
			for (const person of people.values())
				if (person.accountId === accountId) {
					if (address === team) person.role = role;
					else person.roles.set(address, role);
				}
			for (const at of projects.values())
				for (const socket of at.sockets)
					if (socket.person.accountId === accountId && !edits(socket.person, at.team))
						socket.close(CLOSE_NOT_EDITOR);
		},
		/** Another team at spool.page, with nobody in it until `role` puts them there. */
		addTeam(address: string, name: string) {
			teams.set(address, { name, lapsed: false });
		},
		/** Every move spool.page took, as `<team>/<name>` from and to, and who moved it. */
		moves,
		/** Where an old address leads now, as `<team>/<name>`, or nothing. */
		forward(address: string) {
			const to = forwards.get(address);
			return to === undefined ? undefined : `${to.team}/${to.name}`;
		},
		/** Whether an address's project was moved out of its team. */
		movedOut: (address: string) => movedOut.has(address),
		/** A machine's device session revoked from spool.page/account. */
		revoke(accountId: string) {
			for (const person of people.values()) if (person.accountId === accountId) person.revoked = true;
			for (const socket of sockets()) if (socket.person.accountId === accountId) socket.close(CLOSE_SIGNED_OUT);
		},
		/** An admin (by name) removes a team project to its trash: every connection to it is cut off. */
		removeProject(name: string, by = "admin") {
			const removed = project(name);
			if (removed !== undefined) remove(removed, false, by);
		},
		/** An admin restores a project from its team's trash. */
		restoreProject(name: string) {
			restore(name.includes("/") ? name : `${team}/${name}`);
		},
		/** Whether a project waits in its team's trash. */
		inTrash: (name: string) => trash.has(name.includes("/") ? name : `${team}/${name}`),
		/**
		 * The team lapses, as spool.page's sweep or Stripe ends its paid time: every connection is closed as unpaid,
		 * new ones are refused before they open, and asking where a machine stands says `unpaid`.
		 */
		lapse(address = team) {
			const about = teams.get(address);
			if (about !== undefined) about.lapsed = true;
			for (const at of projects.values())
				if (at.team === address) for (const socket of at.sockets) socket.close(CLOSE_UNPAID);
		},
		/** The team pays again: sync is let back in. */
		pay(address = team) {
			const about = teams.get(address);
			if (about !== undefined) about.lapsed = false;
		},
		/** spool.page can't be reached by anyone until the returned undo: its requests fail, as offline. */
		unreachable() {
			down = true;
			return () => {
				down = false;
			};
		},
		/** How many times machines have asked where they stand in a project. */
		standingAsked: () => asked,
		/** Every save is refused for a limit until `lift`, saying when it may lift. */
		limit(reason: Limited, retryAfter: number) {
			limited = { reason, retryAfter };
		},
		lift() {
			limited = undefined;
		},
		/** Every sync connection is closed as it opens, with `code`, until the returned undo. */
		refuseSync(code: number) {
			refusing = code;
			return () => {
				refusing = undefined;
			};
		},
		/**
		 * The minute's limit as spool.page keeps it now: a bucket holding `room` saves, refilling `refill` a minute on the
		 * clock `now`, from everyone together and never from a move's saves. Answers say how full it is.
		 */
		bucket(room: number, refill: number, now: () => number) {
			bucket = { level: room, at: now(), refill, now };
		},
		/**
		 * At most `saves` saves are taken in each window of `now`, and the rest refused as rate_limited: the minute as
		 * the spool.page before buckets counted it, a move's saves too.
		 */
		rateLimit(saves: number, windowMs: number, now: () => number) {
			rate = { saves, windowMs, now, start: now(), taken: 0 };
		},
		/** Every connection to a project dropped at once, as a network going away. */
		disconnect(name: string) {
			for (const socket of project(name)?.sockets ?? []) socket.close();
		},
	};
}

/** The status each move refusal is answered with. */
const REFUSAL_STATUS: Record<string, number> = {
	invalid_input: 400,
	admin_required: 403,
	same_team: 400,
	target_not_found: 404,
	target_editor_required: 403,
	unpaid: 402,
	name_taken: 409,
};

function fileFrame(path: string, file: TeamVersion): string | Uint8Array {
	return encodeFrame(
		{ type: "file", path, version: file.version, deleted: file.bytes === null },
		file.bytes ?? undefined,
	);
}

function hash(bytes: Uint8Array | null): string | null {
	return bytes === null ? null : createHash("sha256").update(bytes).digest("hex");
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
