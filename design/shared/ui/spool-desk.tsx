import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

/**
 * The Mac the app is running on.
 *
 * Every frame on the `play-app` page draws this, because the question is what
 * play is once spool is a window rather than a tab — and a window can only be
 * judged against the screen it sits on, the other window beside it, and the
 * menu bar above it. A frame is a page, so the desktop has to be drawn.
 *
 * Three surfaces, three owners, the way `browser-tab.tsx` keeps them: the
 * desktop and the window frames are the OS and wear grey; the canvas inside the
 * window is spool and wears spool's tokens; the played page is Tidemark's and
 * wears Tidemark's. Anything red is spool's.
 *
 * The screen is 1920x1200 — a desk display rather than the laptop, since the
 * whole argument for a second window is what a big screen makes possible.
 */

export const DESK_W = 1920;
export const DESK_H = 1200;
export const MENU_H = 26;

/** Where a window may stand: under the menu bar, above the dock's resting strip. */
export const DESK_TOP = MENU_H;
export const DESK_BOTTOM = DESK_H - 8;

export function Desk({ menu = "Spool", children }: { menu?: string; children: ReactNode }) {
	return (
		<div
			className="relative h-full w-full overflow-hidden font-sans antialiased [font-synthesis:none]"
			style={{
				background:
					"radial-gradient(120% 90% at 22% 8%, #241d1a 0%, #16151a 42%, #0b0b0d 100%)",
			}}
		>
			{children}
			<MenuBar app={menu} />
		</div>
	);
}

function MenuBar({ app }: { app: string }) {
	return (
		<div
			className="absolute inset-x-0 top-0 z-50 flex items-center gap-4 bg-black/45 px-4 text-[#E6E6E8] backdrop-blur-md"
			style={{ height: MENU_H }}
		>
			<Apple />
			<span className="font-semibold text-xs leading-none">{app}</span>
			{["File", "Edit", "View", "Window", "Help"].map((item) => (
				<span key={item} className="text-xs leading-none opacity-80">
					{item}
				</span>
			))}
			<span className="ml-auto flex items-center gap-3.5 text-xs leading-none opacity-80">
				<Wifi />
				<span>100%</span>
				<span>Mon 09:41</span>
			</span>
		</div>
	);
}

function Apple() {
	return (
		<svg viewBox="0 0 14 16" className="h-3.5 w-3" fill="currentColor" aria-hidden="true">
			<path d="M11.2 8.5c0-1.7 1.4-2.5 1.4-2.6-.8-1.1-2-1.3-2.4-1.3-1-.1-2 .6-2.5.6s-1.3-.6-2.2-.6c-1.1 0-2.2.7-2.7 1.7-1.2 2-.3 5 .8 6.6.6.8 1.2 1.7 2.1 1.7.9 0 1.2-.6 2.2-.6s1.3.6 2.2.5c.9 0 1.5-.8 2-1.6.7-1 .9-1.9.9-2-.1 0-1.8-.7-1.8-2.4ZM9.6 3.2c.5-.6.8-1.4.7-2.2-.7 0-1.6.4-2.1 1-.4.5-.8 1.4-.7 2.2.8.1 1.6-.4 2.1-1Z" />
		</svg>
	);
}

function Wifi() {
	return (
		<svg viewBox="0 0 16 12" className="h-3 w-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
			<path d="M1 4.2a10 10 0 0 1 14 0M3.6 6.9a6.3 6.3 0 0 1 8.8 0M6.2 9.5a2.6 2.6 0 0 1 3.6 0" />
		</svg>
	);
}

/* ---------------------------------------------------------------- windows -- */

/**
 * Where the canvas window stands on every take, so the only thing that ever
 * moves between them is what play does. A hand put it here: not centred, not
 * maximised, which is how a window actually sits on a desk display.
 */
export const CANVAS_RECT = { x: 96, y: 92, w: 1420, h: 950 } as const;


