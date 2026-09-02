import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * site-desk--window. The Mac app argued by putting the reader on the desktop it
 * runs on.
 *
 * The page is not a page with a screenshot in it. The page is the desktop: a
 * menu bar across the top which is also the site's navigation, a dock along the
 * bottom with Spool running in it, and one window standing on the ground with
 * the canvas inside. The landing copy sits on the wallpaper beside the window,
 * the way a note sits on a desk, so the reader is looking at the product in the
 * place the product lives rather than at a picture of it.
 *
 * The whole claim of this take is spatial: you get a window, it has a dock icon,
 * and it opens a folder that is already on your disk. Nothing here is centered
 * and nothing is stacked in a column, because that composition would be arguing
 * for a web app.
 *
 * Everything drawn is real. The menu bar carries Spool's own menus, the dock
 * icon carries the running dot, the window title is the folder the canvas is
 * open on, and the size and floor under the download button are the ones in
 * desktop/README.md.
 *
 * One pose, 1440x900, no scroll. Motion is a slow pointer parallax on the
 * window and its shadow, which is the only thing on the page that has to feel
 * like an object.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/* ── the ground ───────────────────────────────────────────────────────── */

/**
 * The desktop, which is a wallpaper rather than a page background: one warm
 * bloom low and right, where the window stands, and a cold one high and left so
 * the copy column does not sit on flat black.
 */
const wallpaper: CSSProperties = {
	background: [
		"radial-gradient(1100px 720px at 78% 86%, color-mix(in srgb, var(--color-thread) 13%, transparent), transparent 70%)",
		"radial-gradient(900px 620px at 12% 8%, color-mix(in srgb, var(--color-text) 6%, transparent), transparent 68%)",
		"linear-gradient(165deg, #131313 0%, #0E0E0E 46%, #0A0A0A 100%)",
	].join(","),
};

const dotGrid: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 10%, transparent) 1px, transparent 1px)",
	backgroundSize: "26px 26px",
	backgroundPosition: "-1px -1px",
};

/**
 * A window's depth, not a card's lift: one wide ambient pool under the whole
 * body and a hairline of light along the top edge, which is what macOS draws
 * and what makes the thing read as standing on the ground.
 */
const windowDepth: CSSProperties = {
	boxShadow: [
		"0 2px 2px rgba(0,0,0,0.28)",
		"0 22px 44px rgba(0,0,0,0.44)",
		"0 64px 130px -18px rgba(0,0,0,0.78)",
		"inset 0 1px 0 rgba(255,255,255,0.07)",
	].join(","),
};

/* ── glyphs ───────────────────────────────────────────────────────────── */

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

function FrameGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

function DownGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path
				d="M7 2v7.2M3.9 6.4 7 9.5l3.1-3.1M2.6 12h8.8"
				stroke="currentColor"
				strokeWidth="1.35"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function Tick({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M2.5 6.5 5 8.75 9.5 3.5"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CopyGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<rect x="4.25" y="4.25" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
			<path
				d="M2.75 7.75h-.5a.75.75 0 0 1-.75-.75V2.25a.75.75 0 0 1 .75-.75H7a.75.75 0 0 1 .75.75v.5"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

/* ── the install line, the page's second door ─────────────────────────── */

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function CommandLine({ prompt, command }: { prompt: string; command: string }) {
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
			onClick={() => {
				void copyText(command).then((ok) => {
					if (!ok) return;
					setCopied(true);
					if (timer.current !== null) window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => setCopied(false), 1500);
				});
			}}
			aria-label={copied ? `Copied ${command}` : `Copy ${command}`}
			className="group/cmd flex w-full cursor-pointer items-center gap-2 text-left font-mono text-[13px] leading-6 focus-visible:outline-none"
		>
			<span className="select-none text-muted/80">{prompt}</span>
			<span className="text-text">{command}</span>
			<span className="relative ml-auto block h-3 w-3 shrink-0">
				<CopyGlyph
					className={cn(
						"absolute inset-0 text-muted opacity-0 transition-opacity duration-150",
						copied ? "" : "group-hover/cmd:opacity-100 group-focus-visible/cmd:opacity-100",
					)}
				/>
				<Tick
					className={cn(
						"absolute inset-0 text-thread transition-opacity duration-150",
						copied ? "opacity-100" : "opacity-0",
					)}
				/>
			</span>
		</button>
	);
}

/* ── the menu bar, which is also the site's navigation ────────────────── */

const MENUS = ["Spool", "File", "Project", "Window", "Help"] as const;

