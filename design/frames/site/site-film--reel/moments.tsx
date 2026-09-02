import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * The recording, drawn.
 *
 * The maker's first-run screen capture does not exist yet, so the six moments it
 * passes through are drawn in code at one fixed size and scaled wherever a take
 * needs them. Everything here is presentation: no state, no knowledge of the page
 * it stands on.
 *
 * Two fidelities, because one drawing cannot survive both jobs. `RecStill` is the
 * full 1280x720 capture, legible down to about 0.4 scale. `RecThumb` is the same
 * moment at 208x117 native, redrawn as silhouette so a filmstrip entry reads as a
 * shape rather than as grey mush.
 */

export const REC_W = 1280;
export const REC_H = 720;

export const THUMB_W = 208;
export const THUMB_H = 117;

/** the run, in seconds: 18:40. */
export const RUN_SECONDS = 1120;
export const RUN_CLOCK = "18:40";

export type MomentId = "install" | "empty" | "plus" | "author" | "projects" | "design";

export interface Moment {
	id: MomentId;
	/** where the chapter starts, as the player prints it */
	clock: string;
	/** the same, in seconds, for anything that has to position a playhead */
	at: number;
	title: string;
	line: string;
	/** the one thing on screen at that moment, in the machine's own register */
	say: string;
}

export const MOMENTS: readonly Moment[] = [
	{
		id: "install",
		clock: "00:00",
		at: 0,
		title: "A machine with nothing on it",
		line: "One install line. The daemon comes up and prints an address you open in Chrome.",
		say: "npm i -g spool.page",
	},
	{
		id: "empty",
		clock: "02:14",
		at: 134,
		title: "The canvas before anything is in it",
		line: "The rail and the field both start empty. The + in the bar is the thing to press.",
		say: "no frames yet",
	},
	{
		id: "plus",
		clock: "04:02",
		at: 242,
		title: "+ takes any folder",
		line: "Point it at a repo you already have. spool writes design/ into it and leaves the rest of the tree alone.",
		say: "~/code/tvarso",
	},
	{
		id: "author",
		clock: "06:35",
		at: 395,
		title: "The first frames land",
		line: "I ask the agent for a checkout screen. The file hits disk and the frame is on the field before I look up.",
		say: "frames/checkout/frame.tsx",
	},
	{
		id: "projects",
		clock: "11:20",
		at: 680,
		title: "Four projects, one canvas",
		line: "Every project keeps its own design/ folder. The tab row is how I move between them.",
		say: "4 projects",
	},
	{
		id: "design",
		clock: "15:48",
		at: 948,
		title: "spool's own design folder",
		line: "The last chapter opens the canvas this product is designed on. 12 pages, 142 frames, all of it in the repo.",
		say: "142 frames",
	},
];

export const momentAt = (i: number): Moment => MOMENTS[Math.min(Math.max(i, 0), MOMENTS.length - 1)] as Moment;

/* ---------- shared surface ---------- */

const dotGrid: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "24px 24px",
};

const dotGridFine: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 7%, transparent) 1px, transparent 1px)",
	backgroundSize: "8px 8px",
};

function Bar({ w, className }: { w: number | string; className?: string }) {
	return <div className={cn("h-[4px] rounded-full bg-border-raised", className)} style={{ width: w }} />;
}

function FolderGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path
				d="M1.75 3.5h3.5l1.25 1.5h5.75v5.5H1.75z"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function PlusGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
			<path d="M6 2.25v7.5M2.25 6h7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
		</svg>
	);
}

/* ---------- the app, as the recording sees it ---------- */

function Tab({ label, active }: { label: string; active: boolean }) {
	return (
		<span
			className={cn(
				"flex h-[26px] items-center gap-2 rounded-[6px] px-3 font-mono text-[12px] leading-none",
				active ? "bg-raised text-text" : "text-muted",
			)}
		>
			<span className={cn("block h-[5px] w-[5px] rounded-full", active ? "bg-thread" : "bg-border-raised")} />
			{label}
		</span>
	);
}

