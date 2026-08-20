import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	chainOf,
	childrenOf,
	ELEMENTS,
	elementOf,
	type Family,
	FILE,
	familyOf,
	LAYOUT,
	type Layout,
	layoutOf,
	layoutVerdict,
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
	withLayout,
	withToken,
} from "../lib/properties-model";
import { cn } from "../lib/utils";
import { CanvasChrome, type PageRow } from "./spool-canvas-chrome";
import { ChevronIcon, PanelCaret } from "./spool-icons";
import { PropertiesCart } from "./spool-properties-cart";
import { SpoolShell } from "./spool-shell";

/**
 * The properties surface, decided (spool-cloud#16): a right rail, and only a
 * rail. The right column holds one thing at a time, properties by default and
 * the agent when its flag (#238) is on and you switch to it, so the rail never
 * shares the column with a transcript.
 *
 * The vocabulary is Tailwind's with pixels beside it, always both: the field
 * holds the token (`h-11`, `items-center`) and the faint readout says what it
 * means (`44px`, `center`). Typing `347px` is accepted and becomes `w-[347px]`;
 * typing `90` becomes `w-90`; a whole step writes the bare class and anything
 * off it stays in pixels, which is the resize spike's policy.
 *
 * What the hands may write is the spikes' verdict plus the layout words, which
 * are the same single-token splice: text when it is typed in the file, w and h
 * and the spacing tokens on a literal className, and display, direction, align
 * and justify as pickers. Colour, type and radius are read-only rows under
 * `computed` for v1, because their values are tokens and editing tokens is the
 * designers-as-users fog on the map. A refusal is a greyed row with its reason,
 * never a missing row.
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
const STAGE = { left: 288, top: 112, w: 300, h: 640 } as const;
const RAIL_W = 300;

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

type Snapshot = { classes: Record<string, string>; texts: Record<string, string> };

const INITIAL: Snapshot = {
	classes: Object.fromEntries(ELEMENTS.map((element) => [element.id, element.className ?? ""])),
	texts: {},
};

const ORIGINAL = new Map(ELEMENTS.map((element) => [element.id, element.className ?? ""]));

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
		setClassName(drag.id, (className) => withToken(className, drag.axis, `[${live}px]`), true);
	};

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

	/* ---------- what the rail reads ---------- */

	const element = selection === null ? null : (elementOf(selection.id) ?? null);
	const box = selection === null ? undefined : boxes.get(`${selection.id}:${selection.key}`);
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
				};

	const acts: Acts = {
		setToken: (id, family, value) => setClassName(id, (className) => withToken(className, family, value)),
		setLayout: (id, layout, token) => setClassName(id, (className) => withLayout(className, layout, token)),
		setText: (id, text) => commit((snapshot) => ({ ...snapshot, texts: { ...snapshot.texts, [id]: text } })),
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

					<div className="absolute flex flex-col gap-1.5" style={{ left: STAGE.left, top: STAGE.top }}>
						<div className="flex h-4 w-[300px] items-center gap-1.5 font-mono text-sm leading-4">
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
}

interface Acts {
	setToken: (id: string, family: Family, value: string | null) => void;
	setLayout: (id: string, layout: Layout, token: string | null) => void;
	setText: (id: string, text: string) => void;
	select: (pick: Pick) => void;
	undo: () => void;
	canUndo: boolean;
}

