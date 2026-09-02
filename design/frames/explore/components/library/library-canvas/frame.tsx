import { animate, type MotionStyle, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { INK, LINE, MUTED, PAPER } from "shared/ui/demo/tvarso-checkout";
import {
	ICONS,
	type LibPart,
	LibraryFace,
	TOKEN_COUNT,
	TVARSO_FILES,
	TVARSO_PAGES,
	TVARSO_TOKENS,
	Well,
} from "shared/ui/demo/tvarso-library";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * The library as a canvas you actually work, rather than a picture of one
 * ([spool-cloud#29](https://github.com/liamvinberg/spool-cloud/issues/29)).
 *
 * Everything here moves. The camera is spool's own — drag the ground to pan,
 * two fingers to pan, ⌘ or ctrl and the wheel to zoom under the pointer, `+`
 * and `-` from the keyboard, `0` back to where it started — and the readout in
 * the bar is that camera's, not a number typed into a still. The twenty four
 * things standing on it are draggable one at a time: grab `TripRow`, put it
 * somewhere else, and it stays there.
 *
 * **A specimen is a live crop of a real usage.** `Button` is drawn here as the
 * first frame that renders it draws it, so the library has nothing of its own to
 * keep up to date and no second file to write. Where nothing renders a component
 * yet the slot is empty and says so under its name, which is `Stepper` today.
 *
 * **The file is the quietest thing on the field.** A one-export file is a grey
 * name under its component. A file with several members is a tint with a hull
 * computed off wherever those members currently are, so dragging `PayBar` across
 * the field stretches `checkout-parts.tsx` to follow it: the tint reads the
 * folder rather than fencing it. Counts are the same restraint one step further
 * on — they cost nothing at rest because they are not drawn at rest, and the
 * component under the cursor is the one that says how many frames render it.
 *
 * `tokens.css` is a node like the rest. It is the whole sheet on Tvärsö's paper,
 * view only, and it drags because a station you cannot move is chrome pretending
 * to be a citizen.
 *
 * Two things the camera taught, both of them borrowed from `frame-label.tsx` and
 * `overlays.tsx`: type must not zoom, so every caption counter-scales by `1/k`
 * off the `--ik` the world publishes, and a ring is paint rather than geometry,
 * so the hover hairline and the held ring are 1px at 25% and 1px at 300%. A
 * specimen takes no pointer events, which is what leaves the whole node a
 * handle — on this field you move a component, you do not operate it.
 */

/* ---------- the ground rules ---------- */

const MIN_K = 0.25;
const MAX_K = 3;
/** `canvas.tsx`'s flight: 220ms, cubic ease-out */
const FLIGHT_MS = 220;
const EASE = [0.33, 1, 0.68, 1] as const;
/** one press of `+` or `-` */
const STEP = 1.25;

const PARTS = new Map(TVARSO_FILES.flatMap((file) => file.parts.map((part) => [part.name, part] as const)));

function part(name: string): LibPart {
	const found = PARTS.get(name);
	if (found === undefined) throw new Error(`no component named ${name}`);
	return found;
}

/* ---------- what stands on the field ---------- */

type Node =
	| { readonly id: string; readonly kind: "part"; readonly file?: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
	| { readonly id: string; readonly kind: "icon"; readonly x: number; readonly y: number }
	| { readonly id: string; readonly kind: "slot"; readonly file: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
	| { readonly id: string; readonly kind: "tokens"; readonly x: number; readonly y: number };

const ICON_SIZE = 46;
const SHEET_W = 264;
const SHEET_H = 306;

const NODES: readonly Node[] = [
	{ id: "Button", kind: "part", file: "button.tsx", x: 48, y: 88, w: 252, h: 64 },
	{ id: "Card", kind: "part", file: "card.tsx", x: 330, y: 70, w: 212, h: 134 },
	{ id: "TextField", kind: "part", file: "text-field.tsx", x: 60, y: 232, w: 222, h: 88 },
	{ id: "Badge", kind: "part", file: "badge.tsx", x: 318, y: 268, w: 244, h: 58 },
	{ id: "Avatar", kind: "part", file: "avatar.tsx", x: 46, y: 424, w: 152, h: 64 },
	{ id: "Checkbox", kind: "part", file: "checkbox.tsx", x: 300, y: 438, w: 202, h: 80 },
	{ id: "PriceRow", kind: "part", file: "price-row.tsx", x: 52, y: 622, w: 238, h: 84 },
	{ id: "Notice", kind: "part", file: "notice.tsx", x: 298, y: 630, w: 252, h: 98 },
	{ id: "Stepper", kind: "slot", file: "stepper.tsx", x: 50, y: 520, w: 214, h: 62 },

	{ id: "Masthead", kind: "part", x: 598, y: 92, w: 258, h: 60 },
	{ id: "TripRow", kind: "part", x: 584, y: 196, w: 258, h: 78 },
	{ id: "LineItems", kind: "part", x: 612, y: 314, w: 236, h: 80 },
	{ id: "TotalRow", kind: "part", x: 592, y: 434, w: 222, h: 50 },
	{ id: "PayBar", kind: "part", x: 604, y: 536, w: 258, h: 106 },

	{ id: "FerryIcon", kind: "icon", x: 928, y: 92 },
	{ id: "BicycleIcon", kind: "icon", x: 1010, y: 86 },
	{ id: "CalendarIcon", kind: "icon", x: 1080, y: 96 },
	{ id: "ClockIcon", kind: "icon", x: 922, y: 172 },
	{ id: "CardIcon", kind: "icon", x: 1004, y: 178 },
	{ id: "SwishIcon", kind: "icon", x: 1076, y: 166 },
	{ id: "TicketIcon", kind: "icon", x: 934, y: 250 },
	{ id: "WalletIcon", kind: "icon", x: 1012, y: 244 },
	{ id: "CheckIcon", kind: "icon", x: 1082, y: 256 },
	{ id: "ChevronIcon", kind: "icon", x: 1010, y: 328 },

	{ id: "tokens.css", kind: "tokens", x: 912, y: 448 },
];

/** the two files with more than one member in them, which are the only two that draw */
const FAMILIES: readonly { readonly file: string; readonly ids: readonly string[] }[] = [
	{ file: "checkout-parts.tsx", ids: ["Masthead", "TripRow", "LineItems", "TotalRow", "PayBar"] },
	{ file: "icons.tsx", ids: ICONS.map((icon) => icon.name) },
];

type Spot = { readonly x: number; readonly y: number };

const START: Readonly<Record<string, Spot>> = Object.fromEntries(NODES.map((node) => [node.id, { x: node.x, y: node.y }]));

function sizeOf(node: Node): { w: number; h: number } {
	if (node.kind === "icon") return { w: ICON_SIZE, h: ICON_SIZE };
	if (node.kind === "tokens") return { w: SHEET_W, h: SHEET_H };
	return { w: node.w, h: node.h };
}

/* ---------- the frame ---------- */

const PAGES: readonly PageRow[] = [
	...TVARSO_PAGES.map((page) => ({ name: page.name, frames: page.frames })),
	{
		name: "library",
		frames: TVARSO_FILES.map((file) => file.file).concat("stepper.tsx", "tokens.css"),
		active: true,
		open: true,
		face: <LibraryFace />,
	},
];

export default function LibraryCanvasFrame() {
	const [spots, setSpots] = useState<Readonly<Record<string, Spot>>>(START);
	const [held, setHeld] = useState<string | null>(null);
	const [over, setOver] = useState<string | null>(null);
	const [zoom, setZoom] = useState(100);
	const still = useReducedMotion() === true;

	const viewport = useRef<HTMLDivElement>(null);
	const camX = useMotionValue(0);
	const camY = useMotionValue(0);
	const camK = useMotionValue(1);
	/* every caption on the field reads this and cancels the zoom out of its own type */
	const camIK = useTransform(camK, (k: number) => 1 / k);

	useEffect(() => camK.on("change", (k: number) => setZoom(Math.round(k * 100))), [camK]);

	/** zoom about a point in viewport coordinates, so what is under the pointer stays there */
	const zoomAt = useCallback(
		(px: number, py: number, next: number) => {
			const k = Math.min(MAX_K, Math.max(MIN_K, next));
			const x = camX.get();
			const y = camY.get();
			const wx = (px - x) / camK.get();
			const wy = (py - y) / camK.get();
			camK.set(k);
			camX.set(px - wx * k);
			camY.set(py - wy * k);
		},
		[camX, camY, camK],
	);

	/* the wheel is a native listener because pan and pinch both have to preventDefault */
	useEffect(() => {
		const el = viewport.current;
		if (el === null) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const box = el.getBoundingClientRect();
			if (event.ctrlKey || event.metaKey) {
				zoomAt(event.clientX - box.left, event.clientY - box.top, camK.get() * Math.exp(-event.deltaY * 0.0025));
				return;
			}
			camX.set(camX.get() - event.deltaX);
			camY.set(camY.get() - event.deltaY);
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [camX, camY, camK, zoomAt]);

	/* `+` and `-` step about the middle of the view, `0` puts the field back */
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const el = viewport.current;
			if (el === null) return;
			const cx = el.clientWidth / 2;
			const cy = el.clientHeight / 2;
			const options = { duration: still ? 0 : FLIGHT_MS / 1000, ease: EASE };
			if (event.key === "+" || event.key === "=") {
				const to = Math.min(MAX_K, camK.get() * STEP);
				fly(cx, cy, to);
				return;
			}
			if (event.key === "-" || event.key === "_") {
				const to = Math.max(MIN_K, camK.get() / STEP);
				fly(cx, cy, to);
				return;
			}
			if (event.key === "0") {
				animate(camX, 0, options);
				animate(camY, 0, options);
				animate(camK, 1, options);
			}

			function fly(px: number, py: number, to: number) {
				const k = camK.get();
				const wx = (px - camX.get()) / k;
				const wy = (py - camY.get()) / k;
				animate(camX, px - wx * to, options);
				animate(camY, py - wy * to, options);
				animate(camK, to, options);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [camX, camY, camK, still]);

	/* ---------- the two drags ---------- */

	const pan = useRef<{ id: number; px: number; py: number; x: number; y: number } | null>(null);
	const carry = useRef<{ id: number; node: string; px: number; py: number; x: number; y: number } | null>(null);
	const [panning, setPanning] = useState(false);

	const onGroundDown = (event: React.PointerEvent) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		pan.current = { id: event.pointerId, px: event.clientX, py: event.clientY, x: camX.get(), y: camY.get() };
		setPanning(true);
	};

	const onNodeDown = (id: string) => (event: React.PointerEvent) => {
		event.stopPropagation();
		const at = spots[id];
		if (at === undefined) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		carry.current = { id: event.pointerId, node: id, px: event.clientX, py: event.clientY, x: at.x, y: at.y };
		setHeld(id);
	};

	const onMove = (event: React.PointerEvent) => {
		const dragging = carry.current;
		if (dragging !== null && dragging.id === event.pointerId) {
			const k = camK.get();
			const next = {
				x: dragging.x + (event.clientX - dragging.px) / k,
				y: dragging.y + (event.clientY - dragging.py) / k,
			};
			setSpots((current) => ({ ...current, [dragging.node]: next }));
			return;
		}
		const panned = pan.current;
		if (panned !== null && panned.id === event.pointerId) {
			camX.set(panned.x + (event.clientX - panned.px));
			camY.set(panned.y + (event.clientY - panned.py));
		}
	};

	const onUp = (event: React.PointerEvent) => {
		if (carry.current?.id === event.pointerId) {
			carry.current = null;
			setHeld(null);
		}
		if (pan.current?.id === event.pointerId) {
			pan.current = null;
			setPanning(false);
		}
	};

	const worldStyle = {
		x: camX,
		y: camY,
		scale: camK,
		transformOrigin: "0 0",
		"--ik": camIK,
	} as unknown as MotionStyle;

	return (
		<SpoolShell activeTab="tvarso" tabs={["tvarso"]} zoom={`${zoom}%`}>
			<CanvasChrome pages={PAGES} tool="none" rail={null} railWidth={0}>
				<div
					ref={viewport}
					className={cn("relative h-full w-full touch-none overflow-clip", panning ? "cursor-grabbing" : "cursor-grab")}
					onPointerDown={onGroundDown}
					onPointerMove={onMove}
					onPointerUp={onUp}
					onPointerCancel={onUp}
				>
					<motion.div data-world="" className="absolute top-0 left-0 h-0 w-0" style={worldStyle}>
						{FAMILIES.map((family) => (
							<Tint key={family.file} file={family.file} ids={family.ids} spots={spots} />
						))}
						{NODES.map((node) => (
							<NodeBody
								key={node.id}
								node={node}
								at={spots[node.id] ?? { x: node.x, y: node.y }}
								held={held === node.id}
								over={over === node.id}
								onDown={onNodeDown(node.id)}
								onOver={() => setOver(node.id)}
								onOut={() => setOver((current) => (current === node.id ? null : current))}
							/>
						))}
					</motion.div>

					<span className="pointer-events-none absolute top-7 left-10 font-mono text-base text-text/70 leading-base">
						src/ui
					</span>
					<span className="pointer-events-none absolute bottom-6 left-10 font-mono text-2xs text-muted/30 leading-3">
						drag the ground to pan · ⌘ scroll to zoom · + - 0
					</span>
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

/* ---------- the file, as a hull rather than a fence ---------- */

/**
 * A family's tint, computed off wherever its members currently stand.
 *
 * There is nothing to drop into and nothing to drag out of: the shape is read
 * from the members every render, so a component that moves takes the file's
 * outline with it.
 */
function Tint({ file, ids, spots }: { file: string; ids: readonly string[]; spots: Readonly<Record<string, Spot>> }) {
	const boxes = ids
		.map((id) => {
			const node = NODES.find((candidate) => candidate.id === id);
			const at = spots[id];
			if (node === undefined || at === undefined) return null;
			const size = sizeOf(node);
			return { x: at.x, y: at.y, w: size.w, h: size.h };
		})
		.filter((box): box is { x: number; y: number; w: number; h: number } => box !== null);
	if (boxes.length === 0) return null;

	const left = Math.min(...boxes.map((box) => box.x)) - 24;
	const top = Math.min(...boxes.map((box) => box.y)) - 30;
	const right = Math.max(...boxes.map((box) => box.x + box.w)) + 24;
	const bottom = Math.max(...boxes.map((box) => box.y + box.h)) + 24;

	return (
		<div
			className="pointer-events-none absolute"
			style={{
				left,
				top,
				width: right - left,
				height: bottom - top,
				background: "rgba(255,255,255,0.022)",
				borderRadius: "calc(26px * var(--ik))",
			}}
		>
			<span
				className="absolute origin-top-left whitespace-nowrap font-mono text-2xs text-muted/40 leading-3"
				style={{ left: 16, top: 11, transform: "scale(var(--ik))" }}
			>
				{file}
			</span>
		</div>
	);
}

/* ---------- one node ---------- */

function NodeBody({
	node,
	at,
	held,
	over,
	onDown,
	onOver,
	onOut,
}: {
	node: Node;
	at: Spot;
	held: boolean;
	over: boolean;
	onDown: (event: React.PointerEvent) => void;
	onOver: () => void;
	onOut: () => void;
}) {
	const size = sizeOf(node);
	return (
		<div
			data-node={node.id}
			className={cn("absolute", held ? "cursor-grabbing" : "cursor-grab")}
			style={{ left: at.x, top: at.y, width: size.w, zIndex: held ? 30 : over ? 20 : 1 }}
			onPointerDown={onDown}
			onPointerEnter={onOver}
			onPointerLeave={onOut}
		>
			<div className="relative" style={{ height: size.h }}>
				<Body node={node} />
				{/* paint, not geometry: 1px at 25% and 1px at 300% */}
				{held ? (
					<span
						className="pointer-events-none absolute border-thread"
						style={{
							inset: "calc(-6px * var(--ik))",
							borderWidth: "calc(1px * var(--ik))",
							borderRadius: "calc(10px * var(--ik))",
						}}
					/>
				) : over ? (
					<span
						className="pointer-events-none absolute border-border-raised"
						style={{
							inset: "calc(-4px * var(--ik))",
							borderWidth: "calc(1px * var(--ik))",
							borderRadius: "calc(9px * var(--ik))",
						}}
					/>
				) : null}
			</div>
			<Caption node={node} say={held || over} />
		</div>
	);
}

function Body({ node }: { node: Node }) {
	const size = sizeOf(node);
	if (node.kind === "icon") {
		const glyph = ICONS.find((candidate) => candidate.name === node.id);
		if (glyph === undefined) return null;
		return (
			<div
				className="pointer-events-none flex h-full w-full items-center justify-center rounded-md border"
				style={{ background: PAPER, borderColor: LINE, color: INK }}
			>
				<glyph.Icon className="h-5 w-5" />
			</div>
		);
	}
	if (node.kind === "tokens") return <TokenSheet />;
	if (node.kind === "slot") {
		/* nothing renders it yet, so there is nothing to crop and the slot says so under its name */
		return (
			<div
				className="pointer-events-none h-full w-full rounded-md border border-border-raised/70 border-dashed"
				style={{ background: "rgba(255,255,255,0.012)" }}
			/>
		);
	}
	return (
		<div className="pointer-events-none">
			<Well part={part(node.id)} width={size.w} height={size.h} scaleReadout={false} />
		</div>
	);
}

/**
 * The name, the file it came from, and the count that only exists while you are
 * looking at it. All of it counter-scales, so the specimen is the only thing the
 * camera ever makes bigger.
 */
function Caption({ node, say }: { node: Node; say: boolean }) {
	const small = node.kind === "icon";
	return (
		<div
			className="absolute origin-top-left whitespace-nowrap"
			style={{ top: sizeOf(node).h, left: 0, paddingTop: small ? 6 : 8, transform: "scale(var(--ik))" }}
		>
			<div className="flex items-baseline gap-2">
				<span className={cn("font-mono leading-3", small ? "text-2xs text-text/85" : "text-sm text-text/90 leading-sm")}>
					{node.id}
				</span>
				{node.kind === "part" && node.file !== undefined ? (
					<span className="font-mono text-2xs text-muted/30 leading-3">{node.file}</span>
				) : null}
				{node.kind === "slot" ? <span className="font-mono text-2xs text-muted/30 leading-3">{node.file}</span> : null}
				<span
					className={cn(
						"font-mono text-2xs text-muted/55 leading-3 transition-opacity duration-150",
						say ? "opacity-100" : "opacity-0",
					)}
				>
					{note(node)}
				</span>
			</div>
		</div>
	);
}

/** what a node says while it is under the cursor, and nothing at all while it is not */
function note(node: Node): string {
	if (node.kind === "slot") return "no frame renders it yet";
	if (node.kind === "tokens") return `${TOKEN_COUNT} tokens · read only`;
	if (node.kind === "icon") {
		const glyph = ICONS.find((candidate) => candidate.name === node.id);
		return glyph === undefined ? "" : `${glyph.used[0] ?? ""} · ${glyph.frames} frames`;
	}
	const drawn = part(node.id);
	return `${drawn.used[0] ?? ""} · ${drawn.frames} frames`;
}

/* ---------- tokens.css, a citizen of the same field ---------- */

function TokenSheet() {
	const colour = TVARSO_TOKENS.find((group) => group.kind === "colour");
	const type = TVARSO_TOKENS.find((group) => group.kind === "type");
	const radius = TVARSO_TOKENS.find((group) => group.kind === "radius");
	const space = TVARSO_TOKENS.find((group) => group.kind === "space");
	return (
		<div
			className="pointer-events-none flex h-full w-full flex-col gap-3 overflow-clip rounded-md border p-3.5 font-[Instrument_Sans] antialiased"
			style={{ background: PAPER, borderColor: LINE, color: INK }}
		>
			<div className="flex flex-col gap-1.5">
				{colour?.tokens.map((token) => (
					<div key={token.name} className="flex items-center gap-2.5">
						<span
							className="h-[18px] w-[18px] shrink-0 rounded-[4px] border"
							style={{ background: token.swatch, borderColor: LINE }}
						/>
						<span className="flex-1 text-[12px] leading-none">{token.name}</span>
						<span className="text-[11px] leading-none" style={{ color: MUTED }}>
							{token.value}
						</span>
					</div>
				))}
			</div>
			<div className="h-px w-full shrink-0" style={{ background: LINE }} />
			<div className="flex flex-col gap-2">
				{type?.tokens.slice(0, 3).map((token) => (
					<div key={token.name} className="flex items-baseline gap-2.5">
						<span className="flex-1 truncate leading-none" style={{ fontSize: sampleSize(token.value) }}>
							{token.sample}
						</span>
						<span className="text-[11px] leading-none" style={{ color: MUTED }}>
							{token.value}
						</span>
					</div>
				))}
			</div>
			<div className="h-px w-full shrink-0" style={{ background: LINE }} />
			<div className="flex items-center gap-3">
				{radius?.tokens.map((token) => (
					<span
						key={token.name}
						className="h-[26px] w-[26px] shrink-0 border"
						style={{
							borderColor: LINE,
							background: PAPER,
							borderRadius: `${Math.min(26, token.radius ?? 4)}px 0 0 0`,
						}}
					/>
				))}
				<span className="ml-auto flex items-center gap-3">
					{space?.tokens.map((token) => (
						<span key={token.name} className="flex items-center" style={{ gap: token.gap }}>
							<span className="h-[13px] w-[4px] rounded-[1px]" style={{ background: MUTED }} />
							<span className="h-[13px] w-[4px] rounded-[1px]" style={{ background: MUTED }} />
						</span>
					))}
				</span>
			</div>
		</div>
	);
}

function sampleSize(value: string): number {
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? 13 : Math.min(16, parsed);
}
