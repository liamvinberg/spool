import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { OutsideAsk, OutsideSessionView, OutsideView } from "../../daemon/outside";
import type { Unseen } from "../../daemon/seen";
import type { Harness } from "../../outside/harness";
import {
	type Camera,
	fetchOutside,
	fetchOutsideHarnesses,
	type OutsideHarness,
	openOutside,
	postOutside,
} from "../api";
import { cn } from "../cn";
import { CheckIcon } from "../icons";
import { Button } from "../primitives/actions";
import { SpinRing, StatusMark } from "../primitives/display";
import { TextAction } from "../primitives/feedback";
import { useMotionScale } from "./agent-trail";
import { type Box, toScreen } from "./camera";
import type { CameraStore } from "./camera-store";
import { Sep } from "./canvas-path";
import { UnseenMark } from "./unseen-mark";

/**
 * Agents working on this project from a terminal (task 531), on the canvas.
 *
 * Once a harness is connected its sessions are one line each at the top right, under the
 * agent's own trail: what it was asked and how far its tasks are while it works, what it
 * wants and Open <terminal> while it waits, and what it changed once it is done, one press
 * from its last message and those frames. Its hands are on the frames' name rows
 * (`frame-agents`). Before that, an agent heard running `spool` here is offered once it
 * goes quiet, in a card under the frame written last.
 */

/* ---------------------------------------------------------------- store -- */

export interface OutsideStore {
	get(): OutsideView | null;
	set(view: OutsideView): void;
	subscribe(listener: () => void): () => void;
	/** read it again, as a stream that came back does */
	refresh(): void;
}

export function createOutsideStore(project: string): OutsideStore {
	let view: OutsideView | null = null;
	const listeners = new Set<() => void>();
	const set = (next: OutsideView) => {
		view = next;
		for (const listener of listeners) listener();
	};
	return {
		get: () => view,
		set,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		refresh() {
			void fetchOutside(project).then((next) => {
				if (next !== undefined) set(next);
			});
		},
	};
}

export function useOutside(store: OutsideStore): OutsideView | null {
	return useSyncExternalStore(store.subscribe, store.get);
}

const NAMES: Record<Harness, string> = { claude: "Claude", codex: "Codex", pi: "pi" };

/** a harness in a sentence, as its own command is called */
function Name({ children }: { children: ReactNode }) {
	return <span className="font-mono text-[0.94em]">{children}</span>;
}

/* ---------------------------------------------------------------- lines -- */

/** the line's words while it waits: what it wants, or only that it does */
function waitWords(session: OutsideSessionView): string {
	return session.wants === null ? "is waiting for you" : `wants to ${session.wants}`;
}

export function OutsideLines({
	sessions,
	project,
	unseen,
	children,
	onLand,
}: {
	sessions: readonly OutsideSessionView[];
	project: string;
	/** frames nobody has looked at since they changed */
	unseen: ReadonlyMap<string, Unseen>;
	/** what stands under the lines: the ask, when it has no frame to hang from */
	children?: ReactNode;
	onLand: (frame: string) => void;
}) {
	// a finished session someone has looked over goes; a new prompt in it comes back
	const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
	const shown = sessions.filter((one) => !(one.state === "done" && seen.has(`${one.id}:${one.started}`))).slice(0, 3);
	return (
		<div data-outside-lines="" className="flex flex-col items-end gap-1">
			<AnimatePresence initial={false}>
				{shown.map((session) => (
					<OutsideLine
						key={session.id}
						session={session}
						project={project}
						unseen={unseen}
						onLand={onLand}
						onSeen={() => setSeen((was) => new Set(was).add(`${session.id}:${session.started}`))}
					/>
				))}
			</AnimatePresence>
			{children}
		</div>
	);
}

