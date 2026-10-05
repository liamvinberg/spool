/**
 * Shares of a project's pages, as spool.page tells them and every surface shows them: the Shared control on the
 * Mac's canvas and on the browser canvas, and the sheet a share starts from. A share belongs to its project (its
 * team's, or a solo project's own account), shows a set of pages to outsiders, and is either named people, who
 * sign in, or anyone with its link. Pure, so the canvas, the viewer and the daemon spell it alike.
 */
import { pageName, ROOT_PAGE } from "./page-path";

export type ShareKind = "people" | "link";

export interface ShareView {
	id: string;
	kind: ShareKind;
	/** The page paths it shows. */
	pages: string[];
	/** Whom a people share names, by address; none for a link share. */
	people: string[];
	/** Who made it, by address. */
	by: string;
	/** When it was made, in seconds. */
	at: number;
	/** How many times it has been opened. */
	opens: number;
	/** Where it is opened; only for those who may change it. A viewer sees the rows and never the link. */
	link?: string;
}

/** What a project's Shared control knows: its shares and whether this person may change them, or why not. */
export type ProjectShares =
	| { state: "ready"; shares: ShareView[]; manage: boolean }
	/** Nobody is signed in to spool.page on this Mac, so it can't share. */
	| { state: "signed-out" }
	/** spool.page did not answer just now. */
	| { state: "unreachable" }
	/** This project can't share from here: a team project that ended on this Mac, or one on another cloud. */
	| { state: "unavailable" };

/**
 * Where a project's shares are read and changed from: the daemon on a Mac, spool.page in a browser. A change or a
 * stop answers spool.page's reason when it refused, or null.
 */
export interface SharesSource {
	read(): Promise<ProjectShares>;
	change(share: string, change: { add?: string[]; remove?: string[] }): Promise<string | null>;
	stop(share: string): Promise<string | null>;
}

/** What a new share asks for. */
export interface ShareRequest {
	kind: ShareKind;
	pages: string[];
	people?: string[];
}

/** How a share names the root page, which has no folder to name it. */
export const TOP_PAGE = "the top page";

/** A shared page as a share's sheet and line say it: its own name, or the top page. */
export function sharedPageName(page: string): string {
	return page === ROOT_PAGE ? TOP_PAGE : pageName(page);
}

/** A person as their address is said aloud: its first part, `kim` for kim.berg@client.com. */
export function personName(email: string): string {
	return email.split(/[.@]/u)[0] || email;
}

/** "kim and ola", "kim, ola and sam", or "anyone with the link": whom a share is for, as its row says it. */
export function shareWho(share: Pick<ShareView, "kind" | "people">): string {
	if (share.kind === "link") return "anyone with the link";
	return saidList(share.people.map(personName));
}

/** A list said as a sentence says it: "a", "a and b", "a, b and c". */
export function saidList(names: readonly string[]): string {
	if (names.length <= 2) return names.join(" and ");
	return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** How long ago a moment was, as a share's line says it: "just now", "4 min ago", "3 hours ago", "yesterday". */
export function saidAgo(seconds: number, now = Date.now() / 1000): string {
	const minutes = Math.floor((now - seconds) / 60);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
	const days = Math.floor(hours / 24);
	if (days === 1) return "yesterday";
	if (days < 7) return `${days} days ago`;
	if (days < 30) return days < 14 ? "last week" : `${Math.floor(days / 7)} weeks ago`;
	return new Date(seconds * 1000).toLocaleDateString("en", { month: "short", day: "numeric" });
}
