import { shareOpenedAt } from "./outsider-seen";

/**
 * One canvas shared with this account by a team it isn't in, or by someone's own project in no team, as spool.page's
 * `GET /api/shared` lists it.
 */
export interface SharedWithYou {
	id: string;
	/** Where it opens: the share's own canvas at spool.page. */
	href: string;
	project: string;
	/** The team it was shared from; null for a project in no team, which only its sharer stands for. */
	team: { name: string; address: string; logo: string | null } | null;
	by: { name: string; email: string };
	sharedAt: string;
	/** The last time what it shares changed; null when it hasn't since it was shared. */
	updated: string | null;
	/** A picture of its first frame, or null while there is none. */
	cover: string | null;
}

/** What spool.page says is shared with this account: newest change first, or that the browser is signed out. */
export type SharedState = { state: "ready"; shares: SharedWithYou[] } | { state: "signed-out" };

/** Where Home reads what is shared with this account: spool.page in a browser, a stub in a test. */
export interface SharedSource {
	list(): Promise<SharedState>;
}

/** spool.page's own list, on this page's origin with this browser's session. One it can't read is an empty list. */
export const cloudShared: SharedSource = {
	async list() {
		try {
			const response = await fetch("/api/shared", { credentials: "same-origin" });
			if (response.status === 401) return { state: "signed-out" };
			if (!response.ok) return { state: "ready", shares: [] };
			const body = (await response.json()) as { shares?: SharedWithYou[] };
			return { state: "ready", shares: Array.isArray(body.shares) ? body.shares : [] };
		} catch {
			return { state: "ready", shares: [] };
		}
	},
};

/**
 * Whether a share is new to this browser: never opened here, or changed since it last was. One opened before the time
 * of an open was kept counts as seen.
 */
export function isNew(share: SharedWithYou, opened: number | null | undefined = shareOpenedAt(share.id)): boolean {
	if (opened === undefined) return true;
	if (opened === null) return false;
	return Date.parse(share.updated ?? share.sharedAt) > opened;
}

/** Who a group of shares is from: the team that shared them, or the person who shared them from no team. */
export type SharedFrom =
	| { kind: "team"; key: string; team: NonNullable<SharedWithYou["team"]> }
	| { kind: "person"; key: string; person: SharedWithYou["by"] };

/**
 * The shares by the team that shared them, and those from no team by the person who shared them, each group where its
 * newest share stands.
 */
export function byTeam(shares: readonly SharedWithYou[]): { from: SharedFrom; shares: SharedWithYou[] }[] {
	const newest = (share: SharedWithYou) => Date.parse(share.updated ?? share.sharedAt);
	const groups = new Map<string, { from: SharedFrom; shares: SharedWithYou[] }>();
	for (const share of [...shares].sort((a, b) => newest(b) - newest(a))) {
		const from: SharedFrom =
			share.team === null
				? { kind: "person", key: `person:${share.by.email}`, person: share.by }
				: { kind: "team", key: share.team.address, team: share.team };
		const group = groups.get(from.key);
		if (group === undefined) groups.set(from.key, { from, shares: [share] });
		else group.shares.push(share);
	}
	return [...groups.values()];
}

/** The name a share's sharer goes by: their name, or their address when they gave none. */
export const sharerName = (share: SharedWithYou) => share.by.name || share.by.email;
