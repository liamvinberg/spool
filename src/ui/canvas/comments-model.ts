import { type Comment, isOpenComment } from "../../team-sync-protocol";

/*
 * What the canvas makes of a team project's comments for one person (spool#170), as data: which are unread for
 * them, which are for them, what the inbox lists and how it groups them, which pins gather into a count, and where
 * a comment's words mention someone. Nothing here draws.
 */

/** Pins whose tips stand closer than this on screen gather into one count. */
export const CLUSTER = 32;

/** Who reads: their account, and when they last read each comment they have read. */
export interface Reader {
	me: string | null;
	reads: Readonly<Record<string, number>>;
}

/** The messages of a comment this person reads: the first, then its replies, a draft only for whom it waits. */
function messagesOf(comment: Comment, me: string | null) {
	return [comment, ...comment.replies.filter((reply) => reply.draftFor === null || reply.draftFor === me)];
}

/**
 * Unread for this person: it, or a reply under it, came after they last read it and wasn't theirs. An edit is no
 * news, and their own words never are.
 */
export function isUnread(comment: Comment, reader: Reader): boolean {
	const read = reader.reads[comment.id] ?? Number.NEGATIVE_INFINITY;
	return messagesOf(comment, reader.me).some(
		(message) => message.author.accountId !== reader.me && message.created > read,
	);
}

/**
 * For this person: it mentions them, or they wrote it or replied in it, or someone outside the team wrote it through
 * a share they made (spool#174).
 */
export function isForYou(comment: Comment, me: string | null): boolean {
	if (me === null) return false;
	if (comment.share?.by === me && messagesOf(comment, me).some((message) => message.outsider === true)) return true;
	return messagesOf(comment, me).some(
		(message) =>
			message.author.accountId === me || (message.mentions ?? []).some((person) => person.accountId === me),
	);
}

/** Resolved, or as good as: a comment on a deleted page stands only under Resolved. */
export function isClosed(comment: Comment): boolean {
	return !isOpenComment(comment);
}

/** When the last word in it was said: its newest message. */
export function lastSaid(comment: Comment): number {
	return Math.max(comment.created, ...comment.replies.map((reply) => reply.created));
}

export type Show = "all" | "unread" | "yours";
export type Scope = "page" | "project";
export type GroupBy = "frame" | "page";
export type Sort = "newest" | "unread";

/** The inbox's filters. */
export interface Filters {
	show: Show;
	scope: Scope;
	groupBy: GroupBy;
	sort: Sort;
	/** the Resolved switch */
	resolved: boolean;
}

export const FILTERS: Filters = { show: "all", scope: "page", groupBy: "frame", sort: "newest", resolved: false };

/** The comments in scope: this page's, or the whole project's. */
export function inScope(comments: readonly Comment[], scope: Scope, page: string): Comment[] {
	return comments.filter((comment) => scope === "project" || comment.page === page);
}

/** What the filters leave, in the order the sort puts them: the newest word first, or the unread before it. */
export function listed(comments: readonly Comment[], filters: Filters, reader: Reader, page: string): Comment[] {
	const shown = inScope(comments, filters.scope, page).filter((comment) => {
		if (isClosed(comment) && !filters.resolved) return false;
		if (filters.show === "unread" && !isUnread(comment, reader)) return false;
		if (filters.show === "yours" && !isForYou(comment, reader.me)) return false;
		return true;
	});
	const newest = (a: Comment, b: Comment) => lastSaid(b) - lastSaid(a);
	if (filters.sort === "unread")
		return shown.sort((a, b) => Number(isUnread(b, reader)) - Number(isUnread(a, reader)) || newest(a, b));
	return shown.sort(newest);
}

/** How many of each the inbox says: open, resolved, open and unread, open and for you. */
export function counts(comments: readonly Comment[], reader: Reader) {
	const open = comments.filter((comment) => !isClosed(comment));
	return {
		open: open.length,
		resolved: comments.length - open.length,
		unread: open.filter((comment) => isUnread(comment, reader)).length,
		yours: open.filter((comment) => isForYou(comment, reader.me)).length,
	};
}

/** A group of the inbox's rows: one frame's (or the field's), or one page's; those of a page or frame that's gone. */
export interface Group {
	key: string;
	page: string;
	/** null for a page's group, or the field's */
	frame: string | null;
	gone: "page" | "frame" | null;
	items: Comment[];
}

