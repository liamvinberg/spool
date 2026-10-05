import { DEFAULT_HOST, DEFAULT_PORT } from "../daemon/loopback";

/**
 * A team project handed from spool.page to spool on this Mac. The link `spool.page/<team>/<project>` knocks on
 * the daemon the way local.spool.page does, on the address the door looks at and nowhere else, and when spool
 * answers it sends the browser to Home with the project named: Home opens this Mac's local copy of it, or shows
 * the team when there is none here yet.
 */

/** Where the knock goes: the daemon's own address on its usual port. */
export const LOCAL_SPOOL = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;

/** The search parameter that names the team project, `<team>/<project>`. */
const PARAM = "open";
const SEGMENT = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/u;

export interface HandedOver {
	team: string;
	project: string;
}

/** Where spool on this Mac opens a team project. */
export function handoverAddress({ team, project }: HandedOver): string {
	return `${LOCAL_SPOOL}/?${new URLSearchParams({ [PARAM]: `${team}/${project}` })}`;
}

/** The team project a page was handed, or nothing when it wasn't handed one. */
export function handedOver(search: string): HandedOver | null {
	const [team, project, ...rest] = (new URLSearchParams(search).get(PARAM) ?? "").split("/");
	if (team === undefined || project === undefined || rest.length > 0) return null;
	return SEGMENT.test(team) && SEGMENT.test(project) ? { team, project } : null;
}

/**
 * Whether spool answers on this Mac: its health, readable from spool.page and nothing else, says it is spool.
 * Silence, another server on the port, a browser that keeps the page from asking, and no answer within the
 * wait all read as no.
 */
export async function knock(wait = 1500): Promise<boolean> {
	try {
		const response = await fetch(`${LOCAL_SPOOL}/api/health`, {
			mode: "cors",
			cache: "no-store",
			credentials: "omit",
			redirect: "error",
			signal: AbortSignal.timeout(wait),
		});
		if (!response.ok) return false;
		const body: unknown = await response.json();
		return typeof body === "object" && body !== null && (body as { name?: unknown }).name === "spool";
	} catch {
		return false;
	}
}
