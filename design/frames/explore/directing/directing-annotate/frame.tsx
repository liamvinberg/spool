import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CursorIcon, EditIcon, HandIcon } from "shared/ui/spool/icons";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * directing — the annotate tool, synthesized. Annotate is the fourth canvas tool
 * (C) beside interact, select and hand. Armed, it resolves what you point at:
 * an element takes a solid outline and its name, a frame label or edge takes a
 * dashed one. Bare canvas is not a target, so nothing happens out there. Click,
 * an input opens on the frame's rail, type the order, Enter drops a numbered pin.
 * Shift-click gathers more elements under the same order: one enclosure, one pin,
 * one count. Motion pauses the moment the tool comes up so nothing shifts under
 * what you are writing. Try it: click a row, shift-click a second, press Enter.
 *
 * The marking layer knows its place. A waiting order is a numbered dot on the
 * rail and nothing more: it washes, outlines or encloses its target only while it
 * is fresh or while you point at its pin, so four orders never read as four
 * alarms. Put the tool away and the marking goes with it, the dots go neutral,
 * and the count in the header keeps the tally. Press C to bring it back.
 */

/* ---------- model ---------- */

type Tool = "interact" | "select" | "hand" | "annotate";
type Kind = "element" | "frame";
type Mark = "quiet" | "lit";

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}
interface Target {
	key: string;
	kind: Kind;
	name: string;
	frame: string;
}
interface Pin {
	n: number;
	order: string;
	targets: Target[];
}
interface Draft {
	targets: Target[];
	origin: { x: number; y: number };
}
type RectMap = Record<string, Rect | undefined>;

const el = (name: string, frame: string): Target => ({ key: `el:${name}`, kind: "element", name, frame });
const whole = (name: string): Target => ({ key: `frame:${name}`, kind: "frame", name, frame: name });

const SEED: Pin[] = [
	{ n: 1, order: "make these one line", targets: [el("HavremjolkRow", "cart"), el("KanelbulleRow", "cart")] },
	{ n: 2, order: "delete this", targets: [el("NotifyRow", "settings")] },
	{ n: 3, order: "put the label on the left", targets: [el("ThemeRow", "settings")] },
	{ n: 4, order: "rework this", targets: [whole("cart")] },
];

/* ---------- motion vocabulary ----------
 * Two curves carry the whole frame. OUT is the strong ease-out every entrance
 * uses: it moves on the first frame, which is the moment the eye is on it. MOVE
 * is the symmetric curve for things already on screen travelling somewhere else.
 * Exits are always shorter than entrances: the system answers faster than it
 * offers. The tempo below is the whole frame's speed held in one place: nothing
 * arrives slower than 150ms, nothing leaves slower than 120ms, and the only long
 * numbers left are the ambient heartbeats in the mock frames, which are meant to
 * breathe rather than react. */
const OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const MOVE: [number, number, number, number] = [0.77, 0, 0.175, 1];

const T = {
	/** a crossfade inside something already on screen */
	swap: 0.09,
	/** the marking layer answering a hover: it lands before the pointer settles */
	mark: 0.11,
	/** the hover outline travelling from one target to the next */
	travel: 0.12,
	/** anything arriving: outlines, the hairline, the draft card, an order */
	enter: 0.14,
	/** the marking layer letting go: a release, not a snap, still under its entrance */
	release: 0.12,
	/** anything leaving */
	exit: 0.08,
} as const;

const SPRING = {
	/** a pin landing on the rail */
	pin: { type: "spring", duration: 0.28, bounce: 0.14 },
	/** an enclosure growing to take in whatever shift-click just added */
	grow: { type: "spring", duration: 0.26, bounce: 0.08 },
	/** the rail restacking under a new pin */
	rail: { type: "spring", duration: 0.28, bounce: 0.12 },
} as const;

/** the tool switch recolouring the rail: slow enough to read as a settle, not a blink */
const TOOL_FADE = "transition-colors duration-[180ms] ease-out";

const RAIL_GAP = 12;
/** pins collapse once their open orders would land on each other: one card's height */
const CLUSTER_GAP = 56;
const RELAX_MS = 2400;
const SEED_RELAX_MS = 3600;

/* ---------- geometry ---------- */

function union(rects: Rect[]): Rect {
	const x = Math.min(...rects.map((r) => r.x));
	const y = Math.min(...rects.map((r) => r.y));
	const right = Math.max(...rects.map((r) => r.x + r.w));
	const bottom = Math.max(...rects.map((r) => r.y + r.h));
	return { x, y, w: right - x, h: bottom - y };
}

function pad(rect: Rect, by: number): Rect {
	return { x: rect.x - by, y: rect.y - by, w: rect.w + by * 2, h: rect.h + by * 2 };
}

interface PinGeo {
	pin: Pin;
	boxes: Rect[];
	box: Rect;
	x: number;
	y: number;
}

function geometryFor(pin: Pin, rects: RectMap): PinGeo | null {
	const boxes: Rect[] = [];
	for (const target of pin.targets) {
		const rect = rects[target.key];
		if (rect) boxes.push(rect);
	}
	if (boxes.length === 0) return null;
	const box = union(boxes);
	const frames = Array.from(new Set(pin.targets.map((t) => t.frame)));
	let right = box.x + box.w;
	for (const name of frames) {
		const rect = rects[`frame:${name}`];
		if (rect) right = Math.max(right, rect.x + rect.w);
	}
	const first = pin.targets[0];
	const home = first ? rects[`frame:${first.frame}`] : undefined;
	const wholeFrame = pin.targets.length === 1 && first?.kind === "frame";
	return {
		pin,
		boxes,
		box,
		x: right + RAIL_GAP,
		// an order about the whole frame rides the line its name sits on
		y: wholeFrame && home ? home.y - 14 : box.y + box.h / 2,
	};
}

interface Cluster {
	key: number;
	x: number;
	y: number;
	members: PinGeo[];
}

