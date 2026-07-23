import { motion, type Variants } from "motion/react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * landing--stage — the paper.design formula in spool's voice: a type-led hero
 * with premium restraint, then the real product shown big and alive as the
 * page's centerpiece. The stage is a lit spool canvas viewport carrying four
 * real-feeling frames of one music app; the centerpiece is a walk that plays on
 * a seamless loop, browse morphing into now-playing and back, shared elements
 * travelling, a player pill beneath tracking progress. All drawn, no images.
 *
 * Motion is transform/opacity only. The morph is explicit x/y/scale springs
 * (not layout measurement) so it never depends on getBoundingClientRect, which
 * strands chrome when the player scales the frame document (#53). Boot pose is
 * the browse screen, composed instantly for `spool shot`'s ~300ms capture.
 */

/* ---------- canonical copy-to-clipboard (verbatim from landing) ---------- */

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const ta = document.createElement("textarea");
			ta.value = text;
			ta.setAttribute("readonly", "");
			ta.style.position = "fixed";
			ta.style.top = "0";
			ta.style.left = "0";
			ta.style.width = "1px";
			ta.style.height = "1px";
			ta.style.padding = "0";
			ta.style.border = "none";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			ta.setSelectionRange(0, text.length);
			const ok = document.execCommand("copy");
			document.body.removeChild(ta);
			return ok;
		} catch {
			return false;
		}
	}
}

function Tick({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-3 w-3 shrink-0", className)}
		>
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
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-3 w-3 shrink-0", className)}
		>
			<rect
				x="4.25"
				y="4.25"
				width="6"
				height="6"
				rx="1"
				stroke="currentColor"
				strokeWidth="1.2"
			/>
			<path
				d="M2.75 7.75h-.5a.75.75 0 0 1-.75-.75V2.25a.75.75 0 0 1 .75-.75H7a.75.75 0 0 1 .75.75v.5"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function CommandLine({ command }: { command: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	async function handleCopy() {
		const ok = await copyText(command);
		if (!ok) return;
		setCopied(true);
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), 1500);
	}

	return (
		<button
			type="button"
			onClick={handleCopy}
			aria-label={copied ? `copied ${command}` : `copy ${command}`}
			className="group block w-full cursor-pointer text-left focus-visible:outline-none"
		>
			<span className="inline-flex w-[2ch] select-none items-center align-middle">
				{copied ? (
					<Tick className="text-thread" />
				) : (
					<>
						<span className="text-muted group-hover:hidden group-focus-visible:hidden">
							$
						</span>
						<CopyGlyph className="hidden text-thread group-hover:block group-focus-visible:block" />
					</>
				)}
			</span>
			{command}
		</button>
	);
}

/* ---------- shared surfaces ---------- */

const dotGrid: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "30px 30px",
	backgroundPosition: "-1px -1px",
};

const cover: CSSProperties = {
	backgroundImage:
		"radial-gradient(130% 120% at 20% 16%, rgba(255,255,255,0.30), transparent 46%), linear-gradient(145deg, #ff5a3c 0%, #f5391a 24%, #7c1e12 56%, #2a1210 84%, #150b0a 100%)",
};
const coverB: CSSProperties = {
	backgroundImage:
		"radial-gradient(130% 120% at 78% 18%, rgba(255,255,255,0.22), transparent 48%), linear-gradient(215deg, #ffb27a 0%, #e0662a 30%, #5a2a16 64%, #1a0f0b 100%)",
};
const coverC: CSSProperties = {
	backgroundImage:
		"radial-gradient(130% 120% at 24% 82%, rgba(255,255,255,0.18), transparent 46%), linear-gradient(120deg, #f5391a 0%, #8a2016 42%, #3a2a3e 78%, #120c14 100%)",
};

/* ---------- transport + ui glyphs ---------- */

function PlayTri({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M2.5 1.6 8 5 2.5 8.4Z" />
		</svg>
	);
}

function Pause({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" className={className}>
			<rect x="3" y="2.5" width="2" height="7" rx="0.6" />
			<rect x="7" y="2.5" width="2" height="7" rx="0.6" />
		</svg>
	);
}

