import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	chainOf,
	childrenOf,
	ELEMENTS,
	elementOf,
	type Family,
	FILE,
	familyOf,
	nudge,
	parse,
	pxValue,
	type Shown,
	show,
	sizeVerdict,
	type SourceElement,
	spacingVerdict,
	tailOf,
	textVerdict,
	tokenOf,
	type Verdict,
	type Vocab,
	withToken,
} from "../lib/properties-model";
import { cn } from "../lib/utils";
import { CanvasChrome, type PageRow } from "./spool-canvas-chrome";
import { ChevronIcon, PanelCaret } from "./spool-icons";
import { PropertiesCart } from "./spool-properties-cart";
import { SpoolShell } from "./spool-shell";

/**
 * One canvas, one cart, seven surfaces. Everything but the surface is held
 * still: the chrome is the shipped chrome, the cart is the same document on
 * every frame, and what the hands may write is the spikes' verdict, not the
 * frame's. What differs is where a selected element's properties live, what
 * vocabulary they speak, how much of the element they show, and what happens
 * when the agent rail is on.
 *
 * Click an element to select it; click a crumb, or press Esc, to climb. A
 * selected element with a writable axis grows a knob on that edge; drag it and
 * the class changes under the pointer, on the scale when the drop lands on a
 * whole step and in pixels when it does not. Every field writes the same way.
 * Tokens the surface has changed read in thread colour on the source line.
 *
 * Where the shipped canvas stands: the right column is the agent rail, and
 * nothing else, and #238 turns it off by default. A right-rail surface is
 * therefore a rail the canvas does not have today; a floating surface needs
 * nothing the canvas lacks.
 */

export interface PropertiesConfig {
	/** where the surface lives: a right rail, on the element, or both with the rail holding the long tail */
	surface: "rail" | "float" | "both";
	vocab: Vocab;
	/** the rail shows everything the element computes to, read-only, under the writable few */
	tail: boolean;
	/** the agent rail is on: properties stack above its composer, or float at the element */
	agent: "off" | "stack" | "float";
}

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

const FRAME = "cart";
const STAGE = { left: 288, top: 112, w: 300, h: 640 } as const;
const LABEL_H = 22;
const RAIL_W = 300;
const AGENT_W = 420;
const FLOAT_W = 236;
/** the field's height under the 44px bar */
const FIELD_H = 900 - 44;

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
	/** the other axis, for the readout */
	other: number;
	live: number;
}

type Snapshot = { classes: Record<string, string>; texts: Record<string, string> };

const INITIAL: Snapshot = {
	classes: Object.fromEntries(ELEMENTS.map((element) => [element.id, element.className ?? ""])),
	texts: {},
};

const ORIGINAL = new Map(ELEMENTS.map((element) => [element.id, element.className ?? ""]));

