import { useReducedMotion } from "motion/react";
import {
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Unseen } from "../../daemon/seen";
import { charWeights, matchName, runsIn, type Weight } from "../../name-match";
import { pageName } from "../../page-path";
import { coverUrl, fetchFrameWords, type ProjectedFrame } from "../api";
import { cn } from "../cn";
import { FolderIcon, SearchIcon } from "../icons";
import { Kbd } from "../primitives/display";
import { MODAL, Scrim } from "../primitives/overlays";
import { ScrollArea, StatusLine } from "../primitives/structure";
import { findKeys } from "./find-door";
import { FindPreview, fitScale, Picture } from "./find-preview";
import { ageOf, type FrameWords, findFrames, type Hit, newestFirst } from "./frame-find";
import { pageLabel, pageOf } from "./pages";
import { UnseenMark } from "./unseen-mark";

/**
 * The frame finder (finder-wake, task 443). Its door is at the end of the page
 * path (`find-door.tsx`); pressing it, `/` or ⌘K grows the finder out of the
 * door, down and left across the names, so the crumbs end up standing in its
 * head and the field starts where the magnifier was. Nothing on the path moves
 * to make room. Inside, every frame with its still, newest first until you
 * type, and the picked one large with the page it sits on under it. Arrows move
 * the pick, Enter lands the camera on it, Escape or the scrim folds the finder
 * back into the door.
 *
 * `/` because Home already binds it — "`/` is the filter's door" — and one
 * app should not teach the same idea twice; ⌘K beside it, because that is
 * the chord every other palette taught, and both spell the same door. The
 * scrim stops at the rails on purpose: it covers the canvas because the
 * canvas is what Enter is about to move, and it leaves the Pages rail at full
 * strength because the rail is answering at the same time, lighting the page
 * that holds the pick.
 *
 * A frame answers by its name, its page, or failing both what it says
 * (`frame-find.ts`). A name stays whole and in place, only its brightness moves:
 * the run-up before the first landing dims, the typed letters take the thread,
 * and everything from the first landing onward is full text, because that is
 * where the difference between two near-identical frames always lives.
 */

const TONE: Record<Weight, string> = {
	runup: "text-secondary/40",
	hit: "text-accent-strong",
	plain: "text-primary",
};

/** a project whose record says nothing shows no marks */
const EMPTY: ReadonlyMap<string, Unseen> = new Map();

/** the most the finder grows to */
const MOST = { w: 900, h: 584 };
/** the finder's corner: 8 px out from the names, so they sit in its head */
const CORNER = { x: 4, y: 4 };
/** the head's height, the names' line in the middle of it */
const HEAD = 40;
/** the tool bar's band at the canvas's foot, which the finder stops above */
const FOOT = 84;

/**
 * Something the palette can do rather than somewhere it can land: the pane
 * layout's commands ride here (#359), so ⌘K stays the one palette. They answer
 * a typed query only, under the frames, so an empty query is still every frame.
 */
export interface PaletteCommand {
	readonly id: string;
	readonly label: string;
	/** the key face beside it */
	readonly keys?: string | undefined;
	/** why it cannot run now, said in its row */
	readonly refused?: string | undefined;
	readonly run: () => void;
}

const NO_COMMANDS: readonly PaletteCommand[] = [];

function findCommands(query: string, commands: readonly PaletteCommand[]) {
	const wanted = query.trim().toLowerCase();
	if (wanted.length === 0) return [];
	return commands
		.map((command) => ({ command, found: matchName(wanted, command.label.toLowerCase()) }))
		.filter((hit): hit is { command: PaletteCommand; found: NonNullable<typeof hit.found> } => hit.found !== null)
		.sort((a, b) => b.found.score - a.found.score)
		.map((hit) => ({ command: hit.command, matched: hit.found.matched }));
}

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** what the finder is while it is open */
const DIALOG = { role: "dialog", "aria-modal": true, "aria-label": "Find a frame" } as const;