function MenuBar() {
	return (
		<div className="absolute inset-x-0 top-0 z-40 flex h-[26px] items-center justify-between border-white/5 border-b bg-black/35 px-4 backdrop-blur-[14px]">
			<div className="flex items-center gap-1">
				<SpoolMark className="mr-2.5 ml-1 h-[13px] w-[13px] text-thread" title="spool" />
				{MENUS.map((menu, i) => (
					<span
						key={menu}
						className={cn(
							"cursor-default rounded-[4px] px-2 py-[3px] text-[12px] leading-none transition-colors duration-150 hover:bg-white/10",
							i === 0 ? "font-semibold text-text" : "text-text/80",
						)}
					>
						{menu}
					</span>
				))}
			</div>
			<div className="flex items-center gap-4 text-[12px] text-text/70">
				<a href="https://github.com/liamvinberg/spool" className="hover:text-text">
					GitHub
				</a>
				<span className="hover:text-text">Docs</span>
				<SpoolMark className="h-[12px] w-[12px] text-text/70" />
				<span className="tabular-nums">Tue 1 Sep</span>
				<span className="tabular-nums text-text">09:41</span>
			</div>
		</div>
	);
}

/* ── the dock ─────────────────────────────────────────────────────────── */

interface DockApp {
	name: string;
	hue: string;
	glyph: "spool" | "term" | "code" | "browser" | "finder" | "notes";
}

const DOCK: readonly DockApp[] = [
	{ name: "Finder", hue: "#3B6EA5", glyph: "finder" },
	{ name: "Terminal", hue: "#1E1E1E", glyph: "term" },
	{ name: "Editor", hue: "#2C2A4A", glyph: "code" },
	{ name: "Chrome", hue: "#2A3B2E", glyph: "browser" },
	{ name: "Notes", hue: "#4A4327", glyph: "notes" },
];

function DockIconArt({ glyph }: { glyph: DockApp["glyph"] }) {
	if (glyph === "finder") {
		return <div className="h-full w-1/2 self-end bg-white/25" />;
	}
	if (glyph === "term") {
		return <span className="font-mono text-[15px] text-white/70">{">_"}</span>;
	}
	if (glyph === "code") {
		return <span className="font-mono text-[13px] text-white/60">{"{ }"}</span>;
	}
	if (glyph === "browser") {
		return <span className="block h-3.5 w-3.5 rounded-full border-2 border-white/50" />;
	}
	return (
		<div className="w-1/2 space-y-1">
			<span className="block h-px bg-white/40" />
			<span className="block h-px bg-white/40" />
			<span className="block h-px w-2/3 bg-white/40" />
		</div>
	);
}

function Dock() {
	return (
		<div className="-translate-x-1/2 absolute bottom-5 left-1/2 z-30">
			<div className="flex items-end gap-3 rounded-[20px] border border-white/10 bg-white/[0.06] px-3.5 py-2.5 backdrop-blur-[22px]">
				{DOCK.map((app) => (
					<div key={app.name} className="group/dock relative flex flex-col items-center">
						<div
							className="flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-[11px] border border-white/10 transition-transform duration-200 ease-out group-hover/dock:-translate-y-1.5"
							style={{ background: app.hue }}
						>
							<DockIconArt glyph={app.glyph} />
						</div>
					</div>
				))}
				<span className="mx-1 h-[46px] w-px self-center bg-white/12" />
				<div className="group/dock relative flex flex-col items-center">
					<div
						className="flex h-[54px] w-[54px] items-center justify-center rounded-[13px] border border-thread/25 transition-transform duration-200 ease-out group-hover/dock:-translate-y-1.5"
						style={{
							background: "linear-gradient(160deg, #241110 0%, #140B0A 100%)",
						}}
					>
						<SpoolMark className="h-8 w-[26px] text-thread" title="Spool" />
					</div>
					<span className="-bottom-[7px] absolute block h-[4px] w-[4px] rounded-full bg-text/70" />
				</div>
			</div>
		</div>
	);
}

/* ── what stands inside the window: spool's canvas on a real folder ───── */

interface RailRow {
	depth: number;
	kind: "page" | "frame";
	name: string;
	open?: boolean;
	on?: boolean;
}

const RAIL: readonly RailRow[] = [
	{ depth: 0, kind: "page", name: "checkout", open: true },
	{ depth: 1, kind: "frame", name: "cart", on: true },
	{ depth: 1, kind: "frame", name: "cart--empty" },
	{ depth: 1, kind: "frame", name: "pay" },
	{ depth: 1, kind: "frame", name: "receipt" },
	{ depth: 0, kind: "page", name: "onboarding" },
	{ depth: 0, kind: "page", name: "drafts" },
];

