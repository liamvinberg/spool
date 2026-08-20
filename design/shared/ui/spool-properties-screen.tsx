import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	chainOf,
	colorOf,
	ELEMENTS,
	elementOf,
	FILE,
	gapOf,
	literalVerdict,
	type Named,
	nudge,
	paddingOf,
	parse,
	pxValue,
	radiusOf,
	shadowOf,
	type Side,
	type SizeMode,
	sizeModeOf,
	sizeVerdict,
	type SourceElement,
	spacingVerdict,
	staticTokens,
	textVerdict,
	TOKEN_WAITS,
	tokenOf,
	typeOf,
	valueOf,
	valuePx,
	type Verdict,
	withGap,
	withPadding,
	withSizeMode,
	withToken,
	withWord,
	type Word,
	WORDS,
	wordOf,
	wordVerdict,
} from "../lib/properties-model";
import { cn } from "../lib/utils";
import { CanvasChrome, type PageRow } from "./spool-canvas-chrome";
import { PanelCaret } from "./spool-icons";
import { PropertiesCart } from "./spool-properties-cart";
import { SpoolShell } from "./spool-shell";

/**
 * The properties surface, decided (spool-cloud#16): a right rail, and only a
 * rail. The right column holds one thing at a time, properties by default and
 * the agent when its flag (#238) is on and you switch to it, so the rail never
 * shares the column with a transcript.
 *
 * Figma's panel, the HTML way. The sections are the ones a designer reaches
 * for in order, position, size, layout, appearance, fill, stroke, text, and
 * every property is drawn with the primitive that fits it rather than one
 * control for everything: a number field for a length, a select for a word
 * list, an icon pair for direction and text alignment, the nine-dot grid for
 * align and justify together, a swatch for a colour, a plain value for what
 * only reads. The field holds the token (`11`) and the faint readout beside it
 * says what it means (`44px`); typing `347px` becomes `w-[347px]` and `90`
 * becomes `w-90`, a whole step writes the bare class and anything off it stays
 * in pixels, which is the resize spike's policy.
 *
 * What writes is one rule, stated in `properties-model.ts`: numbers and words
 * write, tokens wait. A refusal is a greyed row with its reason, never a
 * missing row. The frame itself is the root of the chain and its position and
 * size are frame.json's, so the rail shows them there and writes them there.
 *
 * Click an element to select it; click a crumb, or press Esc, to climb. A
 * writable edge grows a knob; drag it and the class changes under the pointer.
 * Spliced tokens read in thread colour on the source line. ⌘Z undoes.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

const FRAME = "cart";
const RAIL_W = 300;
/** where the label row sits; the stage starts one label under it */
const LABEL_H = 22;

interface Pick {
	id: string;
	key: string;
}

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface Drag {
	id: string;
	key: string;
	axis: "w" | "h";
	startPx: number;
	startAt: number;
	other: number;
	live: number;
}

/** frame.json, as the canvas holds it */
interface Geometry {
	x: number;
	y: number;
	w: number;
	h: number;
}

type Snapshot = { classes: Record<string, string>; texts: Record<string, string>; frame: Geometry };

const INITIAL: Snapshot = {
	classes: Object.fromEntries(ELEMENTS.map((element) => [element.id, element.className ?? ""])),
	texts: {},
	frame: { x: 1740, y: 96, w: 300, h: 640 },
};

const ORIGINAL = new Map(ELEMENTS.map((element) => [element.id, element.className ?? ""]));

/** where the field draws the frame: its own x/y are canvas space, the field shows them offset */
const FIELD_ORIGIN = { x: 1452, y: -16 } as const;

