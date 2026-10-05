import { lstatSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { type Context, Hono } from "hono";
import { writeAtomic } from "../atomic-write";
import type { CloudRequestOptions } from "../cloud-auth";
import { cloudTeams } from "../cloud-teams";
import { isTeamProject, readProjectLink } from "../team-project";
import { realDesignDir, resolveDesignPath } from "./design-path";
import { frameOfPath } from "./events";
import { batchSize, forgetMarks, markBytes, markFile, readMarks, type SetAsideMark } from "./set-aside";
import { pruneEmpty } from "./team-sync";

/** One mark as the canvas draws it: on which frames, and whose save stands, by name where the team says. */
export interface ShownSetAside {
	id: string;
	path: string;
	kind: SetAsideMark["kind"];
	deleted: boolean;
	/** The frames that render the file; none means it is only in the summary. */
	frames: string[];
	/** The teammate whose save stands: their address, or null where spool.page couldn't say. */
	by: string | null;
	/** Where this machine's side is kept, relative to the project root, for an agent to read. */
	file: string | null;
	at: number;
	/** How many marks arrived together with this one, itself included: more than a handful are one summary. */
	together: number;
}

/** One side of a compare: the file's text, or only its size where it isn't text. Null for a delete. */
export type ComparedSide = { text: string | null; size: number } | null;

export interface SetAsideCompare {
	path: string;
	mine: ComparedSide;
	team: ComparedSide;
}

/** How long a team's addresses are trusted before spool.page is asked again. */
const NAMES_MS = 5 * 60_000;

/**
 * The canvas's side of set-aside marks (`set-aside.ts`): list them with the frames each one is on, compare a
 * mark's two sides, put this machine's side back, or let the mark go. Putting it back is an ordinary write, which
 * the sync sends as a new save on top of the team's version. Handing it to the agent is the canvas's own turn,
 * started only when pressed.
 */
export function setAsideRoutes(deps: {
	spoolDir: string;
	request?: CloudRequestOptions | undefined;
	resolve: (c: Context, name: string) => { root: string } | { response: Response };
	/** The frames whose source graph reaches a shared file, once the graph is built. */
	framesUsing: (root: string, path: string) => Promise<readonly string[] | undefined>;
	changed: (root: string) => void;
}) {
	const names = new Map<string, { at: number; emails: Map<string, string> }>();

	/** A teammate's address by account, from the team's people, remembered a while. */
	const nameOf = async (team: string, accountId: string): Promise<string | null> => {
		let known = names.get(team);
		if (known === undefined || Date.now() - known.at > NAMES_MS || !known.emails.has(accountId)) {
			try {
				const { members } = await cloudTeams(deps.spoolDir, deps.request).people(team);
				known = { at: Date.now(), emails: new Map(members.map((member) => [member.accountId, member.email])) };
				names.set(team, known);
			} catch {
				// unreachable or signed out: the mark says "a teammate" instead
			}
		}
		return known?.emails.get(accountId) ?? null;
	};

	const framesOf = async (root: string, designDir: string, path: string): Promise<string[]> => {
		const owner = frameOfPath(designDir, path.split("/"));
		if (owner !== undefined) return [owner.frame];
		if (!path.startsWith("shared/")) return [];
		return [...((await deps.framesUsing(root, path)) ?? [])];
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

	return new Hono()
		.get("/:project/set-aside", async (c) => {
			const project = deps.resolve(c, c.req.param("project"));
			if ("response" in project) return project.response;
			if (!isTeamProject(project.root)) return c.json({ marks: [] });
			const designDir = realDesignDir(project.root);
			const team = readProjectLink(project.root).team;
			const marks: ShownSetAside[] = [];
			for (const mark of readMarks(designDir))
				marks.push({
					id: mark.id,
					path: mark.path,
					kind: mark.kind,
					deleted: mark.deleted,
					frames: await framesOf(project.root, designDir, mark.path),
					by: mark.by === null ? null : await nameOf(team, mark.by.accountId),
					file: mark.deleted ? null : relative(project.root, markFile(designDir, mark)).split("\\").join("/"),
					at: mark.at,
					together: batchSize(designDir, mark.batch),
				});
			return c.json({ marks });
		})
		.get("/:project/set-aside/:id", (c) =>
			withMark(c, (_root, designDir, mark) => {
				const compared: SetAsideCompare = {
					path: mark.path,
					mine: side(markBytes(designDir, mark)),
					team: side(readDesign(designDir, mark.path)),
				};
				return c.json(compared);
			}),
		)
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
}

/** The team's side, as it is on disk: the sync wrote it there. */
function readDesign(designDir: string, path: string): Buffer | undefined {
	const file = resolveDesignPath(designDir, join(designDir, ...path.split("/")), path);
	return lstatSync(file, { throwIfNoEntry: false })?.isFile() === true ? readFileSync(file) : undefined;
}

function side(bytes: Buffer | undefined): ComparedSide {
	if (bytes === undefined) return null;
	let text: string | null = null;
	try {
		if (!bytes.includes(0)) text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		// an image or any other file that isn't text is compared by size
	}
	return { text, size: bytes.byteLength };
}
