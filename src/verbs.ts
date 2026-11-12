import { basename } from "node:path";
import { holdsDeck } from "./daemon/deck/disk";
import { renderOrigin } from "./daemon/lifecycle";
import { describeMissingFrame, lookupFrame } from "./daemon/projection";
import type { SelectionEntry } from "./daemon/selection";
import { selectionBlock } from "./daemon/selection-block";
import { RefusedError, SpoolError } from "./errors";
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

/**
 * The address that plays a deck page's talk from its first slide (spool#323), or nothing for a name that is no deck
 * page. `deckOn` says whether the deck experiment is on, without which nothing plays.
 */
export function mintTalkUrl(daemonUrl: string, name: string, page: string, root: string, deckOn: boolean) {
	if (!holdsDeck(root, page)) return undefined;
	if (!deckOn) {
		throw new SpoolError(
			`${page} is a deck page, and decks are the deck experiment's, which is off here: \`spool experiments on deck\``,
		);
	}
	return `${daemonUrl}/play/${encodeURIComponent(name)}?${new URLSearchParams({ deck: page })}`;
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

/**
 * What an agent's command on a team project says first (DEV-261): each file that didn't travel and why, a pause,
 * and each of this copy's saves that was set aside, each once. Nothing when the daemon can't say, as an older one
 * can't: the verb itself goes on. The set-aside saves among the lines are told back to the daemon as printed once
 * the answer is here, so an answer given up on leaves them to the next command.
 */
export async function readUntold(
	daemonUrl: string,
	name: string,
	controlToken: string,
	/** The verb prints every set-aside save itself (`check`, `set-aside` with no path), so the lines leave them out. */
	setAsideSaid = false,
): Promise<string[]> {
	try {
		const query = setAsideSaid ? "?setAside=said" : "";
		const res = await fetch(`${daemonUrl}/api/p/${encodeURIComponent(name)}/sync/untold${query}`, {
			method: "POST",
			headers: { "X-Spool-Control": controlToken },
			signal: AbortSignal.timeout(5_000),
		});
		if (!res.ok) return [];
		const { lines, setAside } = (await res.json()) as { lines?: unknown; setAside?: unknown };
		if (Array.isArray(setAside)) await tellSetAsideTold(daemonUrl, name, controlToken, setAside);
		return Array.isArray(lines) ? lines.filter((line): line is string => typeof line === "string") : [];
	} catch {
		return [];
	}
}

/** Tell the daemon these set-aside marks were printed for the agent, so no later command says them again. */
export async function tellSetAsideTold(
	daemonUrl: string,
	name: string,
	controlToken: string,
	ids: readonly unknown[],
): Promise<void> {
	if (ids.length === 0) return;
	try {
		await fetch(`${daemonUrl}/api/p/${encodeURIComponent(name)}/set-aside/told`, {
			method: "POST",
			headers: { "X-Spool-Control": controlToken, "Content-Type": "application/json" },
			body: JSON.stringify({ ids }),
			signal: AbortSignal.timeout(5_000),
		});
	} catch {
		// not told: the next command says them again
	}
}

async function apiJson(url: string, controlToken: string): Promise<unknown> {
	const res = await fetch(url, { headers: { "X-Spool-Control": controlToken } });
	if (!res.ok) throw await refusalOf(res, url);
	return res.json();
}

/**
 * A refused control request carries the daemon it asked, so the boundary can
 * name a version skew instead of leaving it as an auth mystery (#155).
 */
export async function refusalOf(res: Response, url: string): Promise<SpoolError> {
	const message = await res.text();
	if (res.status !== 401 && res.status !== 403) return new SpoolError(message);
	return new RefusedError(message, new URL(url).origin);
}

function pretty(value: unknown): string {
	return JSON.stringify(value, null, "\t");
}
