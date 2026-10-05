import { authorizedCloudRequest, type CloudRequestOptions } from "./cloud-auth";
import { SpoolError } from "./errors";

/**
 * The team API at spool.page, as this machine's device session reaches it. spool.page enforces every
 * rule (who may invite, the last admin, an invite's exact address); these calls only carry the asks.
 */
export type TeamRole = "admin" | "editor" | "viewer";

/** One team this account is in. `logo` is a data URL, or null for the letter mark. */
export interface CloudTeam {
	id: string;
	/** Where the team lives: `spool.page/<address>`. */
	address: string;
	name: string;
	role: TeamRole;
	logo: string | null;
	people: number;
}

/** An open invite to this account's own address. */
export interface CloudTeamInvite {
	id: string;
	team: { address: string; name: string; logo: string | null };
	role: TeamRole;
	invitedBy: string;
	expiresAt: number;
}

export interface CloudTeams {
	teams: CloudTeam[];
	invites: CloudTeamInvite[];
	/** Until launch, a maintainer decides who may start a team. */
	mayCreateTeam: boolean;
}

export interface TeamPeople {
	members: { accountId: string; email: string; role: TeamRole; you: boolean }[];
	invites: {
		id: string;
		email: string;
		role: TeamRole;
		invitedBy: string;
		sentAt: number;
		expiresAt: number;
		expired: boolean;
	}[];
}

/** A team project: `<origin>/<team>/<name>` is its `url`, what a local copy's spool.json holds. */
export interface CloudTeamProject {
	id: string;
	name: string;
	team: string;
	url: string;
	/** The repo its code lives in, as `host/path` from an editor's `origin`; null when nobody has said. Information only. */
	repo: string | null;
}

/** spool.page said no. `code` is its reason, such as `last_admin` or `team_creation_closed`. */
export class CloudTeamRefused extends SpoolError {
	constructor(
		readonly code: string,
		readonly status: number,
	) {
		super(`spool.page refused: ${code}`);
	}
}

export function cloudTeams(spoolDir: string, options: CloudRequestOptions = {}) {
	async function call<T>(method: string, path: string, body?: unknown, contentType = "application/json"): Promise<T> {
		const response = await authorizedCloudRequest(
			spoolDir,
			`/api/${path}`,
			{
				method,
				...(body === undefined
					? {}
					: {
							headers: { "content-type": contentType },
							body: body instanceof Uint8Array ? Buffer.from(body) : JSON.stringify(body),
						}),
			},
			options,
		);
		const text = await response.text();
		let parsed: unknown = null;
		try {
			parsed = text ? JSON.parse(text) : null;
		} catch {
			parsed = null;
		}
		if (!response.ok) {
			const code = (parsed as { error?: unknown } | null)?.error;
			throw new CloudTeamRefused(typeof code === "string" ? code : "unavailable", response.status);
		}
		return parsed as T;
	}
	const team = (address: string) => `teams/${encodeURIComponent(address)}`;
	return {
		list: () => call<CloudTeams>("GET", "teams"),
		create: (name: string) => call<Pick<CloudTeam, "id" | "address" | "name">>("POST", "teams", { name }),
		people: (address: string) => call<TeamPeople>("GET", `${team(address)}/people`),
		update: (address: string, change: { name?: string; address?: string }) =>
			call<Pick<CloudTeam, "id" | "address" | "name">>("PATCH", team(address), change),
		delete: (address: string) => call<{ purgeAfter: number }>("DELETE", team(address)),
		setLogo: (address: string, bytes: Uint8Array) =>
			call<null>("PUT", `${team(address)}/logo`, bytes, "application/octet-stream"),
		removeLogo: (address: string) => call<null>("DELETE", `${team(address)}/logo`),
		invite: (address: string, email: string, role: TeamRole) =>
			call<{ id: string; emailed: boolean }>("POST", `${team(address)}/invites`, { email, role }),
		resendInvite: (address: string, invite: string) =>
			call<{ emailed: boolean }>("POST", `${team(address)}/invites/${encodeURIComponent(invite)}/resend`),
		cancelInvite: (address: string, invite: string) =>
			call<null>("DELETE", `${team(address)}/invites/${encodeURIComponent(invite)}`),
		setRole: (address: string, account: string, role: TeamRole) =>
			call<null>("PATCH", `${team(address)}/members/${encodeURIComponent(account)}`, { role }),
		/** Removing someone else is an admin's; removing yourself is leaving. */
		removeMember: (address: string, account: string) =>
			call<null>("DELETE", `${team(address)}/members/${encodeURIComponent(account)}`),
		acceptInvite: (invite: string) =>
			call<Pick<CloudTeam, "id" | "address" | "name" | "role">>(
				"POST",
				`invites/${encodeURIComponent(invite)}/accept`,
			),
		declineInvite: (invite: string) => call<null>("POST", `invites/${encodeURIComponent(invite)}/decline`),
		/** Starts a team project, named from what its folder is called. Editors and admins only. */
		createProject: (address: string, name: string, repo?: string) =>
			call<CloudTeamProject>("POST", `${team(address)}/projects`, { name, ...(repo === undefined ? {} : { repo }) }),
		/** Every project in the team, whether or not this Mac holds it. */
		projects: (address: string) => call<{ projects: CloudTeamProject[] }>("GET", `${team(address)}/projects`),
		/** Record the repo a project's code lives in, from a checkout's `origin`. Editors and admins only. */
		setRepo: (address: string, name: string, repo: string) =>
			call<CloudTeamProject>("PUT", `${team(address)}/projects/${encodeURIComponent(name)}/repo`, { repo }),
		/** One team project, and this account's role in its team. */
		project: (address: string, name: string) =>
			call<CloudTeamProject & { role: TeamRole }>("GET", `${team(address)}/projects/${encodeURIComponent(name)}`),
	};
}

export type CloudTeamsClient = ReturnType<typeof cloudTeams>;