function TabRow({ names, active }: { names: readonly string[]; active: number }) {
	return (
		<>
			<SpoolMark className="h-[17px] w-[14px] shrink-0 text-thread" />
			<span className="h-[16px] w-px shrink-0 bg-border" />
			{names.map((n, i) => (
				<Tab key={n} label={n} active={i === active} />
			))}
			<span className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] border border-border-raised text-muted">
				<PlusGlyph className="h-[10px] w-[10px]" />
			</span>
		</>
	);
}

interface RailRow {
	name: string;
	count?: number;
	indent?: boolean;
	lit?: boolean;
}

function Rail({ head, rows, foot }: { head: string; rows: readonly RailRow[]; foot?: ReactNode }) {
	return (
		<>
			<div className="px-2 pb-2 font-mono text-[11px] text-muted/70 leading-none">{head}</div>
			{rows.map((r) => (
				<div
					key={r.name}
					className={cn(
						"flex h-[26px] items-center gap-2 rounded-[5px] pr-2 font-mono text-[12px] leading-none",
						r.indent === true ? "pl-6" : "pl-2",
						r.lit === true ? "bg-raised text-text" : "text-muted",
					)}
				>
					<FolderGlyph className={cn("h-[12px] w-[12px] shrink-0", r.lit === true ? "text-thread" : "")} />
					<span className="min-w-0 flex-1 truncate">{r.name}</span>
					{r.count === undefined ? null : <span className="text-muted/60">{r.count}</span>}
				</div>
			))}
			{foot === undefined ? null : <div className="mt-auto">{foot}</div>}
		</>
	);
}

function Chrome({ tabs, rail, children }: { tabs: ReactNode; rail: ReactNode; children: ReactNode }) {
	return (
		<div className="flex h-full w-full flex-col">
			<div className="flex h-[42px] shrink-0 items-center gap-2.5 border-border border-b bg-bg px-4">{tabs}</div>
			<div className="flex min-h-0 flex-1">
				<div className="flex w-[220px] shrink-0 flex-col gap-[2px] border-border border-r bg-bg px-3 py-3">
					{rail}
				</div>
				<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas" style={dotGrid}>
					{children}
				</div>
			</div>
		</div>
	);
}

/* ---------- what a frame looks like from across the room ---------- */

function Sketch({ shape }: { shape: number }) {
	if (shape === 1) {
		return (
			<div className="flex h-full">
				<div className="w-[38%] shrink-0 space-y-[7px] border-border border-r bg-canvas p-2.5">
					<Bar w="70%" className="bg-raised" />
					<Bar w="52%" />
					<Bar w="64%" />
					<Bar w="44%" />
				</div>
				<div className="flex-1 space-y-2 p-2.5" style={dotGridFine}>
					<div className="h-[10px] w-[68%] rounded-[2px] bg-raised" />
					<Bar w="86%" />
					<Bar w="60%" />
					<span className="mt-3 block h-[14px] w-[46%] rounded-[3px] bg-thread/75" />
				</div>
			</div>
		);
	}
	if (shape === 2) {
		return (
			<div className="h-full space-y-[7px] p-3">
				<div className="h-[11px] w-[54%] rounded-[2px] bg-raised" />
				<Bar w="88%" />
				<Bar w="76%" />
				<Bar w="82%" />
				<span className="mt-2 block h-[13px] w-[38%] rounded-[3px] bg-thread/70" />
			</div>
		);
	}
	if (shape === 3) {
		return (
			<div className="flex h-full flex-col">
				<div className="h-[42%] bg-raised/45" />
				<div className="space-y-[7px] p-3">
					<Bar w="72%" />
					<Bar w="50%" />
					<span className="block h-[11px] w-[34%] rounded-[3px] bg-thread/60" />
				</div>
			</div>
		);
	}
	if (shape === 4) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2.5">
				<div className="h-[10px] w-[44%] rounded-[2px] bg-raised" />
				<Bar w="30%" />
				<span className="mt-1 block h-[12px] w-[26%] rounded-[3px] bg-thread/55" />
			</div>
		);
	}
	return (
		<div className="flex h-full gap-2.5 p-3">
			<div className="flex-1 space-y-[7px]">
				<div className="h-[10px] w-[64%] rounded-[2px] bg-raised" />
				<Bar w="90%" />
				<Bar w="72%" />
				<span className="mt-2 block h-[12px] w-[42%] rounded-[3px] bg-thread/65" />
			</div>
			<div className="w-[34%] rounded-[3px] border border-border" />
		</div>
	);
}