/** Orders crowd on the same rail. Anything too close to read separately becomes one stack. */
function clusterPins(items: PinGeo[]): Cluster[] {
	const sorted = [...items].sort((a, b) => a.x - b.x || a.y - b.y);
	const groups: PinGeo[][] = [];
	for (const item of sorted) {
		const last = groups[groups.length - 1];
		const prev = last?.[last.length - 1];
		if (last && prev && Math.abs(prev.x - item.x) < 1 && item.y - prev.y < CLUSTER_GAP) last.push(item);
		else groups.push([item]);
	}
	return groups.map((members) => ({
		key: Math.min(...members.map((m) => m.pin.n)),
		x: members[0]?.x ?? 0,
		y: members.reduce((sum, m) => sum + m.y, 0) / members.length,
		members,
	}));
}

function countLabel(targets: Target[]): string {
	if (targets.length === 1) {
		const only = targets[0];
		return only ? (only.kind === "frame" ? `${only.name} frame` : only.name) : "";
	}
	const allElements = targets.every((t) => t.kind === "element");
	return `${targets.length} ${allElements ? "elements" : "targets"}`;
}

/* ---------- the frame ---------- */

export default function DirectingAnnotateOpus() {
	const canvasRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const reduced = useReducedMotion() === true;

	const [tool, setTool] = useState<Tool>("annotate");
	const [rects, setRects] = useState<RectMap>({});
	const [hover, setHover] = useState<Target | null>(null);
	const [shift, setShift] = useState(false);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [text, setText] = useState("");
	const [pins, setPins] = useState<Pin[]>(SEED);
	const [fresh, setFresh] = useState<{ n: number; hold: number } | null>({ n: 4, hold: SEED_RELAX_MS });
	const [reading, setReading] = useState<number | null>(null);
	const [peek, setPeek] = useState<number | null>(null);

	const armed = tool === "annotate";

	/* measure every target once the document has settled, and again if it reflows */
	const measure = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const origin = canvas.getBoundingClientRect();
		const next: RectMap = {};
		const put = (node: Element, key: string) => {
			const r = node.getBoundingClientRect();
			next[key] = { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
		};
		for (const node of canvas.querySelectorAll("[data-el]")) {
			const name = (node as HTMLElement).dataset.el;
			if (name) put(node, `el:${name}`);
		}
		for (const node of canvas.querySelectorAll("[data-frame-box]")) {
			const name = (node as HTMLElement).dataset.frameBox;
			if (name) put(node, `frame:${name}`);
		}
		setRects(next);
	}, []);

	useLayoutEffect(() => {
		measure();
		window.addEventListener("resize", measure);
		document.fonts?.ready.then(measure).catch(() => undefined);
		return () => window.removeEventListener("resize", measure);
	}, [measure]);

	/* the resolver: elements first, then their frame, then nothing */
	const resolveAt = useCallback((clientX: number, clientY: number): Target | null => {
		const node = document.elementFromPoint(clientX, clientY);
		if (!node) return null;
		const element = node.closest("[data-el]");
		if (element instanceof HTMLElement && element.dataset.el) {
			const owner = element.closest("[data-frame]");
			const frame = owner instanceof HTMLElement ? (owner.dataset.frame ?? "") : "";
			return el(element.dataset.el, frame);
		}
		const frame = node.closest("[data-frame]");
		if (frame instanceof HTMLElement && frame.dataset.frame) return whole(frame.dataset.frame);
		return null;
	}, []);

	const point = (event: React.MouseEvent) => {
		const origin = canvasRef.current?.getBoundingClientRect();
		return { x: event.clientX - (origin?.left ?? 0), y: event.clientY - (origin?.top ?? 0) };
	};

	const onMove = (event: React.MouseEvent) => {
		if (!armed) {
			setHover((prev) => (prev === null ? prev : null));
			return;
		}
		const next = resolveAt(event.clientX, event.clientY);
		// pointing at the next thing ends the last order's moment
		if (next && !draft) setFresh(null);
		setHover((prev) => (prev?.key === next?.key ? prev : next));
		setShift((prev) => (prev === event.shiftKey ? prev : event.shiftKey));
	};

	const onClick = (event: React.MouseEvent) => {
		if (!armed) return;
		const target = resolveAt(event.clientX, event.clientY);
		if (!target) return; // bare canvas is not a target
		if (draft && event.shiftKey) {
			setDraft((current) => {
				if (!current) return current;
				const has = current.targets.some((t) => t.key === target.key);
				if (has && current.targets.length === 1) return current;
				return {
					...current,
					targets: has ? current.targets.filter((t) => t.key !== target.key) : [...current.targets, target],
				};
			});
			inputRef.current?.focus();
			return;
		}
		if (!draft) setText("");
		setDraft({ targets: [target], origin: point(event) });
		setFresh(null);
		setReading(null);
		setPeek(null);
		inputRef.current?.focus();
	};

	const cancel = useCallback(() => {
		setDraft(null);
		setText("");
	}, []);

	const commit = () => {
		const order = text.trim();
		if (!draft || order === "") {
			cancel();
			return;
		}
		const n = pins.length + 1;
		setPins((current) => [...current, { n, order, targets: draft.targets }]);
		setFresh({ n, hold: RELAX_MS });
		// the order that just landed owns the rail until the pointer moves on
		setHover(null);
		setDraft(null);
		setText("");
	};

	/* a just-written pin holds its order open, then relaxes to a quiet dot */
	useEffect(() => {
		if (!fresh) return;
		const id = window.setTimeout(() => setFresh(null), fresh.hold);
		return () => window.clearTimeout(id);
	}, [fresh]);

	/* the marking layer belongs to the tool. Put the tool away and every wash,
	 * outline and enclosure goes with it: the orders keep waiting on the rail. */
	const pickTool = useCallback(
		(next: Tool) => {
			setTool(next);
			if (next !== "annotate") {
				setHover(null);
				setReading(null);
				setPeek(null);
				setFresh(null);
				cancel();
			}
		},
		[cancel],
	);

	/* keys never reach an open input: the draft owns the keyboard while it is up */
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const node = event.target as HTMLElement | null;
			if (node && (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.isContentEditable)) return;
			if (draft) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			const key = event.key.toLowerCase();
			if (key === "c") pickTool("annotate");
			else if (key === "v") pickTool("select");
			else if (key === "h") pickTool("hand");
			else if (key === "i") pickTool("interact");
			else if (event.key === "Escape") pickTool("interact");
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [draft, pickTool]);

	const geo = useMemo(() => {
		const out: PinGeo[] = [];
		for (const pin of pins) {
			const g = geometryFor(pin, rects);
			if (g) out.push(g);
		}
		return out;
	}, [pins, rects]);

	const clusters = useMemo(() => clusterPins(geo), [geo]);

	/* which orders may touch the canvas right now. At rest the answer is none: a
	 * waiting order is a numbered dot on the rail and nothing else, so four orders
	 * do not read as four alarms. An order marks its target while it is fresh, or
	 * while you point at its pin, and never otherwise. Put the tool away and even
	 * that stops. */
	const levels = useMemo(() => {
		const out: Record<number, Mark> = {};
		if (!armed) return out;
		if (fresh) out[fresh.n] = "lit";
		if (reading !== null) {
			const members = clusters.find((c) => c.key === reading)?.members ?? [];
			// a stack shows its whole scope softly; pointing at one line lifts that one
			const crowded = members.length > 1;
			for (const member of members) {
				const n = member.pin.n;
				if (!crowded || peek === n) out[n] = "lit";
				else if (out[n] !== "lit") out[n] = "quiet";
			}
		}
		return out;
	}, [armed, fresh, reading, peek, clusters]);

	/* the wash a target wears while its order is speaking */
	const marks = useMemo(() => {
		const out: Record<string, Mark> = {};
		for (const pin of pins) {
			const level = levels[pin.n];
			if (!level) continue;
			// a shared order is read from its enclosure, so its members stay unwashed
			if (pin.targets.length > 1) continue;
			for (const target of pin.targets) {
				if (level === "lit" || out[target.key] !== "lit") out[target.key] = level;
			}
		}
		return out;
	}, [pins, levels]);

	const deck: Deck = { marks, paused: armed };
	const hoverRect = hover ? rects[hover.key] : undefined;
	const inDraft = Boolean(draft && hover && draft.targets.some((t) => t.key === hover.key));

	return (
		<SpoolShell
			activeTab="kaffe"
			tabs={["kaffe", "opencode"]}
			canvasControls={false}
			headerAccessory={<PendingChip count={pins.length} reduced={reduced} />}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the mock canvas is the surface the tool works on */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: pointing is the gesture under study; the tool keys live on window */}
			<div
				ref={canvasRef}
				onMouseMove={onMove}
				onMouseLeave={() => setHover(null)}
				onClick={onClick}
				className="relative h-full w-full select-none overflow-hidden bg-canvas"
				style={{ cursor: armed && hover ? "crosshair" : "default" }}
			>
				<DotGrid />

				<CartFrame deck={deck} />
				<SettingsFrame deck={deck} />
				<ReceiptFrame deck={deck} />

				{/* an enclosure is how a shared order shows its scope, so it comes up when
				    that order speaks and stays away the rest of the time */}
				<AnimatePresence>
					{geo
						.filter((g) => g.pin.targets.length > 1 && levels[g.pin.n] !== undefined)
						.map((g) => (
							<Enclosure key={g.pin.n} box={g.box} level={levels[g.pin.n] ?? "quiet"} reduced={reduced} />
						))}
				</AnimatePresence>

				{/* the draft already outlines what it is about, so the preview stands down
				    over its own targets unless shift is up and it would drop one */}
				<AnimatePresence>
					{armed && hover && hoverRect && (!inDraft || shift) ? (
						<Resolver
							key="resolver"
							target={hover}
							rect={hoverRect}
							addable={Boolean(draft) && !inDraft}
							inDraft={inDraft}
							shift={shift}
							reduced={reduced}
						/>
					) : null}
				</AnimatePresence>

				<AnimatePresence>
					{draft ? (
						<DraftLayer
							key="draft"
							draft={draft}
							rects={rects}
							next={pins.length + 1}
							text={text}
							setText={setText}
							commit={commit}
							cancel={cancel}
							inputRef={inputRef}
							reduced={reduced}
						/>
					) : null}
				</AnimatePresence>

				{clusters.map((cluster) => (
					<PinCluster
						key={cluster.key}
						cluster={cluster}
						armed={armed}
						fresh={fresh?.n ?? null}
						open={reading === cluster.key}
						peek={peek}
						muted={Boolean(draft)}
						onRead={(on) => {
							setReading(on ? cluster.key : null);
							if (!on) setPeek(null);
						}}
						onPeek={setPeek}
						reduced={reduced}
					/>
				))}

				<Hint armed={armed} dimmed={Boolean(draft)} reduced={reduced} />

				<Toolbar tool={tool} armed={armed} onTool={pickTool} reduced={reduced} />
			</div>
		</SpoolShell>
	);
}

