import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	chainOf,
	CLASSES,
	countLine,
	type DocElement,
	elementOf,
	FIELD,
	reachOf,
	type TakeName,
	TAKES,
} from "shared/lib/explore/manipulate/shared-reach";
import { cn } from "shared/lib/utils";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { AgentPlate, DocFor } from "shared/ui/explore/manipulate/shared-doc";
import { SpoolShell } from "shared/ui/spool/shell";
import { elementOf as modelElementOf } from "shared/lib/spool/properties-model";
import { type Acts, Rail as RealRail, type Reading } from "shared/ui/spool/properties-rail";

/**
 * Five readings of one question (spool-cloud#30): how spool says the element
 * under your cursor is shared, and how much it says when you change it.
 *
 * Way 1 is the settled floor under all five — an edit to a shared element edits
 * the component, and every frame that renders it changes. So the rail is live
 * on a shared element in every take; nothing here greys out the way today's
 * `shared-definition` refusal does. What differs is only the mark and the
 * volume, which is the whole of what the ticket asks.
 *
 * The canvas is deliberately crowded, because that is where a mark dies: a
 * hover ring, a selection ring with its handles, a measurement bar held open,
 * and an agent plate on the receipt. If a mark cannot be found in here it
 * cannot be found on a real canvas either.
 *
 * Select `pay` or `header` for the shared case, `promo` or `row` for a local
 * one, and `title` for the wall that survives Way 1: a prop is the component's
 * own, so no hand writes it however reachable the component becomes.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true },
	{ name: "manipulate", frames: [] },
	{ name: "components", frames: [] },
];

/** the project as `rail` needs it: enough frames off screen that the seven you cannot see have rows */
const PAGES_FULL: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt", "checkout", "orders", "profile", "tip"], active: true, open: true },
	{ name: "onboarding", frames: ["welcome", "signin", "verify"] },
	{ name: "manipulate", frames: [] },
	{ name: "components", frames: [] },
];

const RAIL_W = 300;
const LABEL_H = 22;

/** the second accent, which exists in exactly one of these frames and is the argument there */
const TINT = "#FF3D9A";
const THREAD = "#F5391A";

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface Pick {
	id: string;
	key: string;
}

/** what the last write changed, so a take that speaks at the write has a moment to speak at */
interface Wrote {
	id: string;
	/** the frames on screen that moved, the edited one excluded */
	frames: readonly string[];
	/** a new number each write, so the animation restarts even on the same element */
	stamp: number;
	/** the first write of the session, which is the only one `wake` says anything about */
	first: boolean;
}

const MOTION = `
@keyframes shared-echo-in { from { opacity: 0; transform: scale(1.04); } }
@keyframes shared-pulse { from { opacity: .85; transform: scale(1); } to { opacity: 0; transform: scale(1.05); } }
@keyframes shared-wake { 0% { opacity: 0; } 10% { opacity: 1; } 68% { opacity: 1; } 100% { opacity: 0; } }
`;

