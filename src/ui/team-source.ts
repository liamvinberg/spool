import type {
	BillingCycle,
	BillingSummary,
	CloudTeam,
	CloudTeamInvite,
	CloudTeamProject,
	TeamPeople,
	TeamProjectHere,
	TeamRole,
	TeamSetup,
} from "../cloud-teams";
import type { CloudTeamsState } from "../daemon/cloud-teams";

/** Who is inside a team project right now, as its cover says it. */
export type HerePerson = TeamProjectHere["people"][number];

/**
 * spool.page, or the daemon on its behalf, said no. `code` is the reason, such as `last_admin`; `said` is the
 * daemon's own sentence for it, when it gave one.
 */
export class TeamActionRefused extends Error {
	constructor(
		readonly code: string,
		readonly said?: string,
	) {
		super(code);
	}
}

/** spool.page's reasons, in Home's words. */
const SAYS: Record<string, string> = {
	last_admin: "You’re the only admin. Make someone else an admin first.",
	admin_required: "Only admins can do that.",
	already_member: "They’re already in the team.",
	invalid_mailbox: "Check the address and try again.",
	send_limit_reached: "Too many emails just now. Try again in a while.",
	address_taken: "Another team has that address.",
	address_reserved: "That address isn’t available.",
	invalid_address: "Use 2 to 40 lower-case letters, digits and hyphens.",
	invalid_name: "Give the team a name of up to 64 characters.",
	invalid_logo: "Use a PNG, JPEG, WebP or GIF.",
	logo_too_large: "Use an image under 100 KB.",
	team_creation_closed: "Creating a team isn’t open yet.",
	invite_expired: "That invite has run out. Ask for a new one.",
	invite_closed: "That invite is no longer open.",
	signed_out: "Sign in again to reach your teams.",
	billing_free: "This team is free. There’s nothing to pay.",
	already_paying: "This team is already paid for.",
	invalid_billing: "Choose monthly or yearly and try again.",
	no_subscription: "This team hasn’t paid yet, so there’s no billing to manage.",
	// with its number from People's billing where it is read: see `peopleSays`
	trial_editor_cap: "The trial holds no more editors. Pay for the team in Settings › Billing to add more.",
	unpaid: "This team has gone local. An admin can pay for it in Settings › Billing to sync again.",
};

/** What a refusal says to a person: in Home's words when it has some, else `otherwise`. */
export function teamSays(error: unknown, otherwise = "spool.page can’t be reached just now. Try again."): string {
	const code = error instanceof TeamActionRefused ? error.code : "unreachable";
	return SAYS[code] ?? otherwise;
}

/** A team project as its team's Projects page lists it, whichever side lists it. */
export type ListedTeamProject = Pick<CloudTeamProject, "name" | "url" | "repo">;

/** Someone a project's move takes it from: in the team it leaves, not in the one it joins. */
export interface LosingPerson {
	name: string;
	email: string;
}

/**
 * What moving a project to another team would do, asked before it moves: who loses it, the reason spool.page would
 * refuse it right now, and, on a Mac, the checkouts where it makes a commit and the folder it moves.
 */
export interface MovePreview {
	losing: LosingPerson[];
	refusal: string | null;
	commits: string[];
	folder: { from: string; to: string } | null;
}

