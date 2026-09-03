import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { INK, LINE, MUTED, PAPER } from "shared/ui/demo/tvarso-checkout";
import {
	type LibFile,
	type LibPart,
	LibraryFace,
	TOKEN_COUNT,
	TVARSO_FILES,
	TVARSO_PAGES,
	TVARSO_TOKENS,
} from "shared/ui/demo/tvarso-library";
import type { PageRow } from "shared/ui/spool/canvas-chrome";

/**
 * What `library-frames` and `library-page` both draw: `shared/ui/` projected
 * the way `frames/` already is, one frame per component in file order, and the
 * rail that comes up when one is held. The two frames differ only in whether
 * there is a camera over it ([spool-cloud#31](https://github.com/liamvinberg/spool-cloud/issues/31)).
 */

const PAD = 14;
const ICON_W = 136;
const ICON_H = 64;
const TOKENS_W = 544;
const TOKENS_H = 148;

type Kind = "part" | "slot" | "tokens";

export interface Frame {
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
 * File order, flowing left to right and wrapping at `WRAP`. A file
 * with several members never splits across a wrap: it starts a new row instead,
 * so its tint stays one rectangle.
 */
export function layout(WRAP = 1180): { frames: readonly Frame[]; families: readonly Family[] } {
	const GAP = 40;
	const KIN = 12;
	const ROW = 110;
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
		families.push({ file: file.file, note: file.note, x: startX - 16, y: startY - 78, w: right - startX + 32, h: y + rowH - startY + 78 + 34 });
		if (rows > 1) wrap();
		else x += GAP - KIN;
	}

	return { frames, families };
}

export const LAID = layout();

/** frames rendering this, in project order; the count the rail and the caption both say */
export function holders(frame: Frame): readonly string[] {
	return frame.part?.used ?? [];
}

export const RAIL_FRAMES: readonly string[] = [
	"tokens.css",
	...FILES.map((file) => (file.parts.length === 1 ? (file.parts[0] as LibPart).name : file.parts.length === 0 ? "Stepper" : file.file)),
];

export const PAGES: readonly PageRow[] = [
	...TVARSO_PAGES.map((page) => ({ name: page.name, frames: page.frames })),
	{ name: "library", frames: RAIL_FRAMES, active: true, open: true, face: <LibraryFace /> },
];

/* ---------- a file with several members ---------- */

export function Tint({ family }: { family: Family }) {
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

export function FrameBody({
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

export function Rail({ frame }: { frame: Frame | null }) {
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