function Skip({ className, back }: { className?: string; back?: boolean }) {
	return (
		<svg
			viewBox="0 0 14 14"
			fill="currentColor"
			aria-hidden="true"
			className={cn(back && "-scale-x-100", className)}
		>
			<path d="M3 3.4 8.4 7 3 10.6Z" />
			<rect x="9.3" y="3.2" width="1.7" height="7.6" rx="0.7" />
		</svg>
	);
}

function Shuffle({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
			<path d="M1.5 3.5h2.4L10 10.5h2.5M10.5 8.5l2 2-2 2" />
			<path d="M1.5 10.5h2.4l1.7-2M12.5 3.5H10L8.6 5.1" />
			<path d="M10.5 1.5l2 2-2 2" />
		</svg>
	);
}

function Repeat({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
			<path d="M3.5 5.5V5a2 2 0 0 1 2-2H11l-1.6-1.6M11 3l-1.6 1.6" />
			<path d="M10.5 8.5V9a2 2 0 0 1-2 2H3l1.6 1.6M3 11l1.6-1.6" />
		</svg>
	);
}

function Card({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true" className={className}>
			<rect x="1.5" y="3.5" width="13" height="9" rx="1.6" />
			<path d="M1.5 6.5h13" strokeWidth="1.4" />
			<path d="M4 10h2.5" strokeLinecap="round" />
		</svg>
	);
}

function Chevron({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
			<path d="M4.5 2.5 8 6l-3.5 3.5" />
		</svg>
	);
}

function Dots({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 4" fill="currentColor" aria-hidden="true" className={className}>
			<circle cx="2" cy="2" r="1.3" />
			<circle cx="7" cy="2" r="1.3" />
			<circle cx="12" cy="2" r="1.3" />
		</svg>
	);
}

function Search({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true" className={className}>
			<circle cx="6" cy="6" r="4" />
			<path d="M9.2 9.2 12 12" />
		</svg>
	);
}

function ChevronDown({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
			<path d="M3.5 5.5 7 9l3.5-3.5" />
		</svg>
	);
}

/* ---------- the walk viewport: browse <-> now playing, on a loop ---------- */

const SPRING = { type: "spring", stiffness: 95, damping: 20, mass: 1.05 } as const;
const FADE = { duration: 0.62, ease: [0.22, 1, 0.36, 1] } as const;
const LEG_MS = 3600;

const artV: Variants = { a: { x: -72, y: 354, scale: 0.2 }, b: { x: 0, y: 0, scale: 1 } };
const metaV: Variants = { a: { x: -20, y: 134, scale: 0.66 }, b: { x: 0, y: 0, scale: 1 } };
const listV: Variants = { a: { opacity: 1, y: 0 }, b: { opacity: 0, y: -14 } };
const barV: Variants = { a: { opacity: 1, y: 0 }, b: { opacity: 0, y: 10 } };
const nowV: Variants = { a: { opacity: 0, y: 18 }, b: { opacity: 1, y: 0 } };
const browseLblV: Variants = { a: { opacity: 1 }, b: { opacity: 0 } };
const nowLblV: Variants = { a: { opacity: 0 }, b: { opacity: 1 } };

const browseRows = [
	{ t: "neon harbor", a: "vela", d: "3:48", cover, live: true },
	{ t: "slow transit", a: "kess", d: "4:12", cover: coverB },
	{ t: "paper sun", a: "mirena", d: "3:07", cover: coverC },
	{ t: "low tide", a: "aå", d: "5:21", cover: coverB },
];