export function SharedScreen({ take: name }: { take: TakeName }) {
	const take = TAKES[name];
	const [classes, setClasses] = useState<Readonly<Record<string, string>>>({});
	const [texts, setTexts] = useState<Readonly<Record<string, string>>>({});
	const [selection, setSelection] = useState<Pick | null>({ id: "pay", key: "pay" });
	const [hover, setHover] = useState<Pick | null>(null);
	const [boxes, setBoxes] = useState<ReadonlyMap<string, Rect>>(new Map());
	const [wrote, setWrote] = useState<Wrote | null>(null);
	const writes = useRef(0);
	const fieldRef = useRef<HTMLDivElement | null>(null);

	/* ---------- measuring: every stamped node in every frame, in field space ---------- */

	const measure = useCallback(() => {
		const field = fieldRef.current;
		if (field === null) return;
		const origin = field.getBoundingClientRect();
		const next = new Map<string, Rect>();
		for (const node of field.querySelectorAll<HTMLElement>("[data-frame] [data-node]")) {
			const frame = node.closest<HTMLElement>("[data-frame]")?.dataset.frame ?? "";
			const id = node.dataset.node ?? "";
			const key = node.dataset.key ?? id;
			const rect = node.getBoundingClientRect();
			next.set(`${frame}:${id}:${key}`, { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height });
		}
		setBoxes(next);
	}, []);

	useLayoutEffect(measure, [measure, classes, texts]);
	useEffect(() => {
		addEventListener("resize", measure);
		let live = true;
		void document.fonts.ready.then(() => {
			if (live) measure();
		});
		return () => {
			live = false;
			removeEventListener("resize", measure);
		};
	}, [measure]);

	/* ---------- writing: one value, however many frames render it ---------- */

	const write = useCallback((id: string, change: () => void) => {
		change();
		writes.current += 1;
		setWrote({ id, frames: reachOf(id), stamp: writes.current, first: writes.current === 1 });
	}, []);

	const setClass = (id: string, next: (className: string) => string) =>
		write(id, () => setClasses((held) => ({ ...held, [id]: next(held[id] ?? classOf(id)) })));

	const setText = (id: string, value: string) => write(id, () => setTexts((held) => ({ ...held, [id]: value })));

	const reset = () => {
		setClasses({});
		setTexts({});
		setWrote(null);
		writes.current = 0;
	};

	const element = selection === null ? null : (elementOf(selection.id) ?? null);

	/* ---------- what each take draws ---------- */

	const shared = (id: string) => elementOf(id)?.origin !== undefined;
	// `wake` says nothing before the write: its whole claim is that the first one
	// is the only moment worth spending, so there is no mark until it arrives
	const woken = name === "wake" && wrote?.first === true;
	// rail and name put the reach in the pages rail as well as on the canvas
	const mapped = name === "rail" || name === "name";

	/* ---------- what the shipped rail reads, for the take that stands in it ---------- */

	const cartFrame = FIELD.find((frame) => frame.edited === true) ?? FIELD[0];
	const reading: Reading | null =
		element === null || selection === null
			? null
			: (() => {
					const model = modelElementOf(element.id);
					if (model === undefined) return null;
					const box = boxes.get(`cart:${selection.id}:${selection.key}`) ?? { x: 0, y: 0, w: 0, h: 0 };
					return {
						// the fixture's own tag, so the crumb says Button; and no `shared`, because the refusal is retired
						element: { ...model, tag: element.tag, shared: undefined },
						pick: selection,
						className: classes[element.id] ?? classOf(element.id),
						text: texts[element.id] ?? element.text ?? null,
						box,
						inFrame: { x: box.x - cartFrame.x, y: box.y - cartFrame.y },
						frame: { x: cartFrame.x, y: cartFrame.y, w: cartFrame.w, h: cartFrame.h },
						original: new Set(classOf(element.id).split(/\s+/)),
					};
				})();
	const acts: Acts = {
		setClass: (id, next) => setClass(id, (held) => next(held)),
		setText,
		setFrame: () => {},
		select: setSelection,
		undo: () => {},
		canUndo: false,
	};

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="100%">
			<style>{MOTION}</style>
			<CanvasChrome
				pages={mapped ? PAGES_FULL : PAGES}
				holding={mapped ? (element?.origin?.holders ?? []) : undefined}
				selected="cart"
				tool="select"
				railLabel="properties"
				railWidth={RAIL_W}
				rail={
					name === "name" ? (
						<RealRail reading={reading} acts={acts} head={element === null ? null : <Origin take={take} element={element} />} />
					) : (
					<Rail
						take={name}
						element={element}
						pick={selection}
						className={selection === null ? "" : (classes[selection.id] ?? classOf(selection.id))}
						text={selection === null ? null : (texts[selection.id] ?? elementOf(selection.id)?.text ?? null)}
						wrote={wrote}
						onSelect={setSelection}
						onClass={setClass}
						onText={setText}
						onReset={reset}
					/>
					)
				}
			>
				<div ref={fieldRef} className="absolute inset-0">
					{FIELD.map((frame) => (
						<div key={frame.name} className="absolute flex flex-col gap-1.5" style={{ left: frame.x, top: frame.y - LABEL_H }}>
							<div className="flex h-4 items-center gap-1.5" style={{ width: frame.w }}>
								<span className={cn("font-mono text-sm leading-4", frame.edited === true ? "text-thread" : "text-muted")}>{frame.name}</span>
								<span className="ml-auto font-mono text-2xs text-muted/55 leading-3">
									{frame.w} × {frame.h}
								</span>
							</div>
							<div className="relative">
								{frame.agent === undefined ? null : <AgentPlate who={frame.agent} />}
								<div
									data-frame={frame.name}
									onPointerMove={(event) => {
										if (frame.edited !== true) return;
										setHover(pickFrom(event.target, event.currentTarget));
									}}
									onPointerLeave={() => setHover(null)}
									onClick={(event) => {
										if (frame.edited !== true) return;
										const pick = pickFrom(event.target, event.currentTarget);
										if (pick !== null) setSelection(pick);
									}}
									className="relative overflow-hidden rounded-[10px] border border-border bg-bg"
									style={{ width: frame.w, height: frame.h }}
								>
									<DocFor name={frame.name} ink={{ classes, texts }} />
								</div>
							</div>
						</div>
					))}

					<Overlay take={name} boxes={boxes} hover={hover} selection={selection} shared={shared} woken={woken} wrote={wrote} />
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

/** the class the file holds, before anything the rail spliced */
function classOf(id: string): string {
	return CLASSES[id] ?? "";
}

/* ---------- pointing ---------- */

function pickFrom(target: EventTarget | null, stage: HTMLElement): Pick | null {
	let node = target instanceof Element ? target : null;
	while (node !== null && stage.contains(node)) {
		const id = node.getAttribute("data-node");
		if (id !== null) return { id, key: node.getAttribute("data-key") ?? id };
		node = node.parentElement;
	}
	return null;
}

/* ---------- the overlay ---------- */

function Overlay({
	take,
	boxes,
	hover,
	selection,
	shared,
	woken,
	wrote,
}: {
	take: TakeName;
	boxes: ReadonlyMap<string, Rect>;
	hover: Pick | null;
	selection: Pick | null;
	shared: (id: string) => boolean;
	woken: boolean;
	wrote: Wrote | null;
}) {
	const box = (frame: string, pick: Pick) => boxes.get(`${frame}:${pick.id}:${pick.key}`);
	const selected = selection === null ? undefined : box("cart", selection);
	const hovered = hover === null || (selection !== null && hover.id === selection.id && hover.key === selection.key) ? undefined : box("cart", hover);
	const element = selection === null ? undefined : elementOf(selection.id);
	const parent = element?.parent == null ? undefined : box("cart", { id: element.parent, key: element.parent });
	const root = box("cart", { id: "screen", key: "screen" });

	const tint = take === "tint";
	const accent = (id: string | undefined) => (tint && id !== undefined && shared(id) ? TINT : THREAD);

	/** the same element, in the other frames on screen that render it */
	const echoOf = (pick: Pick | null) =>
		pick === null || !shared(pick.id)
			? []
			: reachOf(pick.id).flatMap((frame) => {
					const rect = box(frame, { id: pick.id, key: pick.id });
					return rect === undefined ? [] : [{ frame, rect }];
				});
	// reach answers the cursor. select, echo and rail answer a click, because most of
	// what a cursor crosses is shared and a field that answers every hover flickers.
	const elsewhere =
		take === "reach"
			? echoOf(hover ?? selection)
			: take === "select" || take === "echo" || take === "rail" || take === "name"
				? echoOf(selection)
				: [];
	/** what the cursor is on, for the take that names it */
	const named = take === "name" && hover !== null ? elementOf(hover.id) : undefined;
	// echo's second volume: the cursor's, under the hand's
	const faint =
		take === "echo" && hover !== null && (selection === null || hover.id !== selection.id) ? echoOf(hover) : [];

	/** what the write moved, drawn only for the take that speaks at the write */
	const changed =
		wrote === null
			? []
			: wrote.frames.flatMap((frame) => {
					const rect = box(frame, { id: wrote.id, key: wrote.id });
					return rect === undefined ? [] : [{ frame, rect }];
				});
	const from = wrote === null ? undefined : box("cart", { id: wrote.id, key: wrote.id });

	return (
		<div className="pointer-events-none absolute inset-0">
			{hovered === undefined ? null : (
				<>
					{named?.origin === undefined ? null : (
						// above the ring, and inside it when above would be the frame's own label
						<span
							className="absolute rounded-xs px-1 py-[1px] font-mono text-2xs leading-3"
							style={{
								left: hovered.x + (inside(hovered, root) ? 3 : -1),
								top: inside(hovered, root) ? hovered.y + 3 : hovered.y - 17,
								color: THREAD,
								background: "#161616",
							}}
						>
							{named.origin.export}
						</span>
					)}
					{take === "ring" && hover !== null && shared(hover.id) ? (
						<Ring rect={grow(hovered, 3)} colour={THREAD} width={1} opacity={0.3} />
					) : null}
					<Ring rect={hovered} colour={accent(hover?.id)} width={1} opacity={0.55} />
				</>
			)}

			{/* select, echo, rail: the same ring where it also stands, and nothing written beside it */}
			{take === "reach" ? null : <Echoes rings={elsewhere} />}
			{faint.map(({ frame, rect }) => (
				<Ring key={`faint-${frame}`} rect={grow(rect, 3)} colour={THREAD} width={1} opacity={0.22} />
			))}

			{/* reach: the same element, ringed where it also stands */}
			{take === "reach"
				? elsewhere.map(({ frame, rect }) => (
						<span key={`reach-${frame}`}>
							{/* outside the element, so a ring on a thread-filled button still lands on dark ground */}
							<Ring rect={grow(rect, 3)} colour={THREAD} width={1} opacity={0.7} />
							<span
								className="absolute rounded-xs px-1 py-[1px] font-mono text-2xs leading-3"
								style={{ left: rect.x - 3, top: rect.y - 18, color: THREAD, background: "#161616" }}
							>
								same element
							</span>
						</span>
					))
				: null}

			{selected === undefined || selection === null ? null : (
				<>
					{/* the mark, drawn outside the ring so the ring itself is untouched */}
					{take === "ring" && shared(selection.id) ? (
						<Ring rect={grow(selected, 4)} colour={THREAD} width={1} opacity={0.45} />
					) : null}
					{take === "ring" && wrote !== null && wrote.id === selection.id ? (
						<Ring
							key={`pulse-${wrote.stamp}`}
							rect={grow(selected, 4)}
							colour={THREAD}
							width={1.5}
							opacity={1}
							animation="shared-pulse 620ms ease-out forwards"
						/>
					) : null}

					<Ring rect={grow(selected, 2)} colour={accent(selection.id)} width={1.5} opacity={1} />
					<Handles rect={grow(selected, 2)} colour={accent(selection.id)} />

					{/* the measurement bar, held open, so the mark is judged beside it */}
					{parent === undefined ? null : <Measure child={selected} parent={parent} />}
				</>
			)}

			{/* wake: the frames the first write moved say so once, then never again */}
			{woken && from !== undefined
				? changed.map(({ frame, rect }) => (
						<span key={`wake-${frame}-${wrote?.stamp}`} style={{ animation: "shared-wake 1500ms ease-out forwards" }}>
							<Ring rect={grow(rect, 3)} colour={THREAD} width={1.5} opacity={1} />
							<Thread from={from} to={rect} />
							<span
								className="absolute rounded-xs px-1.5 py-[2px] font-mono text-2xs leading-3"
								style={{ left: rect.x, top: rect.y - 17, color: "#FFFFFF", background: THREAD }}
							>
								changed
							</span>
						</span>
					))
				: null}
		</div>
	);
}

/**
 * The rings in the other frames arrive on a short fade and leave on one: the last
 * set stays mounted at opacity 0 for the length of the transition, so a deselect
 * does not pop.
 */
function Echoes({ rings }: { rings: readonly { frame: string; rect: Rect }[] }) {
	const [linger, setLinger] = useState(rings);
	useEffect(() => {
		if (rings.length > 0) setLinger(rings);
	}, [rings]);
	const shown = rings.length > 0 ? rings : linger;
	return (
		<>
			{shown.map(({ frame, rect }) => (
				<span
					key={`echo-${frame}`}
					className="absolute rounded-[3px] transition-opacity duration-[160ms] ease-out motion-reduce:transition-none"
					style={{
						left: rect.x - 3,
						top: rect.y - 3,
						width: rect.w + 6,
						height: rect.h + 6,
						border: `1px solid ${THREAD}`,
						opacity: rings.length > 0 ? 0.7 : 0,
						animation: rings.length > 0 ? "shared-echo-in 160ms ease-out" : undefined,
						transformOrigin: "center",
					}}
				/>
			))}
		</>
	);
}

/** where a shared element is written, said under the crumb of the shipped rail */
function Origin({ take, element }: { take: (typeof TAKES)[TakeName]; element: DocElement }) {
	const origin = element.origin;
	if (origin === undefined) return null;
	const count = countLine(take, element);
	return (
		<div className="flex flex-col gap-0.5 px-2.5 pb-2">
			<span className={cn("truncate", VALUE)}>
				{origin.file}:{origin.line}
			</span>
			{count === null ? null : <span className={FAINT}>{count}</span>}
		</div>
	);
}

/** true when a label over this rect would land on the frame's name */
function inside(rect: Rect, root: Rect | undefined): boolean {
	return root !== undefined && rect.y - 17 < root.y;
}

function grow(rect: Rect, by: number): Rect {
	return { x: rect.x - by, y: rect.y - by, w: rect.w + by * 2, h: rect.h + by * 2 };
}

function Ring({
	rect,
	colour,
	width,
	opacity,
	animation,
}: {
	rect: Rect;
	colour: string;
	width: number;
	opacity: number;
	animation?: string;
}) {
	return (
		<span
			className="absolute rounded-[3px]"
			style={{
				left: rect.x,
				top: rect.y,
				width: rect.w,
				height: rect.h,
				border: `${width}px solid ${colour}`,
				opacity,
				...(animation === undefined ? {} : { animation, transformOrigin: "center" }),
			}}
		/>
	);
}

function Handles({ rect, colour }: { rect: Rect; colour: string }) {
	const corners = [
		{ x: rect.x, y: rect.y },
		{ x: rect.x + rect.w, y: rect.y },
		{ x: rect.x, y: rect.y + rect.h },
		{ x: rect.x + rect.w, y: rect.y + rect.h },
	];
	return (
		<>
			{corners.map((corner) => (
				<span
					key={`${corner.x}-${corner.y}`}
					className="absolute h-2.5 w-2.5 rounded-[1.5px] bg-on-thread"
					style={{ left: corner.x - 5, top: corner.y - 5, border: `1.5px solid ${colour}` }}
				/>
			))}
		</>
	);
}

/** the gap between an element's top and its parent's, said in px the way Figma says it */
function Measure({ child, parent }: { child: Rect; parent: Rect }) {
	const gap = Math.round(child.y - parent.y);
	if (gap <= 6) return null;
	const x = child.x + child.w / 2;
	return (
		<>
			<span className="absolute" style={{ left: x, top: parent.y, width: 1, height: gap, background: THREAD, opacity: 0.7 }} />
			<span
				className="absolute rounded-xs px-1 py-[1px] font-mono text-2xs leading-3"
				style={{ left: x + 4, top: parent.y + gap / 2 - 7, color: "#FFFFFF", background: THREAD }}
			>
				{gap}
			</span>
		</>
	);
}

/** a hairline from what was edited to what it moved, for the take that draws the blast radius */
function Thread({ from, to }: { from: Rect; to: Rect }) {
	const a = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
	const b = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
	const left = Math.min(a.x, b.x);
	const top = Math.min(a.y, b.y);
	return (
		<svg
			className="absolute overflow-visible"
			style={{ left, top }}
			width={Math.abs(b.x - a.x)}
			height={Math.abs(b.y - a.y)}
			aria-hidden="true"
		>
			<line x1={a.x - left} y1={a.y - top} x2={b.x - left} y2={b.y - top} stroke={THREAD} strokeWidth={1} strokeDasharray="3 3" />
		</svg>
	);
}

/* ---------- the rail ---------- */

const LABEL = "font-mono text-2xs text-muted/55 leading-3";
const VALUE = "font-mono text-sm leading-sm";
const FAINT = "font-mono text-2xs text-muted leading-3";

function Rail({
	take: name,
	element,
	pick,
	className,
	text,
	wrote,
	onSelect,
	onClass,
	onText,
	onReset,
}: {
	take: TakeName;
	element: DocElement | null;
	pick: Pick | null;
	className: string;
	text: string | null;
	wrote: Wrote | null;
	onSelect: (pick: Pick) => void;
	onClass: (id: string, next: (className: string) => string) => void;
	onText: (id: string, value: string) => void;
	onReset: () => void;
}) {
	const take = TAKES[name];
	const tint = name === "tint";
	if (element === null || pick === null) {
		return (
			<div className="flex h-full flex-col bg-bg">
				<div className="flex h-9 items-center border-border border-b px-2.5">
					<span className={cn("text-muted/50", VALUE)}>no selection</span>
				</div>
			</div>
		);
	}
	const origin = element.origin;
	const count = countLine(take, element);
	const writable = element.prop === undefined;

	return (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			{/* the crumb, unchanged in every take but one */}
			<div className="shrink-0 border-border border-b">
				<div className="flex h-9 items-center gap-2 px-2.5">
					<span className={cn("flex min-w-0 items-center gap-1 truncate", VALUE)}>
						{chainOf(element.id).map((step, index, all) => {
							const last = index === all.length - 1;
							const marked = tint && step.origin !== undefined;
							return (
								<span key={step.id} className="flex shrink-0 items-center gap-1">
									<button
										type="button"
										onClick={() => onSelect({ id: step.id, key: step.mapped === undefined ? step.id : pick.key })}
										className={cn("cursor-pointer rounded-xs px-0.5", last ? "text-thread" : "text-muted hover:text-text")}
										style={marked ? { color: TINT } : undefined}
									>
										{step.name}
									</button>
									{last ? null : <span className="text-muted/30">/</span>}
								</span>
							);
						})}
					</span>
					<span className={cn("ml-auto shrink-0", FAINT)}>{element.tag}</span>
				</div>
			</div>

			{/* where it is written, which is the one thing every take has to answer */}
			<div className="flex shrink-0 flex-col gap-1 border-border border-b px-2.5 py-2">
				<span className={LABEL}>{origin === undefined ? "in this frame" : "defined elsewhere"}</span>
				<span className={cn("truncate", VALUE)} style={origin !== undefined && tint ? { color: TINT } : undefined}>
					{origin === undefined ? `frames/app/cart/frame.tsx:${element.line}` : `${origin.file}:${origin.line}`}
				</span>
				{count === null ? null : (
					<span className={FAINT} style={tint ? { color: TINT } : undefined}>
						{count}
					</span>
				)}
				{origin !== undefined && name === "wake" ? (
					<span className={FAINT}>a change here is a change everywhere it stands</span>
				) : null}
			</div>

			{/* the fields, live on a shared element: Way 1 is the floor under all five */}
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				{writable ? (
					<>
						<Fill className={className} onPick={(token) => onClass(element.id, (held) => withToken(held, "bg", token))} />
						<Size className={className} onStep={(step) => onClass(element.id, (held) => stepToken(held, "h", step))} />
						<Radius className={className} onPick={(token) => onClass(element.id, (held) => withToken(held, "rounded", token))} />
						{element.text === undefined ? null : (
							<Words value={text ?? element.text} onWrite={(value) => onText(element.id, value)} />
						)}
					</>
				) : (
					<div className="flex flex-col gap-1 px-2.5 py-2">
						<span className={LABEL}>read only</span>
						<span className={cn("text-muted", FAINT)}>
							{element.prop} is a prop of {origin?.export}. Structure stays the agent's, whatever else opens up.
						</span>
					</div>
				)}
			</div>

			{/* the argument, in the corner of the rail rather than in a ticket */}
			<div className="flex shrink-0 flex-col gap-1.5 border-border border-t px-2.5 py-2.5">
				<div className="flex items-center gap-2">
					<span className={cn("text-text", VALUE)}>{take.name}</span>
					<button type="button" onClick={onReset} className={cn("ml-auto cursor-pointer rounded-xs border border-border-raised px-1.5 py-[2px] hover:text-text", FAINT)}>
						reset
					</button>
				</div>
				<p className="text-base text-text leading-base">{take.mark}</p>
				<p className="text-base text-muted leading-base">{take.volume}</p>
				<p className={cn("pt-0.5", FAINT)}>{take.cost}</p>
				{wrote === null ? null : (
					<p className={FAINT}>
						last write: {wrote.id} · {wrote.frames.length === 0 ? "this frame only" : `also ${wrote.frames.join(", ")}`}
					</p>
				)}
			</div>
		</div>
	);
}

/* ---------- three fields that actually write ---------- */

const FILLS = ["bg-thread", "bg-surface", "bg-raised", "bg-canvas", "bg-bg"] as const;
const SWATCH: Readonly<Record<string, string>> = {
	"bg-thread": THREAD,
	"bg-surface": "#1C1C1C",
	"bg-raised": "#282828",
	"bg-canvas": "#161616",
	"bg-bg": "#0E0E0E",
};

function Fill({ className, onPick }: { className: string; onPick: (token: string) => void }) {
	const worn = tokenOf(className, "bg");
	return (
		<Row label="fill">
			<div className="flex items-center gap-1.5">
				{FILLS.map((token) => (
					<button
						key={token}
						type="button"
						aria-label={token}
						onClick={() => onPick(token)}
						className={cn("h-5 w-5 cursor-pointer rounded-xs border", worn === token ? "border-thread" : "border-border-raised")}
						style={{ background: SWATCH[token] }}
					/>
				))}
				<span className={cn("ml-auto", FAINT)}>{worn ?? "none"}</span>
			</div>
		</Row>
	);
}

function Size({ className, onStep }: { className: string; onStep: (step: number) => void }) {
	const worn = tokenOf(className, "h");
	const px = worn === null ? null : stepsOf(worn) * 4;
	return (
		<Row label="height">
			<div className="flex items-center gap-1.5">
				<Step label="−" onPress={() => onStep(-1)} disabled={worn === null} />
				<Step label="+" onPress={() => onStep(1)} disabled={worn === null} />
				<span className={cn("ml-auto", VALUE)}>{px === null ? "auto" : `${px}px`}</span>
				<span className={FAINT}>{worn ?? ""}</span>
			</div>
		</Row>
	);
}

const RADII = ["rounded-xs", "rounded-sm", "rounded-md", "rounded-lg"] as const;

function Radius({ className, onPick }: { className: string; onPick: (token: string) => void }) {
	const worn = tokenOf(className, "rounded");
	return (
		<Row label="radius">
			<div className="flex items-center gap-1.5">
				{RADII.map((token) => (
					<button
						key={token}
						type="button"
						onClick={() => onPick(token)}
						className={cn(
							"h-5 cursor-pointer rounded-xs border px-1.5",
							FAINT,
							worn === token ? "border-thread text-text" : "border-border-raised",
						)}
					>
						{token.replace("rounded-", "")}
					</button>
				))}
			</div>
		</Row>
	);
}

function Words({ value, onWrite }: { value: string; onWrite: (value: string) => void }) {
	return (
		<Row label="text">
			<input
				value={value}
				onChange={(event) => onWrite(event.target.value)}
				className={cn("h-6 w-full rounded-xs border border-border-raised bg-surface px-1.5 text-text focus:border-thread focus:outline-none", VALUE)}
			/>
		</Row>
	);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5 border-border border-b px-2.5 py-2">
			<span className={LABEL}>{label}</span>
			{children}
		</div>
	);
}