function MiniFrame({
	x,
	y,
	w,
	h,
	name,
	shape,
	lit = false,
	plate,
}: {
	x: number;
	y: number;
	w: number;
	h: number;
	name: string;
	shape: number;
	lit?: boolean;
	plate?: string;
}) {
	return (
		<div className="absolute" style={{ left: x, top: y, width: w }}>
			<div
				className={cn(
					"mb-[6px] flex items-center gap-1.5 font-mono text-[11px] leading-none",
					lit ? "text-thread" : "text-muted",
				)}
			>
				<span className="text-[8px]">{lit ? "▶" : "▸"}</span>
				<span className="truncate">{name}</span>
			</div>
			<div
				className={cn(
					"relative overflow-hidden rounded-[6px] border bg-bg",
					lit ? "border-thread" : "border-border-raised",
				)}
				style={{ height: h }}
			>
				<Sketch shape={shape} />
			</div>
			{plate === undefined ? null : (
				<div className="mt-2 inline-flex items-center gap-2 rounded-[5px] border border-border-raised bg-surface px-2.5 py-1.5 font-mono text-[11px] text-muted leading-none">
					<span className="block h-[5px] w-[5px] rounded-full bg-thread" />
					{plate}
				</div>
			)}
		</div>
	);
}

/* ---------- the six moments ---------- */

function Install() {
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="flex h-[36px] shrink-0 items-center gap-2 border-border border-b px-4">
				{["a", "b", "c"].map((d) => (
					<span key={d} className="block h-[9px] w-[9px] rounded-full bg-raised" />
				))}
				<span className="ml-3 font-mono text-[12px] text-muted/70 leading-none">tvarso · zsh</span>
			</div>
			<div className="flex flex-1 flex-col justify-center px-[52px] pb-[36px] font-mono text-[17px] leading-[32px]">
				<div className="text-muted">
					~ $ <span className="text-text">npm i -g spool.page</span>
				</div>
				<div className="text-muted/70">added 61 packages in 4s</div>
				<div className="mt-[26px] text-muted">
					~ $ <span className="text-text">cd code/tvarso</span>
				</div>
				<div className="mt-[26px] text-muted">
					~/code/tvarso $ <span className="text-text">spool</span>
				</div>
				<div className="text-muted/70">spool 0.6.0 · node 22.14.0</div>
				<div className="text-muted/70">daemon on 7766</div>
				<div className="text-thread">canvas → http://localhost:7766</div>
				<div className="text-muted/70">watching design/ for changes</div>
				<div className="mt-[26px] flex items-center gap-2 text-muted">
					~/code/tvarso $<span className="block h-[19px] w-[9px] bg-thread" />
				</div>
			</div>
		</div>
	);
}

function Empty() {
	return (
		<Chrome
			tabs={<TabRow names={["tvarso"]} active={0} />}
			rail={<Rail head="pages" rows={[]} foot={<span className="px-2 font-mono text-[11px] text-muted/50">0 frames</span>} />}
		>
			<div className="flex h-full w-full flex-col items-center justify-center gap-5">
				<SpoolMark className="h-[46px] w-[36px] text-thread opacity-30" />
				<div className="font-mono text-[15px] text-muted leading-none">no frames yet</div>
				<div className="w-[440px] text-center font-sans text-[14px] text-muted/70 leading-[22px]">
					Ask your agent for a screen. The file appears here as it is written.
				</div>
			</div>
		</Chrome>
	);
}