function WalkViewport({ screen }: { screen: number }) {
	const state = screen === 0 ? "a" : "b";
	return (
		<motion.div
			className="absolute inset-0"
			initial={false}
			animate={state}
			style={{ willChange: "transform" }}
		>
			{/* app header — a small contextual glyph, the screen name lives on the tab */}
			<div className="absolute inset-x-0 top-0 flex h-[46px] items-center justify-between px-[22px]">
				<div className="relative h-4 w-4 text-muted">
					<motion.span variants={browseLblV} transition={FADE} className="absolute inset-0">
						<Search className="h-4 w-4" />
					</motion.span>
					<motion.span variants={nowLblV} transition={FADE} className="absolute inset-0">
						<ChevronDown className="h-4 w-4" />
					</motion.span>
				</div>
				<Dots className="h-1 w-3.5 text-muted" />
			</div>

			{/* browse list — fades out on the way to now playing */}
			<motion.div variants={listV} transition={FADE} className="absolute inset-x-0 top-[54px] px-[18px]">
				<div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
					made for you
				</div>
				<div className="space-y-[10px]">
					{browseRows.map((r) => (
						<div key={r.t} className="flex items-center gap-3">
							<div className="h-9 w-9 shrink-0 rounded-md" style={r.cover} />
							<div className="min-w-0 flex-1">
								<div
									className={cn(
										"truncate text-[12px] leading-4",
										r.live ? "text-thread" : "text-text",
									)}
								>
									{r.t}
								</div>
								<div className="truncate text-[10px] leading-[13px] text-muted">{r.a}</div>
							</div>
							{r.live ? (
								<div className="flex items-end gap-[2px] pr-1">
									{[0, 1, 2].map((i) => (
										<motion.span
											key={i}
											className="block h-[11px] w-[2px] origin-bottom rounded-full bg-thread"
											animate={{ scaleY: [0.35, 1, 0.45, 0.82, 0.35] }}
											transition={{
												duration: 1.1,
												repeat: Number.POSITIVE_INFINITY,
												ease: "easeInOut",
												delay: i * 0.18,
											}}
										/>
									))}
								</div>
							) : (
								<span className="font-mono text-[10px] text-muted">{r.d}</span>
							)}
						</div>
					))}
				</div>
				<div className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
					recently played
				</div>
				<div className="flex gap-2.5">
					{[cover, coverB, coverC].map((c, i) => (
						<div key={i} className="relative h-[58px] flex-1 overflow-hidden rounded-lg" style={c}>
							<SpoolMark className="absolute inset-0 m-auto h-2/5 w-2/5 text-white/12" />
						</div>
					))}
				</div>
			</motion.div>

			{/* mini-player bar — the resting home of the shared art + meta */}
			<motion.div
				variants={barV}
				transition={FADE}
				className="absolute inset-x-2 top-[404px] h-[56px] overflow-hidden rounded-[13px] border border-border bg-surface"
			>
				<div className="absolute inset-x-3 top-0 h-px bg-border-raised">
					<div className="h-full w-[38%] bg-thread/70" />
				</div>
				<button
					type="button"
					aria-label="pause"
					className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-raised text-text"
				>
					<Pause className="h-3 w-3" />
				</button>
			</motion.div>

			{/* now-playing scrubber + transport — fades in as we arrive */}
			<motion.div variants={nowV} transition={FADE} className="absolute inset-x-0 top-[338px]">
				<div className="px-[30px]">
					<div className="h-[3px] overflow-hidden rounded-full bg-border-raised">
						<div className="h-full w-[38%] rounded-full bg-thread" />
					</div>
					<div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted">
						<span>1:27</span>
						<span>3:48</span>
					</div>
				</div>
				<div className="mt-4 flex items-center justify-center gap-6 text-muted">
					<Shuffle className="h-3.5 w-3.5" />
					<Skip className="h-4 w-4 text-text" back />
					<button
						type="button"
						aria-label="pause"
						className="flex h-12 w-12 items-center justify-center rounded-full bg-thread text-on-thread"
					>
						<Pause className="h-4 w-4" />
					</button>
					<Skip className="h-4 w-4 text-text" />
					<Repeat className="h-3.5 w-3.5" />
				</div>
			</motion.div>

			{/* shared traveller: album art (mini-bar thumb -> hero cover) */}
			<motion.div
				variants={artV}
				transition={SPRING}
				className="absolute h-[200px] w-[200px] overflow-hidden rounded-[16px]"
				style={{ left: 88, top: 66, transformOrigin: "top left", ...cover }}
			>
				<SpoolMark className="absolute inset-0 m-auto h-1/2 w-1/2 text-white/12" />
			</motion.div>

			{/* shared traveller: title + artist */}
			<motion.div
				variants={metaV}
				transition={SPRING}
				className="absolute w-[220px]"
				style={{ left: 88, top: 282, transformOrigin: "top left" }}
			>
				<div className="text-[21px] font-semibold leading-tight tracking-tight">neon harbor</div>
				<div className="mt-0.5 text-[13px] leading-tight text-muted">vela</div>
			</motion.div>
		</motion.div>
	);
}