export function PropertiesScreen() {
	const [state, setState] = useState<Snapshot>(INITIAL);
	const [history, setHistory] = useState<readonly Snapshot[]>([]);
	const [selection, setSelection] = useState<Pick | null>({ id: "pay", key: "pay" });
	const [hover, setHover] = useState<Pick | null>(null);
	const [boxes, setBoxes] = useState<ReadonlyMap<string, Rect>>(new Map());
	const [drag, setDrag] = useState<Drag | null>(null);
	const fieldRef = useRef<HTMLDivElement | null>(null);
	const stageRef = useRef<HTMLDivElement | null>(null);
	const stateBeforeDrag = useRef<Snapshot | null>(null);

	const stageLeft = state.frame.x - FIELD_ORIGIN.x;
	const stageTop = state.frame.y - FIELD_ORIGIN.y;

	/* ---------- measuring: the document's own boxes, in the field's space ---------- */

	const measure = useCallback(() => {
		const field = fieldRef.current;
		const stage = stageRef.current;
		if (field === null || stage === null) return;
		const origin = field.getBoundingClientRect();
		const next = new Map<string, Rect>();
		for (const node of stage.querySelectorAll<HTMLElement>("[data-node]")) {
			const id = node.dataset.node ?? "";
			const key = node.dataset.key ?? id;
			const rect = node.getBoundingClientRect();
			next.set(`${id}:${key}`, { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height });
		}
		setBoxes(next);
	}, []);

	useLayoutEffect(measure, [measure, state]);
	useEffect(() => {
		addEventListener("resize", measure);
		return () => removeEventListener("resize", measure);
	}, [measure]);

	/* ---------- writing: one commit, one undo entry ---------- */

	const commit = useCallback((change: (snapshot: Snapshot) => Snapshot) => {
		setState((current) => {
			const next = change(current);
			if (next === current) return current;
			setHistory((stack) => [...stack, current]);
			return next;
		});
	}, []);

	const setClassName = useCallback(
		(id: string, next: (className: string | null) => string, provisional = false) => {
			const apply = (snapshot: Snapshot): Snapshot => ({
				...snapshot,
				classes: { ...snapshot.classes, [id]: next(snapshot.classes[id] ?? null) },
			});
			if (provisional) setState(apply);
			else commit(apply);
		},
		[commit],
	);

	const undo = useCallback(() => {
		setHistory((stack) => {
			const last = stack[stack.length - 1];
			if (last === undefined) return stack;
			setState(last);
			return stack.slice(0, -1);
		});
	}, []);

	const ascend = useCallback(() => {
		setSelection((held) => {
			if (held === null) return null;
			const element = elementOf(held.id);
			if (element?.parent === undefined || element.parent === null) return null;
			const parent = elementOf(element.parent);
			return parent === undefined ? null : { id: parent.id, key: parent.mapped === undefined ? parent.id : held.key };
		});
	}, []);

	useEffect(() => {
		const down = (event: KeyboardEvent) => {
			if (
				event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLTextAreaElement ||
				event.target instanceof HTMLSelectElement
			)
				return;
			if (event.key === "Escape") ascend();
			if ((event.metaKey || event.ctrlKey) && event.key === "z") {
				event.preventDefault();
				undo();
			}
		};
		addEventListener("keydown", down);
		return () => removeEventListener("keydown", down);
	}, [ascend, undo]);

	/* ---------- pointing ---------- */

	const pickFrom = (target: EventTarget | null): Pick | null => {
		let node = target instanceof Element ? target : null;
		while (node !== null && stageRef.current?.contains(node)) {
			const id = node.getAttribute("data-node");
			if (id !== null) return { id, key: node.getAttribute("data-key") ?? id };
			node = node.parentElement;
		}
		return null;
	};

	/* ---------- the drag: the class moves under the pointer ---------- */

	const startDrag = (pick: Pick, axis: "w" | "h", event: React.PointerEvent) => {
		const box = boxes.get(`${pick.id}:${pick.key}`);
		if (box === undefined) return;
		event.preventDefault();
		event.stopPropagation();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		const startPx = axis === "w" ? box.w : box.h;
		stateBeforeDrag.current = state;
		setDrag({
			id: pick.id,
			key: pick.key,
			axis,
			startPx,
			startAt: axis === "w" ? event.clientX : event.clientY,
			other: axis === "w" ? box.h : box.w,
			live: startPx,
		});
	};

	const applyDrag = (snapshot: Snapshot, current: Drag, value: string | number): Snapshot => {
		// the frame's own edge writes frame.json; an element's writes its class
		if (current.id === "screen") {
			const px = typeof value === "number" ? value : (valuePx(value) ?? current.live);
			return { ...snapshot, frame: { ...snapshot.frame, [current.axis]: px } };
		}
		const token = typeof value === "number" ? `[${value}px]` : value;
		return {
			...snapshot,
			classes: {
				...snapshot.classes,
				[current.id]: withToken(snapshot.classes[current.id] ?? null, current.axis, token),
			},
		};
	};

	const moveDrag = (event: React.PointerEvent) => {
		if (drag === null) return;
		const delta = (drag.axis === "w" ? event.clientX : event.clientY) - drag.startAt;
		const live = Math.max(8, Math.round(drag.startPx + delta));
		if (live === drag.live) return;
		const next = { ...drag, live };
		setDrag(next);
		setState((snapshot) => applyDrag(snapshot, next, live));
	};

	const endDrag = () => {
		if (drag === null) return;
		const before = stateBeforeDrag.current;
		// the drop decides the token: provisional pixels become the scale when they land on a step
		setState((snapshot) => applyDrag(snapshot, drag, drag.id === "screen" ? drag.live : pxValue(drag.live)));
		if (before !== null) setHistory((stack) => [...stack, before]);
		stateBeforeDrag.current = null;
		setDrag(null);
	};

	/* ---------- what the rail reads ---------- */

	const element = selection === null ? null : (elementOf(selection.id) ?? null);
	const box = selection === null ? undefined : boxes.get(`${selection.id}:${selection.key}`);
	const root = boxes.get("screen:screen") ?? { x: stageLeft, y: stageTop + LABEL_H, w: state.frame.w, h: state.frame.h };
	const reading: Reading | null =
		element === null || selection === null
			? null
			: {
					element,
					pick: selection,
					className: state.classes[element.id] ?? "",
					text:
						state.texts[element.id] ??
						(element.text !== undefined && "literal" in element.text ? element.text.literal : null),
					box: box ?? { x: 0, y: 0, w: 0, h: 0 },
					inFrame: box === undefined ? { x: 0, y: 0 } : { x: box.x - root.x, y: box.y - root.y },
					frame: state.frame,
				};

	const acts: Acts = {
		setClass: (id, next) => setClassName(id, next),
		setText: (id, text) => commit((snapshot) => ({ ...snapshot, texts: { ...snapshot.texts, [id]: text } })),
		setFrame: (patch) => commit((snapshot) => ({ ...snapshot, frame: { ...snapshot.frame, ...patch } })),
		select: (pick) => setSelection(pick),
		undo,
		canUndo: history.length > 0,
	};

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="100%">
			<CanvasChrome
				pages={PAGES}
				selected={FRAME}
				tool="select"
				railLabel="properties"
				railWidth={RAIL_W}
				rail={<Rail reading={reading} acts={acts} />}
			>
				<div ref={fieldRef} className="absolute inset-0">
					<Still left={36} top={190} name="menu" />
					<Still left={664} top={150} name="receipt" />

					<div className="absolute flex flex-col gap-1.5" style={{ left: stageLeft, top: stageTop }}>
						<button
							type="button"
							onClick={() => setSelection({ id: "screen", key: "screen" })}
							className="flex h-4 items-center gap-1.5 font-mono text-sm leading-4"
							style={{ width: state.frame.w }}
						>
							<span className={cn(selection?.id === "screen" ? "text-thread" : "text-muted")}>{FRAME}</span>
							<span className="ml-auto font-mono text-2xs text-muted/55 leading-3">
								{state.frame.w} × {state.frame.h}
							</span>
						</button>
						<div
							ref={stageRef}
							onPointerMove={(event) => {
								if (drag === null) setHover(pickFrom(event.target));
							}}
							onPointerLeave={() => setHover(null)}
							onClick={(event) => {
								if (drag !== null) return;
								const pick = pickFrom(event.target);
								if (pick !== null) setSelection(pick);
							}}
							className="relative overflow-hidden rounded-[10px] border border-border bg-bg"
							style={{ width: state.frame.w, height: state.frame.h }}
						>
							<PropertiesCart classes={state.classes} texts={state.texts} elements={ELEMENTS} />
						</div>
					</div>

					<Overlay
						boxes={boxes}
						hover={hover}
						selection={selection}
						drag={drag}
						onKnob={startDrag}
						onKnobMove={moveDrag}
						onKnobUp={endDrag}
					/>
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

/* ---------- shared shapes ---------- */

interface Reading {
	element: SourceElement;
	pick: Pick;
	className: string;
	text: string | null;
	box: Rect;
	/** where the element landed inside the frame, which is what position reads */
	inFrame: { x: number; y: number };
	frame: Geometry;
}

interface Acts {
	setClass: (id: string, next: (className: string | null) => string) => void;
	setText: (id: string, text: string) => void;
	setFrame: (patch: Partial<Geometry>) => void;
	select: (pick: Pick) => void;
	undo: () => void;
	canUndo: boolean;
}

/* ---------- the overlay: ring, knobs, readout ---------- */

function Overlay({
	boxes,
	hover,
	selection,
	drag,
	onKnob,
	onKnobMove,
	onKnobUp,
}: {
	boxes: ReadonlyMap<string, Rect>;
	hover: Pick | null;
	selection: Pick | null;
	drag: Drag | null;
	onKnob: (pick: Pick, axis: "w" | "h", event: React.PointerEvent) => void;
	onKnobMove: (event: React.PointerEvent) => void;
	onKnobUp: () => void;
}) {
	const selected = selection === null ? undefined : boxes.get(`${selection.id}:${selection.key}`);
	const element = selection === null ? undefined : elementOf(selection.id);
	const hovered =
		hover === null || (selection !== null && hover.id === selection.id && hover.key === selection.key)
			? undefined
			: boxes.get(`${hover.id}:${hover.key}`);
	const wOk = element !== undefined && sizeVerdict(element, "w").ok;
	const hOk = element !== undefined && sizeVerdict(element, "h").ok;
	const anyOk =
		element !== undefined &&
		(wOk || hOk || spacingVerdict(element).ok || textVerdict(element).ok || wordVerdict(element).ok);
	const siblings =
		selection === null || element?.mapped === undefined
			? []
			: [...boxes.entries()].filter(
					([key]) => key.startsWith(`${selection.id}:`) && key !== `${selection.id}:${selection.key}`,
				);
	const isFrame = selection?.id === "screen";
	const inset = isFrame ? 0 : 2;

	return (
		<div className="pointer-events-none absolute inset-0">
			{hovered === undefined ? null : (
				<span
					className="absolute rounded-[3px] border border-thread/55"
					style={{ left: hovered.x - 2, top: hovered.y - 2, width: hovered.w + 4, height: hovered.h + 4 }}
				/>
			)}
			{siblings.map(([key, rect]) => (
				<span
					key={key}
					className="absolute rounded-[3px] border border-thread/30"
					style={{ left: rect.x - 2, top: rect.y - 2, width: rect.w + 4, height: rect.h + 4 }}
				/>
			))}
			{selected === undefined || selection === null ? null : (
				<>
					<span
						className={cn("absolute border-[1.5px] border-thread", isFrame ? "rounded-[12px]" : "rounded-[3px]")}
						style={{
							left: selected.x - inset - (isFrame ? 3 : 0),
							top: selected.y - inset - (isFrame ? 3 : 0),
							width: selected.w + inset * 2 + (isFrame ? 6 : 0),
							height: selected.h + inset * 2 + (isFrame ? 6 : 0),
						}}
					/>
					{anyOk ? null : (
						<span
							className="absolute rounded-xs bg-raised px-1.5 py-[2px] font-mono text-2xs text-muted leading-3"
							style={{ left: selected.x + selected.w - 54, top: selected.y - 20 }}
						>
							read-only
						</span>
					)}
					{wOk ? (
						<span
							onPointerDown={(event) => onKnob(selection, "w", event)}
							onPointerMove={onKnobMove}
							onPointerUp={onKnobUp}
							className="pointer-events-auto absolute h-3 w-3 cursor-ew-resize rounded-[1.5px] border-[1.5px] border-thread bg-on-thread"
							style={{ left: selected.x + selected.w - 4 + (isFrame ? 3 : 0), top: selected.y + selected.h / 2 - 6 }}
						/>
					) : null}
					{hOk ? (
						<span
							onPointerDown={(event) => onKnob(selection, "h", event)}
							onPointerMove={onKnobMove}
							onPointerUp={onKnobUp}
							className="pointer-events-auto absolute h-3 w-3 cursor-ns-resize rounded-[1.5px] border-[1.5px] border-thread bg-on-thread"
							style={{ left: selected.x + selected.w / 2 - 6, top: selected.y + selected.h - 4 + (isFrame ? 3 : 0) }}
						/>
					) : null}
					{drag === null ? null : (
						<span
							className="absolute whitespace-nowrap rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3"
							style={{
								left: drag.axis === "w" ? selected.x + selected.w + 12 : selected.x + selected.w / 2 + 12,
								top: drag.axis === "w" ? selected.y + selected.h / 2 - 9 : selected.y + selected.h + 10,
							}}
						>
							{drag.axis === "w"
								? `${drag.live} × ${Math.round(drag.other)}`
								: `${Math.round(drag.other)} × ${drag.live}`}
						</span>
					)}
				</>
			)}
		</div>
	);
}

/* ---------- primitives ---------- */

const FIELD = "h-6 rounded-sm border border-border bg-surface font-mono text-sm leading-sm text-text";
const MUTE = "font-mono text-2xs text-muted/55 leading-3";

/**
 * A length. The label lives inside the box the way Figma's X/Y/W/H do, the
 * token is the value, the pixels sit faint at the right. Arrow keys step a
 * scale unit. Read-only draws the same box without a border.
 */
function NumberBox({
	label,
	value,
	px,
	ok,
	onCommit,
	onNudge,
	wide = false,
}: {
	label: string;
	value: string;
	px: string | null;
	ok: boolean;
	onCommit: (typed: string) => void;
	onNudge: (direction: 1 | -1) => void;
	wide?: boolean;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	return (
		<label
			className={cn(
				"relative flex min-w-0 items-center gap-1.5 px-1.5",
				FIELD,
				wide ? "flex-1" : "w-[104px]",
				!ok && "border-transparent bg-transparent text-muted",
			)}
		>
			<span className={cn("w-[18px] shrink-0", MUTE)}>{label}</span>
			{ok ? (
				<input
					value={draft ?? value}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={() => {
						if (draft !== null && draft !== value) onCommit(draft);
						setDraft(null);
					}}
					onKeyDown={(event) => {
						event.stopPropagation();
						if (event.key === "Enter") (event.target as HTMLInputElement).blur();
						if (event.key === "Escape") {
							setDraft(null);
							(event.target as HTMLInputElement).blur();
						}
						if (event.key === "ArrowUp" || event.key === "ArrowDown") {
							event.preventDefault();
							setDraft(null);
							onNudge(event.key === "ArrowUp" ? 1 : -1);
						}
					}}
					className="min-w-0 flex-1 bg-transparent font-mono text-sm text-text leading-sm outline-none"
				/>
			) : (
				<span className="min-w-0 flex-1 truncate">{value}</span>
			)}
			{px === null ? null : <span className={cn("shrink-0", MUTE)}>{px}</span>}
		</label>
	);
}

/** a word list: a select, because three or more words in a row is a menu and not a toggle */
function Select({
	value,
	options,
	ok,
	onChange,
	placeholder = "default",
	className,
}: {
	value: string | null;
	options: readonly { token: string; says: string }[];
	ok: boolean;
	onChange: (token: string | null) => void;
	placeholder?: string;
	className?: string;
}) {
	if (!ok) {
		const says = options.find((option) => option.token === value)?.says ?? placeholder;
		return <span className={cn("flex h-6 items-center px-1.5 font-mono text-muted text-sm leading-sm", className)}>{says}</span>;
	}
	return (
		<span className={cn("relative flex items-center", FIELD, className)}>
			<select
				value={value ?? ""}
				onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
				onKeyDown={(event) => event.stopPropagation()}
				className="h-full w-full cursor-pointer appearance-none bg-transparent pr-5 pl-1.5 font-mono text-sm text-text leading-sm outline-none"
			>
				<option value="">{placeholder}</option>
				{options.map((option) => (
					<option key={option.token} value={option.token}>
						{option.says}
					</option>
				))}
			</select>
			<svg viewBox="0 0 8 8" className="pointer-events-none absolute right-1.5 h-2 w-2 text-muted" fill="none" aria-hidden="true">
				<path d="M1.5 3 4 5.5 6.5 3" stroke="currentColor" strokeWidth="1.2" />
			</svg>
		</span>
	);
}

/** two or three words that are pictures: direction, text alignment. One lit, the rest quiet. */
function IconPair({
	value,
	options,
	ok,
	onChange,
}: {
	value: string | null;
	options: readonly { token: string; says: string; icon: ReactNode }[];
	ok: boolean;
	onChange: (token: string | null) => void;
}) {
	return (
		<span className={cn("flex items-center gap-px rounded-sm border border-border bg-surface p-px", !ok && "border-transparent bg-transparent")}>
			{options.map((option) => {
				const on = option.token === value;
				return (
					<button
						key={option.token}
						type="button"
						title={option.token}
						aria-label={option.says}
						aria-pressed={on}
						disabled={!ok}
						onClick={() => onChange(on ? null : option.token)}
						className={cn(
							"flex h-5 w-6 items-center justify-center rounded-[3px]",
							ok ? "cursor-pointer" : "cursor-default",
							on ? "bg-raised text-text" : ok ? "text-muted/70 hover:text-text" : "text-muted/40",
						)}
					>
						{option.icon}
					</button>
				);
			})}
		</span>
	);
}

/** a yes or no: wrap, split sides. A small pressed chip. */
function Toggle({ on, label, ok, onChange }: { on: boolean; label: string; ok: boolean; onChange: (on: boolean) => void }) {
	return (
		<button
			type="button"
			aria-pressed={on}
			disabled={!ok}
			onClick={() => onChange(!on)}
			className={cn(
				"h-6 rounded-sm border px-1.5 font-mono text-2xs leading-3",
				ok ? "cursor-pointer" : "cursor-default",
				on ? "border-border-raised bg-raised text-text" : "border-border text-muted/70",
				ok && !on && "hover:text-text",
				!ok && "border-transparent text-muted/40",
			)}
		>
			{label}
		</button>
	);
}

/**
 * Figma's nine dots, for `items-*` and `justify-*` together. Columns are the
 * main axis and rows the cross axis, so the grid turns when the direction does.
 * Between, around and evenly have no dot; they live in the select beside it and
 * light the whole row.
 */
function AlignGrid({
	align,
	justify,
	column,
	ok,
	onPick,
}: {
	align: string | null;
	justify: string | null;
	column: boolean;
	ok: boolean;
	onPick: (align: string, justify: string) => void;
}) {
	const THREE = ["start", "center", "end"] as const;
	const alignSays = align === null ? "stretch" : align.slice("items-".length);
	const justifySays = justify === null ? "start" : justify.slice("justify-".length);
	const distributed = !THREE.includes(justifySays as (typeof THREE)[number]);
	return (
		<span
			className={cn(
				"grid h-[52px] w-[52px] shrink-0 grid-cols-3 grid-rows-3 gap-px rounded-sm border border-border bg-surface p-[3px]",
				!ok && "border-transparent bg-transparent",
			)}
		>
			{[0, 1, 2].flatMap((row) =>
				[0, 1, 2].map((col) => {
					// in a row the main axis runs across, in a column it runs down
					const main = THREE[column ? row : col] ?? "start";
					const cross = THREE[column ? col : row] ?? "start";
					const on = (distributed || main === justifySays) && cross === alignSays;
					const stretchRow = alignSays === "stretch" && main === justifySays;
					return (
						<button
							key={`${row}-${col}`}
							type="button"
							disabled={!ok}
							title={`items-${cross} justify-${main}`}
							onClick={() => onPick(`items-${cross}`, `justify-${main}`)}
							className={cn("flex items-center justify-center rounded-[2px]", ok ? "cursor-pointer hover:bg-raised" : "cursor-default")}
						>
							<span
								className={cn(
									"rounded-full",
									on ? "h-[5px] w-[5px] bg-thread" : stretchRow ? "h-[5px] w-[5px] bg-muted/50" : "h-[3px] w-[3px] bg-muted/35",
									on && distributed && "h-[3px] w-[7px] rounded-[1px]",
								)}
							/>
						</button>
					);
				}),
			)}
		</span>
	);
}

/** a colour that reads: the swatch, the token, the hex faint */
function Swatch({ named, label }: { named: Named; label: string }) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<span className={cn("w-[44px] shrink-0", MUTE)}>{label}</span>
			<span
				className="h-4 w-4 shrink-0 rounded-[3px] border border-border-raised"
				style={{ background: named.value === "" ? "transparent" : named.value }}
			/>
			<span className="min-w-0 truncate font-mono text-muted text-sm leading-sm">{named.token ?? named.from}</span>
			<span className={cn("ml-auto shrink-0", MUTE)}>{named.value === "" ? "none" : named.value}</span>
		</div>
	);
}