function OutsideLine({
	session,
	project,
	unseen,
	onLand,
	onSeen,
}: {
	session: OutsideSessionView;
	project: string;
	unseen: ReadonlyMap<string, Unseen>;
	onLand: (frame: string) => void;
	onSeen: () => void;
}) {
	const t = useMotionScale();
	const [open, setOpen] = useState(false);
	const [opening, setOpening] = useState(false);
	const box = useRef<HTMLDivElement | null>(null);
	const { harness, state } = session;
	const waiting = state === "waiting";
	const done = state === "done";
	const tasks =
		session.tasks.length === 0 ? null : `${session.tasks.filter((one) => one.done).length}/${session.tasks.length}`;
	const openable = done || session.tasks.length > 0;
	const unread = session.changed.some((frame) => unseen.has(frame));
	const label = waiting
		? waitWords(session)
		: (session.name ?? (done ? (session.stopped ? "stopped" : "done") : "working"));

	// a drop opened on one face closes as the line turns into another
	const face = done ? "done" : "work";
	const lastFace = useRef(face);
	useEffect(() => {
		if (lastFace.current !== face) setOpen(false);
		lastFace.current = face;
	}, [face]);

	const close = useCallback(() => {
		setOpen(false);
		if (done) onSeen();
	}, [done, onSeen]);
	useEffect(() => {
		if (!open) return;
		const away = (event: PointerEvent) => {
			if (!box.current?.contains(event.target as Node)) close();
		};
		const esc = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopImmediatePropagation();
			close();
		};
		window.addEventListener("pointerdown", away, true);
		window.addEventListener("keydown", esc, true);
		return () => {
			window.removeEventListener("pointerdown", away, true);
			window.removeEventListener("keydown", esc, true);
		};
	}, [open, close]);

	const swap = { duration: t.base, ease: [0.22, 0.61, 0.36, 1] as const };
	return (
		<motion.div
			ref={box}
			data-outside-line={session.id}
			data-outside-state={state}
			className="relative flex flex-col items-end"
			initial={{ opacity: 0, x: 10 }}
			animate={{ opacity: 1, x: 0 }}
			exit={{ opacity: 0, x: 10, transition: { duration: t.fast } }}
			transition={{ duration: t.slow, ease: [0.32, 0.72, 0, 1] }}
		>
			<span className="flex h-control-sm items-center gap-1.5 rounded-xs bg-surface-canvas">
				<button
					type="button"
					aria-expanded={openable ? open : undefined}
					aria-label={`${harness}: ${label}${tasks === null ? "" : `, ${tasks} tasks`}`}
					onClick={() => (open ? close() : openable && setOpen(true))}
					className={cn(
						"flex h-control-sm items-center whitespace-nowrap rounded-xs px-1 transition-colors duration-fast ease-out focus-ring",
						openable ? "hover:bg-state-hover-raised" : "cursor-default",
						open && "bg-state-selected",
					)}
				>
					<span className="mr-1.5 flex size-3 items-center justify-center">
						{waiting ? (
							<StatusMark status="waiting" className="[&>svg]:text-primary" />
						) : done && unread ? (
							<StatusMark status="unseen" />
						) : done ? (
							<CheckIcon className="size-3 text-tertiary" />
						) : (
							<SpinRing className="size-3 text-primary" />
						)}
					</span>
					<span className="text-primary type-value">{harness}</span>
					<span className="flex w-4 justify-center">
						<Sep />
					</span>
					<span
						key={label}
						className="inline-block max-w-[280px] animate-step-in truncate text-primary type-value motion-reduce:animate-none"
					>
						{label}
					</span>
					{!done && !waiting && tasks !== null ? (
						<span key={tasks} className="ml-2 animate-step-in text-tertiary tabular-nums type-value">
							{tasks}
						</span>
					) : done && session.changed.length > 0 ? (
						<span className="ml-2 text-tertiary tabular-nums type-value">{session.changed.length} changed</span>
					) : null}
				</button>
				{waiting && session.app !== null ? (
					<Button
						variant="primary"
						size="sm"
						loading={opening}
						className="animate-step-in motion-reduce:animate-none"
						title={`Bring ${session.app} to the front`}
						onClick={async () => {
							setOpening(true);
							await openOutside(project, session.id);
							setOpening(false);
						}}
					>
						Open {session.app}
					</Button>
				) : null}
			</span>
			<AnimatePresence>
				{open ? (
					<motion.div
						key="drop"
						data-outside-drop=""
						initial={{ opacity: 0, y: -4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -3, transition: { duration: t.fast } }}
						transition={swap}
						className="absolute top-full right-0 z-10 mt-1.5 flex w-[312px] flex-col overflow-hidden rounded-md border border-line-strong bg-surface-raised shadow-float"
					>
						{done ? (
							<Done
								session={session}
								unseen={unseen}
								onLand={(frame) => {
									close();
									onLand(frame);
								}}
							/>
						) : (
							<Tasks session={session} />
						)}
					</motion.div>
				) : null}
			</AnimatePresence>
		</motion.div>
	);
}