const PICK_ROWS: readonly { name: string; hint: string; lit?: boolean }[] = [
	{ name: "~/code/spool", hint: "12 pages" },
	{ name: "~/code/tvarso", hint: "git", lit: true },
	{ name: "~/code/kaffe", hint: "git" },
	{ name: "~/Documents", hint: "" },
	{ name: "~/Desktop", hint: "" },
];

function Plus() {
	return (
		<Chrome
			tabs={<TabRow names={["tvarso"]} active={0} />}
			rail={<Rail head="pages" rows={[]} />}
		>
			<div className="absolute inset-0 bg-bg/70" />
			<div className="absolute top-[92px] left-1/2 w-[460px] -translate-x-1/2 overflow-hidden rounded-[10px] border border-border-raised bg-surface">
				<div className="flex items-center gap-2.5 border-border border-b px-4 py-3.5">
					<FolderGlyph className="h-[13px] w-[13px] text-thread" />
					<span className="font-mono text-[14px] text-text leading-none">~/code/tva</span>
					<span className="block h-[15px] w-[8px] bg-thread" />
				</div>
				<div className="p-2">
					{PICK_ROWS.map((r) => (
						<div
							key={r.name}
							className={cn(
								"flex h-[36px] items-center gap-2.5 rounded-[6px] px-2.5 font-mono text-[13px] leading-none",
								r.lit === true ? "bg-raised text-text" : "text-muted",
							)}
						>
							<FolderGlyph
								className={cn("h-[13px] w-[13px] shrink-0", r.lit === true ? "text-thread" : "")}
							/>
							<span className="min-w-0 flex-1 truncate">{r.name}</span>
							{r.hint === "" ? null : <span className="text-muted/60 text-[11px]">{r.hint}</span>}
						</div>
					))}
				</div>
				<div className="border-border border-t px-4 py-2.5 font-mono text-[11px] text-muted/60 leading-none">
					↑↓ move · ⏎ open · esc closes
				</div>
			</div>
		</Chrome>
	);
}

function Author() {
	return (
		<Chrome
			tabs={<TabRow names={["tvarso"]} active={0} />}
			rail={
				<Rail
					head="pages"
					rows={[
						{ name: "checkout", count: 2, lit: true },
						{ name: "cart", count: 1 },
					]}
					foot={<span className="px-2 font-mono text-[11px] text-muted/50">3 frames</span>}
				/>
			}
		>
			<MiniFrame x={68} y={70} w={280} h={182} name="checkout" shape={1} lit plate="writing checkout/frame.tsx" />
			<MiniFrame x={430} y={70} w={230} h={150} name="checkout--empty" shape={4} />
			<MiniFrame x={430} y={300} w={230} h={150} name="cart" shape={2} />
			<svg
				className="pointer-events-none absolute top-0 left-0 overflow-visible"
				width={1060}
				height={678}
				fill="none"
				aria-hidden="true"
			>
				<path
					d="M348 175 C 388 175, 392 152, 424 148"
					stroke="var(--color-thread)"
					strokeWidth="1.6"
					strokeLinecap="round"
				/>
				<path d="M430 148 L 419 143 L 419 153 Z" fill="var(--color-thread)" />
			</svg>
		</Chrome>
	);
}

