import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * site-terminal--drag. The spool.page landing argued from the gesture.
 *
 * The take: installing spool on a Mac is one drag, so the fold is that drag and
 * you can do it. Spool.dmg sits on the left of the stage, Applications sits on
 * the right, and the canvas waits underneath at a fifth of its brightness. Drop
 * the file where it goes and the canvas comes up lit, the headline answers, and
 * the page hands you the next move. Nothing about it is a video of an install.
 *
 * npm is on the page and it is quiet: one line under the button, because the
 * file is the shorter road and the page should say which one it means.
 *
 * Below the fold, three bands for the three things that happen next, then the
 * proof, the walkthrough and the licence.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/* ---------- reveal ---------- */

function useReveal<T extends HTMLElement>(rootRef: React.RefObject<HTMLDivElement | null>) {
	const ref = useRef<T | null>(null);
	const [shown, setShown] = useState(false);
	useEffect(() => {
		const el = ref.current;
		const root = rootRef.current;
		if (el === null || root === null) return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) if (entry.isIntersecting) setShown(true);
			},
			{ root, rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
		);
		io.observe(el);
		return () => {
			io.disconnect();
		};
	}, [rootRef]);
	return { ref, shown };
}

function Reveal({
	rootRef,
	delay = 0,
	className,
	children,
}: {
	rootRef: React.RefObject<HTMLDivElement | null>;
	delay?: number;
	className?: string;
	children: ReactNode;
}) {
	const { ref, shown } = useReveal<HTMLDivElement>(rootRef);
	const reduce = useReducedMotion() === true;
	return (
		<motion.div
			ref={ref}
			className={className}
			initial={false}
			animate={{ opacity: shown ? 1 : 0, y: shown || reduce ? 0 : 18 }}
			transition={{ duration: reduce ? 0.2 : 0.62, ease: EASE, delay: shown ? delay : 0 }}
		>
			{children}
		</motion.div>
	);
}

/* ---------- glyphs and the one command ---------- */

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function Tick({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M2.5 6.4 4.9 8.7 9.5 3.4"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CopyGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<rect x="4.4" y="4.4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
			<path
				d="M2.7 7.6h-.45a.8.8 0 0 1-.8-.8V2.3a.8.8 0 0 1 .8-.8h4.5a.8.8 0 0 1 .8.8v.5"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function DownloadGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" fill="none" aria-hidden="true" className={className}>
			<path
				d="M7 1.8v7.4M3.9 6.3 7 9.4l3.1-3.1M2.4 11.9h9.2"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function PlusGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path d="M6 2.2v7.6M2.2 6h7.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

const dotGrid = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 9%, transparent) 1px, transparent 1px)",
	backgroundSize: "24px 24px",
	backgroundPosition: "-1px -1px",
} as const;

/** the page's only command, kept small and kept honest about where it runs. */
function InstallLine({ prompt, command }: { prompt: string; command: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);
	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);
	return (
		<button
			type="button"
			aria-label={copied ? `Copied ${command}` : `Copy ${command}`}
			onClick={() => {
				void copyText(command).then((ok) => {
					if (!ok) return;
					setCopied(true);
					if (timer.current !== null) window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => setCopied(false), 1600);
				});
			}}
			className="group/line flex w-fit cursor-pointer items-center gap-2.5 text-left focus-visible:outline-none"
		>
			<span className="select-none font-mono text-[13px] text-muted/70 leading-none">{prompt}</span>
			<span
				className={cn(
					"font-mono text-[14px] leading-none transition-colors duration-200",
					copied ? "text-thread" : "text-text/85 group-hover/line:text-text",
				)}
			>
				{command}
			</span>
			<span className="relative block h-3 w-3 shrink-0">
				<CopyGlyph
					className={cn(
						"absolute inset-0 h-3 w-3 text-muted/60 transition-opacity duration-200",
						copied ? "opacity-0" : "group-hover/line:text-text",
					)}
				/>
				<Tick
					className={cn(
						"absolute inset-0 h-3 w-3 text-thread transition-opacity duration-200",
						copied ? "opacity-100" : "opacity-0",
					)}
				/>
			</span>
		</button>
	);
}