/** A project moved to another team: where it is now and, on a Mac, its copies afterwards and where each commit landed. */
export interface TeamMoveOutcome {
	team: string;
	name: string;
	url: string;
	roots: string[];
	committed: string[];
	commitWaiting: string[];
	losing: LosingPerson[];
}

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
	/** A project's cover as spool.page keeps it, the still a member's Mac took; undefined while it has none. */
	cover(address: string, project: string): Promise<Blob | undefined>;
	/** How many comments a project holds, which go if it leaves the team; undefined while spool.page can't say. */
	commentCount(address: string, project: string): Promise<number | undefined>;
	/** What moving `project` to the team at `to`, as `name` when given, would do; undefined while it can't be said. */
	movePreview(address: string, project: string, to: string, name?: string): Promise<MovePreview | undefined>;
	/** The same project moves to the team at `to`, renamed when `name` is given; its old address leads on. */
	move(address: string, project: string, to: string, name?: string): Promise<TeamMoveOutcome>;
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
	/** What the team pays and when. Admins only. */
	billing(address: string): Promise<BillingSummary>;
	/** Stripe Checkout's address for paying for the team: `editors` stay editors, every other editor becomes a viewer. */
	checkout(address: string, editors: string[], cycle: BillingCycle): Promise<{ url: string }>;
	/** Stripe's customer portal's address, for the card, invoices, plan and cancelling. */
	portal(address: string): Promise<{ url: string }>;
	/** A new team's setup list, read from its facts. Admins only. */
	setup(address: string): Promise<TeamSetup>;
	/** Invite people, skipped. */
	skipInvites(address: string): Promise<TeamSetup>;
	/** Move a project in, skipped. */
	skipProjects(address: string): Promise<TeamSetup>;
	/** Every step is done: the list goes for good. */
	setupDone(address: string): Promise<TeamSetup>;
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
	const moving = (address: string, project: string) => `${team(address)}/projects/${encodeURIComponent(project)}/move`;
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
				newTeam?: unknown;
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
				...(body.newTeam === "trial" || body.newTeam === "free" || body.newTeam === "paid"
					? { newTeam: body.newTeam }
					: {}),
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
		async cover(address, project) {
			try {
				const response = await options.fetch(
					`${base}${team(address)}/projects/${encodeURIComponent(project)}/cover`,
				);
				if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/")) return undefined;
				return await response.blob();
			} catch {
				return undefined;
			}
		},
		async commentCount(address, project) {
			const body = await read<{ comments?: unknown }>(
				`${team(address)}/projects/${encodeURIComponent(project)}/comments/count`,
			);
			return typeof body?.comments === "number" ? body.comments : undefined;
		},
		async movePreview(address, project, to, name) {
			const query = new URLSearchParams({ to, ...(name === undefined ? {} : { name }) });
			const body = await read<Partial<MovePreview>>(`${moving(address, project)}?${query}`);
			if (!Array.isArray(body?.losing)) return undefined;
			// spool.page knows nothing of a Mac's folders: only the daemon says commits and a folder
			return {
				losing: body.losing,
				refusal: typeof body.refusal === "string" ? body.refusal : null,
				commits: Array.isArray(body.commits) ? body.commits : [],
				folder: body.folder ?? null,
			};
		},
		async move(address, project, to, name) {
			const moved = await call<Partial<TeamMoveOutcome> & Pick<TeamMoveOutcome, "team" | "name" | "url">>(
				"POST",
				moving(address, project),
				{ to, ...(name === undefined ? {} : { name }) },
			);
			return {
				team: moved.team,
				name: moved.name,
				url: moved.url,
				roots: moved.roots ?? [],
				committed: moved.committed ?? [],
				commitWaiting: moved.commitWaiting ?? [],
				losing: moved.losing ?? [],
			};
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
		billing: (address) => call("GET", `${team(address)}/billing`),
		checkout: (address, editors, cycle) => call("POST", `${team(address)}/billing/checkout`, { editors, cycle }),
		portal: (address) => call("POST", `${team(address)}/billing/portal`),
		setup: (address) => call("GET", `${team(address)}/setup`),
		skipInvites: (address) => call("POST", `${team(address)}/setup/skip-invites`),
		skipProjects: (address) => call("POST", `${team(address)}/setup/skip-projects`),
		setupDone: (address) => call("POST", `${team(address)}/setup/done`),
	};
}

/** spool.page refuses with its code as `error`; the daemon's own routes say a sentence there and the code beside it. */
async function answer<T>(response: Response): Promise<T> {
	const parsed = (await response.json().catch(() => null)) as (T & { error?: unknown; code?: unknown }) | null;
	if (response.ok) return parsed as T;
	const error = typeof parsed?.error === "string" ? parsed.error : undefined;
	if (typeof parsed?.code === "string") throw new TeamActionRefused(parsed.code, error);
	throw new TeamActionRefused(error ?? "unreachable");
}

/** A logo as the daemon takes it: its bytes in base64, in JSON. */
export async function base64Logo(image: Blob): Promise<{ headers: Record<string, string>; body: string }> {
	const bytes = new Uint8Array(await image.arrayBuffer());
	let binary = "";
	for (let start = 0; start < bytes.length; start += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
	return { headers: { "content-type": "application/json" }, body: JSON.stringify({ data: btoa(binary) }) };
}