function Projects() {
	return (
		<Chrome
			tabs={<TabRow names={["tvarso", "kaffe", "atlas", "spool"]} active={1} />}
			rail={
				<Rail
					head="pages"
					rows={[
						{ name: "menu", count: 4, lit: true },
						{ name: "order", count: 3 },
						{ name: "receipt", count: 2 },
					]}
					foot={<span className="px-2 font-mono text-[11px] text-muted/50">9 frames</span>}
				/>
			}
		>
			<MiniFrame x={60} y={62} w={222} h={144} name="menu" shape={3} />
			<MiniFrame x={318} y={62} w={222} h={144} name="menu--sold-out" shape={4} />
			<MiniFrame x={576} y={62} w={222} h={144} name="order" shape={2} lit />
			<MiniFrame x={60} y={262} w={222} h={144} name="order--paying" shape={5} />
			<MiniFrame x={318} y={262} w={222} h={144} name="receipt" shape={2} />
			<MiniFrame x={576} y={262} w={222} h={144} name="receipt--mailed" shape={4} />
			<MiniFrame x={318} y={462} w={222} h={144} name="menu--phone" shape={3} />
		</Chrome>
	);
}

const DESIGN_PAGES: readonly RailRow[] = [
	{ name: "app", count: 16 },
	{ name: "agent", count: 27 },
	{ name: "booting", count: 20 },
	{ name: "components", count: 6 },
	{ name: "directing", count: 1 },
	{ name: "dock", count: 7 },
	{ name: "explorer", count: 9 },
	{ name: "manipulate", count: 14 },
	{ name: "picker", count: 6 },
	{ name: "play-tab", count: 3 },
	{ name: "site", count: 12, lit: true },
	{ name: "variants", count: 21 },
];

const DESIGN_FIELD: readonly { x: number; y: number; w: number; h: number; name: string; shape: number }[] = [
	{ x: 34, y: 54, w: 176, h: 112, name: "site-hub", shape: 5 },
	{ x: 238, y: 54, w: 176, h: 112, name: "site-film", shape: 3 },
	{ x: 442, y: 54, w: 148, h: 96, name: "site-disk", shape: 2 },
	{ x: 618, y: 54, w: 176, h: 112, name: "site-flows", shape: 1 },
	{ x: 822, y: 54, w: 148, h: 96, name: "site-mobile", shape: 4 },
	{ x: 34, y: 208, w: 148, h: 96, name: "site-card", shape: 4 },
	{ x: 210, y: 208, w: 176, h: 112, name: "site-local", shape: 2 },
	{ x: 414, y: 208, w: 176, h: 112, name: "site-frames", shape: 1 },
	{ x: 618, y: 208, w: 148, h: 96, name: "site-states", shape: 3 },
	{ x: 794, y: 208, w: 176, h: 112, name: "site-hub--tutorial", shape: 5 },
	{ x: 34, y: 362, w: 176, h: 112, name: "site-local--found", shape: 2 },
	{ x: 238, y: 362, w: 148, h: 96, name: "site-local--wrong", shape: 4 },
	{ x: 414, y: 362, w: 176, h: 112, name: "site-card--pace", shape: 3 },
	{ x: 618, y: 362, w: 176, h: 112, name: "site-frames--depth", shape: 1 },
	{ x: 822, y: 362, w: 148, h: 96, name: "site-disk--write", shape: 2 },
	{ x: 210, y: 516, w: 176, h: 112, name: "site-flows--graph", shape: 5 },
	{ x: 414, y: 516, w: 148, h: 96, name: "site-mobile--real", shape: 4 },
];

function Design() {
	return (
		<Chrome
			tabs={<TabRow names={["tvarso", "kaffe", "atlas", "spool"]} active={3} />}
			rail={
				<Rail
					head="pages"
					rows={DESIGN_PAGES}
					foot={
						<span className="block px-2 font-mono text-[11px] text-thread leading-none">142 frames</span>
					}
				/>
			}
		>
			{DESIGN_FIELD.map((f) => (
				<MiniFrame key={f.name} x={f.x} y={f.y} w={f.w} h={f.h} name={f.name} shape={f.shape} />
			))}
		</Chrome>
	);
}

/* ---------- the two fidelities ---------- */

