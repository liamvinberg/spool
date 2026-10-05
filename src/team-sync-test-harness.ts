import { createHash } from "node:crypto";
import type { CloudRequestOptions } from "./cloud-auth";
import type { OpenSyncSocket, SyncSocketEvents } from "./daemon/team-sync";
import {
	CANVAS_PATH,
	CLOSE_NOT_EDITOR,
	CLOSE_SIGNED_OUT,
	decodeFrame,
	encodeFrame,
	FILE_LIMIT_BYTES,
	type Limited,
	mergeCanvas,
	PROTOCOL_VERSION,
	type PresenceState,
	readPresenceState,
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

interface Person {
	accountId: string;
	device: string;
	role: "admin" | "editor" | "viewer" | null;
	/** Their colour on the team canvas, by when they joined. */
	color: string;
	/** The machine's device session was revoked. */
	revoked?: boolean;
}

/** The colours the fake team hands out, one per person in the order they arrive. */
export const TEAM_COLORS = ["#7aa7ff", "#eaa94a", "#4cc495", "#b896ff", "#f28cbc"];

interface Project {
	team: string;
	name: string;
	files: Map<string, TeamVersion>;
	saves: { path: string; base: number | null; deleted: boolean; by: string; outcome: string }[];
	/** Every applied version's bytes and who made it, which a canvas.json merge reads its base from. */
	versions: Map<number, TeamVersion>;
	sockets: Set<Connected>;
	version: number;
	/** Every path a local copy asked to have resent. */
	resent: string[];
}

interface TeamVersion {
	version: number;
	bytes: Uint8Array | null;
	by?: Person;
}

interface Connected {
	person: Person;
	live: boolean;
	/** Where this connection's person last said they were: kept only while it's connected. */
	presence?: { state: PresenceState; at: number };
	deliver(frame: string | Uint8Array): void;
	/** Closed in turn, after everything already on its way, with the close code the object would give. */
	close(code?: number): void;
	/** Gone this instant: nothing sent from now on arrives, and the daemon hears of it in turn. */
	cut(): void;
}

export function fakeTeam(team = "devosurf") {
	const people = new Map<string, Person>();
	const projects = new Map<string, Project>();
	/** Machines that can't reach the team right now, by account. */
	const away = new Set<string>();
	const project = (name: string) => projects.get(name);
	let limited: { reason: Limited; retryAfter: number } | undefined;
	const edits = (person: Person) => person.role === "admin" || person.role === "editor";
	const sockets = () => [...projects.values()].flatMap((each) => [...each.sockets]);

	function answer(request: Request, person: Person | undefined): Response | Promise<Response> {
		const path = new URL(request.url).pathname;
		if (person === undefined || person.revoked)
			return Response.json({ error: "account_session_required" }, { status: 401 });
		if (path === "/api/teams")
			return Response.json({
				teams:
					person.role === null
						? []
						: [{ id: "t1", address: team, name: "Devosurf", role: person.role, logo: null, people: people.size }],
				invites: [],
				mayCreateTeam: false,
			});
		if (path === `/api/teams/${team}/people` && person.role !== null)
			return Response.json({
				members: [...people.values()]
					.filter((one) => one.role !== null)
					.map((one) => ({ accountId: one.accountId, email: `${one.accountId}@devosurf.com`, role: one.role })),
				invites: [],
			});
		const match = /^\/api\/teams\/([^/]+)\/projects(?:\/([^/]+))?$/u.exec(path);
		if (match === null || match[1] !== team || person.role === null)
			return Response.json({ error: "team_not_found" }, { status: 404 });
		const described = (name: string) => ({ id: name, name, team, url: `${TEAM_ORIGIN}/${team}/${name}` });
		if (request.method === "POST" && match[2] === undefined)
			return request.json().then((body: { name: string }) => {
				if (person.role === "viewer") return Response.json({ error: "editor_required" }, { status: 403 });
				const name = body.name.toLowerCase();
				if (projects.has(name)) return Response.json({ error: "project_taken" }, { status: 409 });
				projects.set(name, {
					team,
					name,
					files: new Map(),
					saves: [],
					versions: new Map(),
					sockets: new Set(),
					version: 0,
					resent: [],
				});
				return Response.json(described(name), { status: 201 });
			});
		const found = match[2] === undefined ? undefined : project(match[2]);
		if (found === undefined) return Response.json({ error: "project_not_found" }, { status: 404 });
		return Response.json({ ...described(found.name), role: person.role });
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
			from.deliver(encodeFrame({ type: "welcome", protocol: PROTOCOL_VERSION, format: 2, head: at.version }));
			const since = Number(message.since);
			for (const [path, file] of [...at.files].sort((a, b) => a[1].version - b[1].version))
				if (file.version > since) from.deliver(fileFrame(path, file));
			from.deliver(encodeFrame({ type: "caught-up", head: at.version }));
			from.live = true;
			greet(at, from);
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
		if (message.type !== "save") return;
		const { ref, path, base, deleted } = message as {
			ref: string;
			path: string;
			base: number | null;
			deleted: boolean;
		};
		const current = at.files.get(path);
		const refuse = (reason: string, retryAfter?: number) =>
			from.deliver(
				encodeFrame({ type: "refused", ref, path, reason, ...(retryAfter === undefined ? {} : { retryAfter }) }),
			);
		if (from.person.revoked || !edits(from.person)) {
			refuse(from.person.revoked ? "signed_out" : "not_editor");
			from.close(from.person.revoked ? CLOSE_SIGNED_OUT : CLOSE_NOT_EDITOR);
		} else if (!travels(path)) refuse("outside_layout");
		else if ((bytes?.byteLength ?? 0) > FILE_LIMIT_BYTES) refuse("too_large");
		else if (limited !== undefined) refuse(limited.reason, limited.retryAfter);
		else if (current !== undefined && hash(current.bytes) === hash(bytes ?? null))
			from.deliver(encodeFrame({ type: "saved", ref, path, version: current.version }));
		else apply(at, from, { ref, path, base, deleted }, current, bytes);
	}

	/**
	 * A save that changes something: applied on the team's current version, set aside on any other, except that an
	 * edit beats a delete and canvas.json is merged onto the team's version key by key.
	 */
	function apply(
		at: Project,
		from: Connected,
		{ ref, path, base, deleted }: { ref: string; path: string; base: number | null; deleted: boolean },
		current: TeamVersion | undefined,
		bytes: Uint8Array | undefined,
	): void {
		const stale = current !== undefined && current.version !== base;
		const merged =
			stale && path === CANVAS_PATH && bytes !== undefined && current.bytes !== null
				? mergeCanvas(base === null ? null : (at.versions.get(base)?.bytes ?? null), current.bytes, bytes)
				: null;
		if (merged !== null && current !== undefined && hash(merged) === hash(current.bytes)) {
			from.deliver(encodeFrame({ type: "saved", ref, path, version: current.version }));
			from.deliver(fileFrame(path, current));
			return;
		}
		const beatsDelete = stale && current.bytes === null && bytes !== undefined;
		const applies = !stale || merged !== null || beatsDelete;
		at.version += 1;
		at.saves.push({ path, base, deleted, by: from.person.accountId, outcome: applies ? "applied" : "set_aside" });
		if (!applies) {
			const by = current.by ?? from.person;
			from.deliver(
				encodeFrame({
					type: "set-aside",
					ref,
					path,
					version: current.version,
					by: { accountId: by.accountId, device: by.device },
				}),
			);
			from.deliver(fileFrame(path, current));
			return;
		}
		const content = merged ?? bytes ?? null;
		const file = { version: at.version, bytes: content, by: from.person };
		at.files.set(path, file);
		at.versions.set(file.version, file);
		from.deliver(encodeFrame({ type: "saved", ref, path, version: file.version }));
		if (merged !== null) from.deliver(fileFrame(path, file));
		const by = { accountId: from.person.accountId, device: from.person.device };
		for (const other of at.sockets)
			if (other !== from && other.live) {
				other.deliver(
					encodeFrame({ type: "file", path, version: file.version, deleted, by }, content ?? undefined),
				);
				if (beatsDelete && other.person === current.by && current.by !== from.person)
					other.deliver(encodeFrame({ type: "restored", path, version: file.version, by }));
			}
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
		for (const other of at.sockets) if (other.live && other.person !== person) other.deliver(frame);
	}

	function greet(at: Project, to: Connected): void {
		const told = new Set<Person>([to.person]);
		for (const socket of at.sockets) {
			if (told.has(socket.person)) continue;
			const stood = standing(at, socket.person);
			if (stood === undefined) continue;
			told.add(socket.person);
			to.deliver(presenceFrame(socket.person, stood));
		}
	}

	const openSocket =
		(token: string): OpenSyncSocket =>
		(url, presented, events: SyncSocketEvents) => {
			const person = presented === token ? people.get(token) : undefined;
			const [, , name] = /\/api\/teams\/([^/]+)\/projects\/([^/]+)\/sync$/u.exec(new URL(url).pathname) ?? [];
			const at = name === undefined ? undefined : project(name);
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
				person: person ?? { accountId: "", device: "", role: null, color: "" },
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
			if (person === undefined || person.revoked || at === undefined || !edits(person) || away.has(person.accountId))
				connected.close();
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
			const token = `${name}-token`.padEnd(43, "x");
			const color = TEAM_COLORS[people.size % TEAM_COLORS.length] as string;
			people.set(token, { accountId: name, device: `${name}'s Mac`, role, color });
			const fetch: typeof globalThis.fetch = async (input, init) => {
				const request = new Request(input, init);
				const presented = request.headers.get("authorization")?.replace(/^Bearer /u, "");
				return answer(request, presented === token ? people.get(token) : undefined);
			};
			const request: CloudRequestOptions = { origin: TEAM_ORIGIN, vault: { read: async () => token }, fetch };
			return {
				request,
				openSocket: openSocket(token),
				services: {
					origin: TEAM_ORIGIN,
					vault: { read: async () => token },
					fetch,
					openSocket: openSocket(token),
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
		resent: (name: string) => project(name)?.resent ?? [],
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
		/** An admin changes someone's role, or removes them with null; their connections are cut off at once. */
		role(accountId: string, role: Person["role"]) {
			for (const person of people.values()) if (person.accountId === accountId) person.role = role;
			for (const socket of sockets())
				if (socket.person.accountId === accountId && !edits(socket.person)) socket.close(CLOSE_NOT_EDITOR);
		},
		/** A machine's device session revoked from spool.page/account. */
		revoke(accountId: string) {
			for (const person of people.values()) if (person.accountId === accountId) person.revoked = true;
			for (const socket of sockets()) if (socket.person.accountId === accountId) socket.close(CLOSE_SIGNED_OUT);
		},
		/** An admin removes a team project: every connection to it is cut off. */
		removeProject(name: string) {
			const removed = project(name);
			projects.delete(name);
			for (const socket of removed?.sockets ?? []) socket.close(CLOSE_NOT_EDITOR);
		},
		/** Every save is refused for a limit until `lift`, saying when it may lift. */
		limit(reason: Limited, retryAfter: number) {
			limited = { reason, retryAfter };
		},
		lift() {
			limited = undefined;
		},
		/** Every connection to a project dropped at once, as a network going away. */
		disconnect(name: string) {
			for (const socket of project(name)?.sockets ?? []) socket.close();
		},
	};
}

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