/** before the door is measured: where the path's end usually is */
const NO_DOOR: Rect = { x: 160, y: 12, w: 56, h: 24 };

export function FindPalette({
	open,
	project,
	frames,
	unseen = EMPTY,
	commands = NO_COMMANDS,
	loadWords = fetchFrameWords,
	onPick,
	onLand,
	onClose,
}: {
	open: boolean;
	project: string;
	/** every frame the finder may answer with, any order */
	frames: readonly ProjectedFrame[];
	/**
	 * What nobody has looked at (seen.ts). The finder shows the state and never
	 * clears it: a name in a list is not a frame, and Enter only takes you to where
	 * it is — what happens when you get there is the canvas's rule, not this one's.
	 * The empty query is already every frame newest first, and what an agent just
	 * wrote is what is newest, so the unseen are the rows under the caret as it opens.
	 */
	unseen?: ReadonlyMap<string, Unseen> | undefined;
	commands?: readonly PaletteCommand[] | undefined;
	/** what each frame said in its still, read again at each opening */
	loadWords?: ((project: string) => Promise<FrameWords>) | undefined;
	/** the page under the pick, so the rail can light the row holding it */
	onPick: (page: string | null) => void;
	onLand: (name: string) => void;
	onClose: () => void;
}) {
	const still = useReducedMotion() === true;
	const root = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [at, setAt] = useState(0);
	const [words, setWords] = useState<FrameWords>(() => new Map());
	// the moment it opened: ages hold still while it is up
	const [openedAt, setOpenedAt] = useState(() => Date.now());

	// what it draws inside stays while it folds back into the door, and goes once it is folded
	const [drawn, setDrawn] = useState(open);
	if (open && !drawn) setDrawn(true);
	useEffect(() => {
		if (!open && still) setDrawn(false);
	}, [open, still]);

	// each opening starts empty, at the newest frame, with what the frames say now
	useEffect(() => {
		if (!open) return;
		setQuery("");
		setAt(0);
		setOpenedAt(Date.now());
		let live = true;
		void loadWords(project).then((said) => {
			if (live) setWords(said);
		});
		return () => {
			live = false;
		};
	}, [open, project, loadWords]);

	useEffect(() => {
		if (open) inputRef.current?.focus();
		else inputRef.current?.blur();
	}, [open]);

	const fresh = useMemo(() => newestFirst(frames), [frames]);
	const hits = useMemo(() => findFrames(query, fresh, words), [query, fresh, words]);
	const doing = useMemo(() => findCommands(query, commands), [query, commands]);
	const picked = hits[at];
	const pickedCommand = doing[at - hits.length];
	const rows = hits.length + doing.length;
	const runCommand = (command: PaletteCommand) => {
		if (command.refused !== undefined) return;
		command.run();
		onClose();
	};

	const pickedPage = open && picked !== undefined ? pageOf(picked.frame) : null;
	useEffect(() => {
		onPick(pickedPage);
	}, [pickedPage, onPick]);

	const byPage = useMemo(() => {
		const pages = new Map<string, ProjectedFrame[]>();
		for (const frame of frames) {
			const page = pageOf(frame);
			const on = pages.get(page);
			if (on === undefined) pages.set(page, [frame]);
			else on.push(frame);
		}
		return pages;
	}, [frames]);
	const stillOf = useCallback(
		(frame: ProjectedFrame) =>
			frame.cover === undefined ? undefined : coverUrl(project, frame.name, frame.cover.hash),
		[project],
	);

	// where the door stands and how big the canvas is, read as it opens and while the canvas resizes
	const [spot, setSpot] = useState<Rect>(NO_DOOR);
	const [size, setSize] = useState({ w: 900, h: 856 });
	useLayoutEffect(() => {
		const view = root.current?.parentElement;
		if (view === null || view === undefined) return;
		const read = () => {
			const v = view.getBoundingClientRect();
			setSize((was) => {
				const next = { w: Math.round(v.width), h: Math.round(v.height) };
				return was.w === next.w && was.h === next.h ? was : next;
			});
			const door = view.querySelector<HTMLElement>("[data-find-door]");
			if (door === null) return;
			const b = door.getBoundingClientRect();
			const next = {
				x: Math.round(b.left - v.left),
				y: Math.round(b.top - v.top),
				w: Math.round(b.width),
				h: Math.round(b.height),
			};
			setSpot((was) => (was.x === next.x && was.y === next.y && was.w === next.w ? was : next));
		};
		read();
		if (!open || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(read);
		observer.observe(view);
		return () => observer.disconnect();
	}, [open]);

	// the pick has to stay on screen, and a real project is screens of list
	useEffect(() => {
		root.current?.querySelector<HTMLElement>(`[data-at="${at}"]`)?.scrollIntoView({ block: "nearest" });
	}, [at]);

	const box: Rect = {
		x: CORNER.x,
		y: CORNER.y,
		w: Math.max(spot.w, Math.min(MOST.w, size.w - CORNER.x * 2 - 8)),
		h: Math.max(HEAD, Math.min(MOST.h, size.h - CORNER.y - FOOT)),
	};
	const previewW = box.w >= 860 ? 352 : box.w >= 640 ? 300 : 0;
	const empty = query.trim().length === 0;
	const magnifier = Math.max(12, spot.x - CORNER.x + 6);
	const keys = findKeys();

	const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setAt((n) => Math.min(n + 1, Math.max(rows - 1, 0)));
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setAt((n) => Math.max(n - 1, 0));
		} else if (event.key === "Enter") {
			event.preventDefault();
			if (picked !== undefined) onLand(picked.frame.name);
			else if (pickedCommand !== undefined) runCommand(pickedCommand.command);
		} else if (event.key === "Escape") {
			event.preventDefault();
			onClose();
		}
	};

	return (
		<div ref={root} className="contents">
			{/* the scrim is a door out, the way the picker's backdrop is */}
			{open ? <Scrim label="Close the finder" onMouseDown={onClose} /> : null}
			<Grow
				from={{ x: spot.x, y: CORNER.y, w: spot.w, h: HEAD }}
				to={box}
				open={open}
				onFolded={() => setDrawn(false)}
				className={cn("z-40 rounded-lg", MODAL)}
			>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: open it is the dialog; it only keeps the caret in its field, and its rows are buttons */}
				<div
					// folded into the door it is no dialog, only the door's shape
					{...(open ? DIALOG : {})}
					className="flex h-full flex-col"
					// a caret that never leaves: clicking the finder is never clicking away from the field
					onMouseDown={(event) => {
						if (event.target !== inputRef.current) event.preventDefault();
						inputRef.current?.focus();
					}}
				>
					<label
						className="relative flex shrink-0 items-center border-line-default border-b pr-4"
						style={{ height: HEAD }}
					>
						{/* where the door's magnifier stood, so it reads as the same mark */}
						<span className="absolute flex text-tertiary" style={{ left: magnifier }}>
							<SearchIcon />
						</span>
						<input
							ref={inputRef}
							value={query}
							spellCheck={false}
							autoComplete="off"
							aria-label="Find a frame"
							placeholder="Find a frame"
							tabIndex={open ? 0 : -1}
							onChange={(event) => {
								setQuery(event.target.value);
								setAt(0);
							}}
							onKeyDown={onKey}
							className="h-full min-w-0 flex-1 bg-transparent text-primary caret-accent outline-none type-value selection:bg-accent-subtle selection:text-accent-strong placeholder:text-tertiary"
							style={{ paddingLeft: magnifier + 22 }}
						/>
						<span className="flex shrink-0 items-center gap-3 text-secondary type-detail">
							{unseen.size === 0 || !empty ? null : (
								<span className="flex items-center gap-1 text-primary">
									<UnseenMark mark="new" className="-mr-0.5" />
									{unseen.size} unseen
								</span>
							)}
							<span>{empty ? `${fresh.length} frames, newest first` : `${hits.length} of ${fresh.length}`}</span>
						</span>
					</label>
					{drawn ? (
						<div className="flex min-h-0 flex-1">
							<ScrollArea role="listbox" aria-label="Frames" className="min-h-0 min-w-0 flex-1 py-1.5">
								{rows === 0 ? (
									<div className="flex h-row items-center px-4 text-secondary type-value">
										nothing answers to that
									</div>
								) : (
									hits.map((hit, index) => (
										<FindRow
											key={hit.frame.name}
											hit={hit}
											index={index}
											mark={unseen.get(hit.frame.name)}
											still={stillOf(hit.frame)}
											age={ageOf(hit.frame.born, openedAt)}
											picked={index === at}
											onPoint={() => setAt(index)}
											onLand={() => onLand(hit.frame.name)}
										/>
									))
								)}
								{doing.map((hit, index) => (
									<CommandRow
										key={hit.command.id}
										command={hit.command}
										matched={hit.matched}
										index={hits.length + index}
										picked={hits.length + index === at}
										onPoint={() => setAt(hits.length + index)}
										onRun={() => runCommand(hit.command)}
									/>
								))}
							</ScrollArea>
							{previewW === 0 ? null : (
								<FindPreview
									frame={picked?.frame}
									page={picked === undefined ? [] : (byPage.get(pageOf(picked.frame)) ?? [])}
									w={previewW}
									now={openedAt}
									stillOf={stillOf}
								/>
							)}
						</div>
					) : (
						<div className="flex-1" />
					)}
					<StatusLine>
						<span className="flex items-center gap-5">
							<span>↑↓ moves</span>
							<span>↵ goes there</span>
							<span>esc closes</span>
						</span>
						<span className="flex items-center gap-1.5">
							or{" "}
							{[...keys].reverse().map((face) => (
								<Kbd key={face}>{face}</Kbd>
							))}{" "}
							from anywhere on the canvas
						</span>
					</StatusLine>
				</div>
			</Grow>
		</div>
	);
}