export function RecStill({ id }: { id: MomentId }) {
	return (
		<div
			className="relative overflow-hidden bg-bg font-sans text-text antialiased"
			style={{ width: REC_W, height: REC_H }}
		>
			{id === "install" ? <Install /> : null}
			{id === "empty" ? <Empty /> : null}
			{id === "plus" ? <Plus /> : null}
			{id === "author" ? <Author /> : null}
			{id === "projects" ? <Projects /> : null}
			{id === "design" ? <Design /> : null}
		</div>
	);
}

/** the capture scaled into a box: `fit` letterboxes, `cover` crops. */
export function RecScreen({
	id,
	width,
	height,
	crop = "fit",
	bias = 0.5,
}: {
	id: MomentId;
	width: number;
	height: number;
	crop?: "fit" | "cover";
	bias?: number;
}) {
	const k =
		crop === "cover"
			? Math.max(width / REC_W, height / REC_H)
			: Math.min(width / REC_W, height / REC_H);
	return (
		<div className="relative overflow-hidden bg-bg" style={{ width, height }}>
			<div
				className="absolute"
				style={{
					left: (width - REC_W * k) * bias,
					top: (height - REC_H * k) / 2,
					width: REC_W,
					height: REC_H,
					transformOrigin: "0 0",
					transform: `scale(${k})`,
				}}
			>
				<RecStill id={id} />
			</div>
		</div>
	);
}

/* ---------- the filmstrip fidelity ---------- */

function ThumbBar({ w, className }: { w: number | string; className?: string }) {
	return <div className={cn("h-[2px] rounded-full bg-border-raised", className)} style={{ width: w }} />;
}

function ThumbChrome({ tabs, rails, children }: { tabs: number; rails: number; children?: ReactNode }) {
	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="flex h-[13px] shrink-0 items-center gap-[5px] border-border border-b px-2">
				<span className="block h-[4px] w-[3px] rounded-[1px] bg-thread" />
				{Array.from({ length: tabs }, (_, i) => (
					<span
						key={`tab-${String(i)}`}
						className={cn("block h-[5px] rounded-full", i === tabs - 1 ? "w-[22px] bg-raised" : "w-[18px] bg-surface")}
					/>
				))}
			</div>
			<div className="flex min-h-0 flex-1">
				<div className="flex w-[36px] shrink-0 flex-col gap-[5px] border-border border-r px-2 py-2">
					{Array.from({ length: rails }, (_, i) => (
						<ThumbBar key={`rail-${String(i)}`} w={i === 2 ? "78%" : "60%"} className={i === 2 ? "bg-thread/70" : ""} />
					))}
				</div>
				<div className="relative min-w-0 flex-1 bg-canvas" style={dotGridFine}>
					{children}
				</div>
			</div>
		</div>
	);
}

function ThumbTile({ x, y, w, h, lit = false }: { x: number; y: number; w: number; h: number; lit?: boolean }) {
	return (
		<span
			className={cn("absolute block rounded-[2px] border bg-bg", lit ? "border-thread" : "border-border-raised")}
			style={{ left: x, top: y, width: w, height: h }}
		>
			<span className="absolute top-[4px] left-[4px] block h-[3px] w-[52%] rounded-full bg-raised" />
			<span className="absolute bottom-[5px] left-[4px] block h-[4px] w-[34%] rounded-[1px] bg-thread/45" />
		</span>
	);
}

