/**
 * Shares of a project's pages, as spool.page tells them and every surface shows them: the Shared control on the
 * Mac's canvas and on the browser canvas, and the sheet a share starts from. A share belongs to its project (its
 * team's, or a solo project's own account), shows a set of pages to outsiders, and is either named people, who
 * sign in, or anyone with its link. Pure, so the canvas, the viewer and the daemon spell it alike.
 */
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

/** What a new share asks for. */
export interface ShareRequest {
	kind: ShareKind;
	pages: string[];
	people?: string[];
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
