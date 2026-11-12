import { rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { type Context, Hono } from "hono";
import { writeAtomic } from "../atomic-write";
import { type CloudRequestOptions, deviceName } from "../cloud-auth";
import { cloudTeams } from "../cloud-teams";
import { personName } from "../person-name";
import { isTeamProject, readProjectLink } from "../team-project";
import { realDesignDir, resolveDesignPath } from "./design-path";
import { frameOfPath } from "./events";
import { batchSize, forgetMarks, markBytes, markFile, readMarks, type SetAsideMark } from "./set-aside";
import { copyAccount, pruneEmpty } from "./team-sync";

/** One mark as the canvas draws it: on which frames, and whose save stands, by name where the team says. */
export interface ShownSetAside {
	id: string;
	path: string;
	kind: SetAsideMark["kind"];
	deleted: boolean;
	/** The frames that render the file; none means it is only in the summary. */
	frames: string[];
	/**
	 * The teammate whose save stands, by name (`personName`), or null where spool.page couldn't say or the save was
	 * this account's own.
	 */
	by: string | null;
	/** The save that stands is this account's own, from another local copy of the project. */
	self: boolean;
	/** For `self`: the other copy's machine, when the team said which and it isn't this one. */
	device: string | null;
	/** Where this machine's side is kept, relative to the project root, for an agent to read. */
	file: string | null;
	at: number;
	/** How many marks arrived together with this one, itself included: more than a handful are one summary. */
	together: number;
	/** The marks that arrived together share it: one clash, said as one. */
	batch: string;
}

/** How long a team's names are trusted before spool.page is asked again. */
const NAMES_MS = 5 * 60_000;
/** How long an agent's command waits on spool.page for a name before it says "a teammate". */
const NAME_WAIT_MS = 2_000;

/** What this machine is called, asked once: a mark from a copy on it names no machine. */
let thisMachine: Promise<string> | undefined;
const machine = () => {
	thisMachine ??= deviceName();
	return thisMachine;
};

/** What a mark is told with, beyond the mark itself. */
interface Look {
	/** The account this copy syncs as, if it has caught up once. */
	account: string | undefined;
	machine: string;
	frames: (path: string) => Promise<string[]>;
	name: (accountId: string) => Promise<string | null>;
}

async function shown(root: string, designDir: string, mark: SetAsideMark, look: Look): Promise<ShownSetAside> {
	const self = mark.by !== null && mark.by.accountId === look.account;
	const device = self && mark.by !== null && mark.by.device !== "" && mark.by.device !== look.machine;
	return {
		id: mark.id,
		path: mark.path,
		kind: mark.kind,
		deleted: mark.deleted,
		frames: await look.frames(mark.path),
		by: mark.by === null || self ? null : await look.name(mark.by.accountId),
		self,
		device: device ? (mark.by?.device ?? null) : null,
		file: mark.deleted ? null : relative(root, markFile(designDir, mark)).split("\\").join("/"),
		at: mark.at,
		together: batchSize(designDir, mark.batch),
		batch: mark.batch,
	};
}

/**
 * A team project's marks as this copy alone can say them, with no daemon: no teammate's name, and only the frame a
 * file is itself. What `spool check` tells when nothing is running.
 */
export async function marksOnDisk(root: string): Promise<ShownSetAside[]> {
	if (!isTeamProject(root)) return [];
	const designDir = realDesignDir(root);
	const look: Look = {
		account: copyAccount(root),
		machine: await machine(),
		frames: async (path) => {
			const owner = frameOfPath(designDir, path.split("/"));
			return owner === undefined ? [] : [owner.frame];
		},
		name: async () => null,
	};
	return Promise.all(readMarks(designDir).map((mark) => shown(root, designDir, mark, look)));
}

/**
 * What an agent is told of one mark, on one line: which file, whose save stands, that the file on disk is theirs
 * now, where its own is kept, and the ways on. The same words when its command first meets the mark, when `spool
 * check` fails on it, and when `spool set-aside` lists it.
 */
export function setAsideTold(mark: ShownSetAside): string {
	const file = `design/${mark.path}`;
	const who = mark.self
		? mark.device === null
			? "another copy of you"
			: `another copy of you on ${mark.device}`
		: (mark.by ?? "a teammate");
	const theirs = mark.self ? "that copy's" : "theirs";
	const mine = `\`spool set-aside mine ${mark.path}\``;
	const letGo = `\`spool set-aside theirs ${mark.path}\``;
	if (mark.deleted || mark.file === null)
		return `your delete of ${file} was undone: ${who} edited it, and an edit beats a delete, so the file is back as ${theirs}. If it should still go, delete it again or run ${mine}; ${letGo} keeps it`;
	return `your change to ${file} was set aside: ${who} changed the same lines and reached the team first, so the file on disk is ${theirs} now and yours is kept in ${mark.file}. Redo your change on top of the file and save it, or settle it: ${mine} puts yours back over it, ${letGo} lets yours go`;
}

/** A promise's answer, or `fallback` once `ms` have passed without one. */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
	return new Promise((done) => {
		const timer = setTimeout(() => done(fallback), ms);
		timer.unref?.();
		void promise.then(
			(value) => {
				clearTimeout(timer);
				done(value);
			},
			() => {
				clearTimeout(timer);
				done(fallback);
			},
		);
	});
}