/** the spacing families an element shows: every one its literal carries, and gap for a container */
function spacingFamilies(reading: Reading): readonly Family[] {
	const tokens = reading.className.split(/\s+/).filter(Boolean);
	const present = tokens
		.map(familyOf)
		.filter((family): family is Family => family !== null && family !== "w" && family !== "h");
	const families = new Set<Family>(present);
	if (![...families].some((family) => family.startsWith("p"))) families.add("p");
	if (reading.element.display === "flex" && childrenOf(reading.element.id).length > 1 && !families.has("gap")) {
		families.add("gap");
	}
	return [...families];
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
		(wOk || hOk || spacingVerdict(element).ok || textVerdict(element).ok || layoutVerdict(element).ok);
	const siblings =
		selection === null || element?.mapped === undefined
			? []
			: [...boxes.entries()].filter(
					([key]) => key.startsWith(`${selection.id}:`) && key !== `${selection.id}:${selection.key}`,
				);

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

/* ---------- rows ---------- */

const LABEL_W = "w-[56px]";

/** a token field with its pixels beside it; a refused one is the value greyed and the reason after it */
function TokenRow({
	shown,
	verdict,
	onCommit,
	onNudge,
}: {
	shown: Shown;
	verdict: Verdict;
	onCommit: (typed: string) => void;
	onNudge: (direction: 1 | -1) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	return (
		<label className="flex min-w-0 items-center gap-2">
			<span className={cn("shrink-0 truncate font-mono text-2xs text-muted leading-3", LABEL_W)}>{shown.label}</span>
			{verdict.ok ? (
				<>
					<input
						value={draft ?? shown.value}
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
						className="h-6 w-[88px] min-w-0 rounded-sm border border-border bg-surface px-1.5 font-mono text-sm text-text leading-sm outline-none focus:border-border-raised"
					/>
					<span className="min-w-0 truncate font-mono text-2xs text-muted/55 leading-3">{shown.px ?? ""}</span>
				</>
			) : (
				<>
					<span className="w-[88px] shrink-0 truncate font-mono text-muted text-sm leading-sm">
						{shown.value}
						{shown.px === null ? "" : <span className="text-muted/55"> {shown.px}</span>}
					</span>
					<span className="min-w-0 truncate font-mono text-2xs text-muted/55 leading-3">{verdict.reason}</span>
				</>
			)}
		</label>
	);
}

/** a layout word: the options as chips, the chosen one lit, its token beside */
function LayoutRow({ reading, layout, acts }: { reading: Reading; layout: Layout; acts: Acts }) {
	const family = LAYOUT[layout];
	const verdict = layoutVerdict(reading.element);
	const current = layoutOf(reading.className, layout);
	const css = family.options.find((option) => option.token === current)?.css ?? family.fallback;
	return (
		<div className="flex min-w-0 items-start gap-2">
			<span className={cn("shrink-0 truncate pt-1 font-mono text-2xs text-muted leading-3", LABEL_W)}>{family.label}</span>
			{verdict.ok ? (
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
					<div className="flex flex-wrap items-center gap-px rounded-sm border border-border bg-surface p-px">
						{family.options.map((option) => (
							<button
								key={option.token}
								type="button"
								title={option.token}
								onClick={() =>
									acts.setLayout(reading.element.id, layout, option.token === current ? null : option.token)
								}
								className={cn(
									"h-5 cursor-pointer rounded-[3px] px-[5px] font-mono text-2xs leading-3",
									option.token === current ? "bg-raised text-text" : "text-muted/70 hover:text-text",
								)}
							>
								{option.css}
							</button>
						))}
					</div>
				</div>
			) : (
				<>
					<span className="w-[88px] shrink-0 truncate font-mono text-muted text-sm leading-sm">{css}</span>
					<span className="min-w-0 truncate font-mono text-2xs text-muted/55 leading-3">{verdict.reason}</span>
				</>
			)}
		</div>
	);
}

function TextRow({ reading, acts }: { reading: Reading; acts: Acts }) {
	const verdict = textVerdict(reading.element);
	const [draft, setDraft] = useState<string | null>(null);
	if (reading.element.text === undefined) return null;
	const shownText = reading.text ?? ("expr" in reading.element.text ? reading.element.text.expr : "");
	return (
		<label className="flex min-w-0 items-center gap-2">
			<span className={cn("shrink-0 font-mono text-2xs text-muted leading-3", LABEL_W)}>text</span>
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
				<>
					<span className="truncate font-mono text-muted text-sm leading-sm">{shownText}</span>
					<span className="min-w-0 truncate font-mono text-2xs text-muted/55 leading-3">{verdict.reason}</span>
				</>
			)}
		</label>
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

function Section({ title, note, children }: { title: string; note?: string | undefined; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-2 border-border border-b px-4 py-3">
			<div className="flex items-baseline gap-2">
				<span className="font-mono text-2xs text-muted/55 leading-3">{title}</span>
				{note === undefined ? null : <span className="font-mono text-2xs text-muted/40 leading-3">{note}</span>}
			</div>
			{children}
		</div>
	);
}

function scopeOf(verdict: Verdict): string | undefined {
	return verdict.ok ? verdict.scope : undefined;
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
					{reading.element.text === undefined ? null : (
						<Section title="text" note={scopeOf(textVerdict(reading.element))}>
							<TextRow reading={reading} acts={acts} />
						</Section>
					)}
					<Section title="size" note={scopeOf(sizeVerdict(reading.element, "w"))}>
						{(["w", "h"] as const).map((axis) => {
							const token = tokenOf(reading.className, axis);
							const measured = axis === "w" ? reading.box.w : reading.box.h;
							return (
								<TokenRow
									key={axis}
									shown={show(axis, token, measured)}
									verdict={sizeVerdict(reading.element, axis)}
									onCommit={(typed) => {
										const value = parse(typed);
										if (value !== null) acts.setToken(reading.element.id, axis, value);
									}}
									onNudge={(direction) => acts.setToken(reading.element.id, axis, nudge(token, measured, direction))}
								/>
							);
						})}
					</Section>
					<Section title="spacing" note={scopeOf(spacingVerdict(reading.element))}>
						{spacingFamilies(reading).map((family) => {
							const token = tokenOf(reading.className, family);
							return (
								<TokenRow
									key={family}
									shown={show(family, token, 0)}
									verdict={spacingVerdict(reading.element)}
									onCommit={(typed) => {
										const value = parse(typed);
										if (value !== null) acts.setToken(reading.element.id, family, value);
									}}
									onNudge={(direction) => acts.setToken(reading.element.id, family, nudge(token, 0, direction))}
								/>
							);
						})}
					</Section>
					<Section title="layout" note={scopeOf(layoutVerdict(reading.element))}>
						<LayoutRow reading={reading} layout="display" acts={acts} />
						{layoutOf(reading.className, "display") === "flex" ? (
							<>
								<LayoutRow reading={reading} layout="direction" acts={acts} />
								<LayoutRow reading={reading} layout="align" acts={acts} />
								<LayoutRow reading={reading} layout="justify" acts={acts} />
							</>
						) : null}
					</Section>
					<Section title="source">
						<SourceLine reading={reading} acts={acts} />
					</Section>
					<Tail reading={reading} />
				</div>
			)}
		</div>
	);
}

/** everything else the element computes to, read-only, named the way a stylesheet names it */
function Tail({ reading }: { reading: Reading }) {
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
							<span className="shrink-0 font-mono text-2xs text-muted leading-4">{row.tw ?? row.css}</span>
							<span className="ml-auto min-w-0 truncate text-right font-mono text-2xs text-muted/40 leading-4">
								{row.tw === null ? row.from : row.css}
							</span>
						</div>
					))}
				</div>
			) : null}
		</div>
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
