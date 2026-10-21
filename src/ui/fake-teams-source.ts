import type { BillingSummary, CloudTeam, TeamPeople, TeamSetup } from "../cloud-teams";
import {
	type ListedTeamProject,
	type LosingPerson,
	type MovePreview,
	TeamActionRefused,
	type TeamMoveOutcome,
	type TeamsSource,
} from "./team-source";

/** What a move does on this Mac, as the daemon says it: nothing on spool.page itself, which has no Mac. */
export interface FakeMac {
	commits?: string[];
	folder?: { from: string; to: string } | null;
	roots?: string[];
	committed?: string[];
	commitWaiting?: string[];
}

/**
 * A team source held in memory, for the team screens' tests: it answers from what it was given, refuses what an
 * admin-only call asks of anyone else as spool.page does, and remembers every change it was asked for.
 */
export function fakeTeamsSource(start: {
	teams: CloudTeam[];
	people?: TeamPeople;
	billing?: BillingSummary;
	setup?: TeamSetup;
	origin?: string;
	/** Each team's projects, by its address. */
	projects?: Record<string, ListedTeamProject[]>;
	/** Who a move into each team would take a project from, by the target's address. */
	losing?: Record<string, LosingPerson[]>;
	/** What a move does on this Mac; none in a browser. */
	mac?: FakeMac;
	/** How many comments each project holds, by `<team>/<project>`; none said is none. */
	comments?: Record<string, number>;
}) {
	const state = { ...start };
	const asked: string[] = [];
	const ask = (line: string) => {
		asked.push(line);
	};
	const teamOf = (address: string) => {
		const team = state.teams.find((each) => each.address === address);
		if (!team) throw new TeamActionRefused("not_found");
		return team;
	};
	const admin = (address: string) => {
		if (teamOf(address).role !== "admin") throw new TeamActionRefused("admin_required");
	};
	const listed = (address: string) => state.projects?.[address] ?? [];
	/** spool.page's refusal of a move, in its order, or null. */
	const moveRefusal = (address: string, to: string, name: string): string | null => {
		if (!/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/u.test(name)) return "invalid_input";
		if (teamOf(address).role !== "admin") return "admin_required";
		if (to === address) return "same_team";
		const target = state.teams.find((each) => each.address === to);
		if (target === undefined) return "target_not_found";
		if (target.role === "viewer") return "target_editor_required";
		if (target.billing?.state === "lapsed") return "unpaid";
		if (listed(to).some((project) => project.name === name)) return "name_taken";
		return null;
	};
	const source: TeamsSource = {
		list: async () => ({
			state: "ready",
			teams: state.teams,
			invites: [],
			mayCreateTeam: false,
			origin: state.origin ?? "https://spool.page",
		}),
		here: async () => new Map(),
		projects: async (address) => listed(address),
		cover: async () => undefined,
		commentCount: async (address, project) => state.comments?.[`${address}/${project}`] ?? 0,
		movePreview: async (address, project, to, name = project) => {
			ask(`preview ${address}/${project} ${to} ${name}`);
			teamOf(address);
			const preview: MovePreview = {
				losing: state.losing?.[to] ?? [],
				refusal: moveRefusal(address, to, name),
				commits: state.mac?.commits ?? [],
				folder: state.mac?.folder ?? null,
			};
			return preview;
		},
		move: async (address, project, to, name = project) => {
			ask(`move ${address}/${project} ${to} ${name}`);
			const refusal = moveRefusal(address, to, name);
			if (refusal !== null) throw new TeamActionRefused(refusal);
			const moving = listed(address).find((each) => each.name === project);
			const url = `${state.origin ?? "https://spool.page"}/${to}/${name}`;
			state.projects = {
				...state.projects,
				[address]: listed(address).filter((each) => each.name !== project),
				[to]: [...listed(to), { name, url, repo: moving?.repo ?? null }],
			};
			const moved: TeamMoveOutcome = {
				team: to,
				name,
				url,
				roots: state.mac?.roots ?? [],
				committed: state.mac?.committed ?? [],
				commitWaiting: state.mac?.commitWaiting ?? [],
				losing: state.losing?.[to] ?? [],
			};
			return moved;
		},
		create: async (name) => {
			ask(`create ${name}`);
			return { address: name.toLowerCase(), name };
		},
		people: async (address) => {
			const people = state.people ?? { members: [], invites: [] };
			if (teamOf(address).role === "admin") return people;
			const { seats: _seats, billing: _billing, ...everyone } = people;
			return everyone;
		},
		update: async (address, change) => {
			ask(`update ${address} ${JSON.stringify(change)}`);
			return { address: change.address ?? address, name: change.name ?? teamOf(address).name };
		},
		delete: async (address) => ask(`delete ${address}`),
		setLogo: async (address) => ask(`logo ${address}`),
		removeLogo: async (address) => ask(`remove logo ${address}`),
		invite: async (address, email, role) => {
			ask(`invite ${address} ${email} ${role}`);
			const trial = state.people?.billing;
			if (role !== "viewer" && trial?.trialEditorCap != null && (trial.trialEditors ?? 0) >= trial.trialEditorCap)
				throw new TeamActionRefused("trial_editor_cap");
			// an invite sent is the setup list's fact, as spool.page counts it
			if (state.setup) {
				const was = state.setup.steps.invited;
				const counts = was === null || was === "skipped" ? { editors: 0, viewers: 0 } : was;
				const invited =
					role === "viewer"
						? { ...counts, viewers: counts.viewers + 1 }
						: { ...counts, editors: counts.editors + 1 };
				state.setup = { ...state.setup, steps: { ...state.setup.steps, invited } };
			}
			return { emailed: true };
		},
		resendInvite: async (address, invite) => {
			ask(`resend ${address} ${invite}`);
			return { emailed: true };
		},
		cancelInvite: async (address, invite) => ask(`cancel ${address} ${invite}`),
		setRole: async (address, account, role) => ask(`role ${address} ${account} ${role}`),
		removeMember: async (address, account) => ask(`remove ${address} ${account}`),
		accept: async (invite) => {
			ask(`accept ${invite}`);
			throw new TeamActionRefused("invite_closed");
		},
		decline: async (invite) => ask(`decline ${invite}`),
		billing: async (address) => {
			ask(`billing ${address}`);
			admin(address);
			if (!state.billing) throw new TeamActionRefused("not_found");
			return state.billing;
		},
		checkout: async (address, editors, cycle) => {
			ask(`checkout ${address} ${cycle} ${editors.join(",")}`);
			admin(address);
			if (state.billing?.state === "free") throw new TeamActionRefused("billing_free");
			return { url: `https://checkout.stripe.test/${address}` };
		},
		portal: async (address) => {
			ask(`portal ${address}`);
			admin(address);
			if (state.billing?.state === "free" || state.billing?.plan == null)
				throw new TeamActionRefused("no_subscription");
			return { url: `https://billing.stripe.test/${address}` };
		},
		withdraw: async (address) => {
			ask(`withdraw ${address}`);
			admin(address);
			const billing = state.billing;
			if (!billing?.withdrawUntil || billing.withdrawUntil * 1000 < Date.now())
				throw new TeamActionRefused("withdrawal_closed");
			state.billing = {
				...billing,
				state: "lapsed",
				paidBefore: true,
				plan: null,
				nextCharge: null,
				withdrawUntil: null,
			};
			return { withdrawnAt: Math.floor(Date.now() / 1000), refunded: billing.plan?.amount ?? 0 };
		},
		setup: async (address) => {
			ask(`setup ${address}`);
			admin(address);
			if (!state.setup) throw new TeamActionRefused("not_found");
			return state.setup;
		},
		skipInvites: async (address) => {
			ask(`skip invites ${address}`);
			admin(address);
			if (!state.setup) throw new TeamActionRefused("not_found");
			if (state.setup.steps.invited === null)
				state.setup = { ...state.setup, steps: { ...state.setup.steps, invited: "skipped" } };
			return state.setup;
		},
		skipProjects: async (address) => {
			ask(`skip projects ${address}`);
			admin(address);
			if (!state.setup) throw new TeamActionRefused("not_found");
			if (state.setup.steps.moved === null)
				state.setup = { ...state.setup, steps: { ...state.setup.steps, moved: "skipped" } };
			return state.setup;
		},
		setupDone: async (address) => {
			ask(`setup done ${address}`);
			admin(address);
			if (!state.setup) throw new TeamActionRefused("not_found");
			state.setup = { ...state.setup, done: true };
			return state.setup;
		},
	};
	return {
		source,
		asked,
		/** What spool.page says next, as a webhook or a sweep would have changed it. */
		set(change: Partial<typeof state>) {
			Object.assign(state, change);
		},
	};
}