function Bar({ w, className }: { w: string | number; className?: string }) {
	return <div className={cn("h-[3px] rounded-full bg-border-raised", className)} style={{ width: w }} />;
}

function FieldFrame({
	x,
	y,
	w,
	h,
	name,
	lit,
	children,
}: {
	x: number;
	y: number;
	w: number;
	h: number;
	name: string;
	lit?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="absolute" style={{ left: x, top: y, width: w }}>
			<div className="mb-[5px] flex items-center gap-1 font-mono text-[9px] leading-none">
				<span className={cn("text-[7px]", lit === true ? "text-thread" : "text-muted/70")}>
					{lit === true ? "▶" : "▸"}
				</span>
				<span className={lit === true ? "text-thread" : "text-muted"}>{name}</span>
			</div>
			<div className="relative">
				<div
					className="overflow-hidden rounded-[4px] border border-border bg-canvas"
					style={{ width: w, height: h }}
				>
					{children}
				</div>
				{lit === true ? (
					<>
						<span className="-inset-[3px] pointer-events-none absolute rounded-[7px] border-[1.5px] border-thread" />
						{[
							"-left-[6px] -top-[6px]",
							"-right-[6px] -top-[6px]",
							"-left-[6px] -bottom-[6px]",
							"-right-[6px] -bottom-[6px]",
						].map((pos) => (
							<span
								key={pos}
								className={cn(
									"absolute h-[7px] w-[7px] rounded-[1.5px] border-[1.5px] border-thread bg-on-thread",
									pos,
								)}
							/>
						))}
						<span className="-bottom-[8px] -translate-x-1/2 absolute left-1/2 rounded-xs bg-thread px-1.5 py-[2px] font-mono text-[9px] text-on-thread leading-none">
							390 × 844
						</span>
					</>
				) : null}
			</div>
		</div>
	);
}

function CartWire() {
	return (
		<div className="flex h-full flex-col p-2.5">
			<div className="h-[7px] w-[62%] rounded-[1px] bg-raised" />
			<div className="mt-2.5 space-y-2">
				{[0, 1, 2].map((row) => (
					<div key={row} className="flex items-center gap-1.5">
						<span className="h-5 w-5 shrink-0 rounded-[2px] bg-raised" />
						<div className="flex-1 space-y-1">
							<Bar w={row === 1 ? "62%" : "78%"} />
							<Bar w="34%" />
						</div>
					</div>
				))}
			</div>
			<div className="mt-auto space-y-1.5">
				<div className="flex items-center justify-between">
					<Bar w={22} />
					<Bar w={30} className="bg-text/40" />
				</div>
				<span className="block h-[15px] w-full rounded-[3px] bg-thread/80" />
			</div>
		</div>
	);
}

function PayWire() {
	return (
		<div className="flex h-full flex-col gap-2 p-2.5">
			<div className="h-[7px] w-[46%] rounded-[1px] bg-raised" />
			<div className="space-y-1.5">
				{["82%", "58%", "70%"].map((w) => (
					<div key={w} className="rounded-[2px] border border-border-raised px-1.5 py-[5px]">
						<Bar w={w} />
					</div>
				))}
			</div>
			<span className="mt-auto block h-[15px] w-full rounded-[3px] border border-border-raised" />
		</div>
	);
}

function ReceiptWire() {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-2 p-2.5">
			<span className="flex h-6 w-6 items-center justify-center rounded-full border border-thread/60 text-thread">
				<Tick className="h-3 w-3" />
			</span>
			<Bar w="52%" />
			<Bar w="34%" />
		</div>
	);
}

/** the threads between the frames, drawn the way the canvas draws a walk. */
function FieldThread() {
	return (
		<svg
			className="pointer-events-none absolute top-0 left-0 overflow-visible"
			width={628}
			height={546}
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M 152 220 C 200 220, 200 152, 242 152"
				stroke="var(--color-thread)"
				strokeWidth="1.5"
				strokeLinecap="round"
				opacity="0.85"
			/>
			<path d="M 252 152 L 240 147 L 240 157 Z" fill="var(--color-thread)" opacity="0.85" />
			<path
				d="M 394 186 C 438 186, 438 338, 404 338"
				stroke="var(--color-thread)"
				strokeWidth="1.5"
				strokeLinecap="round"
				opacity="0.85"
			/>
			<path d="M 394 338 L 406 333 L 406 343 Z" fill="var(--color-thread)" opacity="0.85" />
		</svg>
	);
}

