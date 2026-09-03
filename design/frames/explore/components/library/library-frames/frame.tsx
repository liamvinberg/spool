import { animate, type MotionStyle, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { INK, LINE, MUTED, PAPER } from "shared/ui/demo/tvarso-checkout";
import {
	type LibFile,
	type LibPart,
	LibraryFace,
	TOKEN_COUNT,
	TVARSO_FILES,
	TVARSO_PAGES,
	TVARSO_PARTS,
	TVARSO_TOKENS,
} from "shared/ui/demo/tvarso-library";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * The library is a page, and every component on it is a frame
 * ([spool-cloud#31](https://github.com/liamvinberg/spool-cloud/issues/31)).
 *
 * spool already projects `frames/` onto a canvas: a folder becomes a page, a
 * file becomes a frame with a label over it, a ring when you hold it, and a rail
 * that says what it is. This take projects `shared/ui/` the same way and adds
 * nothing. `library` is a page in the rail, wearing the face a projected page
 * wears instead of a folder. `Button` is a frame on it. Hold it and the same ring
 * and the same rail come up; the rail's one new line is the list of frames that
 * render it, which is the reach mark turned into an index. `tokens.css` is a
 * frame too, the first one, because everything under it reads it.
 *
 * **The arrangement is spool's, the way the rail's order is.** Frames stand in
 * file order and flow left to right, a file with several members kept together
 * on one tint. Nobody drags a component around, because a library's arrangement
 * carries no information a person would want to keep, and every position that
 * has to be kept is a store spool has to own. What is kept is the camera: pan,
 * zoom, fly back with `0`.
 *
 * **A specimen is the first real usage, cropped.** The frame draws `Button` as
 * `timetable` draws it, with `timetable`'s props, so there is no demo file to
 * write and nothing that can drift. `Stepper` is defined and rendered nowhere,
 * so its frame is empty and says so.
 *
 * Counts are per component and drawn at rest. This is the one page where the
 * number is the point rather than a warning: the library is where you come to
 * ask how far a thing reaches.
 */

/* ---------- the projection ---------- */

const PAD = 14;
const ICON_W = 112;
const ICON_H = 56;
const TOKENS_W = 544;
const TOKENS_H = 148;

type Kind = "part" | "slot" | "tokens";

interface Frame {
	readonly id: string;
	readonly kind: Kind;
	readonly file: string;
	/** true for a file that defines exactly one component, which is when the file rides the label */
	readonly solo: boolean;
	readonly w: number;
	readonly h: number;
	readonly part?: LibPart;
	readonly x: number;
	readonly y: number;
}

interface Family {
	readonly file: string;
	readonly note: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** what nothing renders yet, listed where its file falls */
const STEPPER: LibFile = {
	file: "stepper.tsx",
	note: "how many tickets",
	parts: [],
};

const FILES: readonly LibFile[] = [...TVARSO_FILES, STEPPER].sort((a, b) => a.file.localeCompare(b.file));

function frameSize(file: LibFile, part: LibPart | undefined): { w: number; h: number } {
	if (part === undefined) return { w: 172, h: 64 };
	if (file.file === "icons.tsx") return { w: ICON_W, h: ICON_H };
	return { w: part.w + PAD * 2, h: part.h + PAD * 2 };
}

/**
 * File order, flowing left to right and wrapping at the page's width. A file
 * with several members never splits across a wrap: it starts a new row instead,
 * so its tint stays one rectangle.
 */
function layout(): { frames: readonly Frame[]; families: readonly Family[] } {
	const WRAP = 1180;
	const GAP = 40;
	const KIN = 12;
	const ROW = 92;
	const LEFT = 48;

	const frames: Frame[] = [];
	const families: Family[] = [];

	let x = LEFT;
	let y = 132;
	let rowH = 0;

	const place = (frame: Omit<Frame, "x" | "y">) => {
		frames.push({ ...frame, x, y });
		rowH = Math.max(rowH, frame.h);
	};
	const wrap = () => {
		x = LEFT;
		y += rowH + ROW;
		rowH = 0;
	};

	place({ id: "tokens.css", kind: "tokens", file: "tokens.css", solo: true, w: TOKENS_W, h: TOKENS_H });
	wrap();

	for (const file of FILES) {
		if (file.parts.length === 0) {
			const size = frameSize(file, undefined);
			if (x + size.w > LEFT + WRAP) wrap();
			place({ id: "Stepper", kind: "slot", file: file.file, solo: true, ...size });
			x += size.w + GAP;
			continue;
		}
		if (file.parts.length === 1) {
			const part = file.parts[0] as LibPart;
			const size = frameSize(file, part);
			if (x + size.w > LEFT + WRAP) wrap();
			place({ id: part.name, kind: "part", file: file.file, solo: true, part, ...size });
			x += size.w + GAP;
			continue;
		}
		const sizes = file.parts.map((part) => frameSize(file, part));
		const width = sizes.reduce((sum, size) => sum + size.w, 0) + KIN * (sizes.length - 1);
		if (x + width > LEFT + WRAP) wrap();
		/* a family wider than the page breaks into even rows rather than one long one and a stub */
		const rows = Math.ceil(width / WRAP);
		const perRow = Math.ceil(file.parts.length / rows);
		const startX = x;
		const startY = y;
		let right = x;
		file.parts.forEach((part, index) => {
			if (index > 0 && index % perRow === 0) {
				x = startX;
				y += rowH + ROW;
				rowH = 0;
			}
			const size = sizes[index] as { w: number; h: number };
			place({ id: part.name, kind: "part", file: file.file, solo: false, part, ...size });
			x += size.w + KIN;
			right = Math.max(right, x - KIN);
		});
		families.push({ file: file.file, note: file.note, x: startX - 16, y: startY - 62, w: right - startX + 32, h: y + rowH - startY + 62 + 34 });
		if (rows > 1) wrap();
		else x += GAP - KIN;
	}

	return { frames, families };
}

const LAID = layout();

/** frames rendering this, in project order; the count the rail and the caption both say */
function holders(frame: Frame): readonly string[] {
	return frame.part?.used ?? [];
}

const RAIL_FRAMES: readonly string[] = [
	"tokens.css",
	...FILES.map((file) => (file.parts.length === 1 ? (file.parts[0] as LibPart).name : file.parts.length === 0 ? "Stepper" : file.file)),
];

const PAGES: readonly PageRow[] = [
	...TVARSO_PAGES.map((page) => ({ name: page.name, frames: page.frames })),
	{ name: "library", frames: RAIL_FRAMES, active: true, open: true, face: <LibraryFace /> },
];

/* ---------- the camera, which is spool's ---------- */

const MIN_K = 0.25;
const MAX_K = 3;
const START_K = 0.66;
const FLIGHT_MS = 220;
const EASE = [0.33, 1, 0.68, 1] as const;
const STEP = 1.25;

export default function LibraryFramesFrame() {
	const [held, setHeld] = useState<string | null>("Button");
	const [over, setOver] = useState<string | null>(null);
	const [k, setK] = useState(START_K);
	const still = useReducedMotion() === true;

	const viewport = useRef<HTMLDivElement>(null);
	const camX = useMotionValue(0);
	const camY = useMotionValue(0);
	const camK = useMotionValue(START_K);
	const camIK = useTransform(camK, (value: number) => 1 / value);

	useEffect(() => camK.on("change", (value: number) => setK(value)), [camK]);

	const zoomAt = useCallback(
		(px: number, py: number, next: number) => {
			const to = Math.min(MAX_K, Math.max(MIN_K, next));
			const wx = (px - camX.get()) / camK.get();
			const wy = (py - camY.get()) / camK.get();
			camK.set(to);
			camX.set(px - wx * to);
			camY.set(py - wy * to);
		},
		[camX, camY, camK],
	);

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

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const el = viewport.current;
			if (el === null) return;
			if (event.key === "Escape") {
				setHeld(null);
				return;
			}
			const cx = el.clientWidth / 2;
			const cy = el.clientHeight / 2;
			const options = { duration: still ? 0 : FLIGHT_MS / 1000, ease: EASE };
			const fly = (to: number) => {
				const at = camK.get();
				const wx = (cx - camX.get()) / at;
				const wy = (cy - camY.get()) / at;
				animate(camX, cx - wx * to, options);
				animate(camY, cy - wy * to, options);
				animate(camK, to, options);
			};
			if (event.key === "+" || event.key === "=") fly(Math.min(MAX_K, camK.get() * STEP));
			else if (event.key === "-" || event.key === "_") fly(Math.max(MIN_K, camK.get() / STEP));
			else if (event.key === "0") {
				animate(camX, 0, options);
				animate(camY, 0, options);
				animate(camK, START_K, options);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [camX, camY, camK, still]);

	/* the ground pans; a press that never moved is a click, and a click on the ground lets go */
	const pan = useRef<{ id: number; px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
	const [panning, setPanning] = useState(false);

	const onGroundDown = (event: React.PointerEvent) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		pan.current = { id: event.pointerId, px: event.clientX, py: event.clientY, x: camX.get(), y: camY.get(), moved: false };
		setPanning(true);
	};
	const onMove = (event: React.PointerEvent) => {
		const panned = pan.current;
		if (panned === null || panned.id !== event.pointerId) return;
		const dx = event.clientX - panned.px;
		const dy = event.clientY - panned.py;
		if (Math.hypot(dx, dy) > 3) panned.moved = true;
		camX.set(panned.x + dx);
		camY.set(panned.y + dy);
	};
	const onUp = (event: React.PointerEvent) => {
		const panned = pan.current;
		if (panned === null || panned.id !== event.pointerId) return;
		if (!panned.moved) setHeld(null);
		pan.current = null;
		setPanning(false);
	};

	const worldStyle = {
		x: camX,
		y: camY,
		scale: camK,
		transformOrigin: "0 0",
		"--ik": camIK,
	} as unknown as MotionStyle;

	const heldFrame = LAID.frames.find((frame) => frame.id === held) ?? null;

	return (
		<SpoolShell activeTab="tvarso" tabs={["tvarso"]} zoom={`${Math.round(k * 100)}%`}>
			<CanvasChrome pages={PAGES} selected={held ?? undefined} tool="select" rail={<Rail frame={heldFrame} />}>
				<div
					ref={viewport}
					className={cn("relative h-full w-full touch-none overflow-clip", panning ? "cursor-grabbing" : "cursor-default")}
					onPointerDown={onGroundDown}
					onPointerMove={onMove}
					onPointerUp={onUp}
					onPointerCancel={onUp}
				>
					<motion.div data-world="" className="absolute top-0 left-0 h-0 w-0" style={worldStyle}>
						{LAID.families.map((family) => (
							<Tint key={family.file} family={family} />
						))}
						{LAID.frames.map((frame) => (
							<FrameBody
								key={frame.id}
								frame={frame}
								k={k}
								held={held === frame.id}
								over={over === frame.id}
								onDown={(event) => {
									event.stopPropagation();
									setHeld(frame.id);
								}}
								onOver={() => setOver(frame.id)}
								onOut={() => setOver((current) => (current === frame.id ? null : current))}
							/>
						))}
					</motion.div>

					<span className="pointer-events-none absolute top-6 left-8 flex items-baseline gap-2 font-mono text-base text-text/70 leading-base">
						src/ui
						<span className="text-2xs text-muted/40 leading-3">
							{TVARSO_PARTS} components · {TOKEN_COUNT} tokens
						</span>
					</span>
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

/* ---------- a file with several members ---------- */

function Tint({ family }: { family: Family }) {
	return (
		<div
			className="pointer-events-none absolute"
			style={{
				left: family.x,
				top: family.y,
				width: family.w,
				height: family.h,
				background: "rgba(255,255,255,0.022)",
				borderRadius: 14,
			}}
		>
			<span
				className="absolute origin-top-left whitespace-nowrap font-mono text-2xs text-muted/40 leading-3"
				style={{ left: 16, top: 10, transform: "scale(var(--ik))" }}
			>
				{family.file}
			</span>
		</div>
	);
}

/* ---------- one frame ---------- */

function FrameBody({
	frame,
	k,
	held,
	over,
	onDown,
	onOver,
	onOut,
}: {
	frame: Frame;
	k: number;
	held: boolean;
	over: boolean;
	onDown: (event: React.PointerEvent) => void;
	onOver: () => void;
	onOut: () => void;
}) {
	const count = holders(frame).length;
	return (
		<div
			data-frame={frame.id}
			className="absolute cursor-default"
			style={{ left: frame.x, top: frame.y, width: frame.w, zIndex: held ? 30 : over ? 20 : 1 }}
			onPointerDown={onDown}
			onPointerEnter={onOver}
			onPointerLeave={onOut}
		>
			{/* the label spool puts over every frame, the name and nothing else */}
			<div
				className="pointer-events-none absolute bottom-full left-0 origin-bottom-left whitespace-nowrap"
				style={{ width: frame.w * k, transform: `scale(${1 / k})` }}
			>
				<div className="flex w-full min-w-0 items-baseline pb-2">
					<span
						className={cn(
							"min-w-0 truncate font-mono text-sm leading-4",
							held ? "text-thread" : over ? "text-text" : "text-muted",
						)}
					>
						{frame.id}
					</span>
				</div>
			</div>

			<div className="relative" style={{ height: frame.h }}>
				<Body frame={frame} />
				{held ? <Ring /> : over ? <Hair /> : null}
			</div>

			{/* the file and the count, at rest: on this page the number is what you came for */}
			<div
				className="pointer-events-none absolute left-0 origin-top-left whitespace-nowrap pt-2 font-mono text-2xs leading-3"
				style={{ top: frame.h, transform: "scale(var(--ik))" }}
			>
				{frame.kind === "tokens" ? (
					<span className="text-muted/55">read by every component</span>
				) : frame.kind === "slot" ? (
					<span className="text-muted/55">
						<span className="text-muted/35">{frame.file} · </span>no frame renders it yet
					</span>
				) : (
					<span className="text-muted/55">
						{frame.solo ? <span className="text-muted/35">{frame.file} · </span> : null}
						{count} {count === 1 ? "frame" : "frames"}
					</span>
				)}
			</div>
		</div>
	);
}

function Body({ frame }: { frame: Frame }) {
	if (frame.kind === "tokens") return <TokenSheet />;
	if (frame.kind === "slot") {
		return (
			<div
				className="pointer-events-none h-full w-full rounded-md border border-border-raised/70 border-dashed"
				style={{ background: "rgba(255,255,255,0.012)" }}
			/>
		);
	}
	const part = frame.part as LibPart;
	return (
		<div
			className="pointer-events-none flex h-full w-full items-center justify-center overflow-clip rounded-md border"
			style={{ background: PAPER, borderColor: LINE }}
		>
			<div style={{ width: part.w, height: part.h }}>{part.render()}</div>
		</div>
	);
}

/** spool's own ring and handles, paint rather than geometry */
function Ring() {
	return (
		<>
			<span
				className="pointer-events-none absolute border-thread"
				style={{ inset: "calc(-3px * var(--ik))", borderWidth: "calc(1.5px * var(--ik))", borderRadius: "calc(9px * var(--ik))" }}
			/>
			{["-left-[7px] -top-[7px]", "-right-[7px] -top-[7px]", "-bottom-[7px] -left-[7px]", "-bottom-[7px] -right-[7px]"].map(
				(position) => (
					<span
						key={position}
						className={cn("pointer-events-none absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread", position)}
						style={{ transform: "scale(var(--ik))" }}
					/>
				),
			)}
		</>
	);
}

function Hair() {
	return (
		<span
			className="pointer-events-none absolute border-border-raised"
			style={{ inset: "calc(-3px * var(--ik))", borderWidth: "calc(1px * var(--ik))", borderRadius: "calc(9px * var(--ik))" }}
		/>
	);
}

/* ---------- tokens.css, the first frame ---------- */

function TokenSheet() {
	const colour = TVARSO_TOKENS.find((group) => group.kind === "colour");
	const type = TVARSO_TOKENS.find((group) => group.kind === "type");
	const radius = TVARSO_TOKENS.find((group) => group.kind === "radius");
	const space = TVARSO_TOKENS.find((group) => group.kind === "space");
	const head = "text-[10px] leading-none tracking-wide";
	return (
		<div
			className="pointer-events-none grid h-full w-full grid-cols-[1.15fr_1.3fr_0.8fr_0.9fr] gap-5 overflow-clip rounded-md border p-4 font-[Instrument_Sans] antialiased"
			style={{ background: PAPER, borderColor: LINE, color: INK }}
		>
			<div className="flex flex-col gap-2">
				<span className={head} style={{ color: MUTED }}>
					colour
				</span>
				<div className="flex flex-col gap-1.5">
					{colour?.tokens.map((token) => (
						<div key={token.name} className="flex items-center gap-2">
							<span className="h-[14px] w-[14px] shrink-0 rounded-[3px] border" style={{ background: token.swatch, borderColor: LINE }} />
							<span className="flex-1 text-[11px] leading-none">{token.name}</span>
						</div>
					))}
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<span className={head} style={{ color: MUTED }}>
					type
				</span>
				<div className="flex flex-col gap-2">
					{type?.tokens.map((token) => (
						<div key={token.name} className="flex items-baseline gap-2">
							<span className="flex-1 truncate leading-none" style={{ fontSize: Math.min(17, Number.parseInt(token.value, 10) || 13) }}>
								{token.sample}
							</span>
							<span className="text-[10px] leading-none" style={{ color: MUTED }}>
								{token.name}
							</span>
						</div>
					))}
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<span className={head} style={{ color: MUTED }}>
					radius
				</span>
				<div className="flex flex-col gap-2">
					{radius?.tokens.map((token) => (
						<div key={token.name} className="flex items-center gap-2">
							<span
								className="h-[22px] w-[22px] shrink-0 border"
								style={{ borderColor: INK, background: PAPER, borderRadius: `${Math.min(22, token.radius ?? 4)}px 0 0 0` }}
							/>
							<span className="text-[10px] leading-none" style={{ color: MUTED }}>
								{token.name}
							</span>
						</div>
					))}
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<span className={head} style={{ color: MUTED }}>
					space
				</span>
				<div className="flex flex-col gap-2">
					{space?.tokens.map((token) => (
						<div key={token.name} className="flex items-center gap-2">
							<span className="flex items-center" style={{ gap: token.gap }}>
								<span className="h-[12px] w-[3px] rounded-[1px]" style={{ background: INK }} />
								<span className="h-[12px] w-[3px] rounded-[1px]" style={{ background: INK }} />
							</span>
							<span className="text-[10px] leading-none" style={{ color: MUTED }}>
								{token.name}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

/* ---------- the rail, which is the shipped rail with one more list in it ---------- */

const LABEL = "font-mono text-2xs text-muted/55 leading-3";
const VALUE = "font-mono text-sm leading-sm";
const FAINT = "font-mono text-2xs text-muted leading-3";

function Rail({ frame }: { frame: Frame | null }) {
	if (frame === null) {
		return (
			<div className="flex h-full flex-col bg-bg">
				<div className="flex h-9 items-center border-border border-b px-2.5">
					<span className={cn("text-muted/50", VALUE)}>no selection</span>
				</div>
			</div>
		);
	}
	const used = holders(frame);
	return (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			<div className="flex h-9 shrink-0 items-center gap-2 border-border border-b px-2.5">
				<span className={cn("truncate text-thread", VALUE)}>{frame.id}</span>
				<span className={cn("ml-auto shrink-0", FAINT)}>{frame.kind === "tokens" ? "css" : "component"}</span>
			</div>

			<Section label="defined in">
				<span className={cn("truncate", VALUE)}>
					src/ui/{frame.file}
					{frame.kind === "tokens" ? "" : ":12"}
				</span>
			</Section>

			{frame.kind === "tokens" ? (
				<>
					<Section label={`${TOKEN_COUNT} tokens · read only`}>
						<div className="flex flex-col gap-1 pt-0.5">
							{TVARSO_TOKENS.flatMap((group) => group.tokens).map((token) => (
								<div key={token.name} className="flex items-center gap-2">
									{token.swatch === undefined ? (
										<span className="h-3 w-3 shrink-0" />
									) : (
										<span className="h-3 w-3 shrink-0 rounded-[2px] border border-border-raised" style={{ background: token.swatch }} />
									)}
									<span className={cn("flex-1 truncate text-text", VALUE)}>{token.name}</span>
									<span className={FAINT}>{token.value}</span>
									<span className={cn("w-5 text-right", FAINT)}>{token.used}</span>
								</div>
							))}
						</div>
					</Section>
				</>
			) : frame.kind === "slot" ? (
				<Section label="rendered by">
					<span className={cn("text-muted/50", VALUE)}>no frame yet</span>
				</Section>
			) : (
				<>
					<Section label={`rendered by ${used.length} ${used.length === 1 ? "frame" : "frames"}`}>
						<div className="-mx-1 flex flex-col pt-0.5">
							{used.map((name) => (
								<button
									key={name}
									type="button"
									className={cn("flex h-6 cursor-pointer items-center gap-2 rounded-xs px-1 text-left text-muted hover:bg-surface hover:text-text", VALUE)}
								>
									<span className="truncate">{name}</span>
									<span className={cn("ml-auto shrink-0", FAINT)}>{TVARSO_PAGES.find((page) => page.frames.includes(name))?.name}</span>
								</button>
							))}
						</div>
					</Section>
					<Fields part={frame.part as LibPart} />
				</>
			)}
		</div>
	);
}

function Section({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex shrink-0 flex-col gap-1 border-border border-b px-2.5 py-2">
			<span className={LABEL}>{label}</span>
			{children}
		</div>
	);
}

/** the fields the shipped rail gives any held element, unchanged; a write here lands in the file above */
function Fields({ part }: { part: LibPart }) {
	const rows: readonly [string, string][] = [
		["fill", "--paper"],
		["stroke", "--line"],
		["radius", part.name === "Button" ? "--pill" : "--field"],
		["height", `${part.h}`],
		["padding", "--step"],
	];
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			{rows.map(([name, value]) => (
				<div key={name} className="flex h-8 items-center gap-2 border-border border-b px-2.5">
					<span className={cn("w-14 shrink-0", LABEL)}>{name}</span>
					<span className={cn("flex-1 truncate rounded-xs border border-border-raised/60 px-1.5 py-[3px] text-text", VALUE)}>{value}</span>
				</div>
			))}
		</div>
	);
}