export interface WindowRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * A window on that desk.
 *
 * `chrome` is the whole argument of this page, so it is a prop rather than four
 * copies of a component:
 *
 * - `titled` is what Electron gives you for free and what the canvas window is
 *   today: the OS title bar, the app's title centred in it.
 * - `slim` is a 30px bar spool draws itself with the lights inset into it
 *   (`titleBarStyle: "hiddenInset"`), so the bar can carry the frame's name and
 *   the switcher instead of a title nobody reads.
 * - `bare` hides the bar entirely and leaves the three lights floating over the
 *   page, which is what a video app does. The page runs to all four edges.
 */
export function AppWindow({
	rect,
	title,
	chrome = "titled",
	active = true,
	bar,
	className,
	style,
	children,
}: {
	rect: WindowRect;
	title?: string;
	chrome?: "titled" | "slim" | "bare";
	active?: boolean;
	/** What a `slim` bar carries instead of a centred title. */
	bar?: ReactNode;
	className?: string;
	style?: CSSProperties;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"absolute flex flex-col overflow-hidden rounded-[10px] border",
				active ? "border-white/12" : "border-white/6",
				className,
			)}
			style={{
				left: rect.x,
				top: rect.y,
				width: rect.w,
				height: rect.h,
				boxShadow: active
					? "0 34px 70px rgba(0,0,0,.62), 0 4px 14px rgba(0,0,0,.45)"
					: "0 16px 34px rgba(0,0,0,.45)",
				...style,
			}}
		>
			{chrome === "titled" && (
				<div className="relative flex h-[38px] shrink-0 items-center border-[#2A2A2E] border-b bg-[#232326] px-4">
					<Lights active={active} />
					<span
						className={cn(
							"-translate-x-1/2 absolute left-1/2 font-medium text-xs leading-none",
							active ? "text-[#D6D6DA]" : "text-[#75757A]",
						)}
					>
						{title}
					</span>
				</div>
			)}
			{chrome === "slim" && (
				<div className="flex h-[30px] shrink-0 items-center gap-3 border-border border-b bg-bg px-3.5">
					<Lights active={active} />
					{bar}
				</div>
			)}
			<div className="relative min-h-0 flex-1">
				{children}
				{chrome === "bare" && (
					<div className="absolute top-[13px] left-[13px] z-40">
						<Lights active={active} />
					</div>
				)}
			</div>
		</div>
	);
}

export function Lights({ active = true }: { active?: boolean }) {
	const colors = active ? ["#FF5F57", "#FEBC2E", "#28C840"] : ["#4A4A4E", "#4A4A4E", "#4A4A4E"];
	return (
		<span className="flex items-center gap-2">
			{colors.map((color, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: three lights, position is the identity
					key={i}
					className="h-3 w-3 rounded-full"
					style={{ background: color }}
				/>
			))}
		</span>
	);
}

/* ------------------------------------------------------------- the player -- */

/** Tidemark's landing, authored at this width. Every take plays the same page. */
export const AUTHORED_W = 1200;
export const AUTHORED_H = 2400;

export const FRAMES = ["home", "landing", "pricing", "docs", "changelog", "sign-up"];

/**
 * The edge bar, exactly the control the browser player ships (`play-tab--edge`,
 * #227): nothing at rest but a nub, a 300ms dwell against the top edge peels it
 * in, and moving back into the page puts it away. It is drawn here so a window
 * take and the takeover take wear the identical bar and only the container is
 * under test.
 */
