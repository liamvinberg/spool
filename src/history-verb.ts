import { CONTROL_HEADER } from "./daemon/security";
import type { TeamHistorySave } from "./daemon/team-history";
import { SpoolError } from "./errors";
import { refusalOf } from "./verbs";

/**
 * `spool history <path>` (spool#114): an agent reads the team history of one file of a team project, every save to it
 * for the 90 days spool.page keeps, and with `--at` the file as it stood at a moment. Read through the daemon with
 * this Mac's device session; it prints and never writes.
 */

/** The daemon serving the project, and the project's name there. */
export interface HistoryDaemon {
	daemonUrl: string;
	name: string;
	controlToken: string;
}

/** How long the team history keeps a save, as the lines say it. */
const KEPT = "the team history keeps 90 days";
/** The most saves one page read asks for. */
const PAGE = 500;

/** A path in design/ as the team history names it: `design/` dropped, never outside the folder. */
export function historyPath(path: string): string {
	const named = path.replace(/^\.\//u, "").replace(/^design\//u, "");
	if (named === "" || named.startsWith("/") || named.split("/").some((part) => part === ".." || part === ""))
		throw new SpoolError(`${path} isn't a path in design/: name it as frames/<frame>/frame.tsx or shared/<file>`);
	return named;
}

/** A moment as an agent writes it: a date and time, the way `spool history` prints them, or any ISO time. */
export function historyMoment(value: string): number {
	const at = /^\d+$/u.test(value) ? Number(value) : Date.parse(value);
	if (!Number.isFinite(at)) throw new SpoolError(`${value} isn't a time: write it as 2026-10-21 14:02 or an ISO time`);
	return at;
}

async function read(daemon: HistoryDaemon, path: string): Promise<Response> {
	const res = await fetch(`${daemon.daemonUrl}/api/p/${encodeURIComponent(daemon.name)}/history${path}`, {
		headers: { [CONTROL_HEADER]: daemon.controlToken },
	});
	if (res.ok) return res;
	const text = await res.text();
	let answer: unknown;
	try {
		answer = JSON.parse(text);
	} catch {
		answer = undefined;
	}
	if (isRecord(answer) && typeof answer.message === "string") throw new SpoolError(answer.message);
	if (isRecord(answer) && answer.error === "unpaid")
		throw new SpoolError("the team has lapsed: its history is its admins' to read in a browser until it pays");
	if (res.status === 404 && !isRecord(answer))
		throw new SpoolError("this daemon can't read the team history yet; `spool upgrade` or restart it to catch it up");
	throw await refusalOf(new Response(text, { status: res.status }), daemon.daemonUrl);
}

/** One page of saves to a path, newest first. */
async function page(
	daemon: HistoryDaemon,
	path: string,
	more: Record<string, number>,
): Promise<{ saves: TeamHistorySave[]; next: number | null }> {
	const query = new URLSearchParams({ path, limit: String(PAGE) });
	for (const [key, value] of Object.entries(more)) query.set(key, String(value));
	return (await (await read(daemon, `/saves?${query}`)).json()) as { saves: TeamHistorySave[]; next: number | null };
}

/** Every save to a path in the team history, newest first, one line each: when, who, which machine, set aside. */
export async function listHistory(daemon: HistoryDaemon, path: string): Promise<string> {
	const saves: TeamHistorySave[] = [];
	let before: number | null | undefined;
	do {
		const got = await page(daemon, path, before === undefined || before === null ? {} : { before });
		saves.push(...got.saves);
		before = got.next;
	} while (before !== null);
	if (saves.length === 0) return `no saves to ${path} in the team history (${KEPT})`;
	const head = `${saves.length} save${saves.length === 1 ? "" : "s"} to ${path}, newest first (${KEPT}):`;
	return [head, ...saves.map(line)].join("\n");
}

/** One save as a line: when, who on which machine, and how it went where it didn't simply apply. */
function line(save: TeamHistorySave): string {
	const marks = [save.hash === null ? "deleted" : undefined, save.outcome === "set_aside" ? "set aside" : undefined];
	const said = marks.filter((mark) => mark !== undefined).join(", ");
	return `${stamp(save.at)}  ${save.by.name} on ${save.by.device}${said === "" ? "" : `  ${said}`}`;
}

/**
 * The bytes a path had at a moment: those of the last save applied to it at or before then. Refused, saying why, when
 * it had been deleted then or the history holds no save to it by then.
 */
export async function historyAt(daemon: HistoryDaemon, path: string, at: number): Promise<Uint8Array> {
	let before: number | null | undefined;
	do {
		const got = await page(daemon, path, {
			until: at,
			...(before === undefined || before === null ? {} : { before }),
		});
		const stood = got.saves.find((save) => save.outcome === "applied");
		if (stood !== undefined) {
			if (stood.hash === null)
				throw new SpoolError(
					`${path} didn't exist at ${stamp(at)}: ${stood.by.name} deleted it at ${stamp(stood.at)}`,
				);
			return new Uint8Array(await (await read(daemon, `/blobs/${stood.hash}`)).arrayBuffer());
		}
		before = got.next;
	} while (before !== null);
	throw new SpoolError(`${path} didn't exist at ${stamp(at)}: no save to it by then in the team history (${KEPT})`);
}

/** A time as the lines print it, on this machine's clock: 2026-10-21 14:02:05. */
export function stamp(at: number): string {
	const date = new Date(at);
	const two = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(
		date.getMinutes(),
	)}:${two(date.getSeconds())}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
