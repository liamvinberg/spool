import type {
	CloudTeam,
	CloudTeamInvite,
	CloudTeamProject,
	TeamPeople,
	TeamProjectHere,
	TeamRole,
} from "../cloud-teams";
import type { CloudTeamsState } from "../daemon/cloud-teams";

/** Who is inside a team project right now, as its cover says it. */
export type HerePerson = TeamProjectHere["people"][number];

/** spool.page, or the daemon on its behalf, said no. `code` is the reason, such as `last_admin`. */
export class TeamActionRefused extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

/** A team project as its team's Projects page lists it, whichever side lists it. */
export type ListedTeamProject = Pick<CloudTeamProject, "name" | "url" | "repo">;

/**
 * Where Home's team pages read and change a team: the daemon on a Mac, which asks spool.page with the Mac's device
 * session, or spool.page itself in a browser, with the browser's own session. spool.page decides every rule; each
 * change throws `TeamActionRefused` with its reason when refused.
 */
export interface TeamsSource {
	/** This account's teams and the invites to its address. */
	list(): Promise<CloudTeamsState>;
	/** Who is inside each of a team's projects now, by project name; undefined while spool.page can't say. */
	here(address: string): Promise<ReadonlyMap<string, HerePerson[]> | undefined>;
	/** Every project in the team; undefined while spool.page can't say. */
	projects(address: string): Promise<ListedTeamProject[] | undefined>;
	create(name: string): Promise<Pick<CloudTeam, "address" | "name">>;
	people(address: string): Promise<TeamPeople>;
	update(address: string, change: { name?: string; address?: string }): Promise<Pick<CloudTeam, "address" | "name">>;
	delete(address: string): Promise<unknown>;
	setLogo(address: string, image: Blob): Promise<unknown>;
	removeLogo(address: string): Promise<unknown>;
	invite(address: string, email: string, role: TeamRole): Promise<{ emailed: boolean }>;
	resendInvite(address: string, invite: string): Promise<{ emailed: boolean }>;
	cancelInvite(address: string, invite: string): Promise<unknown>;
	setRole(address: string, account: string, role: TeamRole): Promise<unknown>;
	removeMember(address: string, account: string): Promise<unknown>;
	accept(invite: string): Promise<Pick<CloudTeam, "address" | "name" | "role">>;
	decline(invite: string): Promise<unknown>;
}

/**
 * The team API's routes under `base`, each answered as spool.page answers them: JSON, and `{ error }` with a
 * reason when refused.
 */
export function teamsAt(
	base: string,
	options: {
		fetch: (input: string, init?: RequestInit) => Promise<Response>;
		/** A logo as the far side takes it: raw bytes at spool.page, JSON through the daemon. */
		logo: (image: Blob) => Promise<{ headers: Record<string, string>; body: BodyInit }>;
	},
): TeamsSource {
	const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
		let response: Response;
		try {
			response = await options.fetch(`${base}${path}`, {
				method,
				...(body === undefined
					? {}
					: { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
			});
		} catch {
			throw new TeamActionRefused("unreachable");
		}
		return answer<T>(response);
	};
	const read = async <T>(path: string): Promise<T | undefined> => {
		try {
			const response = await options.fetch(`${base}${path}`);
			return response.ok ? ((await response.json()) as T) : undefined;
		} catch {
			return undefined;
		}
	};
	const team = (address: string) => `/teams/${encodeURIComponent(address)}`;
	return {
		async list() {
			let response: Response;
			try {
				response = await options.fetch(`${base}/teams`);
			} catch {
				return { state: "unreachable" };
			}
			const body = (await response.json().catch(() => null)) as {
				state?: unknown;
				teams?: unknown;
				invites?: unknown;
				mayCreateTeam?: unknown;
				origin?: unknown;
			} | null;
			if (response.status === 401 || body?.state === "signed-out") return { state: "signed-out" };
			if (!response.ok || !Array.isArray(body?.teams) || !Array.isArray(body.invites))
				return { state: "unreachable" };
			return {
				state: "ready",
				teams: body.teams as CloudTeam[],
				invites: body.invites as CloudTeamInvite[],
				mayCreateTeam: body.mayCreateTeam === true,
				// the daemon says where spool.page is; spool.page itself is where this page is
				origin: typeof body.origin === "string" ? body.origin : location.origin,
			};
		},
		async here(address) {
			const body = await read<{ projects?: unknown }>(`${team(address)}/here`);
			if (!Array.isArray(body?.projects)) return undefined;
			return new Map((body.projects as TeamProjectHere[]).map((project) => [project.name, project.people]));
		},
		async projects(address) {
			const body = await read<{ projects?: unknown }>(`${team(address)}/projects`);
			return Array.isArray(body?.projects) ? (body.projects as ListedTeamProject[]) : undefined;
		},
		create: (name) => call("POST", "/teams", { name }),
		people: (address) => call("GET", `${team(address)}/people`),
		update: (address, change) => call("PATCH", team(address), change),
		delete: (address) => call("DELETE", team(address)),
		async setLogo(address, image) {
			let response: Response;
			try {
				response = await options.fetch(`${base}${team(address)}/logo`, {
					method: "PUT",
					...(await options.logo(image)),
				});
			} catch {
				throw new TeamActionRefused("unreachable");
			}
			return answer(response);
		},
		removeLogo: (address) => call("DELETE", `${team(address)}/logo`),
		invite: (address, email, role) => call("POST", `${team(address)}/invites`, { email, role }),
		resendInvite: (address, invite) => call("POST", `${team(address)}/invites/${encodeURIComponent(invite)}/resend`),
		cancelInvite: (address, invite) => call("DELETE", `${team(address)}/invites/${encodeURIComponent(invite)}`),
		setRole: (address, account, role) =>
			call("PATCH", `${team(address)}/members/${encodeURIComponent(account)}`, { role }),
		removeMember: (address, account) => call("DELETE", `${team(address)}/members/${encodeURIComponent(account)}`),
		accept: (invite) => call("POST", `/invites/${encodeURIComponent(invite)}/accept`),
		decline: (invite) => call("POST", `/invites/${encodeURIComponent(invite)}/decline`),
	};
}

async function answer<T>(response: Response): Promise<T> {
	const parsed = (await response.json().catch(() => null)) as (T & { error?: unknown }) | null;
	if (!response.ok) throw new TeamActionRefused(typeof parsed?.error === "string" ? parsed.error : "unreachable");
	return parsed as T;
}

/** A logo as the daemon takes it: its bytes in base64, in JSON. */
export async function base64Logo(image: Blob): Promise<{ headers: Record<string, string>; body: string }> {
	const bytes = new Uint8Array(await image.arrayBuffer());
	let binary = "";
	for (let start = 0; start < bytes.length; start += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
	return { headers: { "content-type": "application/json" }, body: JSON.stringify({ data: btoa(binary) }) };
}
