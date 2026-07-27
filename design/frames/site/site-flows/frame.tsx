import { motion, type Variants } from "motion/react";
import { type CSSProperties, useEffect, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * site-flows: the "flows" section of the canvas-as-navigation landing site
 * (landing-site page). One 1440x900 board: what a flow is, felt. The body is
 * the demo, not prose. a small music app walked as ONE coherent flow: library
 * -> album -> now playing, left to right, thread arrows in sequence, a larger
 * lit walker that morphs through the legs on a seamless loop, a player pill
 * beneath it. The chosen album's art physically travels and scales through the
 * legs (tile -> header -> hero) while its title and artist persist. The visitor
 * can take over: clicking any map frame or a pill dot walks the live frame there
 * with the same morph and pauses the loop ~10s.
 *
 * Chrome is a shared convention across every section: a mono "back to canvas"
 * chip top-left (data-go="site-hub"), the section heading, one quiet mono line
 * at the foot. The demo box carries viewTransitionName "site-flows-card" so the
 * hub's flows tile morphs into this whole stage when walked in the player.
 *
 * The music screens keep a diegetic light identity (light product UI on the
 * dark canvas); everything else threads the single page accent. Motion is
 * transform/opacity only; the morph is explicit variant springs keyed on the
 * screen (never layout measurement / getBoundingClientRect), so chrome never
 * strands when the player scales the frame document. Boot pose is the library,
 * composed instantly.
 *
 * The three map frames are hand-built rather than imported: a shared screen
 * component would hard-set one viewTransitionName inline, and three instances
 * plus the walker in one document would collide and abort the page's
 * site-flows-card View Transition. This document holds exactly one
 * viewTransitionName, on the stage. The walker likewise hand-builds its music
 * content so its legs can morph.
 */

/* ---------- diegetic light identity (light product on the dark canvas) ---------- */

const PAPER = "#FEFEFE";
const INK = "#17171A";
const HAIR = "#E4E4E7";
const SOFT = "#86868B";
const CHIP = "#EFEFF1";

/* ---------- album art: warm, thread-adjacent gradients (CSS, no images) ---------- */

const coverA: CSSProperties = {
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
const coverD: CSSProperties = {
	backgroundImage:
		"radial-gradient(130% 120% at 30% 14%, rgba(255,255,255,0.26), transparent 46%), linear-gradient(160deg, #ffc59a 0%, #d2551f 34%, #6a2a17 70%, #180d0b 100%)",
};
const coverE: CSSProperties = {
	backgroundImage:
		"radial-gradient(130% 120% at 72% 80%, rgba(255,255,255,0.20), transparent 48%), linear-gradient(205deg, #ff7a4d 0%, #b83417 38%, #45201c 74%, #140b0a 100%)",
};
const coverF: CSSProperties = {
	backgroundImage:
		"radial-gradient(130% 120% at 22% 20%, rgba(255,255,255,0.24), transparent 46%), linear-gradient(130deg, #ffa06a 0%, #c24a1e 40%, #3a2438 78%, #120c14 100%)",
};

/* ---------- the album that travels, plus the library it sits in ---------- */

const ALBUM = { title: "neon harbor", artist: "vela", cover: coverA } as const;

// the other library tiles (the chosen album fills slot 0, drawn by the traveller)
const otherTiles = [
	{ title: "slow transit", artist: "kess", cover: coverB },
	{ title: "paper sun", artist: "mirena", cover: coverC },
	{ title: "glass coast", artist: "sable", cover: coverD },
	{ title: "night ferry", artist: "noor", cover: coverE },
	{ title: "far shore", artist: "wren", cover: coverF },
] as const;

const tracks = [
	{ n: "harbor lights", d: "3:42", cur: true },
	{ n: "undertow", d: "4:05" },
	{ n: "low ceiling", d: "2:58" },
	{ n: "long exposure", d: "5:12" },
] as const;

/* ---------- the flow, as named legs ---------- */

type ScreenKey = "library" | "album" | "nowplaying";
const ORDER: readonly ScreenKey[] = ["library", "album", "nowplaying"];
const LABEL: Record<ScreenKey, string> = { library: "library", album: "album", nowplaying: "now-playing" };
const keyOf = (index: number): ScreenKey => ORDER[index] ?? "library";
const LEG_MS = 2800;
const PAUSE_MS = 10000;

const SPRING = { type: "spring", stiffness: 110, damping: 21, mass: 1 } as const;
const FADE = { duration: 0.5, ease: [0.22, 1, 0.36, 1] } as const;
// the library is a full-height grid; clearing it quickly keeps the travelling
// art the clear through-line of the morph rather than a dense cross-dissolve.
const FADE_FAST = { duration: 0.32, ease: [0.22, 1, 0.36, 1] } as const;

/* ---------- product glyphs (currentColor, inherit the diegetic ink) ---------- */

type GlyphProps = { className?: string; style?: CSSProperties };

function PlayTri({ className, style }: GlyphProps) {
	return (
		<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className={className} style={style}>
			<path d="M2.5 1.6 8 5 2.5 8.4Z" />
		</svg>
	);
}
function Pause({ className, style }: GlyphProps) {
	return (
		<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" className={className} style={style}>
			<rect x="3" y="2.5" width="2" height="7" rx="0.6" />
			<rect x="7" y="2.5" width="2" height="7" rx="0.6" />
		</svg>
	);
}
function Skip({ className, style, back }: GlyphProps & { back?: boolean }) {
	return (
		<svg viewBox="0 0 14 14" fill="currentColor" aria-hidden="true" className={cn(back && "-scale-x-100", className)} style={style}>
			<path d="M3 3.4 8.4 7 3 10.6Z" />
			<rect x="9.3" y="3.2" width="1.7" height="7.6" rx="0.7" />
		</svg>
	);
}
function Shuffle({ className, style }: GlyphProps) {
	return (
		<svg
			viewBox="0 0 14 14"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className={className}
			style={style}
		>
			<path d="M1.5 3.5h2.4L10 10.5h2.5M10.5 8.5l2 2-2 2" />
			<path d="M1.5 10.5h2.4l1.7-2M12.5 3.5H10L8.6 5.1" />
			<path d="M10.5 1.5l2 2-2 2" />
		</svg>
	);
}
function Repeat({ className, style }: GlyphProps) {
	return (
		<svg
			viewBox="0 0 14 14"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className={className}
			style={style}
		>
			<path d="M3.5 5.5V5a2 2 0 0 1 2-2H11l-1.6-1.6M11 3l-1.6 1.6" />
			<path d="M10.5 8.5V9a2 2 0 0 1-2 2H3l1.6 1.6M3 11l1.6-1.6" />
		</svg>
	);
}
function Search({ className, style }: GlyphProps) {
	return (
		<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true" className={className} style={style}>
			<circle cx="6" cy="6" r="4" />
			<path d="M9.2 9.2 12 12" />
		</svg>
	);
}
function ChevronDown({ className, style }: GlyphProps) {
	return (
		<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
			<path d="M3.5 5.5 7 9l3.5-3.5" />
		</svg>
	);
}
function ChevronLeft({ className, style }: GlyphProps) {
	return (
		<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
			<path d="M8.5 3.5 5 7l3.5 3.5" />
		</svg>
	);
}
function Dots({ className, style }: GlyphProps) {
	return (
		<svg viewBox="0 0 14 4" fill="currentColor" aria-hidden="true" className={className} style={style}>
			<circle cx="2" cy="2" r="1.3" />
			<circle cx="7" cy="2" r="1.3" />
			<circle cx="12" cy="2" r="1.3" />
		</svg>
	);
}

function Equalizer({ color, tall }: { color: string; tall?: number }) {
	const h = tall ?? 10;
	return (
		<span className="flex items-end gap-[2px]" style={{ height: h }}>
			{[0, 1, 2].map((i) => (
				<motion.span
					key={i}
					className="block w-[2px] origin-bottom rounded-full"
					style={{ height: h, backgroundColor: color }}
					animate={{ scaleY: [0.32, 1, 0.46, 0.82, 0.32] }}
					transition={{ duration: 1.1, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: i * 0.18 }}
				/>
			))}
		</span>
	);
}

/* ---------- the live walker: library -> album -> now playing, morphing ---------- */

// the traveller: the chosen album's art. home pose is the now-playing hero.
const artV: Variants = {
	library: { x: -12, y: -20, scale: 0.49 }, // tile slot 0 (22,72) at 96px
	album: { x: 34, y: -40, scale: 0.653 }, // album header art (68,52) at 128px
	nowplaying: { x: 0, y: 0, scale: 1 }, // hero (34,92) at 196px
};
// the traveller: the chosen album's title + artist. home pose is under the hero.
const metaV: Variants = {
	library: { x: -62, y: -132, scale: 0.7 }, // under tile slot 0, center 70
	album: { x: 0, y: -112, scale: 0.82 }, // under album art, center 132
	nowplaying: { x: 0, y: 0, scale: 1 }, // under hero, center 132
};

// per-leg clusters: each fades / drifts as a unit
const libV: Variants = {
	library: { opacity: 1, y: 0 },
	album: { opacity: 0, y: -20 },
	nowplaying: { opacity: 0, y: -20 },
};
const albumV: Variants = {
	library: { opacity: 0, y: 12 },
	album: { opacity: 1, y: 0 },
	nowplaying: { opacity: 0, y: -12 },
};
const nowV: Variants = {
	library: { opacity: 0, y: 16 },
	album: { opacity: 0, y: 16 },
	nowplaying: { opacity: 1, y: 0 },
};
// the contextual header glyph, crossfading per leg
const libGlyphV: Variants = { library: { opacity: 1 }, album: { opacity: 0 }, nowplaying: { opacity: 0 } };
const albGlyphV: Variants = { library: { opacity: 0 }, album: { opacity: 1 }, nowplaying: { opacity: 0 } };
const nowGlyphV: Variants = { library: { opacity: 0 }, album: { opacity: 0 }, nowplaying: { opacity: 1 } };

// library grid geometry inside the 264-wide walker
const TILE_X = [22, 146] as const;
const TILE_TOP = [72, 210, 348] as const;
const staticSlots = [
	{ col: 1, row: 0 },
	{ col: 0, row: 1 },
	{ col: 1, row: 1 },
	{ col: 0, row: 2 },
	{ col: 1, row: 2 },
] as const;

function WalkViewport({ screenKey }: { screenKey: ScreenKey }) {
	return (
		<motion.div
			className="absolute inset-0 font-[Instrument_Sans]"
			style={{ color: INK, willChange: "transform" }}
			initial={false}
			animate={screenKey}
		>
			{/* library cluster: the wordmark + the five sibling album tiles */}
			<motion.div variants={libV} transition={FADE_FAST} className="absolute inset-0">
				<div className="absolute left-[22px] top-[42px] text-[19px] font-semibold leading-none tracking-tight">library</div>
				{otherTiles.map((tile, i) => {
					const slot = staticSlots[i];
					return (
						<div
							key={tile.title}
							className="absolute w-[96px]"
							style={{ left: TILE_X[slot.col], top: TILE_TOP[slot.row] }}
						>
							<div className="h-[96px] w-[96px] rounded-[12px]" style={tile.cover} />
							<div className="mt-1.5 truncate text-[13px] font-medium leading-none">{tile.title}</div>
							<div className="mt-1 truncate text-[10px] leading-none" style={{ color: SOFT }}>
								{tile.artist}
							</div>
						</div>
					);
				})}
			</motion.div>

			{/* album cluster: play affordance + short tracklist */}
			<motion.div variants={albumV} transition={FADE} className="absolute inset-x-0 top-[226px]">
				<div className="flex justify-center">
					<div
						className="flex h-[34px] items-center gap-2 rounded-full px-5 text-[13px] font-semibold"
						style={{ backgroundColor: INK, color: PAPER }}
					>
						<PlayTri className="h-2.5 w-2.5" />
						play
					</div>
				</div>
				<div className="mt-[22px] px-[26px]">
					<div className="mb-2 text-[10px] leading-none" style={{ color: SOFT }}>
						6 songs
					</div>
					<div className="flex flex-col">
						{tracks.map((t, i) => (
							<div key={t.n} className="flex h-[33px] items-center gap-3">
								<span className="flex w-[14px] shrink-0 justify-center">
									{t.cur ? (
										<PlayTri className="h-[9px] w-[9px]" style={{ color: INK }} />
									) : (
										<span className="text-[12px] leading-none" style={{ color: SOFT }}>
											{i + 1}
										</span>
									)}
								</span>
								<span
									className={cn("min-w-0 flex-1 truncate text-[13px] leading-none", t.cur ? "font-semibold" : "font-medium")}
								>
									{t.n}
								</span>
								<span className="shrink-0 text-[11px] leading-none" style={{ color: SOFT }}>
									{t.d}
								</span>
							</div>
						))}
					</div>
				</div>
			</motion.div>

			{/* now-playing cluster: scrubber + transport */}
			<motion.div variants={nowV} transition={FADE} className="absolute inset-x-0 top-[352px]">
				<div className="px-[30px]">
					<div className="h-[3px] w-full overflow-hidden rounded-full" style={{ backgroundColor: HAIR }}>
						<div className="h-full w-[38%] rounded-full" style={{ backgroundColor: INK }} />
					</div>
					<div className="mt-2 flex items-center justify-between text-[11px] leading-none" style={{ color: SOFT }}>
						<span className="flex items-center gap-1.5">
							<Equalizer color={INK} tall={9} />
							1:27
						</span>
						<span>3:42</span>
					</div>
				</div>
				<div className="mt-[26px] flex items-center justify-center gap-[22px]">
					<Shuffle className="h-3.5 w-3.5" style={{ color: SOFT }} />
					<Skip back className="h-[17px] w-[17px]" style={{ color: INK }} />
					<div
						className="flex h-[46px] w-[46px] items-center justify-center rounded-full"
						style={{ backgroundColor: INK, color: PAPER }}
					>
						<Pause className="h-4 w-4" />
					</div>
					<Skip className="h-[17px] w-[17px]" style={{ color: INK }} />
					<Repeat className="h-3.5 w-3.5" style={{ color: SOFT }} />
				</div>
			</motion.div>

			{/* the traveller: album art (tile -> header -> hero) */}
			<motion.div
				variants={artV}
				transition={SPRING}
				className="absolute h-[196px] w-[196px] overflow-hidden rounded-[16px]"
				style={{ left: 34, top: 92, transformOrigin: "top left", ...ALBUM.cover }}
			/>

			{/* the traveller: title + artist, persisting across every leg */}
			<motion.div
				variants={metaV}
				transition={SPRING}
				className="absolute w-[220px] text-center"
				style={{ left: 22, top: 306, transformOrigin: "50% 0%" }}
			>
				<div className="truncate text-[19px] font-semibold leading-tight tracking-tight">{ALBUM.title}</div>
				<div className="mt-1 truncate text-[12px] leading-none" style={{ color: SOFT }}>
					{ALBUM.artist}
				</div>
			</motion.div>

			{/* persistent header: a contextual glyph left, a menu affordance right */}
			<div className="absolute left-[22px] top-[18px] h-4 w-4">
				<motion.span variants={libGlyphV} transition={FADE} className="absolute inset-0" style={{ color: SOFT }}>
					<Search className="h-4 w-4" />
				</motion.span>
				<motion.span variants={albGlyphV} transition={FADE} className="absolute inset-0" style={{ color: SOFT }}>
					<ChevronLeft className="h-4 w-4" />
				</motion.span>
				<motion.span variants={nowGlyphV} transition={FADE} className="absolute inset-0" style={{ color: SOFT }}>
					<ChevronDown className="h-4 w-4" />
				</motion.span>
			</div>
			<Dots className="absolute right-[22px] top-[22px] h-1 w-3.5" style={{ color: SOFT }} />
		</motion.div>
	);
}

/* ---------- the static map frames (music screens, canvas scale, by hand) ---------- */

function MiniShell({ children }: { children: React.ReactNode }) {
	return (
		<div
			className="flex h-full w-full flex-col overflow-hidden rounded-lg border font-[Instrument_Sans]"
			style={{ borderColor: HAIR, backgroundColor: PAPER, color: INK }}
		>
			{children}
		</div>
	);
}

function MiniLibrary() {
	const tiles = [ALBUM, ...otherTiles];
	return (
		<MiniShell>
			<div className="flex items-center justify-between px-3.5 pt-3.5">
				<span className="text-[14px] font-semibold leading-none tracking-tight">library</span>
				<Search className="h-3 w-3" style={{ color: SOFT }} />
			</div>
			<div className="grid flex-1 grid-cols-2 content-start gap-x-3.5 gap-y-3 px-3.5 pt-3">
				{tiles.map((t) => (
					<div key={t.title} className="min-w-0">
						<div className="aspect-square w-full rounded-md" style={t.cover} />
						<div className="mt-1 truncate text-[10px] font-medium leading-tight">{t.title}</div>
						<div className="truncate text-[8px] leading-tight" style={{ color: SOFT }}>
							{t.artist}
						</div>
					</div>
				))}
			</div>
		</MiniShell>
	);
}

function MiniAlbum() {
	return (
		<MiniShell>
			<div className="flex items-center justify-between px-3.5 pt-3.5">
				<ChevronLeft className="h-3.5 w-3.5" style={{ color: SOFT }} />
				<Dots className="h-1 w-3" style={{ color: SOFT }} />
			</div>
			<div className="flex flex-col items-center px-3.5 pt-2.5">
				<div className="h-[92px] w-[92px] rounded-lg" style={ALBUM.cover} />
				<div className="mt-2.5 text-[13px] font-semibold leading-none tracking-tight">{ALBUM.title}</div>
				<div className="mt-1 text-[10px] leading-none" style={{ color: SOFT }}>
					{ALBUM.artist}
				</div>
				<div
					className="mt-2.5 flex h-[26px] items-center gap-1.5 rounded-full px-4 text-[11px] font-semibold"
					style={{ backgroundColor: INK, color: PAPER }}
				>
					<PlayTri className="h-2 w-2" />
					play
				</div>
			</div>
			<div className="mt-3 flex flex-col px-3.5">
				{tracks.slice(0, 3).map((t, i) => (
					<div key={t.n} className="flex h-[26px] items-center gap-2">
						<span className="flex w-2.5 shrink-0 justify-center">
							{t.cur ? (
								<PlayTri className="h-2 w-2" style={{ color: INK }} />
							) : (
								<span className="text-[9px] leading-none" style={{ color: SOFT }}>
									{i + 1}
								</span>
							)}
						</span>
						<span className={cn("min-w-0 flex-1 truncate text-[10px] leading-none", t.cur ? "font-semibold" : "font-medium")}>
							{t.n}
						</span>
						<span className="shrink-0 text-[9px] leading-none" style={{ color: SOFT }}>
							{t.d}
						</span>
					</div>
				))}
			</div>
		</MiniShell>
	);
}

function MiniNowPlaying() {
	return (
		<MiniShell>
			<div className="flex items-center justify-between px-3.5 pt-3.5">
				<ChevronDown className="h-3.5 w-3.5" style={{ color: SOFT }} />
				<Dots className="h-1 w-3" style={{ color: SOFT }} />
			</div>
			<div className="flex flex-1 flex-col items-center px-4 pt-3">
				<div className="h-[124px] w-[124px] rounded-[14px]" style={ALBUM.cover} />
				<div className="mt-4 text-[15px] font-semibold leading-none tracking-tight">{ALBUM.title}</div>
				<div className="mt-1.5 text-[11px] leading-none" style={{ color: SOFT }}>
					{ALBUM.artist}
				</div>
				<div className="mt-4 w-full">
					<div className="h-[3px] w-full overflow-hidden rounded-full" style={{ backgroundColor: HAIR }}>
						<div className="h-full w-[38%] rounded-full" style={{ backgroundColor: INK }} />
					</div>
					<div className="mt-1.5 flex justify-between text-[9px] leading-none" style={{ color: SOFT }}>
						<span>1:27</span>
						<span>3:42</span>
					</div>
				</div>
				<div className="mt-4 flex items-center justify-center gap-4">
					<Skip back className="h-3.5 w-3.5" style={{ color: INK }} />
					<div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: INK, color: PAPER }}>
						<Pause className="h-3.5 w-3.5" />
					</div>
					<Skip className="h-3.5 w-3.5" style={{ color: INK }} />
				</div>
			</div>
		</MiniShell>
	);
}

