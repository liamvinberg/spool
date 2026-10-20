import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { commentRefusalSays } from "../../team-comments-heard";
import { type Comment, type CommentRefusal, commentRefusal } from "../../team-sync-protocol";
import type { CommentAct, CommentChanged, CommentMentionable, CommentSent, CommentsClient, CommentWrite } from "../api";
import type { Point } from "../canvas/camera";
import { type CanvasStore, createCanvasStore, useCanvasField } from "../canvas/canvas-store";
import type { CommentStills } from "../canvas/comment-history";
import type { CommentDraft, CommentsContext } from "../canvas/comments-layer";
import { counts, inScope, isUnread, type Reader } from "../canvas/comments-model";
import { CommentsPane } from "../canvas/comments-pane";
import { PaneActionsSlot } from "../canvas/pane-window";
import { type PickedHit, parseFrameMessage, pickMessage } from "../canvas/protocol";
import { CloseIcon, CommentIcon, CommentToolIcon, SelectIcon } from "../icons";
import { IconButton, ToolGroup } from "../primitives/actions";
import { Kbd } from "../primitives/display";
import { Bar, Panel } from "../primitives/structure";
import type { ViewerProject } from "./source";
import type { ViewerPresence } from "./viewer-presence";

/**
 * Comments on the browser canvas at spool.page (spool#173), for a member: the Mac's own pins, card, composer and
 * Comments list, written straight to spool.page and heard on the canvas's presence socket. The browser's tools are
 * two, Pointer (a click plays a frame, a drag pans) and Comment (C tapped, or held to borrow it), and placing a pin
 * hands back the Pointer. The list is a panel on the right, from a button by Shared.
 *
 * Where a person can't comment (an outsider today, or anyone signed out once spool#174 lets them look), the project
 * names no comments address, and none of this is drawn: `ViewerComments` is null.
 */

export type ViewerTool = "pointer" | "comment";

/** What a browser says while it can't write: its connection to spool.page is down. */
const BROWSER_OFFLINE = "Offline: comments go to spool.page, so this waits until you're connected again.";

/** How long a press must hold C before letting go hands the Pointer back: the Mac's `COMMENT_HOLD_MS`. */
const HOLD_MS = 300;
/** How long a frame has to say what is under a pin before the pin stands on the frame alone. */
const PICK_MS = 600;

/** A refusal's code as spool.page answers it, in the words the card says. */
function refusalOf(status: number, body: unknown): { error: string; message: string } {
	const code = typeof body === "object" && body !== null && "error" in body ? String(body.error) : "";
	const retryAfter =
		typeof body === "object" && body !== null && "retryAfter" in body && typeof body.retryAfter === "number"
			? body.retryAfter
			: undefined;
	const reason: CommentRefusal | undefined = status === 401 ? "signed_out" : commentRefusal(code);
	return {
		error: reason ?? (code || "failed"),
		message: commentRefusalSays(reason ?? "unavailable", "browser", retryAfter),
	};
}

/** What spool.page answered a write: its body, or the refusal in words; offline when it couldn't be reached. */
async function answered(sent: Promise<Response>): Promise<{ body: unknown } | { error: string; message: string }> {
	let response: Response;
	try {
		response = await sent;
	} catch {
		return { error: "offline", message: BROWSER_OFFLINE };
	}
	const body: unknown = await response.json().catch(() => null);
	return response.ok ? { body } : refusalOf(response.status, body);
}

/**
 * A member's browser writing comments at spool.page, as its person: a new comment is posted to `address`, a reply
 * under `<address>/<id>/replies`, and a change goes to the comment's own address. What changed is heard on the
 * socket, as every other reader hears it.
 */
