import { APP_PATH_SEGMENTS } from "./app-paths";

/**
 * Where Home is, as its address says: the same paths in the Mac app and at spool.page/<team>. `/<team>`,
 * `/<team>/people`, `/<team>/settings` and `/<team>/settings/billing` are a team's pages and `/account` the
 * account's own; on a Mac `/` is Your projects and `/recent` is Recent, which live on a Mac only.
 */

/** A team's pages in Home's sidebar, under the team. */
export type TeamPage = "projects" | "people" | "settings";
/** Settings' tabs: General is the team itself; Billing, for admins, is what it pays. */
export type SettingsTab = "general" | "billing";

export type HomePlace =
	| {
			team: string;
			page: TeamPage;
			/** Settings' tab; General when absent. */
			tab?: SettingsTab;
	  }
	| { team: null; page: "account" | "recent" | "own" };

/** spool.page/account, and on a Mac the account's place. `account` is reserved, so no team stands there. */
export const ACCOUNT_PLACE: HomePlace = { team: null, page: "account" };
/** Recent, on a Mac: every project on it, newest opened first. */
export const RECENT_PLACE: HomePlace = { team: null, page: "recent" };
/** Your projects, on a Mac: the projects in no team. */
export const OWN_PLACE: HomePlace = { team: null, page: "own" };

const RESERVED = new Set(APP_PATH_SEGMENTS);

/** The place a path names, or null for a path that is no place of Home's, such as a project's `/p/<name>`. */
export function placeOf(path: string): HomePlace | null {
	const [team, page, tab, ...rest] = path.split("/").filter(Boolean);
	if (team === undefined) return OWN_PLACE;
	if (page === undefined && team === "account") return ACCOUNT_PLACE;
	if (page === undefined && team === "recent") return RECENT_PLACE;
	if (RESERVED.has(team) || rest.length > 0) return null;
	if (page === undefined) return { team, page: "projects" };
	if (page === "settings" && tab === "billing") return { team, page, tab };
	if (tab !== undefined) return null;
	return page === "people" || page === "settings" ? { team, page } : null;
}

export function pathOf(place: HomePlace): string {
	if (place.team === null) return place.page === "own" ? "/" : `/${place.page}`;
	if (place.page === "settings" && place.tab === "billing") return `/${place.team}/settings/billing`;
	return place.page === "projects" ? `/${place.team}` : `/${place.team}/${place.page}`;
}