/* ---------- resolver: what you are pointing at ---------- */

function Resolver({
	target,
	rect,
	addable,
	inDraft,
	shift,
	reduced,
}: {
	target: Target;
	rect: Rect;
	addable: boolean;
	inDraft: boolean;
	shift: boolean;
	reduced: boolean;
}) {
	const frame = target.kind === "frame";
	const box = pad(rect, 2);
	return (
		<motion.div
			className="pointer-events-none absolute top-0 left-0 z-20"
			initial={{ opacity: 0, x: box.x, y: box.y, width: box.w, height: box.h }}
			animate={{ opacity: 1, x: box.x, y: box.y, width: box.w, height: box.h }}
			exit={{ opacity: 0, transition: { duration: reduced ? 0.05 : T.exit, ease: OUT } }}
			transition={{
				opacity: { duration: reduced ? 0.06 : T.swap, ease: OUT },
				default: reduced ? { duration: 0 } : { duration: T.travel, ease: MOVE },
			}}
		>
			{/* solid for an element, dashed for a whole frame, crossfaded so the box never blinks */}
			<motion.span
				className="absolute inset-0 rounded-[4px] border border-thread"
				animate={{ opacity: frame ? 0 : 1 }}
				transition={{ duration: T.swap, ease: OUT }}
			/>
			<motion.span
				className="absolute inset-0 rounded-[4px] border border-thread/70 border-dashed"
				animate={{ opacity: frame ? 1 : 0 }}
				transition={{ duration: T.swap, ease: OUT }}
			/>
			{/* the tag rides the rail, exactly where this target's pin would land */}
			<span className="-translate-y-1/2 absolute top-1/2 left-full flex items-center gap-1 whitespace-nowrap pl-2.5">
				<span className="flex h-[15px] items-center gap-1 rounded-[3px] bg-thread px-1.5 font-mono text-[10px] text-on-thread leading-none">
					{target.name}
					{frame ? <span className="opacity-70">frame</span> : null}
				</span>
				{addable && shift ? (
					<span className="flex h-[15px] items-center rounded-[3px] border border-thread/50 px-1 font-mono text-[10px] text-thread leading-none">
						add
					</span>
				) : null}
				{inDraft ? (
					<span className="flex h-[15px] items-center rounded-[3px] border border-thread/40 px-1 font-mono text-[10px] text-thread/70 leading-none">
						in
					</span>
				) : null}
			</span>
		</motion.div>
	);
}