/**
 * The canvas's side of set-aside marks (`set-aside.ts`): list them with the frames each one is on, put this
 * machine's side back, or let the mark go. Putting it back is an ordinary write, which
 * the sync sends as a new save on top of the team's version. Handing it to the agent is the canvas's own turn,
 * started only when pressed. An agent hears of each mark once, on its next command (`untold`), and settles it with
 * `spool set-aside`, through the same routes.
 */
export function createSetAside(deps: {
	spoolDir: string;
	request?: CloudRequestOptions | undefined;
	resolve: (c: Context, name: string) => { root: string } | { response: Response };
	/** The frames whose source graph reaches a shared file, once the graph is built. */
	framesUsing: (root: string, path: string) => Promise<readonly string[] | undefined>;
	changed: (root: string) => void;
}) {
	const names = new Map<string, { at: number; names: Map<string, string> }>();
	/** The marks each root's agent has been told of, by id. */
	const toldAgent = new Map<string, ReadonlySet<string>>();

	/** A teammate's name by account, from the team's people, remembered a while. */
	const nameOf = async (team: string, accountId: string): Promise<string | null> => {
		let known = names.get(team);
		if (known === undefined || Date.now() - known.at > NAMES_MS || !known.names.has(accountId)) {
			try {
				const { members } = await cloudTeams(deps.spoolDir, deps.request).people(team);
				known = { at: Date.now(), names: new Map(members.map((member) => [member.accountId, personName(member)])) };
				names.set(team, known);
			} catch {
				// unreachable or signed out: the mark says "a teammate" instead
			}
		}
		return known?.names.get(accountId) ?? null;
	};

	const framesOf = async (root: string, designDir: string, path: string): Promise<string[]> => {
		const owner = frameOfPath(designDir, path.split("/"));
		if (owner !== undefined) return [owner.frame];
		if (!path.startsWith("shared/")) return [];
		return [...((await deps.framesUsing(root, path)) ?? [])];
	};

	/**
	 * A root's marks as they are told. An agent's command is told them without their frames, which it doesn't need,
	 * and without waiting long on a name.
	 */
	const list = async (root: string, agent = false): Promise<ShownSetAside[]> => {
		if (!isTeamProject(root)) return [];
		const designDir = realDesignDir(root);
		const marks = readMarks(designDir);
		if (marks.length === 0) return [];
		const team = readProjectLink(root).team;
		const look: Look = {
			account: copyAccount(root),
			machine: await machine(),
			frames: async (path) => (agent ? [] : framesOf(root, designDir, path)),
			name: (accountId) => (agent ? within(nameOf(team, accountId), NAME_WAIT_MS, null) : nameOf(team, accountId)),
		};
		const told: ShownSetAside[] = [];
		for (const mark of marks) told.push(await shown(root, designDir, mark, look));
		return told;
	};

	const withMark = (
		c: Context,
		act: (root: string, designDir: string, mark: SetAsideMark) => Response | Promise<Response>,
	) => {
		const project = deps.resolve(c, c.req.param("project") ?? "");
		if ("response" in project) return project.response;
		const designDir = realDesignDir(project.root);
		const mark = readMarks(designDir).find((held) => held.id === c.req.param("id"));
		if (mark === undefined) return c.json({ error: "mark_not_found" }, 404);
		return act(project.root, designDir, mark);
	};

	const routes = new Hono()
		.get("/:project/set-aside", async (c) => {
			const project = deps.resolve(c, c.req.param("project"));
			if ("response" in project) return project.response;
			return c.json({ marks: await list(project.root) });
		})
		.post("/:project/set-aside/:id/put-back", (c) =>
			withMark(c, (root, designDir, mark) => {
				const target = resolveDesignPath(designDir, join(designDir, ...mark.path.split("/")), mark.path);
				const mine = markBytes(designDir, mark);
				if (mark.deleted) {
					rmSync(target, { force: true });
					pruneEmpty(designDir, dirname(target));
				} else if (mine === undefined) return c.json({ error: "mark_bytes_missing" }, 410);
				else writeAtomic(target, mine);
				forgetMarks(designDir, { id: mark.id });
				deps.changed(root);
				return c.json({});
			}),
		)
		.delete("/:project/set-aside/:id", (c) =>
			withMark(c, (root, designDir, mark) => {
				forgetMarks(designDir, { id: mark.id });
				deps.changed(root);
				return c.json({});
			}),
		);

	return {
		routes,
		/**
		 * What an agent's next command on a root says of its marks: each one it hasn't been told of, once. `said`: the
		 * command says them itself (`spool check`, `spool set-aside`), so they count as told and nothing is returned.
		 */
		async untold(root: string, said = false): Promise<string[]> {
			const marks = await list(root, true);
			const before = toldAgent.get(root) ?? new Set();
			toldAgent.set(root, new Set(marks.map((mark) => mark.id)));
			return said ? [] : marks.filter((mark) => !before.has(mark.id)).map(setAsideTold);
		},
	};
}
