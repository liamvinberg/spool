import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	chainOf,
	ELEMENTS,
	elementOf,
	FILE,
	gapOf,
	literalVerdict,
	paddingOf,
	parse,
	pxValue,
	type Side,
	type SizeMode,
	sizeModeOf,
	sizeVerdict,
	type SourceElement,
	spacingVerdict,
	staticTokens,
	textVerdict,
	tokenOf,
	valueOf,
	type Verdict,
	withGap,
	withPadding,
	withSizeMode,
	withToken,
	withWord,
	WORDS,
	wordOf,
	wordVerdict,
} from "shared/lib/spool/properties-model";
import { cn } from "shared/lib/utils";
import { ITEMS, PropertiesCart } from "shared/ui/demo/kaffe-properties-cart";
import {
	AlignGrid,
	AxisIcon,
	IconField,
	MUTE,
	NumField,
	Row,
	Section,
	SidesIcon,
	TextAlignIcon,
	TextField,
	TokenField,
	WordField,
} from "./fields";
import {
	BG,
	BORDER_COLOR,
	type Choice,
	FAMILIES,
	LEADINGS,
	namedOf,
	pxOf,
	RADII,
	stepValue,
	TEXT_COLOR,
	TEXT_SIZES,
	TRACKINGS,
	WEIGHTS,
	withNamed,
	WRITABLE,
} from "./tokens";

/**
 * Angle: Figma's properties panel, read literally, then said in CSS.
 *
 * The order is Figma's (position, size, auto layout, appearance, fill, stroke,
 * text), the shapes are Figma's (two-up fields with the label inside the box,
 * the nine-dot grid, icon pairs, arrow stepping, drag the label to scrub), and
 * every name on screen is the one the file would carry: `items-center`, `p`,
 * `bg-surface`, `leading-md`. Nothing on the panel explains itself. A control
 * says what it writes and the section title says which property it is.
 *
 * A named token is picked, not typed: the swatch menu holds the project's set
 * out of tokens.css and writes one token onto the literal, the same splice a
 * number or a word gets. What cannot be written keeps its row, loses its box,
 * and the section header carries the short reason once.
 *
 * What to feel: quiet until you touch it. Fields have no chrome until the
 * pointer arrives, red appears only on what is selected, and every edit lands
 * on the mock at the left and on the source line at the bottom in the same
 * frame.
 */

const FRAME_NAME = "cart";
const ROOT = "screen";
const FIRST_ROW = ITEMS[0]?.id ?? "row";

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