/* ---------- the order being written ---------- */

function DraftLayer({
	draft,
	rects,
	next,
	text,
	setText,
	commit,
	cancel,
	inputRef,
	reduced,
}: {
	draft: Draft;
	rects: RectMap;
	next: number;
	text: string;
	setText: (value: string) => void;
	commit: () => void;
	cancel: () => void;
	inputRef: React.RefObject<HTMLInputElement | null>;
	reduced: boolean;
}) {
	// focus a tick late so the card is already opening when the caret lands in it
	useEffect(() => {
		const id = window.requestAnimationFrame(() => inputRef.current?.focus());
		return () => window.cancelAnimationFrame(id);
	}, [inputRef]);

	const boxes: Rect[] = [];
	for (const target of draft.targets) {
		const rect = rects[target.key];
		if (rect) boxes.push(rect);
	}
	const first = boxes[0];
	if (!first) return null;

	const box = union(boxes);
	const frames = Array.from(new Set(draft.targets.map((t) => t.frame)));
	let right = box.x + box.w;
	for (const name of frames) {
		const rect = rects[`frame:${name}`];
		if (rect) right = Math.max(right, rect.x + rect.w);
	}
	const rail = right + RAIL_GAP;
	const multi = draft.targets.length > 1;
	const only = draft.targets[0];
	const label = multi
		? `one order · ${countLabel(draft.targets)}`
		: only
			? only.kind === "frame"
				? `${only.name} · frame`
				: `${only.frame} · ${only.name}`
			: "";
	const placeholder = multi ? "make these one line" : only?.kind === "frame" ? "rework this" : "delete this";

	return (
		<motion.div
			className="pointer-events-none absolute inset-0 z-30"
			initial={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: reduced ? 0.05 : T.exit, ease: OUT }}
		>
			{/* every gathered target keeps its own outline */}
			{draft.targets.map((target) => {
				const rect = rects[target.key];
				if (!rect) return null;
				const at = pad(rect, 2);
				return (
					<motion.span
						key={target.key}
						className={cn(
							"absolute rounded-[4px] border",
							target.kind === "frame" ? "border-thread/70 border-dashed" : "border-thread",
						)}
						style={{ left: at.x, top: at.y, width: at.w, height: at.h }}
						initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.03 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: reduced ? 0.08 : T.enter, ease: OUT }}
					/>
				);
			})}

			{/* the enclosure grows out of the first target to swallow whatever joins it */}
			{multi ? (
				<motion.span
					className="absolute top-0 left-0 rounded-md border border-thread/50 border-dashed bg-thread/[0.04]"
					initial={{ opacity: 0, x: first.x - 8, y: first.y - 8, width: first.w + 16, height: first.h + 16 }}
					animate={{ opacity: 1, x: box.x - 8, y: box.y - 8, width: box.w + 16, height: box.h + 16 }}
					transition={
						reduced
							? { duration: 0.08 }
							: { opacity: { duration: T.enter, ease: OUT }, default: SPRING.grow }
					}
				/>
			) : null}

			{/* the click point: a live anchor, and a hairline out to the rail */}
			<span
				className="-translate-x-1/2 -translate-y-1/2 absolute flex h-3 w-3 items-center justify-center"
				style={{ left: draft.origin.x, top: draft.origin.y }}
			>
				{reduced ? null : (
					<motion.span
						className="absolute h-3 w-3 rounded-full border border-thread/50"
						animate={{ scale: [1, 1.9], opacity: [0.5, 0] }}
						transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "easeOut" }}
					/>
				)}
				<span className="h-2 w-2 rounded-full bg-thread" />
			</span>
			<motion.span
				className="absolute h-px origin-left bg-thread/60"
				style={{ left: draft.origin.x, top: draft.origin.y, width: Math.max(rail - draft.origin.x, 0) }}
				initial={reduced ? { opacity: 0 } : { opacity: 0, scaleX: 0 }}
				animate={{ opacity: 1, scaleX: 1 }}
				transition={{ duration: reduced ? 0.08 : T.enter, ease: OUT, delay: reduced ? 0 : 0.02 }}
			/>

			{/* the card sits on the rail, clear of the frame it is about */}
			<motion.div
				className="pointer-events-auto absolute"
				style={{ left: rail, top: draft.origin.y, y: "-50%", transformOrigin: "left center" }}
				initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, x: -10 }}
				animate={{ opacity: 1, scale: 1, x: 0 }}
				transition={{ duration: reduced ? 0.08 : T.enter, ease: OUT }}
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex items-center gap-2 rounded-md border border-thread/70 bg-bg/95 py-1.5 pr-2 pl-1.5 backdrop-blur">
					<span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-thread px-1 font-mono text-[10px] text-on-thread leading-none">
						{next}
					</span>
					<input
						ref={inputRef}
						value={text}
						onChange={(event) => setText(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								commit();
							} else if (event.key === "Escape") {
								event.preventDefault();
								cancel();
							}
						}}
						placeholder={placeholder}
						className="w-[212px] select-text bg-transparent font-sans text-base text-text leading-none outline-none placeholder:text-muted/40"
					/>
					<span className="flex items-center gap-1">
						<Kbd>esc</Kbd>
						<Kbd>⏎</Kbd>
					</span>
				</div>
				<span className="mt-1 ml-1 block font-mono text-2xs text-muted/60 leading-3">{label}</span>
			</motion.div>
		</motion.div>
	);
}