/* ---------- the two objects on the stage ---------- */

function AppIcon({ size, className }: { size: number; className?: string }) {
	return (
		<span
			className={cn("relative block", className)}
			style={{
				width: size,
				height: size,
				borderRadius: size * 0.235,
				background: "linear-gradient(157deg, #262626 0%, #131313 76%)",
				border: "1px solid var(--color-border-raised)",
			}}
		>
			<span className="absolute inset-0 flex items-center justify-center">
				<span className="block" style={{ width: size * 0.36, height: size * 0.46 }}>
					<SpoolMark className="h-full w-full text-thread" />
				</span>
			</span>
		</span>
	);
}

function FolderIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={className}>
			<path
				d="M4 10h11l3.4 4H36v18H4z"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/* ---------- the canvas that comes up ---------- */

interface Tile {
	x: number;
	y: number;
	w: number;
	h: number;
	kind: "form" | "list" | "card";
}

const TILES: readonly Tile[] = [
	{ x: 40, y: 34, w: 168, h: 116, kind: "form" },
	{ x: 244, y: 34, w: 168, h: 116, kind: "list" },
	{ x: 448, y: 34, w: 168, h: 116, kind: "card" },
	{ x: 40, y: 186, w: 168, h: 116, kind: "list" },
	{ x: 244, y: 186, w: 168, h: 116, kind: "card" },
	{ x: 448, y: 186, w: 168, h: 116, kind: "form" },
];

function TileBody({ kind }: { kind: Tile["kind"] }) {
	if (kind === "list") {
		return (
			<div className="space-y-[7px] p-3">
				<div className="h-[7px] w-[52%] rounded-[1px] bg-raised" />
				{[88, 72, 80, 64].map((w) => (
					<div key={w} className="h-[3px] rounded-full bg-border-raised" style={{ width: `${w}%` }} />
				))}
			</div>
		);
	}
	if (kind === "card") {
		return (
			<div className="p-3">
				<div className="h-[38px] rounded-[3px] bg-raised/70" />
				<div className="mt-2.5 space-y-[6px]">
					<div className="h-[3px] w-[76%] rounded-full bg-border-raised" />
					<div className="h-[3px] w-[54%] rounded-full bg-border-raised" />
				</div>
				<div className="mt-3 h-[11px] w-[46%] rounded-[2px] bg-thread/70" />
			</div>
		);
	}
	return (
		<div className="space-y-[8px] p-3">
			<div className="h-[7px] w-[46%] rounded-[1px] bg-raised" />
			<div className="h-[14px] rounded-[3px] border border-border-raised" />
			<div className="h-[14px] rounded-[3px] border border-border-raised" />
			<div className="mt-1 h-[13px] w-[42%] rounded-[2px] bg-thread/70" />
		</div>
	);
}

/**
 * The canvas, cropped by the bottom of the fold. Before the drop it is dim and
 * still; after it, it is lit and its project has a name. Only opacity and one
 * translate move, so the rise never costs a layout.
 */