/** a value that only reads, with where it comes from */
function ReadRow({ label, value, from }: { label: string; value: string; from: string }) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<span className={cn("w-[44px] shrink-0", MUTE)}>{label}</span>
			<span className="min-w-0 truncate font-mono text-muted text-sm leading-sm">{value}</span>
			<span className={cn("ml-auto min-w-0 shrink truncate", MUTE)}>{from}</span>
		</div>
	);
}

/** a labelled row: the label in the gutter, the control after it */
function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<span className={cn("w-[44px] shrink-0", MUTE)}>{label}</span>
			<div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
		</div>
	);
}

function Section({ title, note, reason, children }: { title: string; note?: string | undefined; reason?: string | undefined; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-2 border-border border-b px-4 py-3">
			<div className="flex min-w-0 items-baseline gap-2">
				<span className="font-mono text-2xs text-muted leading-3">{title}</span>
				{note === undefined ? null : <span className={MUTE}>{note}</span>}
				{reason === undefined ? null : <span className={cn("ml-auto min-w-0 truncate", MUTE)}>{reason}</span>}
			</div>
			{children}
		</div>
	);
}

function noteOf(verdict: Verdict): string | undefined {
	return verdict.ok ? verdict.scope : undefined;
}

function reasonOf(verdict: Verdict): string | undefined {
	return verdict.ok ? undefined : verdict.reason;
}