export function EdgeBar({
	frame,
	project = "tidemark",
	exitLabel = "cmd w exits",
	onExit,
	children,
}: {
	frame: string;
	project?: string;
	exitLabel?: string;
	onExit?: (() => void) | undefined;
	children?: ReactNode;
}) {
	const { revealed, hostRef, hotspot } = useDwell();
	const [picking, setPicking] = useState(false);
	const open = revealed || picking;

	return (
		<div ref={hostRef} className="pointer-events-none absolute inset-0 z-30">
			<div className="pointer-events-auto absolute inset-x-0 top-0 h-2" {...hotspot} />
			<span
				className={cn(
					"-translate-x-1/2 absolute top-0 left-1/2 h-[3px] w-10 rounded-b-full bg-border-raised transition-opacity duration-200",
					open ? "opacity-0" : "opacity-70",
				)}
			/>
			<div
				className={cn(
					"absolute inset-x-0 top-0 transition-[translate,opacity] duration-200 ease-out",
					open ? "translate-y-0 opacity-100" : "-translate-y-full pointer-events-none opacity-0",
				)}
			>
				<div className="pointer-events-auto relative z-10 flex h-10 items-center gap-3 border-border-raised border-b bg-raised px-4">
					{children}
					<FrameSwitcher frame={frame} project={project} picking={picking} onPick={setPicking} />
					<span className="ml-auto flex items-center gap-3">
						<span className="font-mono text-2xs text-muted leading-none">{exitLabel}</span>
						<span className="h-3.5 w-px bg-border-raised" />
						<CloseButton onClick={onExit} />
					</span>
				</div>
				<div className="pointer-events-none absolute inset-x-0 top-10 h-14 bg-gradient-to-b from-bg to-transparent" />
				<div className="pointer-events-auto relative z-10" style={{ marginLeft: 104 }}>
					<FrameMenu frame={frame} open={picking} onPick={() => setPicking(false)} />
				</div>
			</div>
		</div>
	);
}

/**
 * The bar a `slim` window wears: the same controls the edge bar hides, except
 * that the title bar is where they were going to live anyway. A window this
 * shape costs 30px of page and never has to be summoned.
 */
export function PlayerSlimBar({
	frame,
	project = "tidemark",
	note,
	compact = false,
	onCanvas,
	onClose,
}: {
	frame: string;
	project?: string;
	note?: ReactNode;
	/** A window narrow enough that the bar has to choose: the name wins. */
	compact?: boolean;
	onCanvas?: (() => void) | undefined;
	onClose?: (() => void) | undefined;
}) {
	const [picking, setPicking] = useState(false);
	return (
		<div className={cn("relative flex min-w-0 flex-1 items-center gap-3", compact ? "pl-1.5" : "pl-3")}>
			<CanvasButton label={compact ? "" : "canvas"} onClick={onCanvas} />
			<FrameSwitcher frame={frame} project={compact ? undefined : project} picking={picking} onPick={setPicking} />
			<span className="ml-auto flex items-center gap-3">
				{note !== undefined && !compact && (
					<span className="whitespace-nowrap font-mono text-2xs text-muted leading-none">{note}</span>
				)}
				<span className="h-3.5 w-px bg-border-raised" />
				<CloseButton onClick={onClose} />
			</span>
			<div className="absolute top-[26px] left-[104px] z-40">
				<FrameMenu frame={frame} open={picking} onPick={() => setPicking(false)} />
			</div>
		</div>
	);
}