/* ---------- the mini frames: three more screens of the same app ---------- */

function CheckoutFrame() {
	return (
		<div className="flex h-full flex-col p-[18px]">
			<div className="flex items-center justify-between">
				<span className="text-[13px] font-semibold tracking-tight">checkout</span>
				<span className="font-mono text-[10px] text-muted">step 2 of 2</span>
			</div>
			<div className="mt-3.5 flex items-center gap-3 rounded-lg border border-border bg-bg/50 p-2.5">
				<div className="h-9 w-9 shrink-0 rounded-md" style={coverC} />
				<div className="min-w-0 flex-1">
					<div className="truncate text-[12px] leading-4">spool premium</div>
					<div className="text-[10px] leading-[13px] text-muted">yearly, billed once</div>
				</div>
				<span className="font-mono text-[13px]">$96</span>
			</div>
			<div className="mt-2.5 flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5">
				<Card className="h-4 w-4 shrink-0 text-muted" />
				<span className="font-mono text-[12px] tracking-[0.06em] text-muted">4242 4242 4242 4242</span>
			</div>
			<div className="mt-auto">
				<div className="flex items-center justify-between border-t border-border pt-3 text-[12px]">
					<span className="text-muted">total</span>
					<span className="font-mono text-text">$96.00</span>
				</div>
				<div className="mt-3 flex h-9 w-full items-center justify-center rounded-lg bg-thread text-[12px] font-semibold text-on-thread">
					pay $96
				</div>
			</div>
		</div>
	);
}

function Toggle({ on }: { on?: boolean }) {
	return (
		<span
			className={cn(
				"relative block h-[18px] w-8 rounded-full transition-colors",
				on ? "bg-thread" : "bg-raised",
			)}
		>
			<span
				className={cn(
					"absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-on-thread",
					on ? "right-[2px]" : "left-[2px]",
				)}
			/>
		</span>
	);
}

function SettingsFrame() {
	const rows: { k: string; el: React.ReactNode }[] = [
		{
			k: "appearance",
			el: (
				<span className="flex items-center rounded-full border border-border bg-bg p-0.5 font-mono text-[10px]">
					<span className="rounded-full px-2 py-[3px] text-muted">light</span>
					<span className="rounded-full bg-raised px-2 py-[3px] text-text">dark</span>
				</span>
			),
		},
		{ k: "hi-fi audio", el: <Toggle on /> },
		{ k: "notifications", el: <Toggle /> },
		{
			k: "downloads",
			el: (
				<span className="flex items-center gap-1 font-mono text-[11px] text-muted">
					wifi only
					<Chevron className="h-2.5 w-2.5" />
				</span>
			),
		},
	];
	return (
		<div className="flex h-full flex-col p-[18px]">
			<span className="text-[13px] font-semibold tracking-tight">settings</span>
			<div className="mt-3 flex flex-1 flex-col justify-between py-0.5">
				{rows.map((r) => (
					<div key={r.k} className="flex items-center justify-between">
						<span className="text-[12px] text-text">{r.k}</span>
						{r.el}
					</div>
				))}
			</div>
		</div>
	);
}

function LibraryFrame() {
	const rows = [
		{ t: "late motorways", a: "vela · 12 tracks", cover },
		{ t: "for slow mornings", a: "kess · 9 tracks", cover: coverB },
		{ t: "röda natt", a: "mirena · 21 tracks", cover: coverC },
	];
	return (
		<div className="flex h-full flex-col p-[18px]">
			<div className="flex items-center justify-between">
				<span className="text-[13px] font-semibold tracking-tight">your library</span>
				<span className="font-mono text-[10px] text-muted">playlists</span>
			</div>
			<div className="mt-3 flex flex-1 flex-col justify-between py-0.5">
				{rows.map((r) => (
					<div key={r.t} className="flex items-center gap-3">
						<div className="h-10 w-10 shrink-0 rounded-md" style={r.cover} />
						<div className="min-w-0 flex-1">
							<div className="truncate text-[12px] leading-4">{r.t}</div>
							<div className="truncate text-[10px] leading-[13px] text-muted">{r.a}</div>
						</div>
						<Chevron className="h-3 w-3 shrink-0 text-muted" />
					</div>
				))}
			</div>
		</div>
	);
}