/* ---------- icons the pairs use ---------- */

function ArrowIcon({ down = false }: { down?: boolean }) {
	return (
		<svg viewBox="0 0 12 12" className={cn("h-3 w-3", down && "rotate-90")} fill="none" aria-hidden="true">
			<path d="M2 6h7M6.5 3.5 9 6l-2.5 2.5" stroke="currentColor" strokeWidth="1.3" />
		</svg>
	);
}

function LinesIcon({ at }: { at: "left" | "center" | "right" }) {
	const x = (w: number) => (at === "left" ? 2 : at === "center" ? 6 - w / 2 : 10 - w);
	return (
		<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
			<path d={`M2 3h8M${x(6)} 6h6M${x(8)} 9h8`} stroke="currentColor" strokeWidth="1.2" />
		</svg>
	);
}

/* ---------- the rail ---------- */

function Rail({ reading, acts }: { reading: Reading | null; acts: Acts }) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex h-11 shrink-0 items-center gap-2 border-border border-b pr-2 pl-4">
				{reading === null ? (
					<span className="font-semibold text-base leading-base">properties</span>
				) : (
					<Crumbs reading={reading} acts={acts} />
				)}
				<span className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center text-muted/60">
					<PanelCaret dir="right" className="h-3.5 w-2.5" />
				</span>
			</div>
			{reading === null ? (
				<p className="px-4 pt-3 font-mono text-2xs text-muted/55 leading-4">select an element</p>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto">
					<PositionSection reading={reading} acts={acts} />
					<SizeSection reading={reading} acts={acts} />
					<LayoutSection key={reading.element.id} reading={reading} acts={acts} />
					<AppearanceSection reading={reading} acts={acts} />
					<FillSection reading={reading} />
					<StrokeSection reading={reading} acts={acts} />
					{reading.element.text === undefined && reading.element.display !== "inline" ? null : (
						<TextSection reading={reading} acts={acts} />
					)}
					<Section title="source">
						<SourceLine reading={reading} acts={acts} />
					</Section>
				</div>
			)}
		</div>
	);
}