/* ---------- committed orders ---------- */

function Enclosure({ box, level, reduced }: { box: Rect; level: Mark; reduced: boolean }) {
	return (
		<motion.span
			className={cn(
				"pointer-events-none absolute z-10 rounded-md border border-dashed transition-colors duration-150 ease-out",
				level === "lit" ? "border-thread/60 bg-thread/[0.06]" : "border-thread/30 bg-thread/[0.03]",
			)}
			style={{ left: box.x - 8, top: box.y - 8, width: box.w + 16, height: box.h + 16 }}
			initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, transition: { duration: reduced ? 0.05 : T.release, ease: OUT } }}
			transition={{ duration: reduced ? 0.08 : T.mark, ease: OUT }}
		/>
	);
}

function PinCluster({
	cluster,
	armed,
	fresh,
	open,
	peek,
	muted,
	onRead,
	onPeek,
	reduced,
}: {
	cluster: Cluster;
	armed: boolean;
	fresh: number | null;
	open: boolean;
	peek: number | null;
	muted: boolean;
	onRead: (on: boolean) => void;
	onPeek: (n: number | null) => void;
	reduced: boolean;
}) {
	const members = cluster.members;
	const crowded = members.length > 1;
	// the stack wears the most recent order's number, not the lowest one on the rail
	const newest = members.reduce((top, m) => (m.pin.n > top.pin.n ? m : top), members[0] as PinGeo);
	const solo = members[0];
	// an order being written owns the rail; a tool that is not annotate owns nothing.
	// reading an order by pointing at it is something only the armed tool can do.
	const showOrder = armed && !muted && (open || members.some((m) => m.pin.n === fresh));

	return (
		<motion.div
			className="pointer-events-none absolute top-0 left-0 z-30"
			initial={false}
			animate={{ x: cluster.x, y: cluster.y }}
			transition={reduced ? { duration: 0 } : SPRING.rail}
		>
			{/* every pin's furniture starts at the rail and grows right, so the column stays aligned */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: a pin is read by pointing at it */}
			<div
				className={cn(
					"-translate-y-1/2 absolute flex items-center gap-2.5",
					armed ? "pointer-events-auto" : "pointer-events-none",
				)}
				style={{ left: -10 }}
				onMouseEnter={() => {
					if (armed && !muted) onRead(true);
				}}
				onMouseLeave={() => onRead(false)}
			>
				{crowded ? (
					<CollapsedStack count={members.length} n={newest?.pin.n ?? 0} armed={armed} reduced={reduced} />
				) : solo ? (
					<SinglePin geo={solo} armed={armed} born={armed && solo.pin.n === fresh} reduced={reduced} />
				) : null}

				<AnimatePresence>
					{showOrder ? (
						<motion.div
							key="order"
							style={{ transformOrigin: "left center" }}
							initial={reduced ? { opacity: 0 } : { opacity: 0, x: -8, scale: 0.97 }}
							animate={{ opacity: 1, x: 0, scale: 1 }}
							exit={
								reduced
									? { opacity: 0, transition: { duration: 0.05 } }
									: {
											opacity: 0,
											x: -4,
											scale: 0.98,
											transition: { duration: T.exit, ease: OUT, delay: 0 },
										}
							}
							transition={{
								duration: reduced ? 0.08 : open ? T.mark : T.enter,
								ease: OUT,
								delay: reduced ? 0 : open ? 0.03 : 0.04,
							}}
						>
							{crowded ? (
								<StackCard members={members} fresh={fresh} peek={peek} onPeek={onPeek} reduced={reduced} />
							) : solo ? (
								<OrderBubble geo={solo} fresh={solo.pin.n === fresh} />
							) : null}
						</motion.div>
					) : null}
				</AnimatePresence>
			</div>
		</motion.div>
	);
}

function SinglePin({ geo, armed, born, reduced }: { geo: PinGeo; armed: boolean; born: boolean; reduced: boolean }) {
	const multi = geo.pin.targets.length > 1;
	return (
		<span className="relative flex items-center">
			{born && !reduced ? (
				<motion.span
					className="absolute left-0 h-5 w-5 rounded-full border border-thread/60"
					initial={{ scale: 1, opacity: 0.55 }}
					animate={{ scale: 2.2, opacity: 0 }}
					transition={{ duration: 0.4, ease: OUT }}
				/>
			) : null}
			<motion.span
				className={cn(
					"flex items-center",
					multi
						? "gap-1.5 rounded-full border border-border-raised bg-bg/85 py-[3px] pr-2 pl-[3px] backdrop-blur"
						: "",
				)}
				initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.88 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={reduced ? { duration: 0.08 } : SPRING.pin}
			>
				<Chip n={geo.pin.n} armed={armed} />
				{multi ? (
					<span
						className={cn(
							"whitespace-nowrap font-mono text-2xs leading-3",
							TOOL_FADE,
							armed ? "text-muted" : "text-muted/60",
						)}
					>
						{countLabel(geo.pin.targets)}
					</span>
				) : null}
			</motion.span>
		</span>
	);
}

/** crowding: the stack keeps the newest number and counts the rest behind it */
function CollapsedStack({ count, n, armed, reduced }: { count: number; n: number; armed: boolean; reduced: boolean }) {
	return (
		<span className="flex items-center gap-1.5 rounded-full border border-border-raised bg-bg/85 py-[3px] pr-2 pl-[3px] backdrop-blur">
			<span className="relative flex h-5 w-[30px] items-center">
				<span
					className={cn(
						"absolute left-[10px] h-5 w-5 rounded-full border-2 border-bg",
						TOOL_FADE,
						armed ? "bg-thread/25" : "bg-muted/20",
					)}
				/>
				<span
					className={cn(
						"absolute left-[5px] h-5 w-5 rounded-full border-2 border-bg",
						TOOL_FADE,
						armed ? "bg-thread/50" : "bg-muted/35",
					)}
				/>
				<span className="absolute left-0">
					<Chip n={n} armed={armed} />
				</span>
			</span>
			<motion.span
				key={count}
				className={cn(
					"whitespace-nowrap font-mono text-2xs leading-3 tabular-nums",
					TOOL_FADE,
					armed ? "text-thread/80" : "text-muted/60",
				)}
				initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: reduced ? 0.08 : T.enter, ease: OUT }}
			>
				+{count - 1}
			</motion.span>
		</span>
	);
}

