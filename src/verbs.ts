import { basename } from "node:path";
import { renderOrigin } from "./daemon/lifecycle";
import { describeMissingFrame, lookupFrame } from "./daemon/projection";
import type { SelectionEntry } from "./daemon/selection";
import { selectionBlock } from "./daemon/selection-block";
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

/**
 * The live selection (#23) as one block: what Liam points at, in the bytes a chat
 * turn's prompt carries for the same moment (#116).
 *
 * One rendering rather than two, because a CLI agent and the agent in the rail are
 * reading the same thing and a second dialect of it is a second thing to keep
 * true. Nothing pointed at prints nothing, which is the same emptiness the prompt
 * carries.
 */
export async function readSelection(daemonUrl: string, name: string, controlToken: string): Promise<string> {
	const body = (await apiJson(`${daemonUrl}/api/p/${encodeURIComponent(name)}/selection`, controlToken)) as {
		selection: SelectionEntry[];
	};
	return selectionBlock(body.selection);
}

/** The derived link graph: read from source, verified by witnessed sessions. */
export async function readFlows(daemonUrl: string, name: string, controlToken: string): Promise<string> {
	return pretty(await apiJson(`${daemonUrl}/api/p/${encodeURIComponent(name)}/flows`, controlToken));
}

/**
 * A player-session URL the agent drives in its own browser (#25) — walks in
 * that session are witnessed as dashed edges. The frame is checked first so
 * the printed URL never opens on a 404.
 */
export async function mintPlayerUrl(
	daemonUrl: string,
	name: string,
	frame: string,
	controlToken: string,
): Promise<string> {
	await assertFrameExists(daemonUrl, name, frame, controlToken);
	return `${daemonUrl}/play/${encodeURIComponent(name)}?frame=${encodeURIComponent(frame)}`;
}

/** A direct frame document, for browser automation without player chrome. */
export async function mintRawUrl(daemonUrl: string, name: string, frame: string, root: string): Promise<string> {
	if (lookupFrame(root, frame).kind !== "found") {
		throw new SpoolError(describeMissingFrame(frame));
	}
	return `${renderOrigin(daemonUrl)}/p/${encodeURIComponent(name)}/frames/${encodeURIComponent(frame)}`;
}

async function assertFrameExists(daemonUrl: string, name: string, frame: string, controlToken: string): Promise<void> {
	const projection = (await apiJson(`${daemonUrl}/api/p/${encodeURIComponent(name)}/frames`, controlToken)) as {
		frames: { name: string }[];
	};
	if (!projection.frames.some((entry) => entry.name === frame)) {
		throw new SpoolError(describeMissingFrame(frame));
	}
}

async function apiJson(url: string, controlToken: string): Promise<unknown> {
	const res = await fetch(url, { headers: { "X-Spool-Control": controlToken } });
	if (!res.ok) throw new SpoolError(await res.text());
	return res.json();
}

function pretty(value: unknown): string {
	return JSON.stringify(value, null, "\t");
}