export function PropertiesScreen({ config }: { config: PropertiesConfig }) {
	const [state, setState] = useState<Snapshot>(INITIAL);
	const [history, setHistory] = useState<readonly Snapshot[]>([]);
	const [selection, setSelection] = useState<Pick | null>({ id: "pay", key: "pay" });
	const [hover, setHover] = useState<Pick | null>(null);
	const [boxes, setBoxes] = useState<ReadonlyMap<string, Rect>>(new Map());
	const [drag, setDrag] = useState<Drag | null>(null);
	const fieldRef = useRef<HTMLDivElement | null>(null);
	const stageRef = useRef<HTMLDivElement | null>(null);

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

	const setClass = useCallback(
		(id: string, family: Family, value: string | null, provisional = false) => {
			const apply = (snapshot: Snapshot): Snapshot => ({
				...snapshot,
				classes: { ...snapshot.classes, [id]: withToken(snapshot.classes[id] ?? null, family, value) },
			});
			if (provisional) setState(apply);
			else commit(apply);
		},
		[commit],
	);

	const setText = useCallback(
		(id: string, text: string) => commit((snapshot) => ({ ...snapshot, texts: { ...snapshot.texts, [id]: text } })),
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
			if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
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

	const moveDrag = (event: React.PointerEvent) => {
		if (drag === null) return;
		const delta = (drag.axis === "w" ? event.clientX : event.clientY) - drag.startAt;
		const live = Math.max(8, Math.round(drag.startPx + delta));
		if (live === drag.live) return;
		setDrag({ ...drag, live });
		setClass(drag.id, drag.axis, `[${live}px]`, true);
	};

	// what the classes were when the knob was taken, so one drag is one undo
	const stateBeforeDrag = useRef<Snapshot | null>(null);

	const endDrag = () => {
		if (drag === null) return;
		const before = stateBeforeDrag.current;
		// the drop decides the token: provisional pixels become the scale when they land on a step
		setState((current) => ({
			...current,
			classes: {
				...current.classes,
				[drag.id]: withToken(current.classes[drag.id] ?? null, drag.axis, pxValue(drag.live)),
			},
		}));
		if (before !== null) setHistory((stack) => [...stack, before]);
		stateBeforeDrag.current = null;
		setDrag(null);
	};

	/* ---------- what the surfaces read ---------- */

	const element = selection === null ? null : (elementOf(selection.id) ?? null);
	const box = selection === null ? undefined : boxes.get(`${selection.id}:${selection.key}`);
	const reading: Reading | null =
		element === null || selection === null
			? null
			: {
					element,
					pick: selection,
					className: state.classes[element.id] ?? "",
					text: state.texts[element.id] ?? (element.text !== undefined && "literal" in element.text ? element.text.literal : null),
					box: box ?? { x: 0, y: 0, w: 0, h: 0 },
				};

	const acts: Acts = {
		vocab: config.vocab,
		setClass: (id, family, value) => setClass(id, family, value),
		setText,
		select: (pick) => setSelection(pick),
		undo,
		canUndo: history.length > 0,
	};

	const showFloat = config.surface !== "rail" || config.agent === "float";
	const showRail = config.agent === "off" && config.surface !== "float";
	const railFull = config.surface === "rail";

	const rail =
		config.agent !== "off" ? (
			<AgentColumn
				reading={reading}
				shelf={config.agent === "stack" && reading !== null ? <Shelf reading={reading} acts={acts} /> : null}
			/>
		) : showRail ? (
			<RailSurface reading={reading} acts={acts} editables={railFull} tail={config.tail || !railFull} />
		) : null;

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="100%">
			<CanvasChrome
				pages={PAGES}
				selected={FRAME}
				tool="select"
				railLabel={config.agent !== "off" ? "Agent" : "properties"}
				railWidth={config.agent !== "off" ? AGENT_W : showRail ? RAIL_W : 0}
				rail={rail ?? <span />}
			>
				<div ref={fieldRef} className="absolute inset-0">
					<Still left={36} top={190} name="menu" />
					{/* the agent rail takes 420 of the field, and the receipt is what it costs */}
					{config.agent === "off" ? <Still left={664} top={150} name="receipt" /> : null}

					<div className="absolute flex flex-col gap-1.5" style={{ left: STAGE.left, top: STAGE.top }}>
						<div className="flex w-[300px] items-center gap-1.5 font-mono text-sm leading-4" style={{ height: LABEL_H - 6 }}>
							<span className="text-muted">{FRAME}</span>
							<span className="ml-auto font-mono text-2xs text-muted/55 leading-3">300 × 640</span>
						</div>
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
							className="relative h-[640px] w-[300px] overflow-hidden rounded-[10px] border border-border bg-bg"
						>
							<PropertiesCart classes={state.classes} texts={state.texts} elements={ELEMENTS} />
						</div>
					</div>

					{/* the ring, the knobs and the readout: canvas furniture, drawn over the document */}
					<Overlay
						boxes={boxes}
						hover={hover}
						selection={selection}
						drag={drag}
						onKnob={startDrag}
						onKnobMove={moveDrag}
						onKnobUp={endDrag}
					/>

					{showFloat && reading !== null && drag === null ? (
						<FloatSurface reading={reading} acts={acts} full={config.surface === "float" || config.agent === "float"} />
					) : null}
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
}

interface Acts {
	vocab: Vocab;
	setClass: (id: string, family: Family, value: string | null) => void;
	setText: (id: string, text: string) => void;
	select: (pick: Pick) => void;
	undo: () => void;
	canUndo: boolean;
}

/** the spacing families an element shows: every one its literal carries, and gap for a container */
function spacingFamilies(reading: Reading): readonly Family[] {
	const tokens = reading.className.split(/\s+/).filter(Boolean);
	const present = tokens.map(familyOf).filter((family): family is Family => family !== null && family !== "w" && family !== "h");
	const families = new Set<Family>(present);
	if (!families.has("p") && ![...families].some((family) => family.startsWith("p"))) families.add("p");
	if (reading.element.display === "flex" && childrenOf(reading.element.id).length > 1 && !families.has("gap")) families.add("gap");
	return [...families];
}

/* ---------- the overlay ---------- */

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
		element !== undefined && (wOk || hOk || spacingVerdict(element).ok || textVerdict(element).ok);
	const siblings =
		selection === null || element?.mapped === undefined
			? []
			: [...boxes.entries()].filter(([key]) => key.startsWith(`${selection.id}:`) && key !== `${selection.id}:${selection.key}`);

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
						className="absolute rounded-[3px] border-[1.5px] border-thread"
						style={{ left: selected.x - 2, top: selected.y - 2, width: selected.w + 4, height: selected.h + 4 }}
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
							style={{ left: selected.x + selected.w - 4, top: selected.y + selected.h / 2 - 6 }}
						/>
					) : null}
					{hOk ? (
						<span
							onPointerDown={(event) => onKnob(selection, "h", event)}
							onPointerMove={onKnobMove}
							onPointerUp={onKnobUp}
							className="pointer-events-auto absolute h-3 w-3 cursor-ns-resize rounded-[1.5px] border-[1.5px] border-thread bg-on-thread"
							style={{ left: selected.x + selected.w / 2 - 6, top: selected.y + selected.h - 4 }}
						/>
					) : null}
					{drag === null ? null : (
						<span
							className="absolute whitespace-nowrap rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3"
							style={{
								left: drag.axis === "w" ? selected.x + selected.w + 10 : selected.x + selected.w / 2 + 12,
								top: drag.axis === "w" ? selected.y + selected.h / 2 - 9 : selected.y + selected.h + 8,
							}}
						>
							{drag.axis === "w" ? `${drag.live} × ${Math.round(drag.other)}` : `${Math.round(drag.other)} × ${drag.live}`}
						</span>
					)}
				</>
			)}
		</div>
	);
}