/** the dot is the order at rest. Armed it wears the thread; put the tool away and it
 * goes neutral, still counted, no longer shouting. */
function Chip({ n, armed }: { n: number; armed: boolean }) {
	return (
		<span
			className={cn(
				"relative flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-bg px-1 font-mono text-[10px] leading-none",
				TOOL_FADE,
				armed ? "bg-thread text-on-thread" : "bg-raised text-muted",
			)}
		>
			{n}
		</span>
	);
}

function OrderBubble({ geo, fresh }: { geo: PinGeo; fresh: boolean }) {
	const targets = geo.pin.targets;
	const only = targets.length === 1 ? targets[0] : undefined;
	const where = only
		? only.kind === "frame"
			? `${only.name} · frame`
			: `${only.frame} · ${only.name}`
		: `${targets[0]?.frame ?? ""} · ${countLabel(targets)}`;
	return (
		<div
			className={cn(
				"w-[236px] rounded-md border bg-bg/95 px-3 py-2.5 backdrop-blur transition-colors duration-150 ease-out",
				fresh ? "border-thread/45" : "border-border-raised",
			)}
		>
			<p className="font-sans text-base text-text leading-base">{geo.pin.order}</p>
			<p className="mt-1 font-mono text-2xs text-muted leading-3">
				{where} <span className="text-muted/40">·</span>{" "}
				<span className="text-muted/70">{fresh ? "just written" : "waiting"}</span>
			</p>
		</div>
	);
}

function StackCard({
	members,
	fresh,
	peek,
	onPeek,
	reduced,
}: {
	members: PinGeo[];
	fresh: number | null;
	peek: number | null;
	onPeek: (n: number | null) => void;
	reduced: boolean;
}) {
	return (
		<div className="w-[248px] overflow-hidden rounded-md border border-border-raised bg-bg/95 backdrop-blur">
			<div className="flex items-center justify-between border-border/80 border-b px-3 py-1.5 font-mono text-2xs text-muted/60 leading-3">
				<span>{members.length} orders here</span>
				<span>{members.some((m) => m.pin.n === fresh) ? "just written" : "waiting"}</span>
			</div>
			{/* the stack marks its whole scope softly; running down the list narrows the
			    marking to whichever line you are actually on */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: reading a line is pointing at it */}
			<ul className="flex flex-col py-1" onMouseLeave={() => onPeek(null)}>
				{members.map((member, index) => (
					// biome-ignore lint/a11y/noStaticElementInteractions: reading a line is pointing at it
					<motion.li
						key={member.pin.n}
						className={cn(
							"flex items-start gap-2 px-3 py-1.5 transition-colors duration-100 ease-out",
							member.pin.n === peek ? "bg-raised/50" : "bg-transparent",
						)}
						onMouseEnter={() => onPeek(member.pin.n)}
						initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: reduced ? 0.08 : T.mark, ease: OUT, delay: reduced ? 0 : index * 0.03 }}
					>
						<span className="mt-px flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-thread px-1 font-mono text-[10px] text-on-thread leading-none">
							{member.pin.n}
						</span>
						<span
							className={cn(
								"min-w-0 flex-1 font-sans text-sm leading-sm transition-colors duration-100 ease-out",
								member.pin.n === fresh || member.pin.n === peek ? "text-text" : "text-muted",
							)}
						>
							{member.pin.order}
						</span>
					</motion.li>
				))}
			</ul>
		</div>
	);
}

/* ---------- the mock app on the canvas ---------- */

interface Deck {
	marks: Record<string, Mark>;
	paused: boolean;
}

function CartFrame({ deck }: { deck: Deck }) {
	return (
		<MockFrame name="cart" deck={deck} left={132} top={150} width={288}>
			<Row name="BryggkaffeRow" deck={deck} label="Bryggkaffe" value="30 kr" />
			<Row name="HavremjolkRow" deck={deck} label="Havremjölk" value="5 kr" />
			<Row name="KanelbulleRow" deck={deck} label="Kanelbulle" value="35 kr" />
			<Row name="RabattkodRow" deck={deck} label="Rabattkod" pill="Lös in" />
			<div className="mt-1.5 border-border-raised/60 border-t pt-1.5">
				<Row name="TotalRow" deck={deck} label="Summa" value="70 kr" muted />
			</div>
			<div data-el="CheckoutButton" className="relative mt-2">
				<Wash mark={deck.marks["el:CheckoutButton"]} />
				<div className="relative flex h-8 w-full items-center justify-center rounded-sm bg-thread font-sans font-medium text-on-thread text-sm leading-none">
					Till kassan
				</div>
			</div>
		</MockFrame>
	);
}

function SettingsFrame({ deck }: { deck: Deck }) {
	return (
		<MockFrame name="settings" deck={deck} left={800} top={196} width={252}>
			<Row name="NotifyRow" deck={deck} label="Notifications" toggle />
			<Row name="ThemeRow" deck={deck} label="Appearance" value="Dark" />
		</MockFrame>
	);
}

function ReceiptFrame({ deck }: { deck: Deck }) {
	return (
		<MockFrame name="kvitto" deck={deck} left={190} top={520} width={244}>
			<Row name="MailRow" deck={deck} label="Kvitto via mejl" toggle />
			<Row name="CardRow" deck={deck} label="Spara kort" />
		</MockFrame>
	);
}