/* ---------- frame chrome: name tab above a frame on the canvas ---------- */

function NameTab({ name, active }: { name: string; active?: boolean }) {
	return (
		<div
			className={cn(
				"absolute -top-[24px] left-0 flex items-center gap-1.5 font-mono text-[11px] leading-none",
				active ? "text-thread" : "text-muted",
			)}
		>
			<span className="text-[8px] opacity-70">{active ? "▶" : "▸"}</span>
			<span>{name}</span>
		</div>
	);
}

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}
const WALK: Rect = { x: 88, y: 84, w: 376, h: 468 };
const CHECKOUT: Rect = { x: 560, y: 64, w: 304, h: 248 };
const SETTINGS: Rect = { x: 908, y: 150, w: 300, h: 196 };
const LIBRARY: Rect = { x: 596, y: 372, w: 352, h: 214 };

function MiniFrame({ rect, name, children }: { rect: Rect; name: string; children: React.ReactNode }) {
	return (
		<div className="absolute" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
			<NameTab name={name} />
			<div className="h-full w-full overflow-hidden rounded-xl border border-border bg-surface">
				{children}
			</div>
		</div>
	);
}

/* ---------- flow arrows across the canvas ---------- */

function FlowArrows() {
	return (
		<svg
			className="pointer-events-none absolute inset-0 h-full w-full"
			viewBox="0 0 1280 660"
			fill="none"
			aria-hidden="true"
		>
			<defs>
				<marker
					id="stage-ah"
					viewBox="0 0 8 8"
					refX="6"
					refY="4"
					markerWidth="7"
					markerHeight="7"
					markerUnits="userSpaceOnUse"
					orient="auto"
				>
					<path d="M1 1 8 4 1 7Z" fill="var(--color-thread)" fillOpacity="0.75" />
				</marker>
			</defs>
			{/* walk -> library */}
			<path
				d="M464 470 C 524 470, 548 456, 592 452"
				stroke="var(--color-thread)"
				strokeWidth="1.4"
				strokeOpacity="0.42"
				strokeDasharray="4 4"
				markerEnd="url(#stage-ah)"
			/>
			{/* checkout -> settings */}
			<path
				d="M864 176 C 892 186, 902 214, 908 236"
				stroke="var(--color-thread)"
				strokeWidth="1.4"
				strokeOpacity="0.42"
				strokeDasharray="4 4"
				markerEnd="url(#stage-ah)"
			/>
			{/* library -> settings */}
			<path
				d="M900 398 C 968 386, 992 372, 1000 352"
				stroke="var(--color-thread)"
				strokeWidth="1.4"
				strokeOpacity="0.42"
				strokeDasharray="4 4"
				markerEnd="url(#stage-ah)"
			/>
			{/* walk -> checkout: the walked edge, solid + a travelling pulse */}
			<path
				d="M464 244 C 508 230, 520 190, 552 178"
				stroke="var(--color-thread)"
				strokeWidth="1.6"
				strokeOpacity="0.7"
				markerEnd="url(#stage-ah)"
			/>
			<motion.circle
				cx="464"
				cy="244"
				r="3"
				fill="var(--color-thread)"
				style={{ filter: "drop-shadow(0 0 4px color-mix(in srgb, var(--color-thread) 70%, transparent))" }}
				animate={{
					x: [0, 44, 56, 88],
					y: [0, -14, -54, -66],
					opacity: [0, 1, 1, 0],
				}}
				transition={{ duration: 2.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: 0.4 }}
			/>
		</svg>
	);
}

/* ---------- the player pill beneath the walk ---------- */

function StepDot({ active }: { active?: boolean }) {
	return (
		<span className="relative flex h-2 w-2 items-center justify-center">
			{active ? (
				<span className="absolute -inset-[3px] rounded-full border border-thread/40" />
			) : null}
			<span
				className={cn(
					"h-1.5 w-1.5 rounded-full",
					active ? "bg-thread" : "bg-border-raised",
				)}
			/>
		</span>
	);
}

