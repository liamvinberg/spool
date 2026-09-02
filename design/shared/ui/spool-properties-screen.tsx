import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { lengthOf, lengthPx, stylesheetFor, withLength } from "shared/lib/properties-families";
import { ELEMENTS, elementOf, pxValue, sizeVerdict, spacingVerdict, textVerdict, withToken, wordVerdict } from "shared/lib/properties-model";
import { cn } from "shared/lib/utils";
import { CanvasChrome, type PageRow } from "shared/ui/spool-canvas-chrome";
import { PropertiesCart } from "shared/ui/spool-properties-cart";
import { type Acts, type Geometry, type Pick, Rail, type Reading, type Rect } from "shared/ui/spool-properties-rail";
import { SpoolShell } from "shared/ui/spool-shell";

/**
 * The properties surface on the canvas, decided (spool-cloud#16) and merged
 * (spool-cloud#20): a right rail and only a rail, over kaffe's cart as a live
 * document. The rail is `spool-properties-rail.tsx`; this file is the field
 * around it: the stage, the ring and the knobs, the hover, the climb, undo, and
 * the stylesheet the mock needs for classes the served one never saw.
 *
 * Click an element to select it; click a crumb, or press Esc, to climb. The
 * ring wears Figma's handles: a cube on each corner, the edges are bare grab
 * strips, and just outside each corner a diagonal zone rotates. Dragging writes
 * the class under the pointer — `w-*`/`h-*` on size, `rotate-N` on the wheel,
 * shift snaps to 15°. The frame pins like Figma (frame.json owns x and y); an
 * element does not — layout owns its position, so a top or left drag resizes
 * and the box lands wherever the flow puts it.
 * Spliced tokens read in thread colour on the source line. ⌘Z undoes.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

const FRAME = "cart";
const RAIL_W = 300;
const LABEL_H = 22;

/** -1 grabs the top or left side, 1 the bottom or right, 0 leaves the axis alone */
type Sign = -1 | 0 | 1;

interface SizeDrag {
	kind: "size";
	id: string;
	key: string;
	sx: Sign;
	sy: Sign;
	start: { w: number; h: number; x: number; y: number; fx: number; fy: number };
	live: { w: number; h: number };
}

interface RotateDrag {
	kind: "rotate";
	id: string;
	key: string;
	center: { x: number; y: number };
	from: number;
	base: number;
	/** whole degrees, wrapped to (-180, 180] */
	live: number;
}

type Drag = SizeDrag | RotateDrag;

const ROTATE_SVG =
	"<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'><path d='M13.5 4.5a6 6 0 1 0 0 9' fill='none' stroke='black' stroke-width='4'/><path d='M13.5 4.5a6 6 0 1 0 0 9' fill='none' stroke='white' stroke-width='2'/><path d='M13.5 1.2 17 4.6l-3.5 3.3z' fill='white' stroke='black' stroke-width='1'/><path d='M13.5 16.8 17 13.4l-3.5-3.3z' fill='white' stroke='black' stroke-width='1'/></svg>";

const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(ROTATE_SVG)}") 9 9, grab`;

type Snapshot = { classes: Record<string, string>; texts: Record<string, string>; frame: Geometry };

const INITIAL: Snapshot = {
	classes: Object.fromEntries(ELEMENTS.map((element) => [element.id, element.className ?? ""])),
	texts: {},
	frame: { x: 1740, y: 96, w: 300, h: 640 },
};