function CanvasInside() {
	return (
		<div className="flex h-full min-h-0 flex-1">
			{/* the pages rail */}
			<div className="flex w-[176px] shrink-0 flex-col border-border border-r bg-surface">
				<div className="flex items-center gap-1.5 px-3 pt-3 pb-2 font-mono text-[10px] text-muted leading-none">
					<FolderGlyph className="h-3 w-3" />
					<span className="truncate">design/frames</span>
				</div>
				<div className="min-h-0 flex-1">
					{RAIL.map((row) => (
						<div
							key={row.depth + row.name}
							className={cn(
								"flex h-[24px] items-center gap-1.5 pr-2",
								row.on === true && "bg-raised",
							)}
							style={{ paddingLeft: 12 + row.depth * 13 }}
						>
							<span
								className={cn(
									"w-2 shrink-0 text-center text-[7px] leading-none",
									row.on === true ? "text-thread" : "text-muted/60",
								)}
							>
								{row.kind === "page" ? (row.open === true ? "▾" : "▸") : ""}
							</span>
							{row.kind === "page" ? (
								<FolderGlyph className="h-3 w-3 shrink-0 text-muted" />
							) : (
								<FrameGlyph
									className={cn("h-3 w-3 shrink-0", row.on === true ? "text-thread" : "text-muted")}
								/>
							)}
							<span
								className={cn(
									"min-w-0 flex-1 truncate font-mono text-[10px] leading-none",
									row.on === true ? "text-thread" : "text-muted",
								)}
							>
								{row.name}
								{row.kind === "page" ? "/" : ""}
							</span>
						</div>
					))}
				</div>
				<div className="border-border border-t px-3 py-2.5 font-mono text-[10px] text-muted/70 leading-4">
					<div className="text-text">12 frames</div>
					<div className="truncate">~/projects/tvarso</div>
				</div>
			</div>

			{/* the field */}
			<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas" style={dotGrid}>
				<FieldThread />
				<FieldFrame x={40} y={150} w={112} h={140} name="cart" lit>
					<CartWire />
				</FieldFrame>
				<FieldFrame x={252} y={104} w={142} h={136} name="pay">
					<PayWire />
				</FieldFrame>
				<FieldFrame x={252} y={298} w={142} h={118} name="receipt">
					<ReceiptWire />
				</FieldFrame>
				<FieldFrame x={444} y={190} w={132} h={110} name="cart--empty">
					<div className="flex h-full flex-col items-center justify-center gap-2">
						<span className="block h-px w-6 rounded-full bg-border-raised" />
						<span className="block h-px w-4 rounded-full bg-border-raised/60" />
					</div>
				</FieldFrame>
				<div className="absolute bottom-3.5 left-3.5 flex items-center gap-2 rounded-full border border-border-raised bg-bg/80 px-2.5 py-1 font-mono text-[10px] text-muted leading-none">
					<span className="block h-1.5 w-1.5 rounded-full bg-thread" />
					<span>your agent writes these</span>
				</div>
			</div>
		</div>
	);
}

/* ── the window ───────────────────────────────────────────────────────── */

const LIGHTS = [
	{ fill: "#FF5F57", label: "close" },
	{ fill: "#FEBC2E", label: "minimize" },
	{ fill: "#28C840", label: "zoom" },
] as const;

function AppWindow() {
	return (
		<div
			className="flex h-full w-full flex-col overflow-hidden rounded-[11px] border border-white/10 bg-bg"
			style={windowDepth}
		>
			{/* the title bar */}
			<div className="relative flex h-[38px] shrink-0 items-center border-border border-b bg-surface px-3.5">
				<div className="flex items-center gap-2">
					{LIGHTS.map((light) => (
						<span
							key={light.label}
							className="block h-[11px] w-[11px] rounded-full"
							style={{ background: light.fill }}
							aria-label={light.label}
						/>
					))}
				</div>
				<div className="-translate-x-1/2 absolute left-1/2 flex items-center gap-1.5">
					<FolderGlyph className="h-3 w-3 text-muted" />
					<span className="font-medium text-[12px] text-text leading-none">tvarso</span>
				</div>
				<span className="ml-auto rounded-[4px] border border-border-raised px-1.5 py-1 font-mono text-[10px] text-muted leading-none">
					100%
				</span>
			</div>

			{/* spool's own project bar */}
			<div className="flex h-[34px] shrink-0 items-center gap-1 border-border border-b bg-bg px-2">
				<span className="rounded-[5px] bg-raised px-2.5 py-1 font-mono text-[11px] text-text leading-none">
					tvarso
				</span>
				<span className="rounded-[5px] px-2.5 py-1 font-mono text-[11px] text-muted leading-none hover:bg-raised/60">
					kaffe
				</span>
				<span className="rounded-[5px] px-2.5 py-1 font-mono text-[11px] text-muted leading-none hover:bg-raised/60">
					spool
				</span>
				<span className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] text-muted hover:bg-raised/60 hover:text-text">
					<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
						<path d="M6 2.25v7.5M2.25 6h7.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
					</svg>
				</span>
				<span className="ml-auto font-mono text-[10px] text-muted/70">localhost:7766</span>
			</div>

			<CanvasInside />
		</div>
	);
}