export function cloudComments(address: string): CommentsClient {
	const json = { "content-type": "application/json" };
	const at = (comment: string, rest = "") => `${address}/${encodeURIComponent(comment)}${rest}`;
	const send = (url: string, init: RequestInit) => fetch(url, { credentials: "same-origin", ...init });
	const sent = async (request: Promise<Response>): Promise<CommentSent> => {
		const answer = await answered(request);
		if ("error" in answer) return answer;
		const { body } = answer;
		return typeof body === "object" && body !== null && "id" in body && typeof body.id === "string"
			? { id: body.id }
			: { error: "failed", message: commentRefusalSays("unavailable", "browser") };
	};
	return {
		post: (comment: CommentWrite) =>
			sent(send(address, { method: "POST", headers: json, body: JSON.stringify(comment) })),
		reply: (comment, body, mentions) =>
			sent(
				send(at(comment, "/replies"), { method: "POST", headers: json, body: JSON.stringify({ body, mentions }) }),
			),
		async change(comment: string, change: CommentAct): Promise<CommentChanged> {
			const reply = (id: string | undefined) => (id === undefined ? "" : `/replies/${encodeURIComponent(id)}`);
			const request =
				change.type === "edit"
					? send(at(comment, reply(change.reply)), {
							method: "PATCH",
							headers: json,
							body: JSON.stringify({ body: change.body, mentions: change.mentions }),
						})
					: change.type === "delete"
						? send(at(comment, reply(change.reply)), { method: "DELETE" })
						: send(at(comment, `/${change.type}`), { method: "POST" });
			const answer = await answered(request);
			return "error" in answer ? answer : { ok: true };
		},
	};
}

/**
 * Compare's pictures in a browser: the still a comment kept, from spool.page under the comment's own address (a
 * member's session reads it), and the frame's cover now, as the canvas shows it.
 */
export function cloudStills(address: string, covers: Readonly<Record<string, string>> | undefined): CommentStills {
	return {
		kept: (comment) => `${address}/${encodeURIComponent(comment.id)}/still`,
		now: (frame) => covers?.[frame],
	};
}

