import {
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { KnobValue } from "../../runtime/knob-protocol";
import { cn } from "../cn";
import { ChevronIcon, LinkIcon } from "../icons";
import { Button } from "../primitives/actions";
import { type TunePhase, useKeyTune, useScrub } from "../primitives/inputs";
import { Section, StatusLine } from "../primitives/structure";
import { KnobEditor, KnobInRow, KnobList, KnobPreview } from "./knob-controls";
import {
	fileOf,
	headsOver,
	type KnobLine,
	knobLines,
	knobNumber,
	nudged,
	reachOf,
	statusWords,
	valueNow,
} from "./knobs";
import { useCloseOnPressAway } from "./rail-fields";
import { type FrameKnobs, type KnobLane, useFrameKnobs } from "./use-knobs";

/**
 * The Knobs section of the properties rail (#220): a frame's knobs under its
 * geometry, one calm row each. A press opens a row in place into its editor
 * and shuts the one before, the pressed row holding its place; a list too
 * long for the rail opens beside its row instead; a knob whose control fits
 * its row acts there and never opens. A knob that is one number at heart
 * scrubs from its name. The keyboard walks rows and group heads, and Escape
 * backs out one level. One line at the foot says what letting go will write,
 * then where it was written.
 */

export interface KnobsActs {
	lane: KnobLane;
	/** what Save as variant would call the copy */
	variantOf: (frame: string) => string;
	onSaveVariant: (frame: string) => void;
}

type Knob = Extract<KnobLine, { kind: "knob" }>;

export function KnobsSection({ frame, acts }: { frame: string; acts: KnobsActs }) {
	const knobs = useFrameKnobs(acts.lane, frame);
	if (knobs.calls.length === 0) return null;
	return <Knobs key={frame} frame={frame} knobs={knobs} acts={acts} />;
}

function Knobs({ frame, knobs, acts }: { frame: string; knobs: FrameKnobs; acts: KnobsActs }) {
	const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
	const [open, setOpen] = useState<string | null>(null);
	const section = useRef<HTMLDivElement | null>(null);
	/** the row pressed open, and where it stood, so the editor shutting above it cannot move it */
	const anchor = useRef<{ id: string; top: number } | null>(null);
	const lines = knobLines(frame, knobs.calls, folded);
	const count = lines.filter((line) => line.kind === "knob").length;
	/** the file the section's first knob is written in: the frame's own, when it has any */
	const file = fileOf(frame, lines.find((line) => line.kind === "knob")?.at ?? "");

	const rowOf = useCallback(
		(id: string) =>
			[...(section.current?.querySelectorAll<HTMLElement>("[data-knob-id]") ?? [])].find(
				(row) => row.dataset.knobId === id,
			),
		[],
	);
	const openRow = useCallback(
		(id: string | null) => {
			const row = id === null ? undefined : rowOf(id);
			anchor.current = id === null || row === undefined ? null : { id, top: row.getBoundingClientRect().top };
			setOpen(id);
		},
		[rowOf],
	);
	useLayoutEffect(() => {
		const held = anchor.current;
		anchor.current = null;
		if (held === null || open !== held.id) return;
		const row = rowOf(held.id);
		const scroller = row?.closest<HTMLElement>("[data-properties-scroll]");
		if (row === undefined || scroller === null || scroller === undefined) return;
		scroller.scrollTop += row.getBoundingClientRect().top - held.top;
		// an editor opening low glides the rail just far enough to show it
		row.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [open, rowOf]);

	// an undo lands where it can be seen: the groups over its row unfold and the row comes into view
	const washed = knobs.washed;
	useEffect(() => {
		if (washed === null) return;
		setFolded((was) => {
			const over = headsOver(washed.at, washed.path);
			return over.some((id) => was.has(id)) ? new Set([...was].filter((id) => !over.includes(id))) : was;
		});
		const timer = setTimeout(() => rowOf(washed.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
		return () => clearTimeout(timer);
	}, [washed, rowOf]);

	const fold = (id: string) => {
		const next = new Set(folded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		setFolded(next);
		// the open row goes with its group
		if (open?.startsWith(`${id}.`)) setOpen(null);
	};

	return (
		<div ref={section} data-knobs-section="" className="contents">
			<Section title="knobs" meta={file}>
				{lines.map((line) =>
					line.kind === "group" ? (
						<GroupHead key={line.id} line={line} onFold={() => fold(line.id)} />
					) : (
						<KnobRow
							key={line.id}
							frame={frame}
							knob={line}
							knobs={knobs}
							lane={acts.lane}
							open={open === line.id}
							onOpen={(on) => openRow(on ? line.id : null)}
						/>
					),
				)}
			</Section>
			<Foot frame={frame} file={file} knobs={knobs} count={count} acts={acts} />
		</div>
	);
}

/* ---------- walking it by keyboard ---------- */

/** ↑ and ↓ to the row or group head before or after: what every head in the section shares. */
function walk(event: ReactKeyboardEvent<HTMLElement>): boolean {
	if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return false;
	event.preventDefault();
	event.stopPropagation();
	const heads = [
		...(event.currentTarget.closest("[data-knobs-section]")?.querySelectorAll<HTMLElement>("[data-knob-head]") ?? []),
	];
	const at = heads.indexOf(event.currentTarget);
	heads[Math.min(heads.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
	return true;
}

/* ---------- a group ---------- */

function GroupHead({ line, onFold }: { line: Extract<KnobLine, { kind: "group" }>; onFold: () => void }) {
	return (
		<button
			type="button"
			data-knob-head=""
			data-knob-group={line.key}
			aria-expanded={line.open}
			onClick={onFold}
			onKeyDown={(event) => {
				if (walk(event)) return;
				if ((event.key === "ArrowLeft" && line.open) || (event.key === "ArrowRight" && !line.open)) {
					event.preventDefault();
					event.stopPropagation();
					onFold();
				} else if (event.key === "Enter" || event.key === " ") event.stopPropagation();
			}}
			style={{ paddingLeft: `calc(var(--spacing) * ${3 + line.depth * 3})` }}
			className="group/fold flex h-row w-full cursor-pointer items-center gap-1.5 border-line-subtle border-b pr-3 text-left text-primary outline-none transition-colors duration-fast hover:bg-state-hover focus-ring-inset"
		>
			<span
				className={cn(
					"flex size-3 shrink-0 text-tertiary transition-transform duration-fast group-hover/fold:text-secondary [&>svg]:size-full",
					line.open && "rotate-90",
				)}
			>
				<ChevronIcon />
			</span>
			<span className="type-value">{line.key}</span>
			{line.open ? null : (
				<span className="ml-auto flex items-center gap-2 text-tertiary type-detail">
					{line.shared ? <SharedMark /> : null}
					{line.count}
				</span>
			)}
		</button>
	);
}

function SharedMark() {
	return (
		<span className="flex size-3 shrink-0 [&>svg]:size-full">
			<LinkIcon />
		</span>
	);
}

/* ---------- a knob ---------- */

function KnobRow({
	frame,
	knob,
	knobs,
	lane,
	open,
	onOpen,
}: {
	frame: string;
	knob: Knob;
	knobs: FrameKnobs;
	lane: KnobLane;
	open: boolean;
	onOpen: (open: boolean) => void;
}) {
	const { spec, computed } = knob;
	const self = useRef<HTMLDivElement | null>(null);
	const head = useRef<HTMLDivElement | null>(null);
	const value = valueNow(spec, knobs.live.get(knob.at)?.[knob.path]);
	const reach = reachOf(spec.type);
	const tune = (next: KnobValue, phase: TunePhase) => lane.tune(frame, knob, next, phase);
	// a knob that is one number at heart scrubs from its name and steps on ←/→, in the unit its row shows
	const number = computed ? undefined : knobNumber(spec, value);
	/** a scrub ends in a click on the row, which must not open it */
	const scrubbed = useRef(false);
	const tuneNumber = (n: number, phase: TunePhase) => {
		if (phase === "live") scrubbed.current = true;
		if (number !== undefined) tune(number.back(n), phase);
	};
	const scrub = useScrub(number?.n ?? 0, number?.rules ?? {}, tuneNumber);
	const keys = useKeyTune(number?.n ?? 0, number?.rules ?? {}, tuneNumber);

	const close = () => {
		onOpen(false);
		head.current?.focus({ preventScroll: true });
	};

	/** what a press or Return on the row does: an action runs, a switch flips, words take the caret, the rest opens */
	const act = () => {
		if (computed) return;
		if (spec.type === "action") lane.press(knob);
		else if (spec.type === "toggle") tune(value !== true, "commit");
		else if (reach === "row") self.current?.querySelector<HTMLElement>("input")?.focus();
		else onOpen(!open);
	};

	const keyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget || walk(event)) return;
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			event.stopPropagation();
			if (open) close();
			else act();
		} else if (event.key === "Escape" && open) {
			event.preventDefault();
			event.stopPropagation();
			close();
		} else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !computed) {
			if (number !== undefined) {
				keys.onKeyDown(event);
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			const to = nudged(spec, value, event.key === "ArrowRight" ? 1 : -1);
			if (to !== undefined && to !== value) tune(to, "commit");
		} else if (event.key === "Escape" && number !== undefined) keys.onKeyDown(event);
	};

	const refused = knobs.refused?.id === knob.id ? knobs.refused.refusal : null;
	const washed = knobs.washed?.id === knob.id ? knobs.washed.n : 0;
	const control = { spec, value: value as KnobValue, onTune: tune, label: knob.key, disabled: computed };
	const inRow = reach === "row" && !computed;
	return (
		<div
			ref={self}
			data-knob-id={knob.id}
			data-knob={knob.path}
			className={cn(
				// the pinned foot covers the rail's last rows: what scrolls into view clears it
				"relative scroll-mb-24 border-line-subtle border-b transition-colors duration-fast",
				open && reach === "opens" && "bg-surface-panel",
			)}
		>
			{washed === 0 ? null : (
				<span
					key={washed}
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 animate-history-wash"
				/>
			)}
			{/* biome-ignore lint/a11y/useSemanticElements: a row holds controls of its own, so it cannot be a button */}
			<div
				ref={head}
				data-knob-head=""
				role="button"
				tabIndex={0}
				aria-expanded={reach === "row" ? undefined : open}
				aria-label={knob.key}
				onClick={(event) => {
					if (scrubbed.current) {
						scrubbed.current = false;
						return;
					}
					// a press on the row's own control is that control's
					if (inRow && (event.target as HTMLElement).closest("input, button, [role=radiogroup]") !== null) return;
					act();
				}}
				onKeyDown={keyDown}
				onKeyUp={number === undefined ? undefined : keys.onKeyUp}
				onBlur={number === undefined ? undefined : keys.onBlur}
				// a knob stands flush with the head of the group it is in
				style={{ paddingLeft: `calc(var(--spacing) * ${3 + Math.max(0, knob.depth - 1) * 3})` }}
				className={cn(
					"group/knob relative grid h-row min-w-0 select-none grid-cols-[calc(var(--spacing)*22)_minmax(0,1fr)_12px] items-center gap-2 pr-3 outline-none transition-colors duration-fast focus-ring-inset",
					computed || inRow ? "cursor-default" : "cursor-pointer",
					!open && "hover:bg-state-hover",
				)}
			>
				<span className="flex min-w-0 items-center gap-1.5">
					<span
						onPointerDown={number === undefined ? undefined : scrub}
						className={cn(
							"truncate transition-colors duration-fast type-detail",
							number !== undefined && "cursor-ew-resize touch-none",
							open ? "text-primary" : "text-secondary group-hover/knob:text-primary",
						)}
					>
						{knob.key}
					</span>
					{knob.shared === null ? null : (
						<span
							title={`Declared in ${knob.shared}: one value for every frame that renders it`}
							className="text-tertiary"
						>
							<SharedMark />
						</span>
					)}
				</span>
				<span className="flex min-w-0 items-center">
					{inRow ? (
						<KnobInRow {...control} onPress={() => lane.press(knob)} />
					) : (
						<KnobPreview spec={spec} value={value} />
					)}
				</span>
				<span className="flex justify-end text-tertiary type-detail">
					{computed ? (
						<span title="Its value is worked out in code, so a hand cannot write it">ƒ</span>
					) : reach === "row" ? null : (
						<span
							className={cn(
								"flex size-3 transition-[opacity,rotate] duration-fast [&>svg]:size-full",
								open
									? "rotate-90 text-secondary opacity-100"
									: "opacity-0 group-hover/knob:opacity-100 group-focus-visible/knob:opacity-100",
							)}
						>
							<ChevronIcon />
						</span>
					)}
				</span>
			</div>
			{open && reach === "opens" ? (
				// biome-ignore lint/a11y/noStaticElementInteractions: Escape inside the editor backs out to its row
				<div
					className="flex flex-col gap-2.5 px-3 pt-1 pb-3.5"
					onKeyDown={(event) => {
						if (event.key !== "Escape" || event.defaultPrevented) return;
						event.stopPropagation();
						close();
					}}
				>
					<KnobEditor {...control} />
					{knob.shared === null ? null : (
						<span className="flex items-center gap-1.5 text-tertiary type-detail">
							<SharedMark />
							<span className="truncate">{knob.shared}</span>
							<span className="ml-auto shrink-0">every frame</span>
						</span>
					)}
				</div>
			) : null}
			{open && reach === "popover" && self.current !== null ? (
				<Beside row={self.current} from={value as KnobValue} onTune={tune} onClose={close}>
					<KnobList {...control} />
				</Beside>
			) : null}
			{refused === null ? null : (
				<div data-knob-refusal={refused.code} className="px-3 pb-1.5 text-secondary type-detail">
					{refused.says}
				</div>
			)}
		</div>
	);
}

/** the gap between a row and the list open beside it */
const BESIDE_GAP = 8;

/**
 * A list too long for the rail, open beside the row it belongs to, over the
 * canvas, its top on the row's. The list is its own float; this places it.
 * Escape puts back what it tried on and shuts it.
 */
function Beside({
	row,
	from,
	onTune,
	onClose,
	children,
}: {
	row: HTMLElement;
	/** the value when it opened, which Escape puts back */
	from: KnobValue;
	onTune: (next: KnobValue, phase: TunePhase) => void;
	onClose: () => void;
	children: ReactNode;
}) {
	const panel = useRef<HTMLDivElement | null>(null);
	const rowRef = useRef(row);
	rowRef.current = row;
	const [opened] = useState(from);
	const [rect, setRect] = useState(() => row.getBoundingClientRect());
	useCloseOnPressAway(true, onClose, panel, rowRef);
	// the list rides with its row as the rail scrolls under it
	useLayoutEffect(() => {
		const follow = () => setRect(row.getBoundingClientRect());
		follow();
		window.addEventListener("scroll", follow, true);
		window.addEventListener("resize", follow);
		return () => {
			window.removeEventListener("scroll", follow, true);
			window.removeEventListener("resize", follow);
		};
	}, [row]);
	// the keyboard comes along: the chosen option takes the focus as the list opens
	useEffect(() => {
		const options = [...(panel.current?.querySelectorAll<HTMLElement>("[role=option], button[aria-pressed]") ?? [])];
		(options.find((option) => option.matches("[aria-selected=true], [aria-pressed=true]")) ?? options[0])?.focus({
			preventScroll: true,
		});
	}, []);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the keys walk the list inside and Escape shuts it
		<div
			ref={panel}
			style={{
				right: innerWidth - rect.left + BESIDE_GAP,
				top: Math.max(BESIDE_GAP, Math.min(rect.top, innerHeight - 340)),
			}}
			className="fixed z-50"
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.key === "Escape") {
					event.preventDefault();
					onTune(opened, "cancel");
					onClose();
				} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					const options = [
						...event.currentTarget.querySelectorAll<HTMLElement>("[role=option], button[aria-pressed]"),
					];
					const at = options.indexOf(document.activeElement as HTMLElement);
					options[Math.min(options.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
				}
			}}
		>
			{children}
		</div>
	);
}

/* ---------- the foot ---------- */

/** What letting go will write, then where it was written; pinned to the rail's foot while the section shows. */
function Foot({
	frame,
	file,
	knobs,
	count,
	acts,
}: {
	frame: string;
	file: string;
	knobs: FrameKnobs;
	count: number;
	acts: KnobsActs;
}) {
	const words = knobs.status === null ? null : statusWords(knobs.status);
	return (
		<div className="sticky bottom-0 z-10 border-line-default border-t bg-surface-window">
			<StatusLine role="status" aria-live="polite" data-knobs-status="" className="border-t-0 px-3">
				<span className={cn("min-w-0 truncate", words === null ? "text-tertiary" : "text-primary")}>
					{words?.says ?? `${file} · ${count} knobs`}
				</span>
				{words === null || words.aside === "" ? null : (
					<span className="shrink-0 text-tertiary">{words.aside}</span>
				)}
			</StatusLine>
			<div className="flex items-center gap-3 px-3 pb-2.5">
				<Button variant="secondary" size="md" className="flex-1" onClick={() => acts.onSaveVariant(frame)}>
					Save as variant
				</Button>
				<span className="shrink-0 truncate text-tertiary type-detail">{acts.variantOf(frame)}</span>
			</div>
		</div>
	);
}
