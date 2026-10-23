import {
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { fetchHistory, type HistoryRead, type HistoryScope, type HistoryStretch } from "../api";
import { cn } from "../cn";
import { CloseIcon } from "../icons";
import { IconButton } from "../primitives/actions";
import { Count } from "../primitives/display";
import { TextAction } from "../primitives/feedback";
import { SelectTrigger } from "../primitives/inputs";
import { Menu, MenuItem, MenuSeparator } from "../primitives/overlays";
import { Bar, ScrollArea } from "../primitives/structure";
import {
	dayName,
	markHeight,
	movedInSays,
	paceOf,
	people,
	ranSays,
	savesSays,
	shownDays,
	throughOf,
	timeOf,
	touchedSays,
} from "./history-model";
import { restoredSays } from "./history-restore-model";
import { PRESENCE_INK } from "./presence-faces";

/**
 * The History tab beside Properties, Agent and Comments on a team project (spool#187), #105's paced look, its rows
 * versions (task 225, spool#214): a frame's history or the whole project's. Its head names the scope, × widens a
 * frame's to the project's, and the person pick shows everyone or one person, folding the others away. Current
 * version is the top row; under it, days, then versions, each the moment a stretch of someone's saves ended: the
 * end time, a mark in the person's colour as tall as the stretch ran, who, how long, what it touched and how many
 * saves, spaced by the quiet between them. Picking a version shows it on the canvas; picking it again, or Current
 * version, goes back to now, and ↓ ↑ step through them. The history ends with what is kept, and where the project
 * came from when it moved in from git.
 */

/** The event the canvas passes the daemon's design changes on as: what was saved may be the team's history now. */
export const HISTORY_CHANGE = "spool-history-change";

/** How long after a change the history is read again, so a burst of saves is one read. */
const SETTLE_MS = 1500;

/**
 * The project's stretches in a scope, read while the pane is in sight: when it comes into sight or the scope
 * changes, when the window comes back to the front, and a moment after the design changes. Older days are read on
 * asking and kept until the scope changes.
 */
function useHistory(project: string, scope: HistoryScope, visible: boolean) {
	const [read, setRead] = useState<HistoryRead | null>(null);
	const [older, setOlder] = useState(false);
	const asked = useRef(0);
	const key = scope.kind === "frame" ? `frame:${scope.frame}` : "project";
	const scopeRef = useRef(scope);
	scopeRef.current = scope;
	// biome-ignore lint/correctness/useExhaustiveDependencies: the key is the scope
	const refresh = useCallback(() => {
		const mine = ++asked.current;
		void fetchHistory(project, scopeRef.current).then((next) => {
			if (mine === asked.current) setRead(next);
		});
	}, [project, key]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new scope starts from nothing
	useEffect(() => setRead(null), [project, key]);
	useEffect(() => {
		if (!visible) return;
		refresh();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const later = () => {
			clearTimeout(timer);
			timer = setTimeout(refresh, SETTLE_MS);
		};
		window.addEventListener(HISTORY_CHANGE, later);
		window.addEventListener("focus", refresh);
		return () => {
			clearTimeout(timer);
			window.removeEventListener(HISTORY_CHANGE, later);
			window.removeEventListener("focus", refresh);
		};
	}, [visible, refresh]);
	const more = () => {
		if (read?.state !== "ready" || read.next === null || older) return;
		const mine = asked.current;
		setOlder(true);
		void fetchHistory(project, scope, read.next).then((next) => {
			setOlder(false);
			if (mine !== asked.current || next.state !== "ready") return;
			setRead({ ...read, days: [...read.days, ...next.days], next: next.next });
		});
	};
	return { read, more, older };
}

const stretchKey = (stretch: HistoryStretch) =>
	`${stretch.by.accountId}\n${stretch.by.device}\n${stretch.from}\n${stretch.to}`;

const sameStretch = (a: HistoryStretch | null, b: HistoryStretch) =>
	a !== null && a.from === b.from && a.to === b.to && a.by.accountId === b.by.accountId;

export function HistoryPane({
	project,
	scope,
	visible,
	onScope,
	shown,
	onShow,
	onListed,
	did,
}: {
	project: string;
	scope: HistoryScope;
	/** whether its tab is in sight: it reads the history only then */
	visible: boolean;
	onScope: (scope: HistoryScope) => void;
	/** the version the canvas shows; null for now */
	shown: HistoryStretch | null;
	onShow: (stretch: HistoryStretch | null) => void;
	/** the versions listed, newest first, as ↑ ↓ step through them */
	onListed: (stretches: HistoryStretch[]) => void;
	/** what the version shown did on the page, frame by frame, once read */
	did: string | null;
}) {
	const { read, more, older } = useHistory(project, scope, visible);
	const [person, setPerson] = useState<string | null>(null);
	const scopeKey = scope.kind === "frame" ? scope.frame : "";
	const frame = scope.kind === "frame" ? scope.frame : null;
	const days = read?.state === "ready" ? read.days : [];
	const everyone = people(days);
	const shownByDay = shownDays(days, person);
	const listed = shownByDay.flatMap((day) => day.shown);
	const listedRef = useRef(onListed);
	listedRef.current = onListed;
	useEffect(() => listedRef.current(listed));
	/** ↓ from Current version shows the newest; the rest is the canvas's while a version shows */
	const step = (key: string) => {
		const [newest] = listed;
		if (shown !== null || newest === undefined) return false;
		if (key === "ArrowDown") onShow(newest);
		else return false;
		return true;
	};
	return (
		<div className="flex h-full min-w-0 flex-col bg-surface-window" data-history-pane="">
			<Bar
				face="mono"
				title={
					<span key={scopeKey} className="block truncate animate-history-rise" data-history-scope="">
						{frame ?? project}
					</span>
				}
				actions={
					<span className="flex items-center gap-1">
						<PersonPick everyone={everyone} person={person} onPerson={setPerson} />
						{scope.kind === "frame" ? (
							<IconButton
								size="sm"
								icon={<CloseIcon />}
								label="Show the whole project"
								onClick={() => onScope({ kind: "project" })}
							/>
						) : null}
					</span>
				}
			/>
			<ScrollArea className="flex-1">
				{read === null ? (
					<div className="px-4 py-6 text-secondary type-label">Reading the team's history…</div>
				) : read.state === "failed" ? (
					<div className="px-4 py-6 text-secondary type-label" data-history-failed="">
						{read.message}
					</div>
				) : (
					<>
						<CurrentRow
							picked={shown === null}
							onPick={() => onShow(null)}
							onKeyDown={(event) => {
								if (step(event.key)) event.preventDefault();
							}}
						/>
						{days.length === 0 ? (
							<div className="px-4 py-6 text-secondary type-label" data-history-empty="">
								{frame === null
									? "Nothing saved in the last 90 days."
									: `Nothing saved to ${frame} in the last 90 days.`}
							</div>
						) : null}
						{shownByDay.map((day) => (
							<Fold key={day.day} open={day.shown.length > 0}>
								<div className="flex h-9 items-end gap-2 px-3 pb-1.5" data-history-day={day.day}>
									<span className="text-primary type-detail">{dayName(day.day)}</span>
									<span className="ml-auto text-tertiary type-detail">{savesSays(day.saves)}</span>
								</div>
								<div className="pb-2">
									{day.stretches.map((stretch) => {
										const at = day.shown.indexOf(stretch);
										const picked = sameStretch(shown, stretch);
										return (
											<Fold key={stretchKey(stretch)} open={at !== -1}>
												<StretchRow
													stretch={stretch}
													frame={frame}
													above={at > 0 ? (day.shown[at - 1] ?? null) : null}
													first={at === 0}
													last={at === day.shown.length - 1}
													picked={picked}
													did={picked ? did : null}
													onPick={() => onShow(picked ? null : stretch)}
												/>
											</Fold>
										);
									})}
								</div>
							</Fold>
						))}
						{read.next !== null ? (
							<div className="px-3 py-2">
								<TextAction disabled={older} onClick={more}>
									Older days
								</TextAction>
							</div>
						) : null}
						<div className="flex flex-col gap-2 px-3 py-4 text-secondary type-label" data-history-end="">
							<span>Saves are kept 90 days. Today's files are always kept.</span>
							{read.next === null && read.movedIn !== null ? (
								<span data-history-moved-in="">{movedInSays(read.movedIn)}</span>
							) : null}
						</div>
					</>
				)}
			</ScrollArea>
		</div>
	);
}

/** The top row: the project as everyone sees and edits it now, picked while no version shows. */
function CurrentRow({
	picked,
	onPick,
	onKeyDown,
}: {
	picked: boolean;
	onPick: () => void;
	onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={picked}
			onClick={onPick}
			onKeyDown={onKeyDown}
			className="group/now flex w-full items-center py-2 pr-3 text-left focus-ring-inset"
			data-history-now=""
		>
			<span className="w-14 shrink-0 pl-3 text-tertiary type-detail">now</span>
			<span className="flex w-6 shrink-0 justify-center">
				<span aria-hidden="true" className="size-[9px] rounded-full border-2 border-accent" />
			</span>
			<span
				className={cn(
					"flex min-w-0 flex-1 flex-col gap-0.5 rounded-sm px-2 py-1 transition-colors duration-fast ease-out",
					picked ? "bg-state-selected" : "group-hover/now:bg-state-hover",
				)}
			>
				<span className="text-primary type-control">Current version</span>
				<span className="text-secondary type-detail">what everyone sees and edits</span>
			</span>
		</button>
	);
}

/** A person's face: their colour, their initial in the presence ink. */
function Face({ person, size }: { person: { name: string; color: string }; size: number }) {
	return (
		<span
			aria-hidden="true"
			className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-2xs uppercase leading-none"
			style={{ width: size, height: size, background: person.color, color: PRESENCE_INK }}
		>
			{person.name.charAt(0)}
		</span>
	);
}

/** Everyone, or one person: the others' rows fold away. */
function PersonPick({
	everyone,
	person,
	onPerson,
}: {
	everyone: HistoryStretch["by"][];
	person: string | null;
	onPerson: (person: string | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const held = useDismissed(open, () => setOpen(false));
	const one = everyone.find((each) => each.accountId === person);
	const pick = (next: string | null) => {
		onPerson(next);
		setOpen(false);
	};
	return (
		<span ref={held} className="relative">
			<SelectTrigger
				aria-label="Whose saves"
				open={open}
				onClick={() => setOpen(!open)}
				value={
					one === undefined ? (
						"Everyone"
					) : (
						<>
							<Face person={one} size={14} />
							{one.name}
						</>
					)
				}
			/>
			{open ? (
				<Menu className="absolute top-full right-0 z-50 mt-1 w-[220px]" data-history-people="">
					<MenuItem label="Everyone" checked={one === undefined} onClick={() => pick(null)} />
					<MenuSeparator />
					{everyone.map((each) => (
						<MenuItem
							key={each.accountId}
							label={each.name}
							icon={<Face person={each} size={14} />}
							meta={each.device}
							onClick={() => pick(each.accountId)}
						/>
					))}
				</Menu>
			) : null}
		</span>
	);
}

/** A menu open under its button closes on a press anywhere else, or on Esc. The element holding both. */
function useDismissed(open: boolean, close: () => void): RefObject<HTMLSpanElement | null> {
	const held = useRef<HTMLSpanElement>(null);
	const latest = useRef(close);
	latest.current = close;
	useEffect(() => {
		if (!open) return;
		const away = (event: PointerEvent) => {
			if (event.target instanceof Node && held.current?.contains(event.target)) return;
			latest.current();
		};
		const key = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			latest.current();
		};
		document.addEventListener("pointerdown", away, true);
		window.addEventListener("keydown", key, true);
		return () => {
			document.removeEventListener("pointerdown", away, true);
			window.removeEventListener("keydown", key, true);
		};
	}, [open]);
	return held;
}

/** Folds open from no height to its own, so the rows below slide rather than jump; stillness cuts it. */
function Fold({ open, children }: { open: boolean; children: ReactNode }) {
	return (
		<div
			className={cn(
				"grid transition-[grid-template-rows,opacity] duration-base ease-out motion-reduce:transition-none",
				open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
			)}
			inert={!open}
		>
			<div className="min-h-0 overflow-hidden">{children}</div>
		</div>
	);
}

/** One version, paced: the room above it is the quiet before it, its mark as tall as its stretch ran. */
function StretchRow({
	stretch,
	frame,
	above,
	first,
	last,
	picked,
	did,
	onPick,
}: {
	stretch: HistoryStretch;
	frame: string | null;
	/** the newer stretch shown just above it on its day */
	above: HistoryStretch | null;
	first: boolean;
	last: boolean;
	picked: boolean;
	/** what it did on the page, once the canvas has read it */
	did: string | null;
	onPick: () => void;
}) {
	const { space, quiet } = paceOf(above, stretch);
	// a restore is a row of its own (spool#188): ↺ for its mark, what went back to when, washed in as it arrives
	const restored = stretch.restore ?? null;
	const through = throughOf(stretch, frame);
	const ring = `color-mix(in srgb, ${stretch.by.color} 33%, transparent)`;
	const row = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (picked) row.current?.scrollIntoView({ block: "nearest" });
	}, [picked]);
	return (
		<div className="group/stretch relative flex flex-col" style={{ paddingTop: space }} data-history-stretch="">
			{/* the spine the marks hang on, from the day's first to its last */}
			<span
				aria-hidden="true"
				className="absolute left-[67px] w-px bg-line-default"
				style={{ top: first ? space + 8 : 0, bottom: last ? "calc(100% - 20px)" : 0 }}
			/>
			{quiet === null ? null : (
				<span
					className="absolute right-3 left-20 text-tertiary type-detail"
					style={{ top: Math.max(0, space / 2 - 8) }}
					data-history-quiet=""
				>
					{quiet}
				</span>
			)}
			<button
				ref={row}
				type="button"
				onClick={onPick}
				aria-pressed={picked}
				className="flex w-full items-start py-1 pr-3 text-left focus-ring-inset"
			>
				<span
					className={cn(
						"w-14 shrink-0 pt-[3px] pl-3 tabular-nums type-detail transition-colors duration-fast ease-out",
						picked ? "text-primary" : "text-tertiary group-hover/stretch:text-primary",
					)}
				>
					{timeOf(stretch.end)}
				</span>
				<span className="relative flex w-6 shrink-0 justify-center pt-1">
					{restored === null ? (
						<span
							aria-hidden="true"
							className="w-[7px] rounded-full transition-shadow duration-fast ease-out"
							style={{
								height: markHeight(stretch),
								background: stretch.by.color,
								boxShadow: `0 0 0 3px var(--color-surface-window)${picked ? `, 0 0 0 5px ${ring}` : ""}`,
							}}
						/>
					) : (
						<span
							aria-hidden="true"
							className="flex size-[13px] items-center justify-center rounded-full border border-accent bg-surface-window text-2xs text-accent-strong leading-none"
							data-history-restore-mark=""
						>
							↺
						</span>
					)}
				</span>
				<span
					className={cn(
						"flex min-w-0 flex-1 flex-col gap-0.5 rounded-sm px-2 py-1 transition-colors duration-fast ease-out",
						picked ? "bg-state-selected" : "group-hover/stretch:bg-state-hover",
						restored !== null && "animate-history-wash",
					)}
				>
					<span className="flex items-baseline gap-2">
						<span
							className={cn("text-primary type-control", restored === null && "truncate")}
							data-history-who=""
						>
							{restored === null
								? stretch.by.name
								: `${stretch.by.name} restored ${restoredSays(restored, stretch.paths)}`}
						</span>
						<Count
							value={stretch.saves.toLocaleString("en-US")}
							className="ml-auto text-tertiary"
							data-history-saves=""
						/>
					</span>
					<span className="min-w-0 truncate text-secondary type-detail" data-history-touched="">
						{restored === null
							? `${ranSays(stretch)} · ${did ?? touchedSays(stretch)}`
							: savesSays(stretch.saves)}
					</span>
					{stretch.setAside > 0 || through !== null || restored !== null ? (
						<span className="flex flex-wrap gap-1 pt-1">
							{restored === null ? null : <Chip tone="accent">restore</Chip>}
							{stretch.setAside > 0 ? <Chip>{stretch.setAside} set aside</Chip> : null}
							{through === null ? null : <Chip>{through}</Chip>}
						</span>
					) : null}
				</span>
			</button>
		</div>
	);
}

/** A machine-printed mark on a row, the set-aside chip's shape; a restore's in the accent. */
function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "accent" }) {
	return (
		<span
			className={cn(
				"shrink-0 whitespace-nowrap rounded-xs border px-1.5 type-detail",
				tone === "accent"
					? "border-accent text-accent-strong"
					: "border-line-strong bg-surface-raised text-primary",
			)}
			data-history-chip=""
		>
			{children}
		</span>
	);
}