const ORIGINAL = new Map(ELEMENTS.map((element) => [element.id, new Set((element.className ?? "").split(/\s+/).filter(Boolean))]));

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

	/* ---------- the mock's stylesheet: what the panel wrote, compiled here ---------- */

	const stylesheet = useMemo(
		() => stylesheetFor(Object.entries(state.classes).map(([id, className]) => ({ hook: `[data-node="${id}"]`, className }))),
		[state.classes],
	);

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
		let live = true;
		void document.fonts.ready.then(() => {
			if (live) measure();
		});
		return () => {
			live = false;
			removeEventListener("resize", measure);
		};
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
			if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
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

	const startDrag = (pick: Pick, sx: Sign, sy: Sign, event: React.PointerEvent) => {
		const box = boxes.get(`${pick.id}:${pick.key}`);
		if (box === undefined || (sx === 0 && sy === 0)) return;
		event.preventDefault();
		event.stopPropagation();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		stateBeforeDrag.current = state;
		const w = pick.id === "screen" ? state.frame.w : box.w;
		const h = pick.id === "screen" ? state.frame.h : box.h;
		setDrag({
			kind: "size",
			id: pick.id,
			key: pick.key,
			sx,
			sy,
			start: { w, h, x: event.clientX, y: event.clientY, fx: state.frame.x, fy: state.frame.y },
			live: { w: Math.round(w), h: Math.round(h) },
		});
	};

	const startRotate = (pick: Pick, event: React.PointerEvent) => {
		const box = boxes.get(`${pick.id}:${pick.key}`);
		const origin = fieldRef.current?.getBoundingClientRect();
		if (box === undefined || origin === undefined) return;
		event.preventDefault();
		event.stopPropagation();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		stateBeforeDrag.current = state;
		const center = { x: origin.left + box.x + box.w / 2, y: origin.top + box.y + box.h / 2 };
		const worn = lengthOf(state.classes[pick.id] ?? "", "rotate");
		const base = worn === null ? 0 : (lengthPx("deg", worn.value) ?? 0) * (worn.negative ? -1 : 1);
		setDrag({
			kind: "rotate",
			id: pick.id,
			key: pick.key,
			center,
			from: Math.atan2(event.clientY - center.y, event.clientX - center.x),
			base,
			live: base,
		});
	};

	/** mid-drag the pixels stay absolute; letting go rounds each axis onto the scale */
	const applyDrag = (snapshot: Snapshot, current: Drag, final: boolean): Snapshot => {
		if (current.kind === "rotate") {
			const className = withLength(
				snapshot.classes[current.id] ?? "",
				"rotate",
				current.live === 0 ? null : { value: String(Math.abs(current.live)), negative: current.live < 0 },
			);
			return { ...snapshot, classes: { ...snapshot.classes, [current.id]: className } };
		}
		if (current.id === "screen") {
			// the frame pins like Figma: a top or left grab moves x or y to hold the far edge still
			const frame = { ...snapshot.frame };
			if (current.sx !== 0) {
				frame.w = current.live.w;
				if (current.sx === -1) frame.x = current.start.fx + (current.start.w - current.live.w);
			}
			if (current.sy !== 0) {
				frame.h = current.live.h;
				if (current.sy === -1) frame.y = current.start.fy + (current.start.h - current.live.h);
			}
			return { ...snapshot, frame };
		}
		let className = snapshot.classes[current.id] ?? null;
		if (current.sx !== 0) className = withToken(className, "w", final ? pxValue(current.live.w) : `[${current.live.w}px]`);
		if (current.sy !== 0) className = withToken(className, "h", final ? pxValue(current.live.h) : `[${current.live.h}px]`);
		return { ...snapshot, classes: { ...snapshot.classes, [current.id]: className ?? "" } };
	};

	const moveDrag = (event: React.PointerEvent) => {
		if (drag === null) return;
		if (drag.kind === "rotate") {
			const angle = Math.atan2(event.clientY - drag.center.y, event.clientX - drag.center.x);
			let deg = drag.base + ((angle - drag.from) * 180) / Math.PI;
			deg = event.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg);
			deg = ((((deg + 180) % 360) + 360) % 360) - 180;
			if (deg === drag.live) return;
			const next = { ...drag, live: deg };
			setDrag(next);
			setState((snapshot) => applyDrag(snapshot, next, false));
			return;
		}
		const live = {
			w: drag.sx === 0 ? drag.live.w : Math.max(8, Math.round(drag.start.w + drag.sx * (event.clientX - drag.start.x))),
			h: drag.sy === 0 ? drag.live.h : Math.max(8, Math.round(drag.start.h + drag.sy * (event.clientY - drag.start.y))),
		};
		if (live.w === drag.live.w && live.h === drag.live.h) return;
		const next = { ...drag, live };
		setDrag(next);
		setState((snapshot) => applyDrag(snapshot, next, false));
	};

	const endDrag = () => {
		if (drag === null) return;
		const before = stateBeforeDrag.current;
		setState((snapshot) => applyDrag(snapshot, drag, true));
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
					text: state.texts[element.id] ?? (element.text !== undefined && "literal" in element.text ? element.text.literal : null),
					box: box ?? { x: 0, y: 0, w: 0, h: 0 },
					inFrame: box === undefined ? { x: 0, y: 0 } : { x: box.x - root.x, y: box.y - root.y },
					frame: state.frame,
					original: ORIGINAL.get(element.id) ?? new Set(),
				};

	const acts: Acts = {
		setClass: (id, next) => commit((snapshot) => ({ ...snapshot, classes: { ...snapshot.classes, [id]: next(snapshot.classes[id] ?? null) } })),
		setText: (id, text) => commit((snapshot) => ({ ...snapshot, texts: { ...snapshot.texts, [id]: text } })),
		setFrame: (patch) => commit((snapshot) => ({ ...snapshot, frame: { ...snapshot.frame, ...patch } })),
		select: (pick) => setSelection(pick),
		undo,
		canUndo: history.length > 0,
	};

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="100%">
			<style>{stylesheet}</style>
			<CanvasChrome pages={PAGES} selected={FRAME} tool="select" railLabel="properties" railWidth={RAIL_W} rail={<Rail reading={reading} acts={acts} />}>
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

					<Overlay boxes={boxes} hover={hover} selection={selection} drag={drag} onKnob={startDrag} onRotate={startRotate} onKnobMove={moveDrag} onKnobUp={endDrag} />
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

