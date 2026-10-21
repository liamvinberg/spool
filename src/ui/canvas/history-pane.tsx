import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import {
	fetchHistory,
	fetchStretchFiles,
	type HistoryRead,
	type HistoryScope,
	type HistoryStretch,
	type HistoryStretchFile,
} from "../api";
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
	ownPath,
	paceOf,
	people,
	ranSays,
	savesSays,
	setAsideSays,
	shortPath,
	shownDays,
	throughOf,
	timeOf,
	touchedSays,
} from "./history-model";
import type { FileRestore } from "./history-restore";
import { restoredSays } from "./history-restore-model";
import { PRESENCE_INK } from "./presence-faces";

/**
 * The History tab beside Properties, Agent and Comments on a team project (spool#187), #105's paced look: a frame's
 * history or the whole project's, read-only. Its head names the scope, × widens a frame's to the project's, and the
 * person pick shows everyone or one person, folding the others away. Rows are days, then stretches: the end time, a
 * mark in the person's colour as tall as the stretch ran, who, how long, what it touched and how many saves, spaced
 * by the quiet between them. Picking a stretch folds it open to its files; its set-aside saves say whose save stood.
 * The history ends with what is kept, and where the project came from when it moved in from git.
 */

/** The event the canvas passes the daemon's design changes on as: what was saved may be the team's history now. */
export const HISTORY_CHANGE = "spool-history-change";

/** How long after a change the history is read again, so a burst of saves is one read. */
const SETTLE_MS = 1500;

/** What an open stretch holds beyond its files: Compare with now (#188) and Restore… (#189) hang here. */
export type StretchActions = (stretch: HistoryStretch, scope: HistoryScope) => ReactNode;

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

