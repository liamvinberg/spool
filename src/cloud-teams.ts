import { authorizedCloudRequest, type CloudRequestOptions } from "./cloud-auth";
import { SpoolError } from "./errors";
import { SEEN_FILES, type SeenAnswer } from "./team-sync-protocol";

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
	/**
	 * Where the team stands with paying, said to every member. Absent from a spool.page that predates billing.
	 * `hadTime` is false for a team that never had a trial or a subscription, so a lapse is "isn't paid for yet"
	 * rather than "gone local"; a spool.page that doesn't say it means true.
	 */
	billing?: { state: BillingState; hadTime?: boolean };
}

/**
 * A team's billing state. `lapsed` is no paid time left: a trial ended unpaid, payments stopped, a cancel ran out,
 * or a team started by an account whose trial was used.
 */
export type BillingState = "free" | "trial" | "paying" | "failing" | "ending" | "lapsed";

export type BillingCycle = "monthly" | "yearly";

/** What Billing shows an admin. Times are unix seconds, money integer cents. */
export interface BillingSummary {
	state: BillingState;
	/** The trial's end, kept once the team pays within it. */
	trialEndsAt: number | null;
	/** False for a team that started lapsed: it is paid for from the start, never "gone local". */
	hadTime: boolean;
	/** True once the team has had a paid invoice: a lapse is then "gone local", not the trial's end. Absent before DEV-276. */
	paidBefore?: boolean;
	/** A seat's price: monthly a month, yearly a year. */
	prices: { currency: "usd"; monthly: number; yearly: number };
	/** `amount` is per cycle, before VAT. */
	plan: null | { seats: number; cycle: BillingCycle; amount: number };
	nextCharge: null | { at: number; amount: number };
	card: null | { brand: string; last4: string };
	billingEmail: string | null;
	periodEnd: number | null;
	cancelAt: number | null;
	failingSince: number | null;
	lapsesAt: number | null;
}

/**
 * A new team's setup list, for its admins, read from facts where they exist. Only Skip and done are stored; the rest
 * is what spool.page sees: invites sent, a Mac signed in by a member, a team project.
 */
export interface TeamSetup {
	/** Set up for good: the list never shows again. */
	done: boolean;
	steps: {
		/** Always done: `spool.page/<address>`. */
		named: { address: string };
		/** Only for a team that started lapsed, its creator's trial used: "Pay for <team>" comes second. */
		pay: null | { paid: boolean };
		/** Invites ever sent, in any state, or skipped. */
		invited: null | { editors: number; viewers: number } | "skipped";
		/** The member whose Mac signed in first, once one has. */
		mac: null | { name?: string; email: string };
		/** The team's first project, once it has one; or skipped, to start with a new project or none yet. */
		moved: null | { project: string } | "skipped";
	};
}

/** An open invite to this account's own address. */
export interface CloudTeamInvite {
	id: string;
	team: { address: string; name: string; logo: string | null };
	role: TeamRole;
	invitedBy: string;
	expiresAt: number;
}

/** A deleted team this account is an admin of: it may still be exported until `purgeAfter`, unix seconds. */
export interface DeletedTeam {
	address: string;
	name: string;
	logo: string | null;
	purgeAfter: number;
}

export interface CloudTeams {
	teams: CloudTeam[];
	/** The deleted teams this account is an admin of, until their purge. Absent from a spool.page before #200. */
	deletedTeams?: DeletedTeam[];
	invites: CloudTeamInvite[];
	/** Until launch, a maintainer decides who may start a team. */
	mayCreateTeam: boolean;
	/** What a team this account starts begins as: its one free trial, free, or paid for from the start. */
	newTeam?: NewTeamStart;
}

export type NewTeamStart = "trial" | "free" | "paid";

export interface TeamPeople {
	/** `name` is what everyone else calls them; an older spool.page sends none (`personName`). */
	members: { accountId: string; name?: string; email: string; role: TeamRole; you: boolean }[];
	invites: {
		id: string;
		email: string;
		role: TeamRole;
		invitedBy: string;
		sentAt: number;
		expiresAt: number;
		expired: boolean;
	}[];
	/** Admins and editors, counted by spool.page. Said to admins only. */
	seats?: number;
	/** What one more seat costs and how full a trial is. Said to admins only. */
	billing?: PeopleBilling;
}