/** The listed comments in groups, each where its first comment falls in the list. */
export function groupsOf(comments: readonly Comment[], groupBy: GroupBy): Group[] {
	const groups: Group[] = [];
	for (const comment of comments) {
		const gone = comment.standing === "deleted-page" ? "page" : comment.standing === "deleted-frame" ? "frame" : null;
		const frame = groupBy === "page" ? null : comment.frame;
		const key = `${gone ?? ""}:${comment.page}:${frame ?? ""}`;
		let group = groups.find((each) => each.key === key);
		if (group === undefined) {
			group = { key, page: comment.page, frame, gone, items: [] };
			groups.push(group);
		}
		group.items.push(comment);
	}
	return groups;
}

/** The open comments on a page and the pages inside it, as its page object's count says them. */
export function pageCount(comments: readonly Comment[], page: string, reader: Reader) {
	const under = comments.filter(
		(comment) => !isClosed(comment) && (comment.page === page || comment.page.startsWith(`${page}/`)),
	);
	return { open: under.length, unread: under.some((comment) => isUnread(comment, reader)) };
}

/**
 * Pins in groups whose tips stand within `CLUSTER` screen pixels of another in the group, one link at a time: a
 * group of one is a pin, more is a count.
 */
export function gather<T extends { x: number; y: number }>(pins: readonly T[], within = CLUSTER): T[][] {
	const groups: T[][] = [];
	for (const pin of pins) {
		const near = groups.filter((group) =>
			group.some((other) => Math.hypot(other.x - pin.x, other.y - pin.y) < within),
		);
		const merged = [...near.flat(), pin];
		for (const group of near) groups.splice(groups.indexOf(group), 1);
		groups.push(merged);
	}
	return groups;
}

/** Where a count's pins fan out to when clicked: on an arc above its centre, in the order given. */
export function fanOut(count: number, centre: { x: number; y: number }): { x: number; y: number }[] {
	const radius = 58;
	const step = 0.62;
	const start = -Math.PI / 2 - (step * (count - 1)) / 2;
	return Array.from({ length: count }, (_, index) => ({
		x: Math.round(centre.x + Math.cos(start + step * index) * radius),
		y: Math.round(centre.y - 6 + Math.sin(start + step * index) * radius),
	}));
}

/** Someone a comment can name. */
export interface Named {
	accountId: string;
	name: string;
}

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** `@Name` for each of these people, longest first so a longer name wins over its start; null when there's none. */
function mentionPattern(people: readonly Named[]): RegExp | null {
	const names = [...new Set(people.map((person) => person.name))].filter((name) => name !== "");
	if (names.length === 0) return null;
	names.sort((a, b) => b.length - a.length);
	return new RegExp(`@(?:${names.map(literal).join("|")})(?![\\p{L}\\p{N}_])`, "gu");
}

/** Words cut where they mention one of these people, so a mention reads in the accent. */
export function mentionRuns(text: string, people: readonly Named[]): { text: string; mention: boolean }[] {
	const pattern = mentionPattern(people);
	if (pattern === null) return text === "" ? [] : [{ text, mention: false }];
	const out: { text: string; mention: boolean }[] = [];
	let last = 0;
	for (const match of text.matchAll(pattern)) {
		const at = match.index ?? 0;
		if (at > last) out.push({ text: text.slice(last, at), mention: false });
		out.push({ text: match[0], mention: true });
		last = at + match[0].length;
	}
	if (last < text.length) out.push({ text: text.slice(last), mention: false });
	return out;
}

/** The people words mention, by account: whoever of them is named `@Name` in them. */
export function mentionedIn(text: string, people: readonly Named[]): string[] {
	const pattern = mentionPattern(people);
	if (pattern === null) return [];
	const said = new Set([...text.matchAll(pattern)].map((match) => match[0].slice(1)));
	return [...new Set(people.filter((person) => said.has(person.name)).map((person) => person.accountId))];
}

/** The `@` being typed at the end of the words, and what follows it so far; null when none is. */
export function mentionAsked(text: string): { at: number; typed: string } | null {
	const asked = /(?:^|\s)@([\p{L}\p{N}_.'-]*)$/u.exec(text);
	if (asked === null) return null;
	const typed = asked[1] ?? "";
	return { at: text.length - typed.length - 1, typed };
}