/* ── the copy that sits on the wallpaper ──────────────────────────────── */

const FACTS: readonly { key: string; value: string }[] = [
	{ key: "Any folder", value: "Press + and pick a folder. It is a project from that moment on." },
	{ key: "Your disk", value: "Frames are TSX files in the repo, so git tracks them beside your code." },
	{ key: "MIT", value: "Fork it, rework it, rename it, ship it." },
];

function Copy() {
	return (
		<div className="w-[452px]">
			<div className="flex items-center gap-2.5">
				<SpoolMark className="h-[18px] w-[18px] text-thread" title="spool" />
				<span className="font-semibold text-md tracking-tight">spool</span>
			</div>

			<h1 className="mt-10 font-semibold text-[58px] leading-[0.96] tracking-[-0.025em]">
				Spool lives
				<br />
				in your dock.
			</h1>

			<p className="mt-6 max-w-[404px] text-[16px] text-muted leading-[25px]">
				Download the disk image, drag it to Applications, open it. The app bundles the same spool npm
				ships, so a Mac that has never had Node is looking at a canvas a minute later.
			</p>

			<div className="mt-8 flex items-center gap-3">
				<a
					href="https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg"
					className="group/dl inline-flex items-center gap-2.5 rounded-md bg-thread px-4 py-3 font-medium text-[14px] text-on-thread leading-none transition-transform duration-200 ease-out hover:-translate-y-0.5"
				>
					<DownGlyph className="h-3.5 w-3.5" />
					Download Spool.dmg
				</a>
				<div className="font-mono text-[11px] text-muted leading-4">
					<div>Apple silicon, macOS 14+</div>
					<div>168 MB, signed and notarized</div>
				</div>
			</div>

			<div className="mt-8 flex gap-4">
				<span className="w-px shrink-0 self-stretch bg-thread/60" />
				<div className="w-[380px]">
					<CommandLine prompt="~ $" command="npm i -g spool.page" />
					<p className="mt-1.5 text-[13px] text-muted leading-5">
						The CLI is the same daemon under a different door. Install it if you would rather stay in the
						terminal, and the app will adopt whatever is already running.
					</p>
				</div>
			</div>

			<dl className="mt-9 border-border border-t">
				{FACTS.map((fact) => (
					<div key={fact.key} className="flex gap-5 border-border border-b py-3">
						<dt className="w-[86px] shrink-0 font-mono text-[11px] text-text leading-5">{fact.key}</dt>
						<dd className="text-[13px] text-muted leading-5">{fact.value}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}

/* ── the frame ────────────────────────────────────────────────────────── */

export default function SiteDeskWindow() {
	const reduce = useReducedMotion() === true;
	const px = useMotionValue(0);
	const py = useMotionValue(0);
	const sx = useSpring(px, { stiffness: 90, damping: 22, mass: 0.7 });
	const sy = useSpring(py, { stiffness: 90, damping: 22, mass: 0.7 });
	const wx = useTransform(sx, (v: number) => v * -9);
	const wy = useTransform(sy, (v: number) => v * -6);

	function track(event: ReactPointerEvent<HTMLDivElement>) {
		if (reduce) return;
		const box = event.currentTarget.getBoundingClientRect();
		px.set((event.clientX - box.left) / box.width - 0.5);
		py.set((event.clientY - box.top) / box.height - 0.5);
	}

	return (
		<div
			onPointerMove={track}
			className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]"
			style={wallpaper}
		>
			<MenuBar />

			{/* the window, standing on the ground and bleeding past the right edge */}
			<motion.div
				className="absolute"
				style={{ left: 596, top: 128, width: 804, height: 618, x: wx, y: wy }}
				initial={reduce ? false : { opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.7, ease: EASE }}
			>
				<AppWindow />
			</motion.div>

			<div className="absolute" style={{ left: 96, top: 132 }}>
				<Copy />
			</div>

			<Dock />
		</div>
	);
}