interface Geometry {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface Snapshot {
	classes: Record<string, string>;
	texts: Record<string, string>;
	frame: Geometry;
}

const INITIAL: Snapshot = {
	classes: Object.fromEntries(ELEMENTS.map((element) => [element.id, element.className ?? ""])),
	texts: {},
	frame: { x: 1740, y: 96, w: 300, h: 500 },
};

const ORIGINAL = new Map(ELEMENTS.map((element) => [element.id, element.className ?? ""]));
const TREE = ELEMENTS.map((element) => ({ element, depth: chainOf(element.id).length - 1 }));

/** the words a select shows are the tokens themselves, so the control names the property */
function asTokens(options: readonly { token: string; says: string }[]): readonly { token: string; says: string }[] {
	return options.map((option) => ({ token: option.token, says: option.token }));
}

/** short enough for a 300px header: a shared instance says how far it reaches, the rest say themselves */
function reasonOf(element: SourceElement, verdict: Verdict): string | null {
	if (verdict.ok) return null;
	if (element.shared !== undefined) return `shared, ${element.shared.frames} frames`;
	return verdict.reason;
}

export default function PanelFigmaFrame() {
	const [state, setState] = useState<Snapshot>(INITIAL);
	const [history, setHistory] = useState<readonly Snapshot[]>([]);
	const [pick, setPick] = useState<Pick>({ id: "pay", key: "pay" });
	const [hover, setHover] = useState<Pick | null>(null);
	const [boxes, setBoxes] = useState<ReadonlyMap<string, Rect>>(new Map());
	const stage = useRef<HTMLDivElement | null>(null);

	const measure = useCallback(() => {
		const host = stage.current;
		if (host === null) return;
		// the frame root is the space every box is read in, so the stage's own border stays out of it
		const origin = (host.querySelector<HTMLElement>(`[data-node="${ROOT}"]`) ?? host).getBoundingClientRect();
		const next = new Map<string, Rect>();
		for (const node of host.querySelectorAll<HTMLElement>("[data-node]")) {
			const id = node.dataset.node ?? "";
			const key = node.dataset.key ?? id;
			const rect = node.getBoundingClientRect();
			next.set(`${id}:${key}`, { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height });
		}
		setBoxes(next);
	}, []);

	useLayoutEffect(measure, [measure, state]);
	// text is measured wrong until the fonts land, so the boxes are read again when they do
	useEffect(() => {
		let live = true;
		void document.fonts.ready.then(() => {
			if (live) measure();
		});
		return () => {
			live = false;
		};
	}, [measure]);

	const commit = useCallback((change: (snapshot: Snapshot) => Snapshot) => {
		setState((current) => {
			const next = change(current);
			if (next === current) return current;
			setHistory((stack) => [...stack, current]);
			return next;
		});
	}, []);

	const undo = useCallback(() => {
		setHistory((stack) => {
			const last = stack[stack.length - 1];
			if (last === undefined) return stack;
			setState(last);
			return stack.slice(0, -1);
		});
	}, []);

	const ascend = useCallback(() => {
		setPick((held) => {
			const element = elementOf(held.id);
			if (element === undefined || element.parent === null) return held;
			const parent = elementOf(element.parent);
			return parent === undefined ? held : { id: parent.id, key: parent.mapped === undefined ? parent.id : held.key };
		});
	}, []);

	useEffect(() => {
		const down = (event: KeyboardEvent) => {
			const target = event.target;
			if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return;
			if (event.key === "Escape") ascend();
			if ((event.metaKey || event.ctrlKey) && event.key === "z") {
				event.preventDefault();
				undo();
			}
		};
		addEventListener("keydown", down);
		return () => removeEventListener("keydown", down);
	}, [ascend, undo]);

	const pickFrom = (target: EventTarget | null): Pick | null => {
		let node = target instanceof Element ? target : null;
		while (node !== null && stage.current?.contains(node) === true) {
			const id = node.getAttribute("data-node");
			if (id !== null) return { id, key: node.getAttribute("data-key") ?? id };
			node = node.parentElement;
		}
		return null;
	};

	const element = elementOf(pick.id) ?? null;
	const box = boxes.get(`${pick.id}:${pick.key}`) ?? { x: 0, y: 0, w: 0, h: 0 };
	const root = boxes.get(`${ROOT}:${ROOT}`) ?? { x: 0, y: 0, w: state.frame.w, h: state.frame.h };
	const hovered = hover === null ? undefined : boxes.get(`${hover.id}:${hover.key}`);

	const acts: Acts = {
		setClass: (id, next) =>
			commit((snapshot) => ({ ...snapshot, classes: { ...snapshot.classes, [id]: next(snapshot.classes[id] ?? null) } })),
		setText: (id, text) => commit((snapshot) => ({ ...snapshot, texts: { ...snapshot.texts, [id]: text } })),
		setFrame: (patch) => commit((snapshot) => ({ ...snapshot, frame: { ...snapshot.frame, ...patch } })),
		undo,
		canUndo: history.length > 0,
	};

	return (
		<div className="flex h-full w-full bg-canvas font-sans text-text">
			<span className={cn("hidden", WRITABLE)} />

			<div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
				<div className="flex flex-col gap-1.5">
					<button
						type="button"
						onClick={() => setPick({ id: ROOT, key: ROOT })}
						className="flex h-4 cursor-pointer items-center gap-2 font-mono text-sm leading-4"
						style={{ width: state.frame.w }}
					>
						<span className={cn(pick.id === ROOT ? "text-thread" : "text-muted")}>{FRAME_NAME}</span>
						<span className={cn("ml-auto", MUTE)}>
							{state.frame.w} × {state.frame.h}
						</span>
					</button>
					<div
						ref={stage}
						onPointerMove={(event) => setHover(pickFrom(event.target))}
						onPointerLeave={() => setHover(null)}
						onClick={(event) => {
							const next = pickFrom(event.target);
							if (next !== null) setPick(next);
						}}
						className="relative overflow-hidden rounded-[10px] bg-bg outline-1 outline-border"
						style={{ width: state.frame.w, height: state.frame.h }}
					>
						<PropertiesCart classes={state.classes} texts={state.texts} elements={ELEMENTS} />
						<div className="pointer-events-none absolute inset-0">
							{hovered === undefined || (hover?.id === pick.id && hover.key === pick.key) ? null : (
								<span
									className="absolute border border-thread/40"
									style={{ left: hovered.x, top: hovered.y, width: hovered.w, height: hovered.h }}
								/>
							)}
							<span
								className="absolute border border-thread"
								style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
							/>
						</div>
					</div>
				</div>

				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-md border border-border bg-bg p-1">
					{TREE.map((node) => {
						const key = node.element.mapped === undefined ? node.element.id : FIRST_ROW;
						const on = pick.id === node.element.id;
						return (
							<button
								key={node.element.id}
								type="button"
								onClick={() => setPick({ id: node.element.id, key })}
								onPointerEnter={() => setHover({ id: node.element.id, key })}
								onPointerLeave={() => setHover(null)}
								className={cn(
									"flex h-[22px] shrink-0 cursor-pointer items-center gap-2 rounded-[4px] pr-2 text-left hover:bg-surface",
									on && "bg-surface",
								)}
								style={{ paddingLeft: 8 + node.depth * 12 }}
							>
								<span className={cn("truncate font-mono text-sm leading-sm", on ? "text-thread" : "text-text")}>
									{node.element.name}
								</span>
								<span className={cn("ml-auto shrink-0 truncate", MUTE)}>{markOf(node.element)}</span>
							</button>
						);
					})}
				</div>
			</div>

			{element === null ? null : (
				<Panel
					element={element}
					pick={pick}
					className={state.classes[element.id] ?? ""}
					text={state.texts[element.id] ?? null}
					box={box}
					inFrame={{ x: box.x - root.x, y: box.y - root.y }}
					frame={state.frame}
					acts={acts}
				/>
			)}
		</div>
	);
}

function markOf(element: SourceElement): string {
	if (element.shared !== undefined) return element.tag;
	if (element.computed !== undefined) return "cn()";
	if (element.mapped !== undefined) return `×${element.mapped}`;
	return "";
}

interface Acts {
	setClass: (id: string, next: (className: string | null) => string) => void;
	setText: (id: string, text: string) => void;
	setFrame: (patch: Partial<Geometry>) => void;
	undo: () => void;
	canUndo: boolean;
}

interface Reading {
	element: SourceElement;
	pick: Pick;
	className: string;
	text: string | null;
	box: Rect;
	inFrame: { x: number; y: number };
	frame: Geometry;
	acts: Acts;
}

/* ---------- the rail ---------- */

function Panel(props: Omit<Reading, never>) {
	const reading = props;
	const { element } = reading;
	const [shut, setShut] = useState<Record<string, boolean>>({});
	const isRoot = element.id === ROOT;
	const section = (name: string) => ({
		name,
		open: shut[name] !== true,
		onToggle: () => setShut((held) => ({ ...held, [name]: held[name] !== true })),
	});
	const hasText = element.text !== undefined || element.display === "inline";

	// a refusal is worth reading once: the sections under it inherit it and stay quiet
	const seen = new Set<string>();
	const once = (reason: string | null): string | null => {
		if (reason === null || seen.has(reason)) return null;
		seen.add(reason);
		return reason;
	};
	const words = wordVerdict(element);
	const literal = literalVerdict(element);
	const w = sizeVerdict(element, "w");
	const reasons = {
		position: once(reasonOf(element, words)),
		size: once(reasonOf(element, w.ok ? sizeVerdict(element, "h") : w)),
		display: once(reasonOf(element, words.ok ? spacingVerdict(element) : words)),
		opacity: once(reasonOf(element, literal)),
		background: once(reasonOf(element, literal)),
		border: once(reasonOf(element, literal)),
		text: once(reasonOf(element, literal.ok ? textVerdict(element) : literal)),
	};

	return (
		<div className="flex w-[300px] shrink-0 flex-col border-border border-l bg-bg">
			<div className="flex h-11 shrink-0 items-center gap-2 border-border border-b px-3">
				<span className="min-w-0 truncate font-mono text-sm text-text leading-sm">{element.name}</span>
				<span className={cn("ml-auto shrink-0", MUTE)}>{element.tag}</span>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto [&>div:last-child]:border-b-0">
				{isRoot ? (
					<FrameJson reading={reading} section={section} />
				) : (
					<Position reading={reading} section={section} reason={reasons.position} />
				)}
				{isRoot ? null : <Size reading={reading} section={section} reason={reasons.size} />}
				<Display reading={reading} section={section} reason={reasons.display} />
				<Opacity reading={reading} section={section} reason={reasons.opacity} />
				<Background reading={reading} section={section} reason={reasons.background} />
				<Border reading={reading} section={section} reason={reasons.border} />
				{hasText ? <Text reading={reading} section={section} reason={reasons.text} /> : null}
				<Source reading={reading} section={section} />
			</div>
		</div>
	);
}

type Sectioned = (name: string) => { name: string; open: boolean; onToggle: () => void };

/* ---------- position ---------- */

function FrameJson({ reading, section }: { reading: Reading; section: Sectioned }) {
	const { frame, acts } = reading;
	const write = (key: keyof Geometry, typed: string) => {
		const n = Number.parseInt(typed, 10);
		if (!Number.isNaN(n)) acts.setFrame({ [key]: key === "w" || key === "h" ? Math.max(40, n) : n });
	};
	const step = (key: keyof Geometry, units: number) => acts.setFrame({ [key]: frame[key] + units });
	return (
		<Section {...section("frame.json")}>
			<Row>
				<NumField label="x" value={String(frame.x)} ok onCommit={(typed) => write("x", typed)} onStep={(units) => step("x", units)} />
				<NumField label="y" value={String(frame.y)} ok onCommit={(typed) => write("y", typed)} onStep={(units) => step("y", units)} />
			</Row>
			<Row>
				<NumField label="w" value={String(frame.w)} ok onCommit={(typed) => write("w", typed)} onStep={(units) => step("w", units)} />
				<NumField label="h" value={String(frame.h)} ok onCommit={(typed) => write("h", typed)} onStep={(units) => step("h", units)} />
			</Row>
		</Section>
	);
}

const INSET = ["top", "right", "bottom", "left"] as const;

function Position({ reading, section, reason }: { reading: Reading; section: Sectioned; reason: string | null }) {
	const { element, className, inFrame, acts } = reading;
	const verdict = wordVerdict(element);
	const position = wordOf(className, "position");
	const placed = position !== null && position !== "static" && position !== "relative";
	return (
		<Section {...section("position")} reason={reason}>
			<Row>
				<NumField label="x" value={String(Math.round(inFrame.x))} ok={false} onCommit={() => {}} onStep={() => {}} />
				<NumField label="y" value={String(Math.round(inFrame.y))} ok={false} onCommit={() => {}} onStep={() => {}} />
			</Row>
			<Row>
				<WordField
					value={position}
					options={asTokens(WORDS.position.options)}
					ok={verdict.ok}
					placeholder="static"
					onChange={(token) => acts.setClass(element.id, (held) => withWord(held, "position", token))}
				/>
			</Row>
			{placed ? (
				<div className="grid grid-cols-2 gap-1.5">
					{INSET.map((family) => {
						const token = tokenOf(className, family);
						const value = token === null ? null : valueOf(token);
						return (
							<NumField
								key={family}
								label={family}
								value={value ?? "auto"}
								px={pxOf(value)}
								ok={verdict.ok}
								onCommit={(typed) => {
									const next = parse(typed);
									if (next !== null) acts.setClass(element.id, (held) => withToken(held, family, next));
								}}
								onStep={(units) => acts.setClass(element.id, (held) => withToken(held, family, stepValue(value, 0, units)))}
							/>
						);
					})}
				</div>
			) : null}
		</Section>
	);
}

/* ---------- width and height ---------- */

function Size({ reading, section, reason }: { reading: Reading; section: Sectioned; reason: string | null }) {
	const { element, className, box, acts } = reading;
	const w = sizeVerdict(element, "w");
	const h = sizeVerdict(element, "h");
	return (
		<Section {...section("width height")} reason={reason}>
			{(["w", "h"] as const).map((axis) => {
				const verdict = axis === "w" ? w : h;
				const token = tokenOf(className, axis);
				const value = token === null ? null : valueOf(token);
				const measured = Math.round(axis === "w" ? box.w : box.h);
				const mode = sizeModeOf(className, axis);
				return (
					<Row key={axis}>
						<NumField
							label={axis}
							value={mode === "fixed" && value !== null ? value : `${measured}px`}
							px={mode === "fixed" ? `${measured}px` : null}
							ok={verdict.ok}
							className="min-w-0 flex-1"
							onCommit={(typed) => {
								const next = parse(typed);
								if (next !== null) acts.setClass(element.id, (held) => withToken(held, axis, next));
							}}
							onStep={(units) => acts.setClass(element.id, (held) => withToken(held, axis, stepValue(value, measured, units)))}
						/>
						<WordField
							value={mode === "hug" ? null : mode === "fill" ? "full" : "fixed"}
							options={[
								{ token: "full", says: `${axis}-full` },
								{ token: "fixed", says: `${axis}-${value ?? pxValue(measured)}` },
							]}
							ok={verdict.ok}
							placeholder={`${axis}-auto`}
							className="w-[96px]"
							onChange={(token) =>
								acts.setClass(element.id, (held) =>
									withSizeMode(held, axis, (token === null ? "hug" : token === "full" ? "fill" : "fixed") as SizeMode, measured),
								)
							}
						/>
					</Row>
				);
			})}
		</Section>
	);
}

/* ---------- display, and what the display asks for ---------- */

function WrapIcon() {
	return (
		<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
			<path d="M2 3h6a2 2 0 0 1 0 4H3.5M5 5.5 3 7l2 1.5" stroke="currentColor" strokeWidth="1.2" />
		</svg>
	);
}

function Display({ reading, section, reason }: { reading: Reading; section: Sectioned; reason: string | null }) {
	const { element, className, acts } = reading;
	const words = wordVerdict(element);
	const spacing = spacingVerdict(element);
	const [split, setSplit] = useState(false);
	const [sides, setSides] = useState(false);
	const display = wordOf(className, "display");
	const flex = display === "flex" || display === "inline-flex";
	const grid = display === "grid";
	const column = wordOf(className, "direction") === "flex-col";
	const padding = paddingOf(className);
	const four = sides || !(padding.t === padding.b && padding.l === padding.r);
	const gap = gapOf(className);
	const twoGaps = split || gap.x !== gap.y;
	const justify = wordOf(className, "justify");
	const set = (next: (held: string | null) => string) => acts.setClass(element.id, next);

	return (
		<Section {...section("display")} reason={reason}>
			<Row>
				<WordField
					value={display}
					options={asTokens(WORDS.display.options)}
					ok={words.ok}
					placeholder={element.display}
					className="min-w-0 flex-1"
					onChange={(token) => set((held) => withWord(held, "display", token))}
				/>
				{flex ? (
					<>
						<IconField
							value={wordOf(className, "direction") ?? "flex-row"}
							ok={words.ok}
							options={[
								{ token: "flex-row", says: "row", icon: <AxisIcon /> },
								{ token: "flex-col", says: "column", icon: <AxisIcon down /> },
							]}
							onChange={(token) => set((held) => withWord(held, "direction", token === "flex-row" ? null : token))}
						/>
						<IconField
							value={wordOf(className, "wrap")}
							ok={words.ok}
							options={[{ token: "flex-wrap", says: "wrap", icon: <WrapIcon /> }]}
							onChange={(token) =>
								set((held) => withWord(held, "wrap", wordOf(held, "wrap") === token ? null : token))
							}
						/>
					</>
				) : null}
			</Row>

			{flex ? (
				<Row>
					<AlignGrid
						align={wordOf(className, "align")}
						justify={justify}
						column={column}
						ok={words.ok}
						onPick={(align, next) =>
							set((held) => withWord(withWord(held, "align", align), "justify", next === "justify-start" ? null : next))
						}
					/>
					<div className="flex min-w-0 flex-1 flex-col gap-1.5">
						<WordField
							value={wordOf(className, "align")}
							options={asTokens(WORDS.align.options)}
							ok={words.ok}
							placeholder="items-stretch"
							onChange={(token) => set((held) => withWord(held, "align", token))}
						/>
						<WordField
							value={justify}
							options={asTokens(WORDS.justify.options)}
							ok={words.ok}
							placeholder="justify-start"
							onChange={(token) => set((held) => withWord(held, "justify", token))}
						/>
					</div>
				</Row>
			) : null}

			{grid ? (
				<Row>
					<NumField
						label="grid-cols"
						value={valueOf(tokenOf(className, "grid-cols") ?? "grid-cols-1")}
						ok={words.ok}
						onCommit={(typed) => {
							if (/^\d+$/.test(typed.trim())) set((held) => withToken(held, "grid-cols", typed.trim()));
						}}
						onStep={(units) => {
							const now = Number(valueOf(tokenOf(className, "grid-cols") ?? "grid-cols-1"));
							set((held) => withToken(held, "grid-cols", String(Math.max(1, now + units))));
						}}
					/>
				</Row>
			) : null}

			{flex || grid ? (
				<Row>
					{twoGaps ? (
						<>
							<Scale
								label="gap-x"
								value={gap.x}
								ok={spacing.ok}
								onValue={(next) => set((held) => withGap(held, { ...gapOf(held), x: next }))}
							/>
							<Scale
								label="gap-y"
								value={gap.y}
								ok={spacing.ok}
								onValue={(next) => set((held) => withGap(held, { ...gapOf(held), y: next }))}
							/>
						</>
					) : (
						<Scale
							label="gap"
							value={gap.x}
							ok={spacing.ok}
							onValue={(next) => set((held) => withGap(held, { x: next, y: next }))}
						/>
					)}
					<Split on={twoGaps} ok={spacing.ok && gap.x === gap.y} onToggle={() => setSplit(!split)} />
				</Row>
			) : null}

			<Row>
				<div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
					{four ? (
						(["t", "r", "b", "l"] as const).map((side) => (
							<Scale
								key={side}
								label={`p${side}`}
								value={padding[side]}
								ok={spacing.ok}
								onValue={(next) => set((held) => withPadding(held, { ...paddingOf(held), [side]: next }))}
							/>
						))
					) : (
						<>
							<Scale
								label="px"
								value={padding.l}
								ok={spacing.ok}
								onValue={(next) => set((held) => withPadding(held, { ...paddingOf(held), l: next, r: next }))}
							/>
							<Scale
								label="py"
								value={padding.t}
								ok={spacing.ok}
								onValue={(next) => set((held) => withPadding(held, { ...paddingOf(held), t: next, b: next }))}
							/>
						</>
					)}
				</div>
				<Split on={four} ok={spacing.ok && padding.t === padding.b && padding.l === padding.r} onToggle={() => setSides(!sides)} />
			</Row>

			<Row>
				<WordField
					value={wordOf(className, "overflow")}
					options={asTokens(WORDS.overflow.options)}
					ok={words.ok}
					placeholder="overflow-visible"
					onChange={(token) => acts.setClass(element.id, (held) => withWord(held, "overflow", token))}
				/>
			</Row>
		</Section>
	);
}

/** a length on the 4px scale, written as its own token */
function Scale({
	label,
	value,
	ok,
	onValue,
}: {
	label: string;
	value: string | null;
	ok: boolean;
	onValue: (value: string | null) => void;
}) {
	return (
		<NumField
			label={label}
			value={value ?? "0"}
			px={value === null || value === "0" ? null : pxOf(value)}
			ok={ok}
			onCommit={(typed) => {
				const next = parse(typed);
				if (next !== null) onValue(next);
			}}
			onStep={(units) => onValue(stepValue(value, 0, units))}
		/>
	);
}

function Split({ on, ok, onToggle }: { on: boolean; ok: boolean; onToggle: () => void }) {
	return (
		<button
			type="button"
			disabled={!ok && !on}
			aria-pressed={on}
			aria-label="each side"
			onClick={onToggle}
			className={cn(
				"flex h-7 w-7 shrink-0 items-center justify-center rounded-sm",
				ok || on ? "cursor-pointer hover:bg-surface" : "cursor-default",
				on ? "bg-surface text-text" : ok ? "text-muted/60" : "text-muted/25",
			)}
		>
			<SidesIcon on={on} />
		</button>
	);
}

/* ---------- opacity, fill, stroke ---------- */

function Opacity({ reading, section, reason }: { reading: Reading; section: Sectioned; reason: string | null }) {
	const { element, className, acts } = reading;
	const verdict = literalVerdict(element);
	const token = tokenOf(className, "opacity");
	const now = token === null ? 100 : Number(valueOf(token));
	const write = (next: number) => {
		const clamped = Math.min(100, Math.max(0, next));
		acts.setClass(element.id, (held) => withToken(held, "opacity", clamped >= 100 ? null : String(clamped)));
	};
	return (
		<Section {...section("opacity")} reason={reason}>
			<Row>
				<NumField
					label=""
					value={String(now)}
					suffix="%"
					ok={verdict.ok}
					onCommit={(typed) => {
						const n = Number.parseInt(typed, 10);
						if (!Number.isNaN(n)) write(n);
					}}
					onStep={(units) => write(now + units * 5)}
				/>
			</Row>
		</Section>
	);
}

function Background({ reading, section, reason }: { reading: Reading; section: Sectioned; reason: string | null }) {
	const { element, className, acts } = reading;
	const verdict = literalVerdict(element);
	const list = staticTokens(element, className);
	return (
		<Section {...section("background")} reason={reason}>
			<Row>
				<TokenField
					value={namedOf(list, BG)}
					choices={BG}
					ok={verdict.ok}
					onPick={(token) => acts.setClass(element.id, (held) => withNamed(held, BG, token))}
				/>
			</Row>
		</Section>
	);
}

function Border({ reading, section, reason }: { reading: Reading; section: Sectioned; reason: string | null }) {
	const { element, className, acts } = reading;
	const verdict = literalVerdict(element);
	const list = staticTokens(element, className);
	const flat = list.includes("border");
	const token = tokenOf(className, "border");
	const width = token === null ? (flat ? 1 : 0) : Number(valueOf(token));
	const write = (next: number) =>
		acts.setClass(element.id, (held) => {
			const without = withToken(
				(held ?? "")
					.split(/\s+/)
					.filter((candidate) => candidate !== "border")
					.join(" "),
				"border",
				null,
			);
			if (next <= 0) return without;
			return next === 1 ? `${without} border`.trim() : withToken(without, "border", String(next));
		});
	return (
		<Section {...section("border")} reason={reason}>
			<Row>
				<NumField
					label="border"
					value={String(Number.isNaN(width) ? 0 : width)}
					suffix="px"
					ok={verdict.ok}
					onCommit={(typed) => {
						const n = Number.parseInt(typed, 10);
						if (!Number.isNaN(n)) write(n);
					}}
					onStep={(units) => write((Number.isNaN(width) ? 0 : width) + units)}
				/>
			</Row>
			<Row>
				<TokenField
					value={namedOf(list, BORDER_COLOR)}
					choices={BORDER_COLOR}
					ok={verdict.ok}
					onPick={(token_) => acts.setClass(element.id, (held) => withNamed(held, BORDER_COLOR, token_))}
				/>
			</Row>
			<Row>
				<TokenField
					value={namedOf(list, RADII)}
					choices={RADII}
					ok={verdict.ok}
					onPick={(token_) => acts.setClass(element.id, (held) => withNamed(held, RADII, token_))}
				/>
			</Row>
		</Section>
	);
}

/* ---------- text ---------- */

function Text({ reading, section, reason }: { reading: Reading; section: Sectioned; reason: string | null }) {
	const { element, className, text, acts } = reading;
	const content = textVerdict(element);
	const words = wordVerdict(element);
	const literal = literalVerdict(element);
	const list = staticTokens(element, className);
	const written =
		element.text === undefined ? null : (text ?? ("literal" in element.text ? element.text.literal : element.text.expr));
	const pickToken = (choices: readonly Choice[]) => (token: string | null) =>
		acts.setClass(element.id, (held) => withNamed(held, choices, token));
	return (
		<Section {...section("text")} reason={reason}>
			{written === null ? null : (
				<Row>
					<TextField value={written} ok={content.ok} onCommit={(next) => acts.setText(element.id, next)} />
				</Row>
			)}
			<Row>
				<IconField
					value={wordOf(className, "textAlign") ?? "text-left"}
					ok={words.ok}
					options={[
						{ token: "text-left", says: "left", icon: <TextAlignIcon at="left" /> },
						{ token: "text-center", says: "center", icon: <TextAlignIcon at="center" /> },
						{ token: "text-right", says: "right", icon: <TextAlignIcon at="right" /> },
					]}
					onChange={(token) =>
						acts.setClass(element.id, (held) => withWord(held, "textAlign", token === "text-left" ? null : token))
					}
				/>
			</Row>
			<Row>
				<TokenField value={namedOf(list, FAMILIES)} inherited="font-sans" choices={FAMILIES} ok={literal.ok} onPick={pickToken(FAMILIES)} />
			</Row>
			<Row>
				<TokenField value={namedOf(list, TEXT_SIZES)} inherited="text-base" choices={TEXT_SIZES} ok={literal.ok} onPick={pickToken(TEXT_SIZES)} />
			</Row>
			<Row>
				<TokenField value={namedOf(list, WEIGHTS)} inherited="font-normal" choices={WEIGHTS} ok={literal.ok} onPick={pickToken(WEIGHTS)} />
			</Row>
			<Row>
				<TokenField value={namedOf(list, LEADINGS)} inherited="leading-base" choices={LEADINGS} ok={literal.ok} onPick={pickToken(LEADINGS)} />
			</Row>
			<Row>
				<TokenField value={namedOf(list, TRACKINGS)} inherited="tracking-normal" choices={TRACKINGS} ok={literal.ok} onPick={pickToken(TRACKINGS)} />
			</Row>
			<Row>
				<TokenField value={namedOf(list, TEXT_COLOR)} inherited="text-text" choices={TEXT_COLOR} ok={literal.ok} onPick={pickToken(TEXT_COLOR)} />
			</Row>
		</Section>
	);
}

/* ---------- the line the writes land on ---------- */

function Source({ reading, section }: { reading: Reading; section: Sectioned }) {
	const { element, className, acts } = reading;
	const before = new Set((ORIGINAL.get(element.id) ?? "").split(/\s+/));
	const list = className.split(/\s+/).filter(Boolean);
	const verdict = literalVerdict(element);
	const where =
		element.shared === undefined ? `${FILE}:${element.line}` : `${element.shared.file}:${element.shared.line}`;
	const scope = verdict.ok && verdict.scope !== undefined ? ` · ${element.mapped} rows` : "";
	return (
		<Section {...section("source")}>
			<p className="font-mono text-sm leading-sm">
				{element.computed !== undefined ? (
					<span className="text-muted">{element.computed}</span>
				) : list.length === 0 ? (
					<span className="text-muted/50">no className</span>
				) : (
					list.map((token, index) => (
						<span key={`${token}-${index}`} className={before.has(token) ? "text-muted" : "text-thread"}>
							{token}
							{index < list.length - 1 ? " " : ""}
						</span>
					))
				)}
			</p>
			<div className="flex items-center gap-2">
				<span className={cn("min-w-0 truncate", MUTE)}>
					{where}
					{scope}
				</span>
				{acts.canUndo ? (
					<button
						type="button"
						onClick={acts.undo}
						className={cn("ml-auto shrink-0 cursor-pointer text-muted hover:text-text", MUTE)}
					>
						undo ⌘Z
					</button>
				) : null}
			</div>
		</Section>
	);
}