/** The team's people, whom a comment can @mention; none while spool.page can't say. */
function useViewerPeople(address: string | undefined): readonly CommentMentionable[] {
	const [people, setPeople] = useState<readonly CommentMentionable[]>([]);
	useEffect(() => {
		if (address === undefined) return;
		let live = true;
		void fetch(address, { credentials: "same-origin", headers: { accept: "application/json" } })
			.then((response) => (response.ok ? response.json() : null))
			.then((body: unknown) => {
				const members =
					typeof body === "object" && body !== null && "members" in body && Array.isArray(body.members)
						? (body.members as unknown[])
						: [];
				const read = members.flatMap((one) =>
					typeof one === "object" &&
					one !== null &&
					"accountId" in one &&
					typeof one.accountId === "string" &&
					"name" in one &&
					typeof one.name === "string"
						? [{ accountId: one.accountId, name: one.name, you: "you" in one && one.you === true }]
						: [],
				);
				if (live) setPeople(read);
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	}, [address]);
	return people;
}

/**
 * A member's comments on the browser canvas: what the presence socket said of them, who reads them, the tool and the
 * panel, and the card's way of writing. The comment fields of a canvas store (draft, open, hidden pins, filters)
 * stand here as on the Mac, so the Mac's layer and list read them unchanged.
 */
export interface ViewerComments {
	store: CanvasStore;
	comments: readonly Comment[];
	reader: Reader;
	people: readonly CommentMentionable[];
	context: CommentsContext;
	/** whether every comment has been heard since the socket opened */
	heard: boolean;
	tool: ViewerTool;
	setTool: (tool: ViewerTool) => void;
	panel: boolean;
	setPanel: (open: boolean) => void;
}

export function useViewerComments(
	project: ViewerProject,
	presence: ViewerPresence | null,
	url: string,
	notice: (message: string) => void,
): ViewerComments | null {
	const address = project.comments;
	const [store] = useState(createCanvasStore);
	const [tool, setTool] = useState<ViewerTool>("pointer");
	const [panel, setPanel] = useState(false);
	const people = useViewerPeople(address === undefined ? undefined : project.people);
	const client = useMemo(() => (address === undefined ? null : cloudComments(address)), [address]);
	const covers = project.covers;
	const stills = useMemo(() => (address === undefined ? null : cloudStills(address, covers)), [address, covers]);
	const held = presence?.comments;
	const me = project.me ?? people.find((person) => person.you)?.accountId ?? null;
	const reader = useMemo(() => ({ me, reads: held?.reads ?? {} }), [me, held?.reads]);
	const noticeRef = useRef(notice);
	noticeRef.current = notice;
	if (client === null || stills === null || presence === null || held === undefined) return null;
	return {
		store,
		comments: held.comments,
		reader,
		people,
		heard: presence.heard,
		context: {
			client,
			reader,
			people,
			online: presence.online,
			offline: BROWSER_OFFLINE,
			stills,
			url,
			// the socket says what changed, as it says it to everyone
			refresh: NOTHING,
			notice: ({ message }) => noticeRef.current(message),
		},
		tool,
		setTool,
		panel,
		setPanel,
	};
}

const NOTHING = () => {};

/**
 * A pin placed (spool#173): on a frame at the frame's own point, or on the page's field at the world point. The
 * composer opens at it at once, and what was under it is asked of the frame meanwhile, as the Mac asks. Placing hands
 * back the Pointer.
 */
export function placeComment(
	comments: ViewerComments,
	place: { page: string; frame: string | null; at: Point },
	document: HTMLIFrameElement | null,
): void {
	const draft: CommentDraft = { ...place, element: null };
	comments.store.set({ commentDraft: draft, commentOpen: null });
	comments.setTool("pointer");
	if (place.frame === null || document === null) return;
	void askPick(document, place.at).then((hit) => {
		if (hit === undefined || comments.store.get().commentDraft !== draft) return;
		const { selector, tag, outerHtml, source, generated } = hit;
		comments.store.set({ commentDraft: { ...draft, element: { selector, tag, outerHtml, source, generated } } });
	});
}

let picks = 0;

/**
 * The deepest element at a frame-local point, asked of the frame's document as the Mac's canvas asks it: undefined
 * when the frame says nothing in time, or nothing is there.
 */
function askPick(document: HTMLIFrameElement, at: Point): Promise<PickedHit | undefined> {
	const target = document.contentWindow;
	if (target === null) return Promise.resolve(undefined);
	const id = ++picks;
	return new Promise((resolve) => {
		const done = (hit: PickedHit | undefined) => {
			window.removeEventListener("message", heard);
			clearTimeout(timer);
			resolve(hit);
		};
		const heard = (event: MessageEvent) => {
			if (event.source !== target) return;
			const message = parseFrameMessage(event.data);
			if (message?.spool !== "picked" || message.id !== id) return;
			done(message.chain[message.chain.length - 1]);
		};
		const timer = setTimeout(() => done(undefined), PICK_MS);
		window.addEventListener("message", heard);
		target.postMessage(pickMessage(at.x, at.y, id), "*");
	});
}

/**
 * The comment keys, as on the Mac: C takes the Comment tool, and held it is borrowed until let go; V takes the
 * Pointer; Esc puts down the composer, then the card, then the tool; Shift+C puts every pin away and back. None of
 * them while words are being typed.
 */
export function useCommentKeys(comments: ViewerComments | null): void {
	const latest = useRef(comments);
	latest.current = comments;
	const hold = useRef<{ at: number } | null>(null);
	useEffect(() => {
		const typing = (target: EventTarget | null) =>
			target instanceof HTMLElement &&
			(target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "INPUT");
		const down = (event: KeyboardEvent) => {
			const now = latest.current;
			if (now === null || typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.code === "KeyC" && event.shiftKey) {
				event.preventDefault();
				now.store.set({ pinsHidden: !now.store.get().pinsHidden });
				return;
			}
			if (event.key === "Escape") {
				const { commentDraft, commentOpen } = now.store.get();
				if (commentDraft !== null) now.store.set({ commentDraft: null });
				else if (commentOpen !== null) now.store.set({ commentOpen: null });
				else now.setTool("pointer");
				return;
			}
			if (event.code === "KeyC" && !event.shiftKey) {
				if (event.repeat || hold.current !== null) return;
				hold.current = { at: Date.now() };
				now.setTool("comment");
				return;
			}
			if (event.code === "KeyV" && !event.shiftKey) now.setTool("pointer");
		};
		const up = (event: KeyboardEvent) => {
			if (event.code !== "KeyC") return;
			const held = hold.current;
			hold.current = null;
			// held, it was borrowed: letting go hands the Pointer back
			if (held !== null && Date.now() - held.at >= HOLD_MS) latest.current?.setTool("pointer");
		};
		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
		};
	}, []);
}

/** A tool's button, with its name, key and what it does on hover. */
function ToolButton({
	label,
	keyName,
	says,
	on,
	onClick,
	icon,
}: {
	label: string;
	keyName: string;
	says: string;
	on: boolean;
	onClick: () => void;
	icon: ReactNode;
}) {
	return (
		<IconButton
			size="lg"
			icon={icon}
			label={label}
			title={undefined}
			pressed={on}
			onClick={onClick}
			className="group"
		>
			<span className="pointer-events-none absolute -top-8 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-md border border-line-strong bg-surface-window px-2 py-1 text-secondary opacity-0 transition-opacity group-hover:opacity-100 type-detail">
				{label}
				<Kbd>{keyName}</Kbd>
				<span className="text-tertiary">{says}</span>
			</span>
		</IconButton>
	);
}

/** The browser's two tools: Pointer, which plays and pans, and Comment, which places a pin. */
export function ViewerTools({ tool, onTool }: { tool: ViewerTool; onTool: (tool: ViewerTool) => void }) {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
			<ToolGroup
				aria-label="canvas tools"
				className="pointer-events-auto"
				onPointerDown={(event) => event.stopPropagation()}
				onPointerUp={(event) => event.stopPropagation()}
			>
				<ToolButton
					label="pointer"
					keyName="V"
					says="click plays a frame"
					on={tool === "pointer"}
					onClick={() => onTool("pointer")}
					icon={<SelectIcon className="size-4" />}
				/>
				<ToolButton
					label="comment"
					keyName="C"
					says="hold to borrow"
					on={tool === "comment"}
					onClick={() => onTool(tool === "comment" ? "pointer" : "comment")}
					icon={<CommentToolIcon className="size-4" />}
				/>
			</ToolGroup>
		</div>
	);
}