/** the frame's position is frame.json's; an element's is where it landed, and how it is positioned */
function PositionSection({ reading, acts }: { reading: Reading; acts: Acts }) {
	const isFrame = reading.element.id === "screen";
	const verdict = wordVerdict(reading.element);
	if (isFrame) {
		return (
			<Section title="position" note="frame.json">
				<div className="flex items-center gap-1.5">
					<NumberBox
						label="X"
						value={String(reading.frame.x)}
						px={null}
						ok
						onCommit={(typed) => {
							const n = Number.parseInt(typed, 10);
							if (!Number.isNaN(n)) acts.setFrame({ x: n });
						}}
						onNudge={(direction) => acts.setFrame({ x: reading.frame.x + direction })}
					/>
					<NumberBox
						label="Y"
						value={String(reading.frame.y)}
						px={null}
						ok
						onCommit={(typed) => {
							const n = Number.parseInt(typed, 10);
							if (!Number.isNaN(n)) acts.setFrame({ y: n });
						}}
						onNudge={(direction) => acts.setFrame({ y: reading.frame.y + direction })}
					/>
				</div>
			</Section>
		);
	}
	const position = wordOf(reading.className, "position");
	const inset = position !== null && position !== "static" && position !== "relative";
	return (
		<Section title="position" note={noteOf(verdict)} reason={reasonOf(verdict)}>
			<div className="flex items-center gap-1.5">
				<NumberBox label="X" value={String(Math.round(reading.inFrame.x))} px={null} ok={false} onCommit={() => {}} onNudge={() => {}} />
				<NumberBox label="Y" value={String(Math.round(reading.inFrame.y))} px={null} ok={false} onCommit={() => {}} onNudge={() => {}} />
				<span className={MUTE}>in cart</span>
			</div>
			<Row label="position">
				<Select
					value={position}
					options={WORDS.position.options}
					ok={verdict.ok}
					placeholder="static"
					className="w-[104px]"
					onChange={(token) => acts.setClass(reading.element.id, (className) => withWord(className, "position", token))}
				/>
			</Row>
			{inset ? (
				<div className="flex flex-wrap items-center gap-1.5 pl-[52px]">
					{(["top", "right", "bottom", "left"] as const).map((family) => {
						const token = tokenOf(reading.className, family);
						return (
							<NumberBox
								key={family}
								label={family[0]?.toUpperCase() ?? ""}
								value={token === null ? "–" : valueOf(token)}
								px={token === null ? null : pxOf(valueOf(token))}
								ok={verdict.ok}
								onCommit={(typed) => {
									const value = parse(typed);
									if (value !== null) acts.setClass(reading.element.id, (className) => withToken(className, family, value));
								}}
								onNudge={(direction) =>
									acts.setClass(reading.element.id, (className) => withToken(className, family, nudge(token, 0, direction)))
								}
							/>
						);
					})}
				</div>
			) : null}
		</Section>
	);
}