/* ---------- the overlay: ring, knobs, readout ---------- */

function Overlay({
	boxes,
	hover,
	selection,
	drag,
	onKnob,
	onRotate,
	onKnobMove,
	onKnobUp,
}: {
	boxes: ReadonlyMap<string, Rect>;
	hover: Pick | null;
	selection: Pick | null;
	drag: Drag | null;
	onKnob: (pick: Pick, sx: Sign, sy: Sign, event: React.PointerEvent) => void;
	onRotate: (pick: Pick, event: React.PointerEvent) => void;
	onKnobMove: (event: React.PointerEvent) => void;
	onKnobUp: () => void;
}) {
	const selected = selection === null ? undefined : boxes.get(`${selection.id}:${selection.key}`);
	const element = selection === null ? undefined : elementOf(selection.id);
	const hovered = hover === null || (selection !== null && hover.id === selection.id && hover.key === selection.key) ? undefined : boxes.get(`${hover.id}:${hover.key}`);
	const wOk = element !== undefined && sizeVerdict(element, "w").ok;
	const hOk = element !== undefined && sizeVerdict(element, "h").ok;
	const anyOk = element !== undefined && (wOk || hOk || spacingVerdict(element).ok || textVerdict(element).ok || wordVerdict(element).ok);
	const siblings =
		selection === null || element?.mapped === undefined
			? []
			: [...boxes.entries()].filter(([key]) => key.startsWith(`${selection.id}:`) && key !== `${selection.id}:${selection.key}`);
	const isFrame = selection?.id === "screen";
	const inset = isFrame ? 0 : 2;
	const ring: Rect =
		selected === undefined
			? { x: 0, y: 0, w: 0, h: 0 }
			: {
					x: selected.x - inset - (isFrame ? 3 : 0),
					y: selected.y - inset - (isFrame ? 3 : 0),
					w: selected.w + inset * 2 + (isFrame ? 6 : 0),
					h: selected.h + inset * 2 + (isFrame ? 6 : 0),
				};
	// rotate is a class splice, so it needs a writable literal; the frame has no rotation to write
	const rotateOk = element !== undefined && !isFrame && wordVerdict(element).ok;

	return (
		<div className="pointer-events-none absolute inset-0">
			{hovered === undefined ? null : (
				<span className="absolute rounded-[3px] border border-thread/55" style={{ left: hovered.x - 2, top: hovered.y - 2, width: hovered.w + 4, height: hovered.h + 4 }} />
			)}
			{siblings.map(([key, rect]) => (
				<span key={key} className="absolute rounded-[3px] border border-thread/30" style={{ left: rect.x - 2, top: rect.y - 2, width: rect.w + 4, height: rect.h + 4 }} />
			))}
			{selected === undefined || selection === null ? null : (
				<>
					<span
						className={cn("absolute border-[1.5px] border-thread", isFrame ? "rounded-[12px]" : "rounded-[3px]")}
						style={{ left: ring.x, top: ring.y, width: ring.w, height: ring.h }}
					/>
					{anyOk ? null : (
						<span className="absolute rounded-xs bg-raised px-1.5 py-[2px] font-mono text-2xs text-muted leading-3" style={{ left: selected.x + selected.w - 54, top: selected.y - 20 }}>
							read-only
						</span>
					)}
					<Handles pick={selection} ring={ring} wOk={wOk} hOk={hOk} rotateOk={rotateOk} onKnob={onKnob} onRotate={onRotate} onKnobMove={onKnobMove} onKnobUp={onKnobUp} />
					{drag === null ? null : (
						<span
							className="absolute whitespace-nowrap rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3"
							style={{
								left: ring.x + ring.w + 12,
								top: drag.kind === "rotate" ? ring.y - 20 : ring.y + ring.h + 10,
							}}
						>
							{drag.kind === "rotate" ? `${drag.live}°` : `${drag.live.w} × ${drag.live.h}`}
						</span>
					)}
				</>
			)}
		</div>
	);
}