function CanvasStage({ lit }: { lit: boolean }) {
	const reduce = useReducedMotion() === true;
	return (
		<motion.div
			className="absolute overflow-hidden rounded-t-lg border border-border-raised border-b-0 bg-bg"
			style={{ left: 0, top: 0, width: 880, height: 420 }}
			initial={false}
			animate={{ opacity: lit ? 1 : 0.3, y: lit || reduce ? 0 : 18 }}
			transition={{ duration: reduce ? 0.2 : 0.72, ease: EASE }}
		>
			<div className="flex h-[38px] items-center gap-2.5 border-border border-b bg-canvas px-4">
				<span
					className={cn(
						"block h-[6px] w-[6px] rounded-full transition-colors duration-500",
						lit ? "bg-thread" : "bg-border-raised",
					)}
				/>
				<span className="font-mono text-[11px] text-muted leading-none">{lit ? "tvarso" : "spool"}</span>
				<span className="ml-2 flex h-[20px] w-[20px] items-center justify-center rounded-xs text-muted/60">
					<PlusGlyph className="h-2.5 w-2.5" />
				</span>
			</div>
			<div className="flex h-[382px]">
				<div className="w-[150px] shrink-0 border-border border-r bg-canvas py-2.5">
					{["checkout", "account", "search", "settings"].map((n, i) => (
						<div
							key={n}
							className={cn(
								"flex h-[24px] items-center gap-2 px-4 font-mono text-[11px] leading-none",
								i === 0 && lit ? "bg-raised text-text" : "text-muted",
							)}
						>
							<span className={cn("text-[7px]", i === 0 && lit ? "text-thread" : "text-muted/60")}>
								▸
							</span>
							{n}
						</div>
					))}
				</div>
				<div className="relative flex-1" style={dotGrid}>
					{TILES.map((t, i) => (
						<motion.div
							key={`${t.x}-${t.y}`}
							className="absolute overflow-hidden rounded-[4px] border border-border bg-canvas"
							style={{ left: t.x, top: t.y, width: t.w, height: t.h }}
							initial={false}
							animate={{ opacity: lit ? 1 : 0.5, y: lit || reduce ? 0 : 6 }}
							transition={{
								duration: reduce ? 0.2 : 0.5,
								ease: EASE,
								delay: lit && !reduce ? 0.14 + i * 0.05 : 0,
							}}
						>
							<TileBody kind={t.kind} />
						</motion.div>
					))}
				</div>
			</div>
		</motion.div>
	);
}

/* ---------- the drag ---------- */

const ICON = 128;

function DragStage({ installed, onInstall }: { installed: boolean; onInstall: () => void }) {
	const reduce = useReducedMotion() === true;
	const targetRef = useRef<HTMLDivElement | null>(null);
	const [over, setOver] = useState(false);
	const [dragging, setDragging] = useState(false);

	function hits(event: MouseEvent | TouchEvent | PointerEvent): boolean {
		const box = targetRef.current?.getBoundingClientRect();
		if (box === undefined) return false;
		if (!("clientX" in event)) return false;
		const { clientX, clientY } = event;
		return clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom;
	}

	return (
		<div className="relative" style={{ width: 620, height: 210 }}>
			{/* the path it takes, drawn once so the gesture is legible at rest */}
			<svg
				viewBox="0 0 620 210"
				fill="none"
				aria-hidden="true"
				className="absolute inset-0 h-full w-full overflow-visible"
			>
				<path
					d="M150 84 C 230 22, 350 22, 428 84"
					stroke="color-mix(in srgb, var(--color-text) 16%, transparent)"
					strokeWidth="1"
					strokeDasharray="3 6"
					strokeLinecap="round"
					className={cn("transition-opacity duration-500", installed ? "opacity-0" : "opacity-100")}
				/>
			</svg>

			{/* Applications */}
			<div className="absolute top-[20px] left-[420px]">
				<div
					ref={targetRef}
					className={cn(
						"relative flex items-center justify-center border border-dashed transition-colors duration-200",
						over && !installed ? "border-thread bg-thread/10" : "border-border-raised",
						installed && "border-transparent border-solid",
					)}
					style={{ width: ICON, height: ICON, borderRadius: ICON * 0.235 }}
				>
					<AnimatePresence initial={false} mode="wait">
						{installed ? (
							<motion.span
								key="landed"
								initial={{ scale: reduce ? 1 : 0.82, opacity: 0 }}
								animate={{ scale: 1, opacity: 1 }}
								transition={{ duration: reduce ? 0.15 : 0.34, ease: EASE }}
							>
								<AppIcon size={ICON} />
							</motion.span>
						) : (
							<motion.span
								key="empty"
								initial={false}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0, transition: { duration: 0.12 } }}
								className="text-muted/50"
							>
								<FolderIcon className="h-11 w-11" />
							</motion.span>
						)}
					</AnimatePresence>
				</div>
				<div className="mt-4 text-center font-mono text-[11px] text-muted/70 leading-none">
					{installed ? "applications / spool" : "applications"}
				</div>
			</div>

			{/* Spool.dmg, the thing your hand moves */}
			<motion.div
				className={cn("absolute top-[20px] left-[22px]", installed ? "cursor-default" : "cursor-grab")}
				drag={!installed && !reduce}
				dragMomentum={false}
				dragElastic={0.08}
				dragSnapToOrigin
				whileDrag={{ scale: 1.05, cursor: "grabbing", zIndex: 40 }}
				onDragStart={() => setDragging(true)}
				onDrag={(event: MouseEvent | TouchEvent | PointerEvent) => setOver(hits(event))}
				onDragEnd={(event: MouseEvent | TouchEvent | PointerEvent) => {
					setDragging(false);
					const landed = hits(event);
					setOver(false);
					if (landed) onInstall();
				}}
				initial={false}
				animate={{ opacity: installed ? 0 : 1, scale: installed ? 0.86 : 1 }}
				transition={{ duration: 0.26, ease: EASE }}
				style={{ pointerEvents: installed ? "none" : "auto" }}
			>
				<AppIcon size={ICON} />
				<div className="mt-4 text-center font-mono text-[11px] text-muted/70 leading-none">
					{dragging ? "drop it in" : "spool.dmg"}
				</div>
			</motion.div>
		</div>
	);
}