function pxOf(value: string): string | null {
	const px = valuePx(value);
	return px === null ? null : `${px}px`;
}

const MODES: readonly { token: SizeMode; says: string }[] = [
	{ token: "hug", says: "hug" },
	{ token: "fill", says: "fill" },
	{ token: "fixed", says: "fixed" },
];

/** w and h, each a mode and a number: hug is no token, fill is `full`, fixed is the scale or pixels */
function SizeSection({ reading, acts }: { reading: Reading; acts: Acts }) {
	const isFrame = reading.element.id === "screen";
	if (isFrame) {
		return (
			<Section title="size" note="frame.json">
				<div className="flex items-center gap-1.5">
					<NumberBox
						label="W"
						value={String(reading.frame.w)}
						px={null}
						ok
						onCommit={(typed) => {
							const n = Number.parseInt(typed, 10);
							if (!Number.isNaN(n) && n > 40) acts.setFrame({ w: n });
						}}
						onNudge={(direction) => acts.setFrame({ w: reading.frame.w + direction })}
					/>
					<NumberBox
						label="H"
						value={String(reading.frame.h)}
						px={null}
						ok
						onCommit={(typed) => {
							const n = Number.parseInt(typed, 10);
							if (!Number.isNaN(n) && n > 40) acts.setFrame({ h: n });
						}}
						onNudge={(direction) => acts.setFrame({ h: reading.frame.h + direction })}
					/>
				</div>
			</Section>
		);
	}
	const wV = sizeVerdict(reading.element, "w");
	const hV = sizeVerdict(reading.element, "h");
	const worst = !wV.ok ? wV : hV;
	return (
		<Section title="size" note={noteOf(wV)} reason={reasonOf(worst)}>
			{(["w", "h"] as const).map((axis) => {
				const verdict = axis === "w" ? wV : hV;
				const token = tokenOf(reading.className, axis);
				const measured = axis === "w" ? reading.box.w : reading.box.h;
				const mode = sizeModeOf(reading.className, axis);
				return (
					<div key={axis} className="flex items-center gap-1.5">
						<NumberBox
							label={axis.toUpperCase()}
							value={mode === "fixed" && token !== null ? valueOf(token) : `${Math.round(measured)}px`}
							px={mode === "fixed" ? `${Math.round(measured)}px` : null}
							ok={verdict.ok && mode === "fixed"}
							onCommit={(typed) => {
								const value = parse(typed);
								if (value !== null) acts.setClass(reading.element.id, (className) => withToken(className, axis, value));
							}}
							onNudge={(direction) =>
								acts.setClass(reading.element.id, (className) => withToken(className, axis, nudge(token, measured, direction)))
							}
						/>
						<Select
							value={mode}
							options={MODES}
							ok={verdict.ok}
							placeholder="hug"
							className="w-[72px]"
							onChange={(next) =>
								acts.setClass(reading.element.id, (className) =>
									withSizeMode(className, axis, (next ?? "hug") as SizeMode, measured),
								)
							}
						/>
					</div>
				);
			})}
		</Section>
	);
}

/** display, then what the display asks for; padding and gap under it */
function LayoutSection({ reading, acts }: { reading: Reading; acts: Acts }) {
	const words = wordVerdict(reading.element);
	const spacing = spacingVerdict(reading.element);
	const [sides, setSides] = useState(false);
	const [split, setSplit] = useState(false);
	const display = wordOf(reading.className, "display");
	const flex = display === "flex" || display === "inline-flex";
	const grid = display === "grid";
	const column = wordOf(reading.className, "direction") === "flex-col";
	const padding = paddingOf(reading.className);
	const fourSided = sides || !(padding.t === padding.b && padding.l === padding.r);
	const gap = gapOf(reading.className);
	const splitGap = split || gap.x !== gap.y;
	const set = (next: (className: string | null) => string) => acts.setClass(reading.element.id, next);
	const justify = wordOf(reading.className, "justify");
	const distributed = ["justify-between", "justify-around", "justify-evenly"].includes(justify ?? "");

	return (
		<Section title="layout" note={noteOf(words)} reason={reasonOf(words)}>
			<Row label="display">
				<Select
					value={display}
					options={WORDS.display.options}
					ok={words.ok}
					placeholder={WORDS.display.fallback}
					className="w-[104px]"
					onChange={(token) => set((className) => withWord(className, "display", token))}
				/>
				{flex ? (
					<>
						<IconPair
							value={wordOf(reading.className, "direction") ?? "flex-row"}
							ok={words.ok}
							options={[
								{ token: "flex-row", says: "row", icon: <ArrowIcon /> },
								{ token: "flex-col", says: "column", icon: <ArrowIcon down /> },
							]}
							onChange={(token) => set((className) => withWord(className, "direction", token === "flex-row" ? null : token))}
						/>
						<Toggle
							on={wordOf(reading.className, "wrap") === "flex-wrap"}
							label="wrap"
							ok={words.ok}
							onChange={(on) => set((className) => withWord(className, "wrap", on ? "flex-wrap" : null))}
						/>
					</>
				) : null}
			</Row>
			{flex ? (
				<Row label="align">
					<AlignGrid
						align={wordOf(reading.className, "align")}
						justify={justify}
						column={column}
						ok={words.ok}
						onPick={(align, next) =>
							set((className) => withWord(withWord(className, "align", align), "justify", next === "justify-start" ? null : next))
						}
					/>
					<div className="flex min-w-0 flex-1 flex-col gap-1.5">
						<Select
							value={distributed ? justify : null}
							options={WORDS.justify.options.filter((option) => option.says === "between" || option.says === "around" || option.says === "evenly")}
							ok={words.ok}
							placeholder="packed"
							onChange={(token) => set((className) => withWord(className, "justify", token))}
						/>
						<Select
							value={wordOf(reading.className, "align")}
							options={WORDS.align.options}
							ok={words.ok}
							placeholder="stretch"
							onChange={(token) => set((className) => withWord(className, "align", token))}
						/>
					</div>
				</Row>
			) : null}
			{grid ? (
				<Row label="columns">
					<NumberBox
						label="n"
						value={tokenOf(reading.className, "grid-cols") === null ? "–" : valueOf(tokenOf(reading.className, "grid-cols") ?? "")}
						px={null}
						ok={words.ok}
						onCommit={(typed) => {
							if (/^\d+$/.test(typed.trim())) set((className) => withToken(className, "grid-cols", typed.trim()));
						}}
						onNudge={() => {}}
					/>
				</Row>
			) : null}
			{flex || grid ? (
				<Row label="gap">
					{splitGap ? (
						<>
							<GapBox label="X" value={gap.x} ok={spacing.ok} onValue={(value) => set((className) => withGap(className, { ...gapOf(className), x: value }))} />
							<GapBox label="Y" value={gap.y} ok={spacing.ok} onValue={(value) => set((className) => withGap(className, { ...gapOf(className), y: value }))} />
						</>
					) : (
						<GapBox label="" value={gap.x} ok={spacing.ok} onValue={(value) => set((className) => withGap(className, { x: value, y: value }))} />
					)}
					<Toggle on={splitGap} label="x y" ok={spacing.ok && gap.x === gap.y} onChange={setSplit} />
				</Row>
			) : null}
			<Row label="padding">
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					{fourSided ? (
						<>
							<div className="flex items-center gap-1.5">
								<PadBox side="t" padding={padding} ok={spacing.ok} set={set} />
								<PadBox side="r" padding={padding} ok={spacing.ok} set={set} />
							</div>
							<div className="flex items-center gap-1.5">
								<PadBox side="b" padding={padding} ok={spacing.ok} set={set} />
								<PadBox side="l" padding={padding} ok={spacing.ok} set={set} />
							</div>
						</>
					) : (
						<div className="flex items-center gap-1.5">
							<PadBox side="x" padding={padding} ok={spacing.ok} set={set} />
							<PadBox side="y" padding={padding} ok={spacing.ok} set={set} />
						</div>
					)}
				</div>
				<Toggle on={fourSided} label="sides" ok={spacing.ok && padding.t === padding.b && padding.l === padding.r} onChange={setSides} />
			</Row>
			{spacing.ok || (!words.ok && words.reason === spacing.reason) ? null : <span className={MUTE}>{spacing.reason}</span>}
		</Section>
	);
}