export function HistoryPane({
	project,
	scope,
	visible,
	onScope,
	actions,
	restore,
}: {
	project: string;
	scope: HistoryScope;
	/** whether its tab is in sight: it reads the history only then */
	visible: boolean;
	onScope: (scope: HistoryScope) => void;
	actions?: StretchActions | undefined;
	/** Restore on a file's line and Put back under a set-aside save (spool#188); an editor's alone */
	restore?: FileRestore | undefined;
}) {
	const { read, more, older } = useHistory(project, scope, visible);
	const [person, setPerson] = useState<string | null>(null);
	const [picked, setPicked] = useState<string | null>(null);
	const scopeKey = scope.kind === "frame" ? scope.frame : "";
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new scope closes what was open
	useEffect(() => setPicked(null), [scopeKey]);
	const frame = scope.kind === "frame" ? scope.frame : null;
	const days = read?.state === "ready" ? read.days : [];
	const everyone = people(days);
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
						{days.length === 0 ? (
							<div className="px-4 py-6 text-secondary type-label" data-history-empty="">
								{frame === null
									? "Nothing saved in the last 90 days."
									: `Nothing saved to ${frame} in the last 90 days.`}
							</div>
						) : null}
						{shownDays(days, person).map((day) => (
							<Fold key={day.day} open={day.shown.length > 0}>
								<div className="flex h-9 items-end gap-2 px-3 pb-1.5" data-history-day={day.day}>
									<span className="text-primary type-detail">{dayName(day.day)}</span>
									<span className="ml-auto text-tertiary type-detail">{savesSays(day.saves)}</span>
								</div>
								<div className="pb-2">
									{day.stretches.map((stretch) => {
										const at = day.shown.indexOf(stretch);
										const key = stretchKey(stretch);
										return (
											<Fold key={key} open={at !== -1}>
												<StretchRow
													project={project}
													scope={scope}
													stretch={stretch}
													frame={frame}
													above={at > 0 ? (day.shown[at - 1] ?? null) : null}
													first={at === 0}
													last={at === day.shown.length - 1}
													picked={picked === key}
													onPick={() => setPicked(picked === key ? null : key)}
													actions={actions}
													restore={restore}
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

/** One stretch, paced: the room above it is the quiet before it, its mark as tall as it ran. */
function StretchRow({
	project,
	scope,
	stretch,
	frame,
	above,
	first,
	last,
	picked,
	onPick,
	actions,
	restore,
}: {
	project: string;
	scope: HistoryScope;
	stretch: HistoryStretch;
	frame: string | null;
	/** the newer stretch shown just above it on its day */
	above: HistoryStretch | null;
	first: boolean;
	last: boolean;
	picked: boolean;
	onPick: () => void;
	actions: StretchActions | undefined;
	restore: FileRestore | undefined;
}) {
	const { space, quiet } = paceOf(above, stretch);
	// a restore is a row of its own (spool#188): ↺ for its mark, what went back to when, washed in as it arrives
	const restored = stretch.restore ?? null;
	const through = throughOf(stretch, frame);
	const ring = `color-mix(in srgb, ${stretch.by.color} 33%, transparent)`;
	return (
		<div className="group/stretch relative flex flex-col" style={{ paddingTop: space }} data-history-stretch="">
			{/* the spine the marks hang on, from the day's first to its last */}
			<span
				aria-hidden="true"
				className="absolute left-[67px] w-px bg-line-default"
				style={{ top: first ? space + 8 : 0, bottom: last && !picked ? "calc(100% - 20px)" : 0 }}
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
				type="button"
				onClick={onPick}
				aria-expanded={picked}
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
							{restored === null ? stretch.by.name : `${stretch.by.name} restored ${restoredSays(restored)}`}
						</span>
						<Count
							value={stretch.saves.toLocaleString("en-US")}
							className="ml-auto text-tertiary"
							data-history-saves=""
						/>
					</span>
					<span className="min-w-0 truncate text-secondary type-detail" data-history-touched="">
						{restored === null ? `${ranSays(stretch)} · ${touchedSays(stretch)}` : savesSays(stretch.saves)}
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
			<Detail project={project} scope={scope} stretch={stretch} open={picked} actions={actions} restore={restore} />
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

/**
 * A picked stretch folded open: its files, arriving one after another, each with its saves, and over any save the
 * team set aside, whose save arrived first. Read-only: what an open stretch does with them comes in `actions`.
 */
function Detail({
	project,
	scope,
	stretch,
	open,
	actions,
	restore,
}: {
	project: string;
	scope: HistoryScope;
	stretch: HistoryStretch;
	open: boolean;
	actions: StretchActions | undefined;
	restore: FileRestore | undefined;
}) {
	const [files, setFiles] = useState<HistoryStretchFile[] | null | undefined>(undefined);
	const scopeKey = scope.kind === "frame" ? scope.frame : "";
	// biome-ignore lint/correctness/useExhaustiveDependencies: read once it opens, again for another scope
	useEffect(() => {
		if (!open) return;
		let live = true;
		void fetchStretchFiles(project, scope, stretch).then((read) => {
			if (live) setFiles(read);
		});
		return () => {
			live = false;
		};
	}, [open, project, scopeKey, stretch.from, stretch.to]);
	// a restore's row says what went back; its files are the target's, not a stretch of work
	const lines = stretch.restore === null || stretch.restore === undefined ? (files ?? []) : [];
	const frame = scope.kind === "frame" ? scope.frame : null;
	return (
		<Fold open={open}>
			<div className="flex flex-col gap-1 pr-3 pb-3 pl-[88px]" data-history-files="">
				{files === null ? <span className="text-secondary type-detail">Its files can't be read now.</span> : null}
				{lines.map((file, index) => (
					<div
						key={file.path}
						className={cn(
							"group/file flex flex-col transition-[opacity,transform] duration-base ease-out",
							open ? "translate-y-0 opacity-100" : "-translate-y-[3px] opacity-0",
						)}
						// each file a little after the one above it, on the house scale, so stillness cuts it too
						style={{
							transitionDelay: open
								? `calc(var(--transition-duration-base) / 3 + ${index} * var(--transition-duration-base) / 6)`
								: undefined,
						}}
						data-history-file={file.path}
					>
						<div className="flex h-6 items-center gap-2 type-detail">
							<span className="min-w-0 flex-1 truncate text-primary">
								{frame !== null && !ownPath(file.path, frame) ? file.path : shortPath(file.path)}
							</span>
							{file.hash === null ? <span className="text-danger-strong">deleted</span> : null}
							<Count
								value={file.saves}
								className={
									restore === undefined ? undefined : "group-focus-within/file:hidden group-hover/file:hidden"
								}
							/>
							{restore === undefined ? null : (
								<span
									className="hidden group-focus-within/file:inline-flex group-hover/file:inline-flex"
									data-history-file-restore=""
								>
									{restore.line(file, stretch)}
								</span>
							)}
						</div>
						{file.setAside.map((save) => (
							<div
								key={save.version}
								className="mb-1 rounded-sm border border-line-default p-2 text-secondary type-label"
								data-history-set-aside=""
							>
								{setAsideSays(stretch, save.stood)}
								{restore === undefined ? null : (
									<span className="flex gap-1 pt-1.5">{restore.setAside(file, save, stretch)}</span>
								)}
							</div>
						))}
					</div>
				))}
				{actions === undefined ? null : <div className="flex gap-2 pt-2">{actions(stretch, scope)}</div>}
			</div>
		</Fold>
	);
}