/** one moment as a silhouette, drawn at 208x117 and never scaled up. */
export function RecThumb({ id }: { id: MomentId }) {
	return (
		<div
			className="relative overflow-hidden bg-bg font-mono text-[7px] leading-[11px]"
			style={{ width: THUMB_W, height: THUMB_H }}
		>
			{id === "install" ? (
				<div className="h-full px-3 py-3">
					<div className="text-muted">
						~ $ <span className="text-text">npm i -g spool.page</span>
					</div>
					<div className="text-muted/60">added 61 packages in 4s</div>
					<div className="mt-2 text-muted">
						~/code/tvarso $ <span className="text-text">spool</span>
					</div>
					<div className="text-muted/60">daemon on 7766</div>
					<div className="text-thread">canvas → localhost:7766</div>
					<div className="mt-2 flex items-center gap-1 text-muted">
						~/code/tvarso $<span className="block h-[7px] w-[3px] bg-thread" />
					</div>
				</div>
			) : null}
			{id === "empty" ? (
				<ThumbChrome tabs={1} rails={0}>
					<div className="flex h-full flex-col items-center justify-center gap-1.5">
						<SpoolMark className="h-[16px] w-[13px] text-thread opacity-30" />
						<span className="text-[6px] text-muted/70">no frames yet</span>
					</div>
				</ThumbChrome>
			) : null}
			{id === "plus" ? (
				<ThumbChrome tabs={1} rails={0}>
					<span className="absolute inset-0 bg-bg/60" />
					<span className="-translate-x-1/2 absolute top-[16px] left-1/2 block w-[104px] rounded-[3px] border border-border-raised bg-surface p-[5px]">
						<span className="mb-[5px] flex items-center gap-1 border-border border-b pb-[5px]">
							<span className="block h-[4px] w-[4px] rounded-[1px] bg-thread" />
							<span className="block h-[3px] w-[46px] rounded-full bg-raised" />
						</span>
						{[0, 1, 2, 3].map((r) => (
							<span
								key={`pick-${String(r)}`}
								className={cn(
									"mb-[3px] flex h-[9px] items-center gap-1 rounded-[2px] px-1",
									r === 1 ? "bg-raised" : "",
								)}
							>
								<span className={cn("block h-[4px] w-[4px] rounded-[1px]", r === 1 ? "bg-thread" : "bg-border-raised")} />
								<span className="block h-[3px] w-[54px] rounded-full bg-border-raised/70" />
							</span>
						))}
					</span>
				</ThumbChrome>
			) : null}
			{id === "author" ? (
				<ThumbChrome tabs={1} rails={4}>
					<ThumbTile x={10} y={12} w={62} h={40} lit />
					<ThumbTile x={84} y={12} w={50} h={32} />
					<ThumbTile x={84} y={54} w={50} h={32} />
					<span className="absolute top-[58px] left-[10px] flex items-center gap-1 rounded-[2px] border border-border-raised bg-surface px-1 py-[2px] text-[6px] text-muted">
						<span className="block h-[3px] w-[3px] rounded-full bg-thread" />
						writing
					</span>
				</ThumbChrome>
			) : null}
			{id === "projects" ? (
				<ThumbChrome tabs={4} rails={4}>
					{[0, 1, 2].map((c) =>
						[0, 1].map((r) => (
							<ThumbTile
								key={`p-${String(c)}-${String(r)}`}
								x={9 + c * 52}
								y={10 + r * 46}
								w={44}
								h={30}
								lit={c === 2 && r === 0}
							/>
						)),
					)}
				</ThumbChrome>
			) : null}
			{id === "design" ? (
				<ThumbChrome tabs={4} rails={9}>
					{[0, 1, 2, 3, 4].map((c) =>
						[0, 1].map((r) => (
							<ThumbTile
								key={`d-${String(c)}-${String(r)}`}
								x={6 + c * 32}
								y={7 + r * 34}
								w={27}
								h={26}
							/>
						)),
					)}
					<span className="absolute right-[6px] bottom-[6px] text-[6px] text-thread">142 frames</span>
				</ThumbChrome>
			) : null}
		</div>
	);
}

/** the silhouette scaled to any box, aspect kept. */
export function ThumbScreen({ id, width }: { id: MomentId; width: number }) {
	const k = width / THUMB_W;
	return (
		<div className="relative overflow-hidden bg-bg" style={{ width, height: THUMB_H * k }}>
			<div
				className="absolute top-0 left-0"
				style={{ width: THUMB_W, height: THUMB_H, transformOrigin: "0 0", transform: `scale(${k})` }}
			>
				<RecThumb id={id} />
			</div>
		</div>
	);
}