function MiniMusic({ screen }: { screen: ScreenKey }) {
	if (screen === "library") return <MiniLibrary />;
	if (screen === "album") return <MiniAlbum />;
	return <MiniNowPlaying />;
}

/* ---------- geometry (fixed offsetParent-chain px, never measured) ---------- */

const BOX_W = 1328;
const BOX_H = 624;
const WALKER = { x: 96, y: 52, w: 264, h: 480 } as const;
const MINI_W = 176;
const MINI_H = 360;
const MINI_TOP = 112;
const MINI_X: Record<ScreenKey, number> = { library: 522, album: 776, nowplaying: 1030 };
const FLOW_Y = MINI_TOP + MINI_H / 2; // 292

const dotGrid: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "30px 30px",
	backgroundPosition: "-1px -1px",
};

function PillTri({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M2.5 1.6 8 5 2.5 8.4Z" />
		</svg>
	);
}

/* ---------- a map frame: real light frame, click to walk there ---------- */

function MapFrame({
	screenKey,
	index,
	active,
	onSelect,
}: {
	screenKey: ScreenKey;
	index: number;
	active: boolean;
	onSelect: (index: number) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onSelect(index)}
			aria-label={`walk to ${LABEL[screenKey]}`}
			className="group absolute cursor-pointer text-left focus-visible:outline-none"
			style={{ left: MINI_X[screenKey], top: MINI_TOP, width: MINI_W, height: MINI_H }}
		>
			{/* mono name tab: lifts and warms on hover, thread when the walk is here */}
			<span
				className={cn(
					"absolute -top-[26px] left-0 flex items-center gap-1.5 font-mono text-[11px] leading-none transition-all duration-200 group-hover:-translate-y-[3px]",
					active ? "text-thread" : "text-muted group-hover:text-text",
				)}
			>
				<span className="text-[8px] opacity-70">{active ? "▶" : "▸"}</span>
				{LABEL[screenKey]}
			</span>

			{/* the real product frame, light on the dark canvas: the leg ahead sits
			    back a touch so the walk reads its direction even at rest */}
			<div
				className={cn(
					"relative h-full w-full transition-opacity duration-500",
					active ? "opacity-100" : "opacity-[0.88] group-hover:opacity-100",
				)}
			>
				<MiniMusic screen={screenKey} />
			</div>

			{/* the walk is currently here: a soft thread tint (never the walker's bright ring) */}
			<div
				className={cn(
					"pointer-events-none absolute -inset-[3px] rounded-[13px] border border-thread/35 transition-opacity duration-300 group-hover:opacity-0",
					active ? "opacity-100" : "opacity-0",
				)}
			/>

			{/* hover: a crisper thread selection ring + corner ticks */}
			<div className="pointer-events-none absolute -inset-[5px] rounded-[15px] border-[1.5px] border-thread opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
			{["-left-[9px] -top-[9px]", "-right-[9px] -top-[9px]", "-bottom-[9px] -left-[9px]", "-bottom-[9px] -right-[9px]"].map(
				(pos) => (
					<span
						key={pos}
						className={cn(
							"pointer-events-none absolute h-[7px] w-[7px] rounded-[2px] border-[1.5px] border-thread bg-on-thread opacity-0 transition-opacity duration-200 group-hover:opacity-100",
							pos,
						)}
					/>
				),
			)}
		</button>
	);
}