function MockFrame({
	name,
	deck,
	left,
	top,
	width,
	children,
}: {
	name: string;
	deck: Deck;
	left: number;
	top: number;
	width: number;
	children: React.ReactNode;
}) {
	const mark = deck.marks[`frame:${name}`];
	return (
		<div data-frame={name} className="absolute" style={{ left, top, width }}>
			<div className="mb-1.5 inline-flex h-4 items-center gap-1.5 font-mono text-sm leading-xs">
				<span className="text-2xs text-muted/70">▸</span>
				<span className="text-muted">{name}</span>
			</div>
			<div data-frame-box={name} className="relative overflow-hidden rounded-md border border-border bg-surface">
				{/* an order about the whole frame outlines it only while that order speaks */}
				<AnimatePresence>
					{mark ? (
						<motion.span
							key="frame-mark"
							className={cn(
								"pointer-events-none absolute inset-0 z-10 rounded-md border border-dashed transition-colors duration-150 ease-out",
								mark === "lit" ? "border-thread/60" : "border-thread/25",
							)}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0, transition: { duration: T.release, ease: OUT } }}
							transition={{ duration: T.mark, ease: OUT }}
						/>
					) : null}
				</AnimatePresence>
				<FrameHeader paused={deck.paused} />
				<div className="flex flex-col px-3 py-2">{children}</div>
			</div>
		</div>
	);
}

function Row({
	name,
	deck,
	label,
	value,
	pill,
	toggle,
	muted,
}: {
	name: string;
	deck: Deck;
	label: string;
	value?: string;
	pill?: string;
	toggle?: boolean;
	muted?: boolean;
}) {
	return (
		<div data-el={name} className="relative flex h-9 items-center justify-between">
			<Wash mark={deck.marks[`el:${name}`]} />
			<span className={cn("relative font-sans leading-none", muted ? "text-muted text-sm" : "text-base text-text")}>
				{label}
			</span>
			{pill ? (
				<span className="relative rounded-[3px] border border-border-raised px-2 py-1 font-sans text-muted text-sm leading-none">
					{pill}
				</span>
			) : toggle ? (
				<span className="relative flex h-4 w-7 items-center rounded-full bg-thread/70 px-[2px]">
					<span className="h-3 w-3 translate-x-3 rounded-full bg-text" />
				</span>
			) : value ? (
				<span
					className={cn(
						"relative font-mono leading-none tabular-nums",
						muted ? "text-base text-text" : "text-muted text-sm",
					)}
				>
					{value}
				</span>
			) : (
				<span className="relative flex h-4 w-7 items-center rounded-full bg-raised px-[2px]">
					<span className="h-3 w-3 rounded-full bg-muted" />
				</span>
			)}
		</div>
	);
}

/** the wash a target wears while its order is speaking, behind the content it marks.
 * It is on screen for exactly as long as the order has something to say and no longer. */
function Wash({ mark }: { mark: Mark | undefined }) {
	return (
		<AnimatePresence>
			{mark ? (
				<motion.span
					key="wash"
					className={cn(
						"-inset-x-1.5 pointer-events-none absolute inset-y-0 rounded-[3px] border transition-colors duration-150 ease-out",
						mark === "lit" ? "border-thread/60 bg-thread/[0.10]" : "border-thread/25 bg-thread/[0.05]",
					)}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0, transition: { duration: T.release, ease: OUT } }}
					transition={{ duration: T.mark, ease: OUT }}
				/>
			) : null}
		</AnimatePresence>
	);
}