/* ---------- the three things that happen next ---------- */

function EmptyPanel() {
	return (
		<div className="overflow-hidden rounded-lg border border-border bg-bg">
			<div className="flex h-[34px] items-center gap-2.5 border-border border-b bg-canvas px-4">
				<span className="block h-[6px] w-[6px] rounded-full bg-border-raised" />
				<span className="font-mono text-[11px] text-muted/70 leading-none">no project</span>
			</div>
			<div className="relative flex h-[330px] flex-col items-center justify-center gap-3.5" style={dotGrid}>
				<SpoolMark className="h-[30px] w-[23px] text-thread/30" />
				<span className="font-mono text-[12px] text-muted/80 leading-none">no frames yet</span>
			</div>
		</div>
	);
}

function PickPanel() {
	const reduce = useReducedMotion() === true;
	const rows = ["Documents", "code", "tvarso", "kaffe", "notes", "sketches"];
	return (
		<div className="overflow-hidden rounded-lg border border-border bg-bg">
			<div className="flex h-[34px] items-center gap-2.5 border-border border-b bg-canvas px-4">
				<span className="relative flex h-[20px] w-[20px] items-center justify-center rounded-xs bg-thread text-on-thread">
					<PlusGlyph className="h-2.5 w-2.5" />
					{reduce ? null : (
						<motion.span
							className="-inset-[5px] absolute rounded-sm border border-thread/45"
							animate={{ opacity: [0.2, 0.85, 0.2], scale: [0.94, 1.06, 0.94] }}
							transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
						/>
					)}
				</span>
				<span className="font-mono text-[11px] text-muted leading-none">open a folder</span>
			</div>
			<div className="h-[330px] bg-canvas/40 py-4">
				{rows.map((r, i) => (
					<div
						key={r}
						className={cn(
							"flex h-[34px] items-center gap-3 px-5 font-mono text-[12px] leading-none",
							i === 2 ? "bg-raised text-text" : "text-muted",
						)}
					>
						<FolderIcon className={cn("h-4 w-4 shrink-0", i === 2 ? "text-thread" : "text-muted/60")} />
						{r}
						{i === 2 ? <span className="ml-auto text-[11px] text-muted/60">git repo</span> : null}
					</div>
				))}
			</div>
		</div>
	);
}