/**
 * A box that grows out of a spot: from `from` to `to` (rects in the canvas's
 * pixels), its contents laid out at `to`'s size and held still while the edges
 * travel past them, so it uncovers what is inside rather than squeezing it.
 */
function Grow({
	from,
	to,
	open,
	onFolded,
	className,
	children,
}: {
	from: Rect;
	to: Rect;
	open: boolean;
	/** it finished folding back into its spot */
	onFolded: () => void;
	className?: string;
	children: ReactNode;
}) {
	const box = open ? to : from;
	const curve = "var(--transition-duration-slow) var(--ease-snap)";
	const fade = "var(--transition-duration-fast) var(--ease-out)";
	return (
		<div
			className={cn("absolute overflow-hidden", !open && "pointer-events-none", className)}
			aria-hidden={open ? undefined : true}
			inert={!open}
			style={{
				left: box.x,
				top: box.y,
				width: box.w,
				height: box.h,
				opacity: open ? 1 : 0,
				transition: `left ${curve}, top ${curve}, width ${curve}, height ${curve}, opacity ${fade}`,
			}}
			onPointerDown={(event) => event.stopPropagation()}
			onTransitionEnd={(event) => {
				if (!open && event.target === event.currentTarget && event.propertyName === "width") onFolded();
			}}
		>
			<div
				className="absolute"
				style={{
					left: to.x - box.x,
					top: to.y - box.y,
					width: to.w - 2,
					height: to.h - 2,
					transition: `left ${curve}, top ${curve}`,
				}}
			>
				{children}
			</div>
		</div>
	);
}

