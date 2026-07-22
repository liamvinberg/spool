import { basename } from "node:path";
import { SpoolError } from "./errors";
import { readRegistry } from "./registry";
import { resolveProjectRoot } from "./resolve";

/**
 * The read verbs (#25): thin questions to the daemon, printed for an agent.
 * Every one resolves the project git-style from the cwd and refuses roots the
 * registry does not know — registration stays init/open's alone (#4).
 */

export interface ProjectContext {
	root: string;
	name: string;
}

export function resolveRegisteredProject(spoolDir: string, cwd: string): ProjectContext {
	const root = resolveProjectRoot(cwd);
	if (root === undefined) {
		throw new SpoolError("not inside a spool project — no design/canvas.json here or above; `spool init` starts one");
	}
	if (!readRegistry(spoolDir).projects.some((project) => project.root === root)) {
		throw new SpoolError(`${root} is not registered on this machine — run \`spool open\` there first`);
	}
	return { root, name: basename(root) };
}

/** The live selection payload (#23): what Liam points at, verbatim. */
export async function readSelection(daemonUrl: string, name: string): Promise<string> {
	const body = (await apiJson(`${daemonUrl}/api/p/${encodeURIComponent(name)}/selection`)) as { selection: unknown };
	return pretty(body.selection);
}

/** The derived link graph: declared from source, walked from witnessed sessions. */
export async function readFlows(daemonUrl: string, name: string): Promise<string> {
	return pretty(await apiJson(`${daemonUrl}/api/p/${encodeURIComponent(name)}/flows`));
}

/**
 * A player-session URL the agent drives in its own browser (#25) — walks in
 * that session are witnessed as dashed edges. The frame is checked first so
 * the printed URL never opens on a 404.
 */
export async function mintPlayerUrl(daemonUrl: string, name: string, frame: string): Promise<string> {
	const projection = (await apiJson(`${daemonUrl}/api/p/${encodeURIComponent(name)}/frames`)) as {
		frames: { name: string }[];
	};
	if (!projection.frames.some((entry) => entry.name === frame)) {
		throw new SpoolError(`no frame "${frame}" — a frame is born by writing design/frames/${frame}/frame.tsx`);
	}
	return `${daemonUrl}/play/${encodeURIComponent(name)}?frame=${encodeURIComponent(frame)}`;
}

async function apiJson(url: string): Promise<unknown> {
	const res = await fetch(url);
	if (!res.ok) throw new SpoolError(await res.text());
	return res.json();
}

function pretty(value: unknown): string {
	return JSON.stringify(value, null, "\t");
}