function FillPanel() {
	const reduce = useReducedMotion() === true;
	return (
		<div className="overflow-hidden rounded-lg border border-border bg-bg">
			<div className="flex h-[34px] items-stretch border-border border-b bg-canvas pl-3">
				{["tvarso", "kaffe", "spool"].map((p, i) => (
					<div
						key={p}
						className={cn(
							"flex items-center gap-2 px-3.5 font-mono text-[11px] leading-none",
							i === 0 ? "text-text" : "text-muted/70",
						)}
					>
						<span
							className={cn(
								"block h-[5px] w-[5px] rounded-full",
								i === 0 ? "bg-thread" : "bg-border-raised",
							)}
						/>
						{p}
					</div>
				))}
			</div>
			<div className="flex h-[330px]">
				<div className="w-[112px] shrink-0 border-border border-r bg-canvas py-2.5">
					{["checkout", "account", "search"].map((n, i) => (
						<div
							key={n}
							className={cn(
								"flex h-[24px] items-center gap-2 px-3 font-mono text-[11px] leading-none",
								i === 0 ? "bg-raised text-text" : "text-muted",
							)}
						>
							<span className={cn("text-[7px]", i === 0 ? "text-thread" : "text-muted/60")}>▸</span>
							{n}
						</div>
					))}
				</div>
				<div className="relative flex-1" style={dotGrid}>
					{[
						{ x: 26, y: 26, w: 128, h: 92 },
						{ x: 178, y: 26, w: 128, h: 92 },
						{ x: 26, y: 142, w: 128, h: 92 },
						{ x: 178, y: 142, w: 128, h: 92 },
					].map((t, i) => (
						<motion.div
							key={`${t.x}-${t.y}`}
							className="absolute overflow-hidden rounded-[3px] border border-border bg-canvas"
							style={{ left: t.x, top: t.y, width: t.w, height: t.h }}
							initial={false}
							animate={reduce ? undefined : { opacity: [0, 1], y: [8, 0] }}
							transition={{ duration: 0.55, ease: EASE, delay: 0.15 + i * 0.14 }}
						>
							<TileBody kind={i % 2 === 0 ? "form" : "list"} />
						</motion.div>
					))}
				</div>
			</div>
		</div>
	);
}

function Band({
	title,
	body,
	aside,
	flip = false,
	children,
	rootRef,
}: {
	title: string;
	body: string;
	aside: string;
	flip?: boolean;
	children: ReactNode;
	rootRef: React.RefObject<HTMLDivElement | null>;
}) {
	return (
		<Reveal rootRef={rootRef}>
			<div className={cn("flex items-center gap-[88px]", flip && "flex-row-reverse")}>
				<div className="w-[400px] shrink-0">
					<h2 className="font-semibold text-[36px] leading-[1.08] tracking-[-0.026em]">{title}</h2>
					<p className="mt-5 text-[15px] text-muted leading-[25px]">{body}</p>
					<div className="mt-7 flex gap-4">
						<span className="w-px shrink-0 self-stretch bg-thread/60" />
						<p className="font-mono text-[12px] text-muted leading-[21px]">{aside}</p>
					</div>
				</div>
				<div className="min-w-0 flex-1">{children}</div>
			</div>
		</Reveal>
	);
}

/* ---------- proof ---------- */

const PAGES: readonly { name: string; n: number }[] = [
	{ name: "variants", n: 45 },
	{ name: "agent", n: 27 },
	{ name: "booting", n: 20 },
	{ name: "manipulate", n: 14 },
	{ name: "site", n: 11 },
	{ name: "explorer", n: 8 },
	{ name: "dock", n: 7 },
	{ name: "app", n: 7 },
	{ name: "picker", n: 6 },
	{ name: "components", n: 6 },
	{ name: "play-tab", n: 4 },
	{ name: "play-inline", n: 3 },
	{ name: "directing", n: 1 },
];

const TOTAL = PAGES.reduce((a, p) => a + p.n, 0);

/* ---------- video ---------- */

function VideoSlot() {
	const [hover, setHover] = useState(false);
	return (
		<button
			type="button"
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			className="block w-full cursor-pointer overflow-hidden rounded-lg border border-border bg-canvas text-left transition-colors duration-300 hover:border-border-raised focus-visible:outline-none"
		>
			<div className="relative flex h-[460px] items-center justify-center" style={dotGrid}>
				<span
					className={cn(
						"flex h-[60px] w-[60px] items-center justify-center rounded-full border transition-all duration-300",
						hover ? "border-thread bg-thread" : "border-border-raised bg-bg/70",
					)}
				>
					<svg
						viewBox="0 0 12 12"
						fill="currentColor"
						aria-hidden="true"
						className={cn(
							"ml-[3px] h-3.5 w-3.5 transition-colors duration-300",
							hover ? "text-on-thread" : "text-text",
						)}
					>
						<path d="M2.6 1.5 10 6 2.6 10.5Z" />
					</svg>
				</span>
				<span className="absolute bottom-5 left-6 font-mono text-[11px] text-muted leading-none">
					getting started · 4:52
				</span>
			</div>
		</button>
	);
}