/* ---------- flow arrows: the red thread, in sequence ---------- */

function FlowArrows() {
	const legs = [
		{ from: MINI_X.library + MINI_W, to: MINI_X.album, delay: 0 },
		{ from: MINI_X.album + MINI_W, to: MINI_X.nowplaying, delay: 0.9 },
	];
	return (
		<svg
			className="pointer-events-none absolute inset-0 h-full w-full"
			viewBox={`0 0 ${BOX_W} ${BOX_H}`}
			fill="none"
			aria-hidden="true"
		>
			<defs>
				<marker
					id="site-flow-ah"
					viewBox="0 0 8 8"
					refX="6"
					refY="4"
					markerWidth="7"
					markerHeight="7"
					markerUnits="userSpaceOnUse"
					orient="auto"
				>
					<path d="M1 1 8 4 1 7Z" fill="var(--color-thread)" fillOpacity="0.85" />
				</marker>
			</defs>
			{legs.map((leg) => (
				<g key={leg.from}>
					<line
						x1={leg.from + 7}
						y1={FLOW_Y}
						x2={leg.to - 8}
						y2={FLOW_Y}
						stroke="var(--color-thread)"
						strokeWidth="1.6"
						strokeOpacity="0.6"
						markerEnd="url(#site-flow-ah)"
					/>
					<motion.circle
						cx={leg.from + 7}
						cy={FLOW_Y}
						r="2.4"
						fill="var(--color-thread)"
						animate={{ x: [0, leg.to - leg.from - 15], opacity: [0, 1, 1, 0] }}
						transition={{
							duration: 1.7,
							repeat: Number.POSITIVE_INFINITY,
							ease: "easeInOut",
							repeatDelay: 1.1,
							delay: leg.delay,
						}}
					/>
				</g>
			))}
		</svg>
	);
}

