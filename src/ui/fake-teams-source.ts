import type { BillingSummary, CloudTeam, TeamPeople, TeamSetup } from "../cloud-teams";
import { TeamActionRefused, type TeamsSource } from "./team-source";

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
	const source: TeamsSource = {
		list: async () => ({
			state: "ready",
			teams: state.teams,
			invites: [],
			mayCreateTeam: false,
			origin: state.origin ?? "https://spool.page",
		}),
		here: async () => new Map(),
		projects: async () => [],
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