function Step({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
	return (
		<button
			type="button"
			onClick={onPress}
			disabled={disabled}
			className={cn(
				"h-5 w-5 rounded-xs border border-border-raised text-muted",
				VALUE,
				disabled ? "opacity-35" : "cursor-pointer hover:text-text",
			)}
		>
			{label}
		</button>
	);
}

/* ---------- the smallest className splice that makes an edit real ---------- */

function tokenOf(className: string, prefix: string): string | null {
	return className.split(/\s+/).find((token) => token.startsWith(`${prefix}-`)) ?? null;
}

function withToken(className: string, prefix: string, token: string): string {
	const kept = className.split(/\s+/).filter((held) => held !== "" && !held.startsWith(`${prefix}-`));
	return [...kept, token].join(" ");
}

/** `h-11` is 44px; a step is one rung of the 4px scale, and half-steps are left alone */
function stepsOf(token: string): number {
	const value = Number.parseFloat(token.slice(token.indexOf("-") + 1));
	return Number.isFinite(value) ? value : 0;
}

function stepToken(className: string, prefix: string, step: number): string {
	const worn = tokenOf(className, prefix);
	if (worn === null) return className;
	const next = Math.max(1, Math.round(stepsOf(worn) + step));
	return withToken(className, prefix, `${prefix}-${next}`);
}