/** motion lives here, so pausing it is visible where it stops */
function FrameHeader({ paused }: { paused: boolean }) {
	const reduced = useReducedMotion() === true;
	const bars = [9, 14, 7];
	return (
		<div className="relative flex items-center justify-between border-border-raised/60 border-b px-3 py-2">
			<div className="flex items-center gap-1.5">
				<motion.span
					className={cn(
						"h-1.5 w-1.5 rounded-full transition-colors duration-200 ease-out",
						paused ? "bg-muted/50" : "bg-thread",
					)}
					initial={false}
					animate={paused || reduced ? { opacity: 1 } : { opacity: [1, 0.4, 1] }}
					transition={
						paused || reduced
							? { duration: 0.2, ease: OUT }
							: { duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
					}
				/>
				<span className="font-mono text-2xs text-muted leading-3">{paused ? "paused" : "live"}</span>
			</div>
			<div className="flex h-[14px] items-end gap-[3px]" aria-hidden="true">
				{bars.map((height, index) => (
					<motion.span
						key={height}
						className={cn(
							"w-[3px] rounded-full transition-colors duration-200 ease-out",
							paused ? "bg-muted/35" : "bg-thread/70",
						)}
						initial={false}
						animate={paused || reduced ? { height } : { height: [height, 14 - index * 2, height * 0.6, height] }}
						transition={
							paused || reduced
								? { duration: 0.2, ease: OUT }
								: { duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: index * 0.12 }
						}
					/>
				))}
			</div>
		</div>
	);
}

/* ---------- chrome ---------- */

function PendingChip({ count, reduced }: { count: number; reduced: boolean }) {
	return (
		<div className="flex items-center gap-1.5 rounded-full border border-border-raised bg-surface px-2.5 py-1 font-mono text-2xs leading-3">
			<motion.span
				key={count}
				className="h-1.5 w-1.5 rounded-full bg-thread"
				initial={{ scale: 1 }}
				animate={reduced ? { scale: 1 } : { scale: [1, 1.8, 1] }}
				transition={{ duration: 0.32, ease: OUT }}
			/>
			<Rolling value={count} reduced={reduced} />
			<span className="text-muted">waiting</span>
		</div>
	);
}

function Rolling({ value, reduced }: { value: number; reduced: boolean }) {
	return (
		<span className="relative inline-flex h-3 min-w-[7px] justify-center overflow-hidden text-text tabular-nums">
			<span className="invisible">{value}</span>
			<AnimatePresence initial={false}>
				<motion.span
					key={value}
					className="absolute inset-0 flex items-center justify-center"
					initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
					transition={{ duration: reduced ? 0.08 : T.enter, ease: OUT }}
				>
					{value}
				</motion.span>
			</AnimatePresence>
		</span>
	);
}

const TOOLS = [
	{ id: "interact" as const, label: "interact", key: null, hold: null, Icon: CursorIcon },
	{ id: "select" as const, label: "select", key: "V", hold: "hold ⌘", Icon: EditIcon },
	{ id: "hand" as const, label: "hand", key: "H", hold: "hold space", Icon: HandIcon },
];

const CAPTION: Record<Tool, string> = {
	interact: "clicks reach the app",
	select: "pick an element",
	hand: "pan the canvas",
	annotate: "point at an element or a frame",
};

function Toolbar({
	tool,
	armed,
	onTool,
	reduced,
}: {
	tool: Tool;
	armed: boolean;
	onTool: (tool: Tool) => void;
	reduced: boolean;
}) {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex flex-col items-center gap-2.5">
			<motion.div
				layout={!reduced}
				transition={{ duration: T.travel, ease: MOVE }}
				className="flex items-center gap-1.5 rounded-full border border-border-raised bg-bg/90 px-2.5 py-1 font-mono text-2xs leading-3 backdrop-blur"
			>
				<span className="text-thread">{tool}</span>
				<span className="relative flex items-center">
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={tool}
							className="whitespace-nowrap text-muted/60"
							initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
							transition={{ duration: reduced ? 0.08 : T.enter, ease: OUT }}
						>
							{CAPTION[tool]}
						</motion.span>
					</AnimatePresence>
				</span>
				<AnimatePresence initial={false}>
					{armed ? (
						<motion.span
							key="paused"
							className="overflow-hidden whitespace-nowrap text-muted/40"
							initial={{ opacity: 0, width: 0 }}
							animate={{ opacity: 1, width: "auto" }}
							exit={{ opacity: 0, width: 0 }}
							transition={{ duration: reduced ? 0.08 : T.enter, ease: OUT }}
						>
							· motion paused
						</motion.span>
					) : null}
				</AnimatePresence>
			</motion.div>

			<div
				role="toolbar"
				aria-label="canvas tools"
				className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur"
				onPointerDown={(event) => event.stopPropagation()}
				onPointerMove={(event) => event.stopPropagation()}
				onDoubleClick={(event) => event.stopPropagation()}
				onContextMenu={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				{TOOLS.map((meta) => (
					<ToolButton
						key={meta.id}
						label={meta.label}
						kbd={meta.key}
						hold={meta.hold}
						active={tool === meta.id}
						Icon={meta.Icon}
						onClick={() => onTool(meta.id)}
					/>
				))}
				<span className="mx-1 h-5 w-px bg-border-raised" />
				<ToolButton
					label="annotate"
					kbd="C"
					hold={null}
					active={armed}
					accent
					Icon={AnnotateIcon}
					onClick={() => onTool("annotate")}
				/>
			</div>
		</div>
	);
}

function ToolButton({
	label,
	kbd,
	hold,
	active,
	accent,
	Icon,
	onClick,
}: {
	label: string;
	kbd: string | null;
	hold: string | null;
	active: boolean;
	accent?: boolean;
	Icon: (props: { className?: string }) => React.ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"group relative flex h-9 w-9 items-center justify-center rounded-md transition-[background-color,color,transform] duration-100 ease-out active:scale-[0.96]",
				active
					? accent
						? "bg-raised text-thread"
						: "bg-raised text-text"
					: "text-muted hover:bg-surface hover:text-text",
			)}
		>
			<Icon className="h-[18px] w-[18px]" />
			{accent ? (
				<span
					className={cn(
						"absolute bottom-[3px] h-[2px] w-3 origin-center rounded-full bg-thread transition-transform duration-150 ease-out",
						active ? "scale-x-100" : "scale-x-0",
					)}
				/>
			) : null}
			<span className="-top-8 pointer-events-none absolute flex origin-bottom scale-[0.97] items-center gap-1.5 whitespace-nowrap rounded-md border border-border-raised bg-bg px-2 py-1 font-mono text-2xs text-muted leading-3 opacity-0 transition-[opacity,transform] duration-100 ease-out group-hover:scale-100 group-hover:opacity-100">
				{label}
				{kbd === null ? null : <Kbd>{kbd}</Kbd>}
				{hold === null ? null : <span>· {hold}</span>}
			</span>
		</button>
	);
}

function AnnotateIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
			<path
				d="M12 21c4-3.6 6.5-6.9 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 14.1 8 17.4 12 21Z"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinejoin="round"
			/>
			<circle cx="12" cy="10.4" r="2.5" fill="currentColor" />
		</svg>
	);
}

function Hint({ armed, dimmed, reduced }: { armed: boolean; dimmed: boolean; reduced: boolean }) {
	const swap = {
		initial: reduced ? { opacity: 0 } : { opacity: 0, y: 4 },
		animate: { opacity: 1, y: 0 },
		exit: reduced
			? { opacity: 0, transition: { duration: 0.05 } }
			: { opacity: 0, y: -4, transition: { duration: T.exit, ease: OUT } },
	};
	return (
		<motion.div
			className="pointer-events-none absolute right-10 bottom-28 flex max-w-[350px] flex-col items-end text-right"
			animate={{ opacity: dimmed ? 0.25 : 1 }}
			transition={{ duration: reduced ? 0.08 : T.enter, ease: OUT }}
		>
			{/* the hint only ever describes the tool that is actually up */}
			<AnimatePresence mode="wait" initial={false}>
				{armed ? (
					<motion.div
						key="armed"
						className="flex flex-col items-end gap-1.5"
						{...swap}
						transition={{ duration: reduced ? 0.08 : T.enter, ease: OUT }}
					>
						<p className="font-sans text-base text-muted leading-base">
							Point at a row or a frame, then click and write the order.
						</p>
						<p className="font-mono text-2xs text-muted/60 leading-3">
							shift-click gathers more rows under one order
						</p>
						<p className="font-mono text-2xs text-muted/40 leading-3">
							hover a pin to read it and see what it covers
						</p>
					</motion.div>
				) : (
					<motion.div
						key="idle"
						className="flex flex-col items-end gap-1.5"
						{...swap}
						transition={{ duration: reduced ? 0.08 : T.enter, ease: OUT }}
					>
						<p className="font-sans text-base text-muted leading-base">The orders wait while you work.</p>
						<p className="font-mono text-2xs text-muted/60 leading-3">press C to pick annotate back up</p>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}

/* ---------- shared bits ---------- */

function DotGrid() {
	return (
		<div
			className="pointer-events-none absolute inset-0 opacity-40"
			style={{
				backgroundImage: "radial-gradient(circle, var(--color-border-raised) 0.75px, transparent 0.75px)",
				backgroundSize: "22px 22px",
			}}
		/>
	);
}

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<span className="flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-border-raised bg-surface px-1 font-mono text-[9px] text-muted leading-none">
			{children}
		</span>
	);
}