/* ---------- fields ---------- */

function ValueField({
	shown,
	verdict,
	compact = false,
	onCommit,
	onNudge,
}: {
	shown: Shown;
	verdict: Verdict;
	/** the float's density: label and value on one short line */
	compact?: boolean;
	onCommit: (typed: string) => void;
	onNudge: (direction: 1 | -1) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const value = draft ?? shown.value;
	return (
		<label className={cn("flex min-w-0 items-center", compact ? "gap-1.5" : "gap-2")}>
			<span
				className={cn(
					"shrink-0 font-mono text-2xs text-muted leading-3",
					compact ? "w-auto" : "w-[74px] truncate",
				)}
			>
				{shown.label}
			</span>
			{verdict.ok ? (
				<span className={cn("relative flex min-w-0 items-center", compact ? "w-[56px]" : "flex-1")}>
					<input
						value={value}
						onChange={(event) => setDraft(event.target.value)}
						onBlur={() => {
							if (draft !== null && draft !== shown.value) onCommit(draft);
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
						className={cn(
							"h-6 w-full min-w-0 rounded-sm border border-border bg-surface px-1.5 font-mono text-sm text-text leading-sm outline-none focus:border-border-raised",
							shown.unit !== null && "pr-6",
						)}
					/>
					{shown.unit === null || (compact && shown.value === "–") ? null : (
						<span className="pointer-events-none absolute right-1.5 font-mono text-2xs text-muted/55 leading-3">
							{shown.unit}
						</span>
					)}
				</span>
			) : (
				<span className={cn("flex min-w-0 items-baseline gap-2", compact ? "" : "flex-1")}>
					<span className="shrink-0 font-mono text-muted text-sm leading-sm">
						{shown.value}
						{shown.unit === null ? "" : shown.value === "–" ? ` ${shown.unit}` : shown.unit}
					</span>
					{compact ? null : <span className="min-w-0 truncate font-mono text-2xs text-muted/55 leading-3">{verdict.reason}</span>}
				</span>
			)}
		</label>
	);
}

function TextField({ reading, acts, compact = false }: { reading: Reading; acts: Acts; compact?: boolean }) {
	const verdict = textVerdict(reading.element);
	const [draft, setDraft] = useState<string | null>(null);
	if (reading.element.text === undefined) return null;
	const shownText = reading.text ?? ("expr" in reading.element.text ? reading.element.text.expr : "");
	return (
		<label className={cn("flex min-w-0 items-center", compact ? "gap-1.5" : "gap-2")}>
			<span className={cn("shrink-0 font-mono text-2xs text-muted leading-3", compact ? "" : "w-[74px]")}>text</span>
			{verdict.ok ? (
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
					className="h-6 min-w-0 flex-1 rounded-sm border border-border bg-surface px-1.5 font-sans text-base text-text leading-sm outline-none focus:border-border-raised"
				/>
			) : (
				<span className="flex min-w-0 flex-1 items-baseline gap-2">
					<span className="truncate font-mono text-muted text-sm leading-sm">{shownText}</span>
					{compact ? null : <span className="min-w-0 truncate font-mono text-2xs text-muted/55 leading-3">{verdict.reason}</span>}
				</span>
			)}
		</label>
	);
}

/** the w and h rows, which the rail and the float both draw */
function SizeFields({ reading, acts, compact = false }: { reading: Reading; acts: Acts; compact?: boolean }) {
	return (
		<>
			{(["w", "h"] as const).map((axis) => {
				const token = tokenOf(reading.className, axis);
				const measured = axis === "w" ? reading.box.w : reading.box.h;
				return (
					<ValueField
						key={axis}
						compact={compact}
						shown={show(acts.vocab, axis, token, measured)}
						verdict={sizeVerdict(reading.element, axis)}
						onCommit={(typed) => {
							const value = parse(acts.vocab, typed);
							if (value !== null) acts.setClass(reading.element.id, axis, value);
						}}
						onNudge={(direction) =>
							acts.setClass(reading.element.id, axis, nudge(acts.vocab, token, measured, direction))
						}
					/>
				);
			})}
		</>
	);
}

function SpacingFields({ reading, acts, compact = false }: { reading: Reading; acts: Acts; compact?: boolean }) {
	const verdict = spacingVerdict(reading.element);
	const families = compact ? spacingFamilies(reading).slice(0, 2) : spacingFamilies(reading);
	return (
		<>
			{families.map((family) => {
				const token = tokenOf(reading.className, family);
				return (
					<ValueField
						key={family}
						compact={compact}
						shown={show(acts.vocab, family, token, 0)}
						verdict={verdict}
						onCommit={(typed) => {
							const value = parse(acts.vocab, typed);
							if (value !== null) acts.setClass(reading.element.id, family, value);
						}}
						onNudge={(direction) => acts.setClass(reading.element.id, family, nudge(acts.vocab, token, 0, direction))}
					/>
				);
			})}
		</>
	);
}

/** the literal as it now stands, the spliced tokens lit, over the line the write lands on */
function SourceLine({ reading, acts }: { reading: Reading; acts: Acts }) {
	const original = new Set((ORIGINAL.get(reading.element.id) ?? "").split(/\s+/));
	const tokens = reading.className.split(/\s+/).filter(Boolean);
	const where =
		reading.element.shared === undefined
			? `${FILE}:${reading.element.line}`
			: `${reading.element.shared.file}:${reading.element.shared.line}`;
	return (
		<div className="flex flex-col gap-1.5">
			<p className="font-mono text-sm leading-sm">
				{reading.element.computed !== undefined ? (
					<span className="text-muted">{reading.element.computed}</span>
				) : tokens.length === 0 ? (
					<span className="text-muted/55">no className</span>
				) : (
					tokens.map((token, index) => (
						<span key={`${token}-${index}`} className={cn(original.has(token) ? "text-muted" : "text-thread")}>
							{token}
							{index < tokens.length - 1 ? " " : ""}
						</span>
					))
				)}
			</p>
			<div className="flex items-center gap-2">
				<span className="min-w-0 truncate font-mono text-2xs text-muted/55 leading-3">{where}</span>
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

function Crumbs({ reading, acts, dim = false }: { reading: Reading; acts: Acts; dim?: boolean }) {
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
							className={cn("cursor-pointer", last ? "text-text" : dim ? "text-muted/55 hover:text-text" : "text-muted hover:text-text")}
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

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-2 border-border border-b px-4 py-3">
			<span className="font-mono text-2xs text-muted/55 leading-3">{title}</span>
			{children}
		</div>
	);
}

/* ---------- the rail surface ---------- */

function RailSurface({
	reading,
	acts,
	editables,
	tail,
}: {
	reading: Reading | null;
	acts: Acts;
	/** the rail carries the writable fields; off when the float has them */
	editables: boolean;
	tail: boolean;
}) {
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
					{editables ? (
						<>
							{reading.element.text === undefined ? null : (
								<Section title="text">
									<TextField reading={reading} acts={acts} />
								</Section>
							)}
							<Section title="size">
								<SizeFields reading={reading} acts={acts} />
								{sizeVerdict(reading.element, "w").ok || sizeVerdict(reading.element, "h").ok ? (
									<span className="font-mono text-2xs text-muted/45 leading-3">
										{acts.vocab === "tailwind" ? "↑↓ a step, or drag the knob" : "↑↓ a pixel, or drag the knob"}
										{scopeOf(sizeVerdict(reading.element, "w"))}
									</span>
								) : null}
							</Section>
							<Section title="spacing">
								<SpacingFields reading={reading} acts={acts} />
								{scopeOf(spacingVerdict(reading.element)) === "" ? null : (
									<span className="font-mono text-2xs text-muted/45 leading-3">{scopeOf(spacingVerdict(reading.element)).trim()}</span>
								)}
							</Section>
						</>
					) : null}
					<Section title="source">
						<SourceLine reading={reading} acts={acts} />
					</Section>
					{tail ? <Tail reading={reading} vocab={acts.vocab} /> : null}
				</div>
			)}
		</div>
	);
}

function scopeOf(verdict: Verdict): string {
	return verdict.ok && verdict.scope !== undefined ? ` · ${verdict.scope}` : "";
}

/** everything else the element computes to, read-only, named the way a stylesheet names it */
function Tail({ reading, vocab }: { reading: Reading; vocab: Vocab }) {
	const [open, setOpen] = useState(true);
	const rows = tailOf(reading.element);
	return (
		<div className="flex flex-col px-4 py-3">
			<button
				type="button"
				onClick={() => setOpen((was) => !was)}
				className="flex cursor-pointer items-center gap-2 font-mono text-2xs text-muted/55 leading-3 hover:text-muted"
			>
				<ChevronIcon open={open} className="h-2 w-2" />
				computed
				<span className="text-muted/40">{rows.length}</span>
			</button>
			{open ? (
				<div className="mt-2 flex flex-col gap-[5px]">
					{rows.map((row, index) => (
						<div key={`${row.prop}-${index}`} className="flex items-baseline gap-2">
							<span className="w-[104px] shrink-0 truncate font-mono text-2xs text-muted/70 leading-4">{row.prop}</span>
							<span className="shrink-0 font-mono text-2xs text-muted leading-4">
								{vocab === "tailwind" && row.tw !== null ? row.tw : row.css}
							</span>
							<span className="ml-auto min-w-0 truncate text-right font-mono text-2xs text-muted/40 leading-4">
								{vocab === "tailwind" && row.tw !== null ? row.css : row.from}
							</span>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

/* ---------- the floating surface ---------- */

function FloatSurface({ reading, acts, full }: { reading: Reading; acts: Acts; full: boolean }) {
	// under the element when the field has room; otherwise beside the frame at the
	// element's own top, so the card never covers the document it is editing
	const below = reading.box.y + reading.box.h + 12;
	const fits = below + 124 < FIELD_H - 8;
	const top = fits ? below : Math.min(reading.box.y, FIELD_H - 132);
	const left = fits ? Math.max(8, reading.box.x) : STAGE.left + STAGE.w + 16;
	const noSize = !sizeVerdict(reading.element, "w").ok && !sizeVerdict(reading.element, "h").ok;
	const noSpacing = !spacingVerdict(reading.element).ok;
	const noText = !textVerdict(reading.element).ok;
	return (
		<div
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
			className="absolute z-30 flex flex-col gap-2 rounded-md border border-border-raised bg-bg/95 p-2.5 backdrop-blur"
			style={{ left, top, width: FLOAT_W }}
		>
			<div className="flex items-center gap-2">
				<Crumbs reading={reading} acts={acts} dim />
				<span className="ml-auto shrink-0 font-mono text-2xs text-muted/45 leading-3">
					{reading.element.shared === undefined ? `:${reading.element.line}` : "shared"}
				</span>
			</div>
			{noSize && noSpacing && noText ? (
				<span className="font-mono text-2xs text-muted/55 leading-4">
					read-only · {firstReason(reading.element)}
				</span>
			) : (
				<>
					<div className="flex items-center gap-3">
						<SizeFields reading={reading} acts={acts} compact />
					</div>
					{noSpacing ? null : (
						<div className="flex items-center gap-3">
							<SpacingFields reading={reading} acts={acts} compact />
						</div>
					)}
					{reading.element.text === undefined || noText ? null : <TextField reading={reading} acts={acts} compact />}
				</>
			)}
			{full ? (
				<span className="truncate font-mono text-2xs text-muted/40 leading-3">
					{reading.element.computed !== undefined
						? "className is an expression"
						: reading.className === ""
							? "no className"
							: reading.className}
				</span>
			) : null}
		</div>
	);
}

function firstReason(element: SourceElement): string {
	const size = sizeVerdict(element, "w");
	if (!size.ok) return size.reason;
	const spacing = spacingVerdict(element);
	if (!spacing.ok) return spacing.reason;
	const text = textVerdict(element);
	return text.ok ? "" : text.reason;
}

/* ---------- the agent rail, on ---------- */

/**
 * The rail as it ships, reduced to its shape: nameplate, a turn, the composer
 * with the selection chip. A `shelf` slides in between the transcript and the
 * composer, which is where a stacked properties surface would stand.
 */
function AgentColumn({ reading, shelf }: { reading: Reading | null; shelf: ReactNode }) {
	const chip = reading === null ? "cart" : `cart › ${chainOf(reading.element.id).slice(1).map((element) => element.name).join(" › ")}`;
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex h-11 shrink-0 items-center gap-2 border-border border-b pr-2 pl-4">
				<span className="h-1.5 w-1.5 rounded-full bg-thread" />
				<span className="font-mono text-sm text-text leading-sm">cart</span>
				<span className="font-mono text-2xs text-muted/55 leading-3">sonnet · 41k</span>
				<span className="ml-auto flex h-7 w-7 items-center justify-center text-muted/60">
					<PanelCaret dir="right" className="h-3.5 w-2.5" />
				</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden px-3.5 pb-3">
				<div className="flex flex-col gap-1">
					<span className="self-start rounded-xs border border-border-raised px-1.5 py-[2px] font-mono text-2xs text-muted leading-3">
						pay
					</span>
					<p className="text-base text-text leading-base">Make the pay button feel heavier.</p>
				</div>
				<div className="flex flex-col gap-1.5 font-mono text-sm leading-sm">
					<Row state="done" verb="read" subject="cart" />
					<Row state="done" verb="edit" subject="cart" meta="+1 −1" />
					<Row state="done" verb="shot" subject="cart" />
				</div>
				<p className="text-base text-muted leading-base">
					Set it to h-12 and font-semibold. The row above it keeps its gap.
				</p>
			</div>
			{shelf}
			<div className="shrink-0 border-border border-t p-3">
				<div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2.5">
					<span className="self-start truncate rounded-xs border border-thread/50 px-1.5 py-[2px] font-mono text-2xs text-text leading-3">
						{chip}
					</span>
					<span className="font-sans text-base text-muted/55 leading-base">Ask about the selection</span>
					<div className="flex items-center gap-2">
						<span className="font-mono text-2xs text-muted/45 leading-3">⏎ send</span>
						<span className="ml-auto font-mono text-2xs text-muted/45 leading-3">sonnet</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function Row({ state, verb, subject, meta }: { state: "done" | "running"; verb: string; subject: string; meta?: string }) {
	return (
		<div className="flex items-center gap-2">
			<span
				className={cn(
					"flex h-3 w-3 items-center justify-center rounded-full border",
					state === "done" ? "border-muted/50" : "border-muted",
				)}
			>
				{state === "done" ? <span className="h-1 w-1 rounded-full bg-muted/70" /> : null}
			</span>
			<span className="text-muted">{verb}</span>
			<span className="text-text">{subject}</span>
			{meta === undefined ? null : <span className="ml-auto text-2xs text-muted/55">{meta}</span>}
		</div>
	);
}

/** the stacked surface: the chip, opened, between the transcript and the composer */
function Shelf({ reading, acts }: { reading: Reading; acts: Acts }) {
	return (
		<div className="shrink-0 border-border border-t">
			<div className="flex items-center gap-2 px-3.5 pt-3 pb-1">
				<Crumbs reading={reading} acts={acts} dim />
				<span className="ml-auto font-mono text-2xs text-muted/45 leading-3">
					{reading.element.shared === undefined ? `frame.tsx:${reading.element.line}` : "shared"}
				</span>
			</div>
			<div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-3.5 pb-3">
				<SizeFields reading={reading} acts={acts} />
				<SpacingFields reading={reading} acts={acts} />
				{reading.element.text === undefined ? null : (
					<div className="col-span-2">
						<TextField reading={reading} acts={acts} />
					</div>
				)}
			</div>
		</div>
	);
}

/* ---------- the field's other frames ---------- */

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