/** The facts People words its seat and cost lines from. Money in cents, a seat's price a month on its cycle. */
export interface PeopleBilling {
	state: BillingState;
	/** Null unless the team has a subscription. */
	cycle: BillingCycle | null;
	seatPrice: number | null;
	/** Yearly charges the days left at once; monthly adds them, prorated, to the next invoice. */
	charged: "now" | "next_invoice" | null;
	/** During a trial: the cap, and admins plus editors plus open admin and editor invites. */
	trialEditorCap: number | null;
	trialEditors: number | null;
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

/** A project in its team's trash (#197), as the team's admins see it: who removed it, when, and when it goes for good. */
export interface RemovedTeamProject {
	name: string;
	/** Who removed it, by name; null once their account is gone. */
	removedBy: string | null;
	/** Unix seconds. */
	removedAt: number;
	/** When it is purged, unix seconds: until then an admin can restore it. */
	purgeAt: number;
	/** Its shares, paused while it waits. */
	shares: number;
}

/** Who is inside one of a team's projects right now (DEV-197): each person once, named and in their team colour. */
export interface TeamProjectHere {
	name: string;
	url: string;
	people: { name: string; color: string }[];
}

/** Someone who loses a project that moves to a team they aren't in: what presence calls them, and their address. */
export interface MoveLoser {
	name: string;
	email: string;
}

/** What a move to another team would do now: who loses the project, and what it would be refused with, if anything. */
export interface MovePreview {
	losing: MoveLoser[];
	refusal: string | null;
}

/**
 * spool.page said no. `code` is its reason, such as `last_admin` or `team_creation_closed`; `body` is the rest of what
 * it said, such as where a moved project lives now.
 */
export class CloudTeamRefused extends SpoolError {
	constructor(
		readonly code: string,
		readonly status: number,
		readonly body: Record<string, unknown> = {},
	) {
		super(
			code === "unpaid"
				? "the team has gone local; an admin can pay for it at spool.page to sync again"
				: `spool.page refused: ${code}`,
		);
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
			const body = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
			throw new CloudTeamRefused(typeof code === "string" ? code : "unavailable", response.status, body);
		}
		return parsed as T;
	}
	const team = (address: string) => `teams/${encodeURIComponent(address)}`;
	return {
		list: () => call<CloudTeams>("GET", "teams"),
		/** `business`: the starter ticked that they're buying for their business or work; spool.page refuses a team without. */
		create: (name: string, business: boolean) =>
			call<Pick<CloudTeam, "id" | "address" | "name">>("POST", "teams", { name, business }),
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
		/** What the team pays and when. Admins only. */
		billing: (address: string) => call<BillingSummary>("GET", `${team(address)}/billing`),
		/** Stripe Checkout for the team: `editors` are the editors kept as seats; the rest become viewers once it completes. */
		checkout: (address: string, editors: string[], cycle: BillingCycle, business: boolean) =>
			call<{ url: string }>("POST", `${team(address)}/billing/checkout`, { editors, cycle, business }),
		/** Stripe's customer portal for the team's card, invoices and plan. */
		portal: (address: string) => call<{ url: string }>("POST", `${team(address)}/billing/portal`),
		/** A new team's setup list, read from its facts. Admins only. */
		setup: (address: string) => call<TeamSetup>("GET", `${team(address)}/setup`),
		/** Invite people, skipped: setting the team up alone first. */
		skipInvites: (address: string) => call<TeamSetup>("POST", `${team(address)}/setup/skip-invites`),
		/** Move a project in, skipped: starting with a new project, or none yet. */
		skipProjects: (address: string) => call<TeamSetup>("POST", `${team(address)}/setup/skip-projects`),
		/** Every step done: the list is gone for good. */
		setupDone: (address: string) => call<TeamSetup>("POST", `${team(address)}/setup/done`),
		/** Starts a team project, named from what its folder is called. Editors and admins only. */
		createProject: (address: string, name: string, repo?: string) =>
			call<CloudTeamProject>("POST", `${team(address)}/projects`, { name, ...(repo === undefined ? {} : { repo }) }),
		/** Every project in the team, whether or not this Mac holds it. */
		projects: (address: string) => call<{ projects: CloudTeamProject[] }>("GET", `${team(address)}/projects`),
		/** Who is inside each of the team's projects now, leaving out whoever asks. */
		here: (address: string) => call<{ projects: TeamProjectHere[] }>("GET", `${team(address)}/here`),
		/** Record the repo a project's code lives in, from a checkout's `origin`. Editors and admins only. */
		setRepo: (address: string, name: string, repo: string) =>
			call<CloudTeamProject>("PUT", `${team(address)}/projects/${encodeURIComponent(name)}/repo`, { repo }),
		/** Who would lose a project moved to `to` (as `name`, its own unless given), and what the move would be refused with. */
		previewMove: (address: string, name: string, to: string, as?: string) =>
			call<MovePreview>(
				"GET",
				`${team(address)}/projects/${encodeURIComponent(name)}/move?${new URLSearchParams({ to, ...(as === undefined ? {} : { name: as }) })}`,
			),
		/** The same project, its id and history kept, to another team (and another name); its old address forwards. Admins only. */
		moveProject: (address: string, name: string, to: string, as?: string) =>
			call<CloudTeamProject & { losing: MoveLoser[] }>(
				"POST",
				`${team(address)}/projects/${encodeURIComponent(name)}/move`,
				{ to, ...(as === undefined ? {} : { name: as }) },
			),
		/**
		 * The project leaves the team for its trash, every copy ending; it can be restored for 30 days. Moved out, its
		 * address says so to the team. Admins only.
		 */
		deleteProject: (address: string, name: string, options: { out?: boolean } = {}) =>
			call<null>(
				"DELETE",
				`${team(address)}/projects/${encodeURIComponent(name)}${options.out === true ? "?out=1" : ""}`,
			),
		/** The team's trash: its removed projects, latest first. Admins only. */
		removed: (address: string) => call<{ projects: RemovedTeamProject[] }>("GET", `${team(address)}/removed`),
		/** A removed project back in the team, with everything it kept. Admins only; refused while the team is unpaid. */
		restore: (address: string, name: string) =>
			call<CloudTeamProject>("POST", `${team(address)}/removed/${encodeURIComponent(name)}/restore`),
		/** A removed project deleted now, rather than after its 30 days. Admins only. */
		deleteRemoved: (address: string, name: string) =>
			call<null>("DELETE", `${team(address)}/removed/${encodeURIComponent(name)}`),
		/** How many comments a team project holds: what waits in the trash with it if it leaves the team. */
		commentCount: (address: string, name: string) =>
			call<{ comments: number }>("GET", `${team(address)}/projects/${encodeURIComponent(name)}/comments/count`),
		/**
		 * Whether the team has, had or never had each of these files at their paths (spool#193), asked in batches of
		 * `SEEN_FILES`: what Get it reads before a design/ spool never synced first connects. Editors only.
		 */
		seen: async (address: string, name: string, files: readonly SeenAsk[]): Promise<SeenAnswer> => {
			const answered: SeenAnswer = { files: [], held: 0 };
			for (let at = 0; at === 0 || at < files.length; at += SEEN_FILES) {
				const part = await call<SeenAnswer>(
					"POST",
					`${team(address)}/projects/${encodeURIComponent(name)}/history/seen`,
					{ files: files.slice(at, at + SEEN_FILES) },
				);
				// an answer that isn't one is a spool.page that can't say, as one with no such route
				if (!Array.isArray(part.files) || typeof part.held !== "number")
					throw new CloudTeamRefused("invalid_answer", 502);
				answered.files.push(...part.files);
				answered.held = part.held;
			}
			return answered;
		},
		/**
		 * One team project, and this account's role in its team: what a local copy asks after a close or a refused
		 * connect. `standing` is `unpaid` while the team has gone local, whatever the role.
		 */
		project: (address: string, name: string) =>
			call<CloudTeamProject & { role: TeamRole; standing?: "unpaid" }>(
				"GET",
				`${team(address)}/projects/${encodeURIComponent(name)}`,
			),
	};
}

export type CloudTeamsClient = ReturnType<typeof cloudTeams>;

/** One file a Mac holds, asked of the team's history: its design-relative path and its bytes' sha256. */
export interface SeenAsk {
	path: string;
	hash: string;
}
