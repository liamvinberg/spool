import { personName } from "../../person-name";
import { type ShareView, saidList } from "../../share-view";
import type { Comment } from "../../team-sync-protocol";

/**
 * Who reads a comment (spool#174): the team, or one share of the page it stands on besides. A member picks it in the
 * composer and sees every comment's; an outsider writes only to their own share and is never told another. Pure, so
 * the Mac's canvas and the browser's say it alike.
 */

/** A share a comment can be for, as the composer and the card say it: its kind and whom it names, by name. */
export interface AudienceShare {
	id: string;
	kind: "people" | "link";
	/** the people a people share names, by name; none for a link share */
	who: readonly string[];
	/** the pages it shows: a comment is for it only on one of them */
	pages: readonly string[];
}

/** A project's share as the composer's picker offers it: its people by the names spool.page gives them, as cards say. */
export function audienceOf(share: Pick<ShareView, "id" | "kind" | "people" | "names" | "pages">): AudienceShare {
	return {
		id: share.id,
		kind: share.kind,
		who: share.names ?? share.people.map((email) => personName({ email })),
		pages: share.pages,
	};
}

/** The shares a new comment on this page may be for, besides the team. */
export function audiencesOn(shares: readonly AudienceShare[], page: string): AudienceShare[] {
	return shares.filter((share) => share.pages.includes(page));
}

/** A share's name where a comment's audience is said: whom a people share names, or that it is a link's. */
export function audienceLabel(share: { kind: "people" | "link"; who: readonly string[] }): string {
	if (share.kind === "link") return "Link share";
	return share.who.length === 0 ? "Named share" : saidList(share.who);
}

/** What the picker says beside a share: its kind. */
export function audienceKind(share: { kind: "people" | "link" }): string {
	return share.kind === "link" ? "link share" : "named share";
}

/** Who outside the team reads it, as the start of a sentence. */
function outsideReaders(share: { kind: "people" | "link"; who: readonly string[] }): { who: string; one: boolean } {
	if (share.kind === "link") return { who: "Everyone signed in through the link", one: true };
	if (share.who.length === 0) return { who: "The people it names", one: false };
	return { who: saidList(share.who), one: share.who.length === 1 };
}

/** Under a member's composer on a share: who outside the team reads what they write. */
export function composerNote(share: { kind: "people" | "link"; who: readonly string[] }): string {
	const { who, one } = outsideReaders(share);
	return share.kind === "link"
		? `${who} reads this and its replies.`
		: `${who} ${one ? "reads" : "read"} this and its replies, outside the team.`;
}

/** Under a share's comment's reply field: who outside the team reads the reply. */
export function replyNote(share: { kind: "people" | "link"; who: readonly string[] }): string {
	const { who, one } = outsideReaders(share);
	return share.kind === "link"
		? `${who} reads replies.`
		: `${who} ${one ? "reads" : "read"} replies, outside the team.`;
}

/** An outsider's composer, which picks nothing: their share and the team read it. */
export function outsiderNote(team: string, share: { kind: "people" | "link"; who: readonly string[] }): string {
	if (share.kind === "link") return `The ${team} team and everyone signed in through this link read it.`;
	return `The ${team} team and ${share.who.length === 0 ? "the people this share names" : saidList(share.who)} read it.`;
}

/** The reply field's placeholder: a reply takes its comment's audience. */
export function replyPlaceholder(comment: Pick<Comment, "share">): string {
	return comment.share === undefined ? "Reply" : `Reply to ${audienceLabel(comment.share)}`;
}
