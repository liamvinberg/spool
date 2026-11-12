import { CONTROL_HEADER } from "./daemon/security";
import { type ShownSetAside, setAsideTold } from "./daemon/set-aside-routes";
import { SpoolError } from "./errors";
import { historyPath } from "./history-verb";
import { refusalOf } from "./verbs";

/**
 * `spool set-aside`: an agent's own saves to a team project that lost a collision in this local copy, listed, and each
 * settled as a person settles it on the canvas: mine puts this copy's version back as a new save, theirs lets it go.
 * Through the daemon's set-aside routes, so the canvas hears of it at once.
 */

/** The daemon serving the project, and the project's name there. */
export interface SetAsideDaemon {
	daemonUrl: string;
	name: string;
	controlToken: string;
}

async function ask(daemon: SetAsideDaemon, path: string, method = "GET"): Promise<Response> {
	const url = `${daemon.daemonUrl}/api/p/${encodeURIComponent(daemon.name)}/set-aside${path}`;
	const res = await fetch(url, { method, headers: { [CONTROL_HEADER]: daemon.controlToken } });
	if (!res.ok) throw await refusalOf(res, url);
	return res;
}

/** This copy's marks, as the daemon tells them. */
export async function readSetAside(daemon: SetAsideDaemon): Promise<ShownSetAside[]> {
	return ((await (await ask(daemon, "")).json()) as { marks: ShownSetAside[] }).marks;
}

/** Every mark, one told line each, or that there are none. */
export async function listSetAside(daemon: SetAsideDaemon): Promise<string> {
	const marks = await readSetAside(daemon);
	if (marks.length === 0) return "nothing is set aside in this copy";
	return marks.map(setAsideTold).join("\n");
}

/** Settle the mark on a path: `mine` writes this copy's version again, as a new save; `theirs` lets it go. */
export async function settleSetAside(daemon: SetAsideDaemon, path: string, side: "mine" | "theirs"): Promise<string> {
	const named = historyPath(path);
	const mark = (await readSetAside(daemon)).find((one) => one.path === named);
	if (mark === undefined)
		throw new SpoolError(`nothing is set aside at design/${named} in this copy; \`spool set-aside\` lists what is`);
	if (side === "theirs") {
		await ask(daemon, `/${encodeURIComponent(mark.id)}`, "DELETE");
		return `kept the team's design/${named}; your version is let go`;
	}
	await ask(daemon, `/${encodeURIComponent(mark.id)}/put-back`, "POST");
	return mark.deleted
		? `deleted design/${named} again: the delete goes to the team as a new save`
		: `put your design/${named} back: it goes to the team as a new save`;
}