function FrameSwitcher({
	frame,
	project,
	picking,
	onPick,
}: {
	frame: string;
	project?: string | undefined;
	picking: boolean;
	onPick: (next: (open: boolean) => boolean) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onPick((p) => !p)}
			className="-mx-1.5 flex cursor-pointer items-center gap-2 rounded-xs px-1.5 py-1 font-mono text-sm text-text leading-none transition-colors hover:bg-surface"
		>
			{project !== undefined && <span className="text-muted">{project} /</span>}
			{frame}
			<svg viewBox="0 0 10 10" className={cn("h-2.5 w-2.5 text-muted transition-transform", picking && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				<path d="m2 4 3 3 3-3" />
			</svg>
		</button>
	);
}

function FrameMenu({ frame, open, onPick }: { frame: string; open: boolean; onPick: () => void }) {
	return (
		<div
			className={cn(
				"w-[212px] overflow-hidden rounded-b-lg border-border-raised border-r border-b border-l bg-canvas transition-[opacity,translate] duration-150",
				open ? "opacity-100" : "-translate-y-1 pointer-events-none opacity-0",
			)}
		>
			<div className="flex flex-col p-1.5">
				{FRAMES.map((name) => (
					<button
						key={name}
						type="button"
						onClick={onPick}
						className={cn(
							"flex cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 text-left font-mono text-sm leading-none transition-colors hover:bg-surface",
							name === frame ? "text-text" : "text-muted hover:text-text",
						)}
					>
						<span className={cn("h-[2px] w-2", name === frame ? "bg-thread" : "bg-transparent")} />
						{name}
					</button>
				))}
			</div>
			<div className="border-border border-t px-3.5 py-2 font-mono text-2xs text-muted leading-none">
				6 frames · cmd k
			</div>
		</div>
	);
}

function CloseButton({ onClick }: { onClick?: (() => void) | undefined }) {
	return (
		<button
			type="button"
			aria-label="Close"
			onClick={onClick}
			className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-xs text-muted transition-colors hover:bg-surface hover:text-text"
		>
			<svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
				<path d="M2 2 8 8M8 2 2 8" />
			</svg>
		</button>
	);
}

/** Back to the canvas, for the takes where the canvas is behind this window. */
export function CanvasButton({ label = "canvas", onClick }: { label?: string; onClick?: (() => void) | undefined }) {
	return (
		<>
			<button
				type="button"
				onClick={onClick}
				aria-label="Back to the canvas"
				className={cn(
					"flex cursor-pointer items-center gap-1.5 rounded-xs py-1 pl-1 font-mono text-2xs text-muted leading-none transition-colors hover:text-text",
					label === "" ? "pr-1" : "pr-2",
				)}
			>
				<svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
					<path d="m10 3.5-4.5 4.5 4.5 4.5" />
				</svg>
				{label}
			</button>
			<span className="h-3.5 w-px bg-border-raised" />
		</>
	);
}

/**
 * The dwell the hidden macOS menu bar uses: rest against the edge for 300ms and
 * it comes down, cross back into the page and it is gone at once. Hiding never
 * earns a delay — only the reveal does.
 */
export function useDwell(delay = 300, leave = 140) {
	const [revealed, setRevealed] = useState(false);
	const hostRef = useRef<HTMLDivElement>(null);
	const timer = useRef<number>(undefined);

	useEffect(() => {
		const onMove = (event: PointerEvent) => {
			const top = hostRef.current?.getBoundingClientRect().top ?? 0;
			if (event.clientY - top > leave) setRevealed(false);
		};
		window.addEventListener("pointermove", onMove);
		return () => window.removeEventListener("pointermove", onMove);
	}, [leave]);

	useEffect(() => () => window.clearTimeout(timer.current), []);

	return {
		revealed,
		hostRef,
		hotspot: {
			onPointerEnter: () => {
				timer.current = window.setTimeout(() => setRevealed(true), delay);
			},
			onPointerLeave: () => window.clearTimeout(timer.current),
		},
	};
}

/* ------------------------------------------------------------- the frame's own controls -- */

/**
 * The prototype's own control, standing on the wallpaper rather than inside the
 * app: press it to play, press it again to come back. It wears spool's mono at
 * its smallest so it never reads as something the product ships.
 */
export function DeskControl({
	playing,
	onToggle,
	label,
	note,
}: {
	playing: boolean;
	onToggle: () => void;
	label: string;
	note: string;
}) {
	return (
		<div className="absolute bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-black/55 px-4 py-2 backdrop-blur-md">
			<button
				type="button"
				onClick={onToggle}
				className="flex cursor-pointer items-center gap-2 font-mono text-text text-xs leading-none"
			>
				<span className="h-[2px] w-2.5 bg-thread" />
				{playing ? "close" : label}
			</button>
			<span className="h-3 w-px bg-white/12" />
			<span className="font-mono text-[#9A9AA0] text-2xs leading-none">{note}</span>
		</div>
	);
}

/** The one line of argument each take carries, in the corner of its own screen. */
export function DeskCaption({ children }: { children: ReactNode }) {
	return (
		<p className="absolute bottom-6 left-8 z-40 max-w-[420px] font-mono text-[#8A8A90] text-2xs leading-4">
			{children}
		</p>
	);
}

/** A window's measurements, said the way the canvas says a frame's. */
export function SizeReadout({ text, rect }: { text: string; rect: { x: number; y: number } }) {
	return (
		<span
			className="absolute z-40 font-mono text-[#9A9AA0] text-2xs leading-none"
			style={{ left: rect.x, top: rect.y }}
		>
			{text}
		</span>
	);
}