function GapBox({ label, value, ok, onValue }: { label: string; value: string | null; ok: boolean; onValue: (value: string | null) => void }) {
	return (
		<NumberBox
			label={label}
			value={value ?? "–"}
			px={value === null ? "0px" : pxOf(value)}
			ok={ok}
			onCommit={(typed) => {
				const next = parse(typed);
				if (next !== null) onValue(next);
			}}
			onNudge={(direction) => onValue(nudge(value === null ? null : `gap-${value}`, 0, direction))}
		/>
	);
}

function PadBox({
	side,
	padding,
	ok,
	set,
}: {
	side: Side | "x" | "y";
	padding: Record<Side, string | null>;
	ok: boolean;
	set: (next: (className: string | null) => string) => void;
}) {
	const value = side === "x" ? padding.l : side === "y" ? padding.t : padding[side];
	const write = (next: string) =>
		set((className) => {
			const now = paddingOf(className);
			if (side === "x") return withPadding(className, { ...now, l: next, r: next });
			if (side === "y") return withPadding(className, { ...now, t: next, b: next });
			return withPadding(className, { ...now, [side]: next });
		});
	return (
		<NumberBox
			label={side.toUpperCase()}
			value={value ?? "–"}
			px={value === null ? "0px" : pxOf(value)}
			ok={ok}
			onCommit={(typed) => {
				const next = parse(typed);
				if (next !== null) write(next);
			}}
			onNudge={(direction) => write(nudge(value === null ? null : `p-${value}`, 0, direction))}
		/>
	);
}

/** opacity writes, overflow writes, radius and shadow are tokens and read */
function AppearanceSection({ reading, acts }: { reading: Reading; acts: Acts }) {
	const words = wordVerdict(reading.element);
	const list = staticTokens(reading.element, reading.className);
	const opacity = tokenOf(reading.className, "opacity");
	const radius = radiusOf(list);
	const shadow = shadowOf(list);
	return (
		<Section title="appearance" note={noteOf(words)} reason={reasonOf(words)}>
			<Row label="opacity">
				<NumberBox
					label="%"
					value={opacity === null ? "100" : valueOf(opacity)}
					px={null}
					ok={words.ok}
					onCommit={(typed) => {
						const n = Number.parseInt(typed, 10);
						if (!Number.isNaN(n)) acts.setClass(reading.element.id, (className) => withToken(className, "opacity", n >= 100 ? null : String(Math.max(0, n))));
					}}
					onNudge={(direction) => {
						const now = opacity === null ? 100 : Number(valueOf(opacity));
						const next = Math.min(100, Math.max(0, now + direction * 5));
						acts.setClass(reading.element.id, (className) => withToken(className, "opacity", next >= 100 ? null : String(next)));
					}}
				/>
				<Select
					value={wordOf(reading.className, "overflow")}
					options={WORDS.overflow.options}
					ok={words.ok}
					placeholder="visible"
					className="w-[88px]"
					onChange={(token) => acts.setClass(reading.element.id, (className) => withWord(className, "overflow", token))}
				/>
			</Row>
			<ReadRow label="radius" value={radius.token ?? "none"} from={radius.token === null ? "" : radius.value} />
			{shadow.token === null ? null : <ReadRow label="shadow" value={shadow.token} from="token" />}
		</Section>
	);
}

function FillSection({ reading }: { reading: Reading }) {
	const list = staticTokens(reading.element, reading.className);
	const bg = colorOf(list, "bg");
	return (
		<Section title="fill" reason={TOKEN_WAITS}>
			<Swatch label="color" named={bg} />
		</Section>
	);
}

/** the width writes (a number), the colour reads (a token) */
function StrokeSection({ reading, acts }: { reading: Reading; acts: Acts }) {
	const words = wordVerdict(reading.element);
	const list = staticTokens(reading.element, reading.className);
	const hasBorder = list.includes("border") || tokenOf(reading.className, "border") !== null;
	const width = tokenOf(reading.className, "border");
	const px = width === null ? (hasBorder ? "1" : "0") : valueOf(width);
	const color = colorOf(list, "border");
	return (
		<Section title="stroke" note={noteOf(words)} reason={reasonOf(words)}>
			<Row label="width">
				<NumberBox
					label="px"
					value={px}
					px={null}
					ok={words.ok}
					onCommit={(typed) => {
						const n = Number.parseInt(typed, 10);
						if (Number.isNaN(n)) return;
						acts.setClass(reading.element.id, (className) => {
							// `border` alone is 1px and `border-N` is N; zero drops both
							const without = (className ?? "").split(/\s+/).filter((token) => token !== "border").join(" ");
							const base = withToken(without, "border", null);
							if (n <= 0) return base;
							return n === 1 ? `${base} border`.trim() : withToken(base, "border", String(n));
						});
					}}
					onNudge={() => {}}
				/>
			</Row>
			{hasBorder ? <Swatch label="color" named={color} /> : null}
		</Section>
	);
}