function FindRow({
	hit,
	index,
	mark,
	still,
	age,
	picked,
	onPoint,
	onLand,
}: {
	hit: Hit;
	index: number;
	mark: Unseen | undefined;
	still: string | undefined;
	/** how long ago the frame was born */
	age: string | undefined;
	picked: boolean;
	onPoint: () => void;
	onLand: () => void;
}) {
	const { frame } = hit;
	const name = pageName(frame.name);
	const scale = fitScale(frame, 58, 42);
	return (
		<button
			type="button"
			tabIndex={-1}
			data-at={index}
			// move, not enter: a list that scrolls under a still cursor must not re-pick
			onMouseMove={onPoint}
			onClick={onLand}
			className={cn(
				"relative mx-1.5 flex h-[56px] w-[calc(100%-12px)] cursor-default items-center gap-3 rounded-sm px-2.5 text-left transition-colors duration-quick",
				picked && "bg-state-selected-strong",
			)}
		>
			<span className="flex h-11 w-15 shrink-0 items-center justify-center rounded-xs bg-surface-canvas">
				<Picture src={still} w={frame.w * scale} h={frame.h * scale} lazy />
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="flex min-w-0 items-center gap-1.5">
					{mark === undefined ? null : <UnseenMark mark={mark} className="-ml-0.5" />}
					<Lit text={name} matched={hit.matched} className="min-w-0 truncate type-value" />
				</span>
				<span className="flex min-w-0 items-center gap-1.5 text-secondary type-detail">
					<FolderIcon className="h-3 w-3 shrink-0 text-secondary/40" />
					<Lit text={pageLabel(pageOf(frame))} matched={hit.page} quiet className="shrink-0" />
					{hit.said === undefined ? null : (
						<>
							<span className="shrink-0 text-tertiary">says</span>
							<span className="min-w-0 truncate text-primary">
								“<Lit text={hit.said.phrase} matched={hit.said.matched} quiet />”
							</span>
						</>
					)}
				</span>
			</span>
			{age === undefined ? null : <span className="shrink-0 text-secondary type-detail">{age}</span>}
		</button>
	);
}