/* ---------- the player pill beneath the walker ---------- */

function StepDot({ active, onSelect, name }: { active: boolean; onSelect: () => void; name: string }) {
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-label={`walk to ${name}`}
			className="group flex h-4 w-4 cursor-pointer items-center justify-center focus-visible:outline-none"
		>
			<span className="relative flex h-2 w-2 items-center justify-center">
				{active ? <span className="absolute -inset-[3px] rounded-full border border-thread/40" /> : null}
				<span
					className={cn(
						"h-1.5 w-1.5 rounded-full transition-colors",
						active ? "bg-thread" : "bg-border-raised group-hover:bg-muted",
					)}
				/>
			</span>
		</button>
	);
}

function PlayerPill({ screen, onSelect }: { screen: number; onSelect: (index: number) => void }) {
	return (
		<div className="flex w-[322px] items-center gap-3 rounded-full border border-border-raised bg-bg/85 px-4 py-2.5 backdrop-blur-sm">
			<motion.span
				className="text-thread"
				animate={{ opacity: [0.55, 1, 0.55] }}
				transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
			>
				<PillTri className="h-2.5 w-2.5" />
			</motion.span>
			<div className="w-[80px] overflow-hidden">
				<motion.span
					key={screen}
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4, ease: "easeOut" }}
					className="block truncate font-mono text-[11px] leading-none text-text"
				>
					{LABEL[keyOf(screen)]}
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
				{ORDER.map((name, i) => (
					<StepDot key={name} name={LABEL[name]} active={screen === i} onSelect={() => onSelect(i)} />
				))}
			</div>
		</div>
	);
}