/** the content writes when it is typed in the file; alignment is a word; the rest are tokens */
function TextSection({ reading, acts }: { reading: Reading; acts: Acts }) {
	const verdict = textVerdict(reading.element);
	const words = wordVerdict(reading.element);
	const list = staticTokens(reading.element, reading.className);
	const type = typeOf(list);
	const color = colorOf(list, "text");
	const [draft, setDraft] = useState<string | null>(null);
	const shownText =
		reading.element.text === undefined
			? null
			: (reading.text ?? ("expr" in reading.element.text ? reading.element.text.expr : ""));
	return (
		<Section title="text" note={noteOf(verdict)} reason={reading.element.text === undefined ? undefined : reasonOf(verdict)}>
			{shownText === null ? null : verdict.ok ? (
				<input
					value={draft ?? shownText}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={() => {
						if (draft !== null && draft !== shownText) acts.setText(reading.element.id, draft);
						setDraft(null);
					}}
					onKeyDown={(event) => {
						event.stopPropagation();
						if (event.key === "Enter") (event.target as HTMLInputElement).blur();
						if (event.key === "Escape") {
							setDraft(null);
							(event.target as HTMLInputElement).blur();
						}
					}}
					className={cn("w-full px-1.5 font-sans text-base leading-sm outline-none focus:border-border-raised", FIELD)}
				/>
			) : (
				<span className="truncate font-mono text-muted text-sm leading-sm">{shownText}</span>
			)}
			<Row label="align">
				<IconPair
					value={wordOf(reading.className, "textAlign") ?? "text-left"}
					ok={words.ok}
					options={[
						{ token: "text-left", says: "left", icon: <LinesIcon at="left" /> },
						{ token: "text-center", says: "center", icon: <LinesIcon at="center" /> },
						{ token: "text-right", says: "right", icon: <LinesIcon at="right" /> },
					]}
					onChange={(token) => acts.setClass(reading.element.id, (className) => withWord(className, "textAlign", token === "text-left" ? null : token))}
				/>
			</Row>
			<ReadRow label="font" value={type.family.value} from={type.family.from} />
			<ReadRow label="size" value={`${type.size.value} / ${type.leading.value}`} from={type.size.token ?? type.size.from} />
			<ReadRow label="weight" value={type.weight.value} from={type.weight.from} />
			{type.tracking.token === null ? null : <ReadRow label="tracking" value={type.tracking.value} from={type.tracking.from} />}
			<Swatch label="color" named={color} />
		</Section>
	);
}

/** the literal as it now stands, the spliced tokens lit, over the line the write lands on */
function SourceLine({ reading, acts }: { reading: Reading; acts: Acts }) {
	const original = new Set((ORIGINAL.get(reading.element.id) ?? "").split(/\s+/));
	const list = reading.className.split(/\s+/).filter(Boolean);
	const where =
		reading.element.shared === undefined
			? `${FILE}:${reading.element.line}`
			: `${reading.element.shared.file}:${reading.element.shared.line}`;
	const verdict = literalVerdict(reading.element);
	return (
		<div className="flex flex-col gap-1.5">
			<p className="font-mono text-sm leading-sm">
				{reading.element.computed !== undefined ? (
					<span className="text-muted">{reading.element.computed}</span>
				) : list.length === 0 ? (
					<span className="text-muted/55">no className</span>
				) : (
					list.map((token, index) => (
						<span key={`${token}-${index}`} className={cn(original.has(token) ? "text-muted" : "text-thread")}>
							{token}
							{index < list.length - 1 ? " " : ""}
						</span>
					))
				)}
			</p>
			<div className="flex items-center gap-2">
				<span className={cn("min-w-0 truncate", MUTE)}>
					{where}
					{verdict.ok && verdict.scope !== undefined ? ` · ${verdict.scope}` : ""}
				</span>
				{acts.canUndo ? (
					<button
						type="button"
						onClick={acts.undo}
						className="ml-auto shrink-0 cursor-pointer font-mono text-2xs text-muted leading-3 hover:text-text"
					>
						undo ⌘Z
					</button>
				) : null}
			</div>
		</div>
	);
}

function Crumbs({ reading, acts }: { reading: Reading; acts: Acts }) {
	const chain = chainOf(reading.element.id);
	return (
		<span className="flex min-w-0 items-center gap-1 truncate font-mono text-sm leading-sm">
			{chain.map((element, index) => {
				const last = index === chain.length - 1;
				return (
					<span key={element.id} className="flex items-center gap-1">
						<button
							type="button"
							onClick={() =>
								acts.select({ id: element.id, key: element.mapped === undefined ? element.id : reading.pick.key })
							}
							className={cn("cursor-pointer", last ? "text-text" : "text-muted hover:text-text")}
						>
							{element.name}
						</button>
						{last ? null : <span className="text-muted/40">›</span>}
					</span>
				);
			})}
		</span>
	);
}

/** a neighbour on the field, so the frame under the pointer is a choice */
function Still({ left, top, name }: { left: number; top: number; name: string }) {
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left, top }}>
			<span className="font-mono text-muted text-sm leading-4">{name}</span>
			<div className="h-[430px] w-[200px] overflow-hidden rounded-[8px] border border-border bg-bg">
				<div className="flex h-full flex-col gap-2 p-3">
					<span className="h-3 w-14 rounded-full bg-surface" />
					<span className="h-20 w-full rounded-[4px] bg-surface" />
					<span className="h-1.5 w-[88%] rounded-full bg-raised" />
					<span className="h-1.5 w-[72%] rounded-full bg-raised" />
					<span className="h-1.5 w-[80%] rounded-full bg-raised" />
					<span className="mt-auto h-7 w-full rounded-[4px] bg-raised" />
				</div>
			</div>
		</div>
	);
}