/** The list's door, beside Shared: this page's open comments, and the accent's dot when something is unread. */
export function CommentsButton({
	comments,
	page,
	open,
	onClick,
}: {
	comments: ViewerComments;
	page: string;
	open: boolean;
	onClick: () => void;
}) {
	const here = counts(inScope(comments.comments, "page", page), comments.reader).open;
	const unread = comments.comments.some(
		(comment) =>
			comment.resolved === null && comment.standing !== "deleted-page" && isUnread(comment, comments.reader),
	);
	return (
		<button
			type="button"
			aria-expanded={open}
			data-comments-button=""
			data-unread={unread ? "" : undefined}
			onClick={onClick}
			className="relative flex h-7 items-center gap-2 rounded-sm border border-line-strong bg-surface-window px-2.5 text-primary transition-colors hover:bg-surface-panel aria-expanded:bg-state-selected-strong type-control"
		>
			<CommentIcon className="size-3.5" />
			Comments
			<span className="text-secondary type-detail" data-comments-count="">
				{here}
			</span>
			{unread ? (
				<span
					className="absolute -top-1 -right-1 size-2 animate-comment-pin-in rounded-full bg-accent"
					style={{ boxShadow: "0 0 0 1.5px var(--color-surface-window)" }}
				/>
			) : null}
		</button>
	);
}

/**
 * The Comments panel on the right, sliding out from the canvas's edge: the Mac's Comments list, with its own verbs in
 * the panel's head beside its close.
 */
export function CommentsPanel({
	open,
	onClose,
	children,
}: {
	open: boolean;
	onClose: () => void;
	children: ReactNode;
}) {
	const [slot, setSlot] = useState<HTMLElement | null>(null);
	return (
		<div
			className="h-full shrink-0 overflow-hidden transition-[width] duration-base ease-snap"
			style={{ width: open ? PANEL_W : 0 }}
			data-comments-panel={open ? "open" : "closed"}
			inert={!open}
		>
			<Panel side="end" className="h-full" style={{ width: PANEL_W }} aria-label="Comments">
				<Bar
					title="Comments"
					actions={
						<>
							<span ref={setSlot} className="flex items-center" />
							<IconButton size="sm" icon={<CloseIcon />} label="Close comments" onClick={onClose} />
						</>
					}
				/>
				<div className="min-h-0 flex-1">
					<PaneActionsSlot slot={slot}>{children}</PaneActionsSlot>
				</div>
			</Panel>
		</div>
	);
}

/** The panel's width: the list's segments and switch on one line. */
const PANEL_W = 360;

/** The Mac's Comments list in the panel: a row flies to its pin and opens it, and its + takes the Comment tool. */
export function ViewerCommentsList({
	comments,
	page,
	project,
	onPick,
}: {
	comments: ViewerComments;
	page: string;
	project: string;
	onPick: (comment: Comment) => void;
}) {
	const { store } = comments;
	const [filters, setFilters] = useCanvasField(store, "commentFilters");
	const [open] = useCanvasField(store, "commentOpen");
	const [pinsHidden, setPinsHidden] = useCanvasField(store, "pinsHidden");
	return (
		<CommentsPane
			comments={comments.comments}
			reader={comments.reader}
			people={comments.people}
			page={page}
			project={project}
			filters={filters}
			open={open}
			pinsHidden={pinsHidden}
			onFilters={setFilters}
			onPick={onPick}
			onNew={() => comments.setTool("comment")}
			onTogglePins={() => setPinsHidden(!pinsHidden)}
		/>
	);
}