/* ---------- the demo stage: the morph target ---------- */

function Stage() {
	const [screen, setScreen] = useState(0);
	const [pausedUntil, setPausedUntil] = useState(0);
	const screenKey = keyOf(screen);

	// Auto-advance on a slow loop. A manual take-over sets pausedUntil ~10s out;
	// the timer waits that long before the next leg, then resumes.
	useEffect(() => {
		const wait = Math.max(LEG_MS, pausedUntil - Date.now());
		const id = window.setTimeout(() => setScreen((s) => (s + 1) % ORDER.length), wait);
		return () => window.clearTimeout(id);
	}, [screen, pausedUntil]);

	function select(index: number) {
		setScreen(index);
		setPausedUntil(Date.now() + PAUSE_MS);
	}

	return (
		<div
			className="absolute overflow-hidden rounded-2xl border border-border bg-canvas"
			style={{ left: 56, top: 210, width: BOX_W, height: BOX_H, viewTransitionName: "site-flows-card", ...dotGrid }}
		>
			{/* lighting: a thread halo behind the walker (breathing) + an edge vignette */}
			<motion.div
				className="pointer-events-none absolute h-[560px] w-[560px] rounded-full"
				style={{
					left: WALKER.x + WALKER.w / 2 - 280,
					top: WALKER.y + WALKER.h / 2 - 280,
					background:
						"radial-gradient(circle, color-mix(in srgb, var(--color-thread) 15%, transparent) 0%, transparent 64%)",
				}}
				animate={{ opacity: [0.72, 1, 0.72] }}
				transition={{ duration: 5.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
			/>
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(96% 86% at 30% 46%, rgba(255,255,255,0.02) 0%, transparent 40%, rgba(0,0,0,0.5) 100%)",
				}}
			/>

			<FlowArrows />

			{/* the flow, three real product frames */}
			<MapFrame screenKey="library" index={0} active={screen === 0} onSelect={select} />
			<MapFrame screenKey="album" index={1} active={screen === 1} onSelect={select} />
			<MapFrame screenKey="nowplaying" index={2} active={screen === 2} onSelect={select} />

			{/* the live walker: lit, ringed, playing the flow */}
			<div className="absolute" style={{ left: WALKER.x, top: WALKER.y }}>
				<div className="absolute -top-[26px] left-0 flex items-center gap-1.5 font-mono text-[11px] leading-none text-thread">
					<span className="text-[8px] opacity-70">▶</span>
					<span className="relative block h-3 w-[86px]">
						<motion.span
							key={screen}
							initial={{ opacity: 0, y: 3 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.42, ease: "easeOut" }}
							className="absolute inset-0"
						>
							{LABEL[screenKey]}
						</motion.span>
					</span>
				</div>
				<div className="pointer-events-none absolute -inset-[7px] rounded-[24px] border-[1.5px] border-thread/55" />
				{[
					{ l: -11, t: -11 },
					{ l: WALKER.w + 3, t: -11 },
					{ l: -11, t: WALKER.h + 3 },
					{ l: WALKER.w + 3, t: WALKER.h + 3 },
				].map((c) => (
					<span
						key={`${c.l}-${c.t}`}
						className="pointer-events-none absolute h-2 w-2 rounded-[2px] border-[1.5px] border-thread bg-on-thread"
						style={{ left: c.l, top: c.t }}
					/>
				))}
				<div
					className="relative overflow-hidden rounded-[18px] border"
					style={{ width: WALKER.w, height: WALKER.h, borderColor: HAIR, backgroundColor: PAPER }}
				>
					<WalkViewport screenKey={screenKey} />
				</div>
			</div>

			{/* the player pill, centered beneath the walker */}
			<div className="absolute" style={{ left: WALKER.x + WALKER.w / 2 - 161, top: WALKER.y + WALKER.h + 16 }}>
				<PlayerPill screen={screen} onSelect={select} />
			</div>

			{/* quiet canvas chrome */}
			<div className="absolute bottom-4 left-5 flex items-center gap-1.5 font-mono text-[10px] text-muted/80">
				<SpoolMark className="h-3 w-3 text-muted/70" />
				<span>canvas</span>
			</div>
		</div>
	);
}

/* ---------- the shared section chrome ---------- */

function BackChip() {
	return (
		<button
			type="button"
			data-go="site-hub"
			aria-label="back to canvas"
			className="group absolute left-14 top-11 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface/40 px-2.5 py-1.5 font-mono text-[11px] leading-none text-muted transition-colors hover:border-thread/40 hover:text-text"
		>
			<span className="text-muted transition-colors group-hover:text-thread">←</span>
			canvas
		</button>
	);
}

export default function SiteFlows() {
	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<BackChip />

			{/* section heading */}
			<div className="absolute left-14 top-[92px]">
				<h1 className="text-[68px] font-semibold leading-[0.95] tracking-[-0.02em]">flows</h1>
				<p className="mt-3 text-[16px] leading-[24px] text-muted">
					link frames into walks. one screen morphs into the next.
				</p>
			</div>

			{/* the body is the demo */}
			<Stage />

			{/* one quiet closing line */}
			<p className="absolute bottom-9 left-14 font-mono text-[11px] leading-none text-muted">
				arrows are derived from your code. walks verify them.
			</p>
		</div>
	);
}