function PlayerPill({ screen }: { screen: number }) {
	return (
		<div className="flex w-[352px] items-center gap-3 rounded-full border border-border-raised bg-bg/85 px-4 py-2.5 backdrop-blur-sm">
			<motion.span
				className="text-thread"
				animate={{ opacity: [0.55, 1, 0.55] }}
				transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
			>
				<PlayTri className="h-2.5 w-2.5" />
			</motion.span>
			<div className="w-[92px] overflow-hidden">
				<motion.span
					key={screen}
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4, ease: "easeOut" }}
					className="block truncate font-mono text-[11px] leading-none text-text"
				>
					{screen === 0 ? "browse" : "now playing"}
				</motion.span>
			</div>
			<div className="h-[3px] flex-1 overflow-hidden rounded-full bg-border-raised">
				<motion.div
					key={screen}
					className="h-full w-full origin-left rounded-full bg-thread"
					initial={{ scaleX: 0 }}
					animate={{ scaleX: 1 }}
					transition={{ duration: LEG_MS / 1000, ease: "linear" }}
				/>
			</div>
			<div className="flex items-center gap-2 pl-0.5">
				<StepDot active={screen === 0} />
				<StepDot active={screen === 1} />
			</div>
		</div>
	);
}

/* ---------- the stage ---------- */

function Stage() {
	const [screen, setScreen] = useState(0);
	useEffect(() => {
		const id = window.setInterval(() => setScreen((s) => (s === 0 ? 1 : 0)), LEG_MS);
		return () => window.clearInterval(id);
	}, []);

	return (
		<div
			className="relative mx-auto h-[660px] w-[1280px] overflow-hidden rounded-2xl border border-border bg-canvas"
			style={dotGrid}
		>
			{/* lighting: a thread halo behind the hero frame + an edge vignette */}
			<div
				className="pointer-events-none absolute h-[620px] w-[620px] rounded-full"
				style={{
					left: WALK.x + WALK.w / 2 - 310,
					top: WALK.y + WALK.h / 2 - 310,
					background:
						"radial-gradient(circle, color-mix(in srgb, var(--color-thread) 16%, transparent) 0%, transparent 64%)",
				}}
			/>
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(92% 82% at 30% 46%, rgba(255,255,255,0.02) 0%, transparent 38%, rgba(0,0,0,0.5) 100%)",
				}}
			/>

			<FlowArrows />

			{/* the three supporting frames */}
			<MiniFrame rect={CHECKOUT} name="checkout">
				<CheckoutFrame />
			</MiniFrame>
			<MiniFrame rect={SETTINGS} name="settings">
				<SettingsFrame />
			</MiniFrame>
			<MiniFrame rect={LIBRARY} name="library">
				<LibraryFrame />
			</MiniFrame>

			{/* the centerpiece: the walked frame, ringed thread, lit */}
			<div className="absolute" style={{ left: WALK.x, top: WALK.y }}>
				<div className="absolute -top-[24px] left-0 flex items-center gap-1.5 font-mono text-[11px] leading-none text-thread">
					<span className="text-[8px] opacity-70">▶</span>
					<span className="relative block h-3 w-[90px]">
						<motion.span
							key={screen}
							initial={{ opacity: 0, y: 3 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.42, ease: "easeOut" }}
							className="absolute inset-0"
						>
							{screen === 0 ? "browse" : "now playing"}
						</motion.span>
					</span>
				</div>
				<div className="pointer-events-none absolute -inset-[7px] rounded-[26px] border-[1.5px] border-thread/55" />
				{[
					{ l: -11, t: -11 },
					{ l: WALK.w + 3, t: -11 },
					{ l: -11, t: WALK.h + 3 },
					{ l: WALK.w + 3, t: WALK.h + 3 },
				].map((c) => (
					<span
						key={`${c.l}-${c.t}`}
						className="absolute h-2 w-2 rounded-[2px] border-[1.5px] border-thread bg-on-thread"
						style={{ left: c.l, top: c.t }}
					/>
				))}
				<div
					className="relative overflow-hidden rounded-[20px] border border-border-raised bg-bg"
					style={{ width: WALK.w, height: WALK.h }}
				>
					<div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-white/[0.035] to-transparent" />
					<WalkViewport screen={screen} />
				</div>
			</div>

			{/* the player pill, centered beneath the walk */}
			<div
				className="absolute"
				style={{ left: WALK.x + WALK.w / 2 - 176, top: WALK.y + WALK.h + 18 }}
			>
				<PlayerPill screen={screen} />
			</div>

			{/* quiet canvas chrome */}
			<div className="absolute bottom-4 left-5 flex items-center gap-1.5 font-mono text-[10px] text-muted/80">
				<SpoolMark className="h-3 w-3 text-muted/70" />
				<span>canvas</span>
			</div>
			<div className="absolute bottom-4 right-5 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted/80">
				100%
			</div>
		</div>
	);
}