/* ---------- the page ---------- */

export default function SiteTerminalDrag() {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const [installed, setInstalled] = useState(false);

	return (
		<div
			ref={rootRef}
			className="h-full w-full overflow-y-auto bg-bg font-sans text-text antialiased [font-synthesis:none]"
		>
			{/* the fold: one gesture, full bleed to the right edge */}
			<section className="relative h-[900px] overflow-hidden">
				<header className="relative z-20 flex h-[84px] items-center justify-between px-[112px]">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-[19px] w-[15px] text-thread" title="spool" />
						<span className="font-medium text-[15px] tracking-[-0.01em]">spool</span>
					</div>
					<nav className="flex items-center gap-8 text-[13px] text-muted">
						<span className="font-mono text-[12px]">v0.6.0</span>
						<span className="cursor-pointer transition-colors duration-200 hover:text-text">Docs</span>
						<span className="cursor-pointer transition-colors duration-200 hover:text-text">GitHub</span>
					</nav>
				</header>

				{/* the words */}
				<div className="absolute top-[210px] left-[112px] z-20 w-[460px]">
					<AnimatePresence initial={false} mode="wait">
						<motion.div
							key={installed ? "after" : "before"}
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
							transition={{ duration: 0.42, ease: EASE, delay: 0.06 }}
						>
							<h1 className="font-semibold text-[82px] leading-[0.98] tracking-[-0.038em]">
								{installed ? "That was it." : "Drag it in."}
							</h1>
							<p className="mt-7 max-w-[420px] text-[16px] text-muted leading-[26px]">
								{installed
									? "spool is on your machine and the canvas is up. Press + and point it at a folder you already have."
									: "That is the whole install on a Mac. The file on the right is the real one, and the canvas underneath comes up when it lands."}
							</p>
						</motion.div>
					</AnimatePresence>

					<div className="mt-9 flex items-center gap-5">
						<button
							type="button"
							className="flex h-[46px] cursor-pointer items-center gap-2.5 rounded-md bg-thread px-5 font-medium text-[14px] text-on-thread leading-none transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none"
						>
							<DownloadGlyph className="h-3.5 w-3.5" />
							Download Spool.dmg
						</button>
						<span className="font-mono text-[11px] text-muted/70 leading-[18px]">
							84 mb
							<br />
							apple silicon
						</span>
					</div>

					<div className="mt-10 border-border border-t pt-7">
						<p className="text-[14px] text-muted leading-[22px]">
							There is an npm install as well. It wants Node 22 or newer.
						</p>
						<div className="mt-3.5">
							<InstallLine prompt="~ $" command="npm i -g spool.page" />
						</div>
					</div>
				</div>

				{/* the stage */}
				<div className="absolute top-[196px] left-[700px] z-10">
					<DragStage installed={installed} onInstall={() => setInstalled(true)} />
				</div>
				<div className="absolute top-[480px] left-[700px]">
					<CanvasStage lit={installed} />
				</div>

				{/* the page keeps going, and says so quietly */}
				<div className="absolute bottom-[74px] left-[112px] z-20">
					<span className="mb-4 block h-px w-[72px] bg-border-raised" />
					<span className="font-mono text-[12px] text-muted/70 leading-none">
						what happens after it lands
					</span>
				</div>

				{/* the way back, offered only once there is something to undo */}
				<AnimatePresence>
					{installed ? (
						<motion.button
							key="reset"
							type="button"
							onClick={() => setInstalled(false)}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.3, delay: 0.4 }}
							className="absolute top-[418px] left-[700px] z-20 cursor-pointer font-mono text-[11px] text-muted/60 leading-none transition-colors duration-200 hover:text-text focus-visible:outline-none"
						>
							put it back
						</motion.button>
					) : null}
				</AnimatePresence>
			</section>

			{/* what happens next */}
			<div className="mx-auto w-[1200px]">
				<section className="space-y-[104px] border-border border-t pt-[96px] pb-[104px]">
					<Band
						rootRef={rootRef}
						title="First run is empty."
						body="spool holds nothing until you hand it a folder. It opens and says so, which is the honest version of a welcome screen."
						aside={"no frames yet"}
					>
						<EmptyPanel />
					</Band>
					<Band
						rootRef={rootRef}
						flip
						title="+ takes any folder."
						body="Point it at a repo you already have. A design/ folder appears beside your source and it is yours: plain files, tracked by your git, readable in your editor. Open as many projects as you like and each keeps its own tab."
						aside={"design/frames/<page>/<name>/frame.tsx"}
					>
						<PickPanel />
					</Band>
					<Band
						rootRef={rootRef}
						title="Then it fills up."
						body="Your agent writes a TSX file into that folder and the frame appears on the canvas, live. Arrange them, link them, and click through the flow the way a user would."
						aside={"one folder, one component, one frame"}
					>
						<FillPanel />
					</Band>
				</section>

				{/* proof */}
				<section className="border-border border-t pt-[92px] pb-[100px]">
					<Reveal rootRef={rootRef}>
						<div className="grid grid-cols-[520px_1fr] gap-[88px]">
							<div>
								<h2 className="font-semibold text-[40px] leading-[1.06] tracking-[-0.028em]">
									I made this for myself.
								</h2>
								<p className="mt-6 text-[15px] text-muted leading-[25px]">
									Then I kept using it. spool designs spool, in a canvas that lives in this repo, and
									the column beside this is what is in it today.
								</p>
								<div className="mt-9 flex items-baseline gap-4">
									<span className="font-semibold text-[68px] leading-none tracking-[-0.034em] tabular-nums">
										{TOTAL}
									</span>
									<span className="font-mono text-[12px] text-muted leading-none">
										frames · {PAGES.length} pages
									</span>
								</div>
							</div>
							<div className="columns-2 gap-x-14">
								{PAGES.map((p) => (
									<div
										key={p.name}
										className="flex items-baseline justify-between border-border border-b py-[9px] font-mono text-[13px] leading-none"
									>
										<span className="text-muted">{p.name}</span>
										<span className="text-text/80 tabular-nums">{p.n}</span>
									</div>
								))}
							</div>
						</div>
					</Reveal>
				</section>

				{/* video */}
				<section className="border-border border-t pt-[92px] pb-[100px]">
					<Reveal rootRef={rootRef}>
						<div className="flex items-end justify-between gap-16 pb-9">
							<h2 className="font-semibold text-[40px] leading-[1.06] tracking-[-0.028em]">
								Watch someone do it once.
							</h2>
							<p className="mb-2 w-[340px] shrink-0 text-[14px] text-muted leading-[23px]">
								Install, open a folder, and walk a three screen flow. One take, no cuts.
							</p>
						</div>
						<VideoSlot />
					</Reveal>
				</section>

				{/* licence */}
				<section className="border-border border-t pt-[92px] pb-[64px]">
					<Reveal rootRef={rootRef}>
						<div className="flex items-end justify-between gap-16">
							<h2 className="max-w-[740px] font-semibold text-[44px] leading-[1.06] tracking-[-0.028em]">
								MIT. Fork it, rework it, rename it, ship it.
							</h2>
							<p className="mb-2 w-[300px] shrink-0 text-[14px] text-muted leading-[23px]">
								It is a tool for designing things. Make it your own if you want to.
							</p>
						</div>
					</Reveal>
				</section>

				<footer className="flex items-center justify-between border-border border-t py-8">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-4 w-[13px] text-thread" />
						<span className="text-[13px] text-muted">spool.page</span>
					</div>
					<div className="flex items-center gap-7 font-mono text-[11px] text-muted/70">
						<span>github.com/liamvinberg/spool</span>
						<span>node 22+</span>
						<span>best in Chrome</span>
					</div>
				</footer>
			</div>
		</div>
	);
}