function Tasks({ session }: { session: OutsideSessionView }) {
	const now = session.tasks.findIndex((task) => !task.done);
	return (
		<div className="flex flex-col py-1">
			{session.tasks.map((task, index) => {
				const state = task.done ? "done" : index === now ? "now" : "next";
				return (
					<div key={task.id} className="flex h-row items-center gap-2.5 px-3">
						<span className="flex size-3 shrink-0 items-center justify-center">
							{state === "done" ? (
								<CheckIcon className="size-3 text-tertiary" />
							) : state === "now" ? (
								session.state === "waiting" ? (
									<StatusMark status="waiting" className="[&>svg]:text-primary" />
								) : (
									<SpinRing className="size-3 text-primary" />
								)
							) : (
								<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className="size-3 text-disabled">
									<circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.2" />
								</svg>
							)}
						</span>
						<span
							className={cn(
								"min-w-0 flex-1 truncate type-label",
								state === "done" ? "text-tertiary" : state === "now" ? "text-primary" : "text-secondary",
							)}
						>
							{task.subject}
						</span>
					</div>
				);
			})}
		</div>
	);
}

function Done({
	session,
	unseen,
	onLand,
}: {
	session: OutsideSessionView;
	unseen: ReadonlyMap<string, Unseen>;
	onLand: (frame: string) => void;
}) {
	return (
		<div className="flex flex-col">
			{session.said === null ? null : (
				<p className="max-h-48 overflow-y-auto whitespace-pre-line px-3 pt-2.5 pb-3 text-pretty text-secondary type-label">
					{session.said}
				</p>
			)}
			<div className={cn("flex flex-col p-1", session.said !== null && "border-line-default border-t")}>
				{session.changed.map((frame) => {
					const mark = unseen.get(frame);
					const fresh = mark !== undefined;
					return (
						<button
							key={frame}
							type="button"
							data-outside-changed={frame}
							onClick={() => onLand(frame)}
							className="flex h-row items-center gap-2 rounded-sm px-2 text-left transition-colors duration-fast ease-out hover:bg-state-hover-raised focus-ring"
						>
							<span className="flex size-3 items-center justify-center">
								{mark === undefined ? null : <UnseenMark mark={mark} />}
							</span>
							<span
								className={cn("min-w-0 flex-1 truncate type-value", fresh ? "text-primary" : "text-secondary")}
							>
								{frame}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ ask -- */

/** How long an agent has to go quiet before it is asked about: never while it works. */
export const QUIET_MS = 20_000;

type Face = "ask" | "connected" | "trust" | "later" | "never" | "gone" | { error: string };

/** What the ask card shows now, and what hangs it: kept here, since the daemon's ask goes the moment it is answered. */
export interface AskShown {
	readonly harness: Harness;
	readonly frame: string | null;
	readonly face: Face;
}

/**
 * The ask, from the daemon's offer to the card's own steps. It comes once the agent has
 * been quiet a while and the canvas's own agent isn't at work, and keeps its frame and its
 * last face until it fades.
 */
export function useOutsideAsk(view: OutsideView | null, busy: boolean) {
	const [shown, setShown] = useState<AskShown | null>(null);
	const [held, setHeld] = useState(false);
	const [now, setNow] = useState(() => Date.now());
	const ask: OutsideAsk | null = view?.ask ?? null;

	// the offer comes once it has gone quiet
	const due = ask === null ? null : ask.at + QUIET_MS;
	useEffect(() => {
		if (due === null) return;
		const wait = due - Date.now();
		if (wait <= 0) return;
		const timer = window.setTimeout(() => setNow(Date.now()), wait + 50);
		return () => window.clearTimeout(timer);
	}, [due]);
	useEffect(() => {
		if (ask === null || busy || shown !== null || due === null || now < due) return;
		setShown({ harness: ask.harness, frame: ask.frames[ask.frames.length - 1] ?? null, face: "ask" });
	}, [ask, busy, shown, due, now]);
	// connected some other way meanwhile, from Settings or the CLI: nothing left to ask
	useEffect(() => {
		if (shown?.face === "ask" && ask === null) setShown(null);
	}, [ask, shown]);

	// codex runs its hooks only once trusted, so its first hook is the trust landing
	const heard = view?.sessions.some((one) => one.harness === shown?.harness) ?? false;
	useEffect(() => {
		if (shown?.face === "trust" && heard) setShown({ ...shown, face: "connected" });
	}, [shown, heard]);

	// a line about what was said stands a moment, then the card goes; connected stays until it is read
	const face = shown?.face;
	useEffect(() => {
		if (face === undefined || face === "ask" || face === "trust" || held) return;
		const ms = face === "connected" ? (heard ? 6_000 : 30_000) : typeof face === "object" ? 6_000 : 2_600;
		const timer = window.setTimeout(() => setShown(null), ms);
		return () => window.clearTimeout(timer);
	}, [face, held, heard]);

	const answer = useCallback(
		async (act: "connect" | "later" | "disconnect") => {
			if (shown === null) return;
			if (act === "later") {
				const notNow = await postOutside(shown.harness, "later");
				setShown({ ...shown, face: notNow.ok ? (notNow.never ? "never" : "later") : { error: notNow.error } });
				return;
			}
			const result = await postOutside(shown.harness, act);
			if (!result.ok) return setShown({ ...shown, face: { error: result.error } });
			setShown({
				...shown,
				face: act === "disconnect" ? "gone" : shown.harness === "codex" ? "trust" : "connected",
			});
		},
		[shown],
	);

	const close = useCallback(() => setShown(null), []);

	return { shown, answer, setHeld, close };
}

/** the card's width on screen */
const CARD_W = 340;
/** where the card hangs off its frame's left foot, as the agent's own ask hangs */
const HANG = { below: 22, notch: 15 } as const;

/** room kept clear at the field's foot, where the tool bar stands */
const FOOT = 84;
/** the frame's name row above it, which the card never covers */
const NAME_ROW = 30;

/**
 * Where the card hangs: under the frame, or over it when there is no room under it,
 * and kept on screen either way. Its notch follows through `data-side`.
 */
function hangOutside(element: HTMLElement, frame: Box, view: Camera): void {
	const rect = toScreen(frame, view);
	const field = element.parentElement?.clientHeight ?? window.innerHeight;
	const height = element.offsetHeight;
	const below = rect.y + rect.h + HANG.below;
	const above = rect.y - NAME_ROW - HANG.below - height;
	const width = element.parentElement?.clientWidth ?? window.innerWidth;
	const lowest = Math.max(8, field - FOOT - height);
	let side: "below" | "above" | "beside" | "over";
	let x = Math.max(8, Math.min(rect.x, width - CARD_W - 8));
	let y: number;
	if (below + height <= field - FOOT) [side, y] = ["below", below];
	else if (above >= 8) [side, y] = ["above", above];
	else {
		// a frame taller than the screen: beside its foot when there is room, over it when not
		const right = rect.x + rect.w + HANG.below;
		side = right + CARD_W <= width - 8 ? "beside" : "over";
		if (side === "beside") x = right;
		y = Math.max(8, Math.min(rect.y + rect.h - height, lowest));
	}
	element.dataset.side = side;
	// the notch keeps pointing at the frame's foot when the card is pushed along to stay on screen
	element.style.setProperty(
		"--notch",
		`${Math.round(Math.max(HANG.notch, Math.min(CARD_W - 24, rect.x - x + HANG.notch)))}px`,
	);
	element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

/** The ask, hung at the frame the agent wrote last, moving with the camera without a render. */
export function OutsideAskOnFrame({
	camera,
	frame,
	children,
}: {
	camera: CameraStore;
	frame: Box;
	children: ReactNode;
}) {
	const card = useRef<HTMLDivElement | null>(null);
	const box = useRef(frame);
	box.current = frame;
	useLayoutEffect(() => {
		const place = () => {
			const view = camera.get();
			const element = card.current;
			if (element === null) return;
			if (view === null) {
				element.style.visibility = "hidden";
				return;
			}
			element.style.visibility = "";
			hangOutside(element, box.current, view);
		};
		place();
		// a face that grows or shrinks, as See change opens, may no longer fit where it hung
		const grows = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
		if (card.current !== null) grows?.observe(card.current);
		const unsubscribe = camera.subscribe(place);
		return () => {
			grows?.disconnect();
			unsubscribe();
		};
	}, [camera]);
	// a frame that moved under a still camera moves its card too
	// biome-ignore lint/correctness/useExhaustiveDependencies: the box is read through its ref
	useLayoutEffect(() => {
		const view = camera.get();
		const element = card.current;
		if (view === null || element === null) return;
		hangOutside(element, frame, view);
	}, [frame.x, frame.y, frame.w, frame.h]);
	return (
		<div
			ref={card}
			data-outside-ask-hung=""
			data-side="below"
			className="group pointer-events-auto absolute top-0 left-0 z-20"
			style={{ width: CARD_W }}
			onPointerDown={(event) => event.stopPropagation()}
			onWheel={(event) => event.stopPropagation()}
		>
			{children}
		</div>
	);
}

export function OutsideAskCard({
	shown,
	notch,
	onAnswer,
	onHeld,
	onClose,
}: {
	shown: AskShown;
	/** hung under a frame: its notch points up at it */
	notch: boolean;
	onAnswer: (act: "connect" | "later" | "disconnect") => Promise<void>;
	onHeld: (held: boolean) => void;
	onClose: () => void;
}) {
	const [busy, setBusy] = useState<"connect" | "later" | "disconnect" | null>(null);
	const [change, setChange] = useState(false);
	const act = async (which: "connect" | "later" | "disconnect") => {
		setBusy(which);
		await onAnswer(which);
		setBusy(null);
		setChange(false);
	};
	useEffect(() => onHeld(change), [change, onHeld]);
	const { harness, face } = shown;
	const key = typeof face === "object" ? "error" : face;
	return (
		<section
			data-outside-ask={key}
			aria-label={`Connect ${harness}`}
			onPointerEnter={() => onHeld(true)}
			onPointerLeave={() => onHeld(change)}
			className="relative flex animate-agent-ring-open flex-col rounded-lg border border-line-default bg-surface-panel p-4 shadow-agent-float"
			style={{ width: CARD_W }}
		>
			{notch ? (
				<>
					<span
						aria-hidden="true"
						className="-top-[6px] absolute size-[11px] rotate-45 border-line-default border-t border-l bg-surface-panel group-data-[side=above]:hidden group-data-[side=beside]:hidden group-data-[side=over]:hidden"
						style={{ left: `calc(var(--notch, ${HANG.notch}px) - 5.5px)` }}
					/>
					<span
						aria-hidden="true"
						className="-bottom-[6px] absolute hidden size-[11px] rotate-45 border-line-default border-r border-b bg-surface-panel group-data-[side=above]:block"
						style={{ left: `calc(var(--notch, ${HANG.notch}px) - 5.5px)` }}
					/>
				</>
			) : null}
			<div key={key} className="animate-step-in motion-reduce:animate-none">
				{face === "ask" ? (
					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1">
							<p className="text-pretty text-primary type-body">
								<Name>{harness}</Name> is working on this canvas from your terminal.
							</p>
							<p className="text-pretty text-secondary type-label">
								Connect it to see where it works and when it's done. spool only listens.
							</p>
						</div>
						<div className="flex items-center gap-1.5">
							<Button variant="primary" size="sm" loading={busy === "connect"} onClick={() => act("connect")}>
								Connect
							</Button>
							<Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => act("later")}>
								Not now
							</Button>
						</div>
					</div>
				) : face === "connected" ? (
					<Connected
						harness={harness}
						change={change}
						onChange={setChange}
						busy={busy}
						onDisconnect={() => act("disconnect")}
					/>
				) : face === "trust" ? (
					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1">
							<p className="text-primary type-body">
								One more step in <Name>codex</Name>
							</p>
							<p className="text-pretty text-secondary type-label">
								Codex runs new hooks once you trust them. Type this in codex.
							</p>
						</div>
						<CopyLine text="/hooks" />
						<div className="flex items-center justify-between gap-2">
							<span className="flex items-center gap-1.5 text-secondary type-detail">
								<SpinRing className="size-3" />
								waiting for codex
							</span>
							<Button variant="ghost" size="sm" onClick={onClose}>
								Close
							</Button>
						</div>
					</div>
				) : face === "later" ? (
					<p className="text-pretty text-secondary type-label">
						Asking again next week. Settings can connect it any time.
					</p>
				) : face === "gone" ? (
					<p className="text-pretty text-secondary type-label">
						Disconnected. spool took its hooks back out, and won't ask again.
					</p>
				) : face === "never" ? (
					<p className="text-pretty text-secondary type-label">
						Won't ask again. Settings can connect it any time.
					</p>
				) : (
					<p className="text-pretty text-secondary type-label">{face.error}</p>
				)}
			</div>
		</section>
	);
}

function Connected({
	harness,
	change,
	onChange,
	busy,
	onDisconnect,
}: {
	harness: Harness;
	change: boolean;
	onChange: (open: boolean) => void;
	busy: string | null;
	onDisconnect: () => void;
}) {
	const [about, setAbout] = useState<OutsideHarness | null>(null);
	useEffect(() => {
		let live = true;
		void fetchOutsideHarnesses().then((all) => {
			if (live) setAbout(all.find((one) => one.harness === harness) ?? null);
		});
		return () => {
			live = false;
		};
	}, [harness]);
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-start gap-2">
				<span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-primary">
					<CheckIcon className="size-3.5" />
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<p className="text-primary type-body">
						<Name>{harness}</Name> is connected
					</p>
					<p className="text-pretty text-secondary type-label">
						spool only listens. {NAMES[harness]}'s context and speed stay as they are.
					</p>
				</div>
			</div>
			{about === null ? null : <SeeChange about={about} open={change} onOpen={onChange} />}
			<div className="flex items-center justify-between gap-2">
				<span className="text-tertiary type-caption">Shows on its frames from its next step.</span>
				<TextAction disabled={busy !== null} onClick={onDisconnect} className="text-secondary">
					Disconnect
				</TextAction>
			</div>
		</div>
	);
}

/** The exact change, one press away: the file, and each line connecting added to it. */
export function SeeChange({
	about,
	open,
	onOpen,
}: {
	about: OutsideHarness;
	open: boolean;
	onOpen: (open: boolean) => void;
}) {
	return (
		<div className="flex flex-col rounded-sm border border-line-default">
			<button
				type="button"
				onClick={() => onOpen(!open)}
				aria-expanded={open}
				className="flex h-control-md items-center gap-2 rounded-sm px-2 text-left transition-colors duration-fast ease-out hover:bg-state-hover-raised focus-ring"
			>
				<span className="min-w-0 flex-1 truncate text-secondary type-detail">{about.file}</span>
				<span className="text-tertiary type-caption">{open ? "Hide change" : "See change"}</span>
				<svg
					viewBox="0 0 10 10"
					className={cn(
						"size-2.5 text-tertiary transition-transform duration-fast ease-out",
						open && "rotate-180",
					)}
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M2.5 4 5 6.5 7.5 4"
						stroke="currentColor"
						strokeWidth="1.3"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>
			<div
				aria-hidden={!open}
				className={cn(
					"grid transition-[grid-template-rows,opacity] duration-base ease-out motion-reduce:transition-none",
					open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
				)}
			>
				<div className="min-h-0 overflow-hidden">
					<div className="flex flex-col gap-1.5 border-line-default border-t px-2 py-2">
						<div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
							{about.lines.events.map((event) => (
								<div key={event} className="flex min-w-0 items-center gap-1.5 type-detail">
									<span className="text-tertiary">+</span>
									<span className="truncate text-secondary">{event}</span>
								</div>
							))}
						</div>
						<p className="text-pretty text-tertiary type-caption">
							{about.harness === "pi" ? (
								"One small extension file that sends these events to spool on this computer. It adds nothing to pi's context."
							) : (
								<>
									Each runs <span className="break-all text-secondary type-detail">{about.lines.runs}</span> in
									the background. It sends the event to spool on this computer and prints nothing.
								</>
							)}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

/** one command to type, copied with a press; it says so only once the copy landed */
function CopyLine({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={async () => {
				try {
					await navigator.clipboard.writeText(text);
					setCopied(true);
				} catch {}
			}}
			className="group flex h-control-md items-center justify-between rounded-sm border border-line-default px-2 transition-colors duration-fast ease-out hover:bg-state-hover-raised focus-ring"
		>
			<span className="text-primary type-value">{text}</span>
			<span
				key={copied ? "copied" : "copy"}
				className={cn(
					"animate-step-in type-caption motion-reduce:animate-none",
					copied ? "text-primary" : "text-tertiary group-hover:text-secondary",
				)}
			>
				{copied ? "Copied" : "Copy"}
			</span>
		</button>
	);
}
