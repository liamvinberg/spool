import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { stylesheetFor } from "../lib/properties-families";
import { ELEMENTS, elementOf, pxValue, sizeVerdict, spacingVerdict, textVerdict, valuePx, withToken, wordVerdict } from "../lib/properties-model";
import { cn } from "../lib/utils";
import { CanvasChrome, type PageRow } from "./spool-canvas-chrome";
import { PropertiesCart } from "./spool-properties-cart";
import { type Acts, DEFAULT_SHAPE, type Geometry, type Pick, Rail, type Reading, type Rect, type Shape } from "./spool-properties-rail";
import { SpoolShell } from "./spool-shell";

/**
 * The properties surface on the canvas, decided (spool-cloud#16) and merged
 * (spool-cloud#20): a right rail and only a rail, over kaffe's cart as a live
 * document. The rail is `spool-properties-rail.tsx`; this file is the field
 * around it: the stage, the ring and the knobs, the hover, the climb, undo, and
 * the stylesheet the mock needs for classes the served one never saw.
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
const LABEL_H = 22;

interface Drag {
	id: string;
	key: string;
	axis: "w" | "h";
	startPx: number;
	startAt: number;
	other: number;
	live: number;
}

type Snapshot = { classes: Record<string, string>; texts: Record<string, string>; frame: Geometry };

const INITIAL: Snapshot = {
	classes: Object.fromEntries(ELEMENTS.map((element) => [element.id, element.className ?? ""])),
	texts: {},
	frame: { x: 1740, y: 96, w: 300, h: 640 },
};

const ORIGINAL = new Map(ELEMENTS.map((element) => [element.id, new Set((element.className ?? "").split(/\s+/).filter(Boolean))]));

/** where the field draws the frame: its own x/y are canvas space, the field shows them offset */
const FIELD_ORIGIN = { x: 1452, y: -16 } as const;

export function PropertiesScreen({ shape = DEFAULT_SHAPE }: { shape?: Shape }) {
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

	const startDrag = (pick: Pick, axis: "w" | "h", event: React.PointerEvent) => {
		const box = boxes.get(`${pick.id}:${pick.key}`);
		if (box === undefined) return;
		event.preventDefault();
		event.stopPropagation();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		const startPx = axis === "w" ? box.w : box.h;
		stateBeforeDrag.current = state;
		setDrag({ id: pick.id, key: pick.key, axis, startPx, startAt: axis === "w" ? event.clientX : event.clientY, other: axis === "w" ? box.h : box.w, live: startPx });
	};

	const applyDrag = (snapshot: Snapshot, current: Drag, value: string | number): Snapshot => {
		if (current.id === "screen") {
			const px = typeof value === "number" ? value : (valuePx(value) ?? current.live);
			return { ...snapshot, frame: { ...snapshot.frame, [current.axis]: px } };
		}
		const token = typeof value === "number" ? `[${value}px]` : value;
		return { ...snapshot, classes: { ...snapshot.classes, [current.id]: withToken(snapshot.classes[current.id] ?? null, current.axis, token) } };
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
			<CanvasChrome pages={PAGES} selected={FRAME} tool="select" railLabel="properties" railWidth={RAIL_W} rail={<Rail reading={reading} acts={acts} shape={shape} />}>
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

					<Overlay boxes={boxes} hover={hover} selection={selection} drag={drag} onKnob={startDrag} onKnobMove={moveDrag} onKnobUp={endDrag} />
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
						style={{
							left: selected.x - inset - (isFrame ? 3 : 0),
							top: selected.y - inset - (isFrame ? 3 : 0),
							width: selected.w + inset * 2 + (isFrame ? 6 : 0),
							height: selected.h + inset * 2 + (isFrame ? 6 : 0),
						}}
					/>
					{anyOk ? null : (
						<span className="absolute rounded-xs bg-raised px-1.5 py-[2px] font-mono text-2xs text-muted leading-3" style={{ left: selected.x + selected.w - 54, top: selected.y - 20 }}>
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
							{drag.axis === "w" ? `${drag.live} × ${Math.round(drag.other)}` : `${Math.round(drag.other)} × ${drag.live}`}
						</span>
					)}
				</>
			)}
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