/* ---------- stance + shell ---------- */

const stance = [
	{ k: "your agent", v: "works through files and a cli, not a captive chat." },
	{ k: "your disk", v: "local-first. plain files inside your repo. git-friendly, no cloud, no accounts." },
	{ k: "real depth", v: "frames are real tsx. arbitrary js, real motion, real state." },
	{ k: "flows", v: "walk screen to screen, with morphing transitions." },
];

export default function LandingStage() {
	return (
		<div className="relative flex min-h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{/* header */}
			<header className="flex shrink-0 items-center justify-between px-20 py-9">
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-5 w-5 text-thread" title="spool" />
					<span className="text-md font-semibold tracking-tight">spool</span>
				</div>
				<div className="flex items-center gap-6 font-mono text-xs text-muted">
					<span>spool.page</span>
					<a
						href="https://github.com/liamvinberg/spool"
						className="text-text transition-colors hover:text-thread"
					>
						github.com/liamvinberg/spool
					</a>
				</div>
			</header>

			{/* hero — type-led, centered, premium restraint */}
			<section className="flex shrink-0 flex-col items-center px-8 pt-10 text-center">
				<h1 className="text-[84px] font-semibold leading-[0.97] tracking-[-0.025em]">
					feel an app
					<br />
					before it exists
				</h1>
				<p className="mt-7 max-w-[560px] text-[18px] leading-[27px] text-muted">
					a live prototyping canvas. your agent authors live tsx frames on an infinite canvas and
					links them into walkable flows. you feel the real thing, interactions and motion and
					inputs, before it exists.
				</p>

				<div className="mt-9 w-fit rounded-xl border border-border bg-surface/40 px-6 py-5 text-left">
					<div className="w-[300px] font-mono text-[15px] leading-[30px]">
						<CommandLine command="npm i -g spool.page" />
						<CommandLine command="spool init" />
						<CommandLine command="spool serve" />
					</div>
				</div>
				<div className="mt-5 font-mono text-xs text-muted">
					requires node 22+ · best in chrome · macos-first today
				</div>
			</section>

			{/* connective thread down into the canvas */}
			<div className="relative flex shrink-0 justify-center py-9">
				<div
					className="h-14 w-px"
					style={{
						background:
							"linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-thread) 60%, transparent) 30%, color-mix(in srgb, var(--color-thread) 60%, transparent))",
					}}
				/>
				<span className="absolute bottom-0 left-1/2 block h-[9px] w-[9px] -translate-x-1/2 translate-y-1/2">
					<span className="absolute -inset-[5px] rounded-full border border-thread/25" />
					<span className="absolute inset-0 rounded-full border-[3px] border-bg bg-thread" />
				</span>
			</div>

			{/* the stage — the product, big and alive */}
			<section className="shrink-0">
				<Stage />
			</section>

			{/* stance — quiet, four across */}
			<section className="mt-auto px-20 pt-16">
				<div className="grid grid-cols-4 gap-8 border-t border-border pt-9">
					{stance.map((s, i) => (
						<div key={s.k}>
							<div className="flex items-baseline gap-2">
								<span className="font-mono text-[11px] text-thread">
									{String(i + 1).padStart(2, "0")}
								</span>
								<span className="text-[15px] font-semibold tracking-tight">{s.k}</span>
							</div>
							<p className="mt-2 text-[13px] leading-[20px] text-muted">{s.v}</p>
						</div>
					))}
				</div>
			</section>

			{/* footer */}
			<footer className="mt-14 flex shrink-0 items-center justify-between border-t border-border px-20 py-8">
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-4 w-4 text-thread" />
					<span className="text-sm text-muted">spool.page</span>
				</div>
				<a
					href="https://github.com/liamvinberg/spool"
					className="font-mono text-xs text-muted transition-colors hover:text-thread"
				>
					github.com/liamvinberg/spool
				</a>
			</footer>
		</div>
	);
}