/**
 * Text with the typed letters lit. A name dims its run-up and is full text from
 * the first landing; `quiet` text (a page, a phrase) keeps its own ink and only
 * lights what was typed.
 */
function Lit({
	text,
	matched,
	quiet = false,
	className,
}: {
	text: string;
	matched: readonly number[];
	quiet?: boolean;
	className?: string;
}) {
	const weights = charWeights(text, matched);
	return (
		<span className={className}>
			{runsIn(text, weights).map((run) => (
				<span key={run.at} className={quiet ? (run.weight === "hit" ? TONE.hit : undefined) : TONE[run.weight]}>
					{run.text}
				</span>
			))}
		</span>
	);
}

function CommandRow({
	command,
	matched,
	index,
	picked,
	onPoint,
	onRun,
}: {
	command: PaletteCommand;
	matched: readonly number[];
	index: number;
	picked: boolean;
	onPoint: () => void;
	onRun: () => void;
}) {
	const refused = command.refused !== undefined;
	return (
		<button
			type="button"
			tabIndex={-1}
			aria-disabled={refused}
			data-at={index}
			data-command={command.id}
			onMouseMove={onPoint}
			onClick={onRun}
			className={cn(
				"relative mx-1.5 flex h-row w-[calc(100%-12px)] cursor-default items-center gap-5 rounded-sm px-2.5 text-left transition-colors duration-quick",
				picked && "bg-state-selected-strong",
			)}
		>
			<Lit
				text={command.label}
				matched={matched}
				className={cn("min-w-0 flex-1 truncate type-value", refused && "opacity-50")}
			/>
			{command.refused !== undefined ? (
				<span className="shrink-0 text-secondary type-detail">{command.refused}</span>
			) : command.keys !== undefined ? (
				<Kbd>{command.keys}</Kbd>
			) : null}
		</button>
	);
}