const CORNERS: readonly { sx: -1 | 1; sy: -1 | 1; cursor: string }[] = [
	{ sx: -1, sy: -1, cursor: "cursor-nwse-resize" },
	{ sx: 1, sy: -1, cursor: "cursor-nesw-resize" },
	{ sx: 1, sy: 1, cursor: "cursor-nwse-resize" },
	{ sx: -1, sy: 1, cursor: "cursor-nesw-resize" },
];

/**
 * Figma's handle set on the ring: a cube on each corner, bare grab strips along
 * the edges, and a rotate zone diagonally outside each corner. A handle only
 * moves the axes the verdicts allow — a corner on a fixed-height row drags
 * width alone.
 */
function Handles({
	pick,
	ring,
	wOk,
	hOk,
	rotateOk,
	onKnob,
	onRotate,
	onKnobMove,
	onKnobUp,
}: {
	pick: Pick;
	ring: Rect;
	wOk: boolean;
	hOk: boolean;
	rotateOk: boolean;
	onKnob: (pick: Pick, sx: Sign, sy: Sign, event: React.PointerEvent) => void;
	onRotate: (pick: Pick, event: React.PointerEvent) => void;
	onKnobMove: (event: React.PointerEvent) => void;
	onKnobUp: () => void;
}) {
	if (!wOk && !hOk) return null;
	const at = (sx: number, sy: number) => ({ x: sx === -1 ? ring.x : ring.x + ring.w, y: sy === -1 ? ring.y : ring.y + ring.h });
	const held = { onPointerMove: onKnobMove, onPointerUp: onKnobUp };
	return (
		<>
			{rotateOk
				? CORNERS.map(({ sx, sy }) => {
						const corner = at(sx, sy);
						return (
							<span
								key={`rotate-${sx}-${sy}`}
								onPointerDown={(event) => onRotate(pick, event)}
								{...held}
								className="pointer-events-auto absolute h-5 w-5"
								style={{ left: corner.x + (sx === -1 ? -22 : 2), top: corner.y + (sy === -1 ? -22 : 2), cursor: ROTATE_CURSOR }}
							/>
						);
					})
				: null}
			{wOk
				? ([-1, 1] as const).map((sx) => (
						<span
							key={`edge-x-${sx}`}
							onPointerDown={(event) => onKnob(pick, sx, 0, event)}
							{...held}
							className="pointer-events-auto absolute w-[6px] cursor-ew-resize"
							style={{ left: at(sx, 0).x - 3, top: ring.y + 8, height: Math.max(0, ring.h - 16) }}
						/>
					))
				: null}
			{hOk
				? ([-1, 1] as const).map((sy) => (
						<span
							key={`edge-y-${sy}`}
							onPointerDown={(event) => onKnob(pick, 0, sy, event)}
							{...held}
							className="pointer-events-auto absolute h-[6px] cursor-ns-resize"
							style={{ top: at(0, sy).y - 3, left: ring.x + 8, width: Math.max(0, ring.w - 16) }}
						/>
					))
				: null}
			{CORNERS.map(({ sx, sy, cursor }) => {
				const corner = at(sx, sy);
				return (
					<span
						key={`corner-${sx}-${sy}`}
						onPointerDown={(event) => onKnob(pick, wOk ? sx : 0, hOk ? sy : 0, event)}
						{...held}
						className={cn("pointer-events-auto absolute h-3 w-3 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread", cursor)}
						style={{ left: corner.x - 6, top: corner.y - 6 }}
					/>
				);
			})}
		</>
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
