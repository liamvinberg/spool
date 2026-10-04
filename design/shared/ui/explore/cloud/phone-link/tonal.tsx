import { AnimatePresence, animate, type MotionValue, motion, type PanInfo, useMotionValue, useTransform } from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Tonal, a music app built to be felt on a real phone through a shared link
 * (DEV-115), after the native moves Mobbin shows in Apple Music, Spotify and
 * Sonos: a mini player that grows into Now Playing and drags back down, album
 * art that flies from its card into the album page, a header that stretches
 * when you pull, long-press menus, a tab bar that stays while pages push, and
 * an edge swipe back that follows your finger.
 *
 * Shared UI takes values and callbacks only; the frames own ui.state and walks.
 * Prototype only.
 */

/* ---------- motion ---------- */

export const IOS = [0.32, 0.72, 0, 1] as const;
export const SHEET = { type: "spring", stiffness: 380, damping: 40, mass: 1 } as const;
export const POP = { type: "spring", stiffness: 650, damping: 32 } as const;
export const TOP = "env(safe-area-inset-top)";
export const BOTTOM = "env(safe-area-inset-bottom)";
export const BG = "#0B0B0D";
export const ACCENT = "#FF5A36";

/** iOS has no vibration API; toggling an <input switch> through its label ticks, inside a tap. */
export function haptic() {
	try {
		const label = document.createElement("label");
		label.ariaHidden = "true";
		label.style.display = "none";
		const input = document.createElement("input");
		input.type = "checkbox";
		input.setAttribute("switch", "");
		label.appendChild(input);
		document.body.appendChild(label);
		label.click();
		label.remove();
	} catch {
		// no switch, no tick
	}
}

/* ---------- catalogue ---------- */

export interface Album {
	id: string;
	title: string;
	artist: string;
	year: number;
	colors: [string, string, string];
	shape: "sun" | "rings" | "stripes" | "dots";
	tracks: [string, number][];
}

const t = (names: string, lengths: number[]): [string, number][] => names.split("|").map((n, i) => [n, lengths[i % lengths.length] ?? 200]);
const L = [214, 187, 241, 199, 263, 176, 228, 205, 252, 193];

export const ALBUMS: Album[] = [
	{ id: "low-tide", title: "Low Tide", artist: "Marlow Hayes", year: 2026, colors: ["#16324A", "#5FA8D3", "#F4B860"], shape: "sun", tracks: t("Saltwater|Harbour Lights|Slow Return|Undertow|Kelp Forest|Lighthouse Keeper|Ebb|Blue Hour|The Long Swim", L) },
	{ id: "neon-orchard", title: "Neon Orchard", artist: "Sundae Club", year: 2026, colors: ["#3A0CA3", "#F72585", "#4CC9F0"], shape: "rings", tracks: t("Peach Fuzz|Glow Stick Summer|Orchard|Arcade Heart|Cherry Static|Midnight Fruit|Laser Bloom|Ripe", L.slice(2)) },
	{ id: "quiet-machines", title: "Quiet Machines", artist: "Ida Brenner", year: 2025, colors: ["#0F1A14", "#2D6A4F", "#B7E4C7"], shape: "stripes", tracks: t("Idle|Fan Noise|Servo Lullaby|Cold Boot|Soft Reset|Standby|Hum", L.slice(4)) },
	{ id: "paper-suns", title: "Paper Suns", artist: "The Halverts", year: 2025, colors: ["#5E1D0F", "#E76F51", "#F4A261"], shape: "sun", tracks: t("Origami|Paper Suns|Kite String|Folded Light|August|Warm Static|Crease|Dry Grass|Flicker|Last Bonfire", L) },
	{ id: "glasshouse", title: "Glasshouse", artist: "Noor & the Weather", year: 2026, colors: ["#22223B", "#9A8C98", "#F2E9E4"], shape: "dots", tracks: t("Condensation|Fern|Glasshouse|Under Glass|Humid|Orchid|Pane", L.slice(1)) },
	{ id: "velvet-static", title: "Velvet Static", artist: "KAIRO", year: 2026, colors: ["#10002B", "#7B2CBF", "#E0AAFF"], shape: "rings", tracks: t("Velvet|Static Bloom|Afterimage|Violet Hour|Low Signal|Haze|Mirrorball|Exit Wound", L.slice(3)) },
	{ id: "northbound", title: "Northbound", artist: "Elk Fjord", year: 2024, colors: ["#0B2027", "#40798C", "#CFD7C7"], shape: "stripes", tracks: t("Northbound|Tundra|Pine Needles|Ferry|Aurora|Snowline|Cabin Fever|Thaw", L.slice(5)) },
	{ id: "sugar-hours", title: "Sugar Hours", artist: "Lumi Park", year: 2026, colors: ["#FF006E", "#FB5607", "#FFBE0B"], shape: "dots", tracks: t("Sugar Hours|Bubblegum Sky|Sprinkles|Pop Rocks|Fizz|Caramel|Sour Patch|Candy Floss|Sweet Tooth", L.slice(2)) },
];

export const album = (id: string | undefined) => ALBUMS.find((a) => a.id === id) ?? ALBUMS[0]!;
export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** What is playing. Seconds played = at, plus the time since `since` while playing. */
export interface Now {
	album: string;
	index: number;
	playing: boolean;
	at: number;
	since: number;
}
export const elapsed = (now: Now) => now.at + (now.playing ? (Date.now() - now.since) / 1000 : 0);
export const play = (a: Album, index: number): Now => ({ album: a.id, index, playing: true, at: 0, since: Date.now() });
export const toggle = (now: Now): Now => (now.playing ? { ...now, playing: false, at: elapsed(now) } : { ...now, playing: true, since: Date.now() });
export const skip = (now: Now, by: number): Now => {
	const a = album(now.album);
	return { ...now, index: (now.index + by + a.tracks.length) % a.tracks.length, at: 0, since: Date.now(), playing: true };
};
export const seek = (now: Now, at: number): Now => ({ ...now, at, since: Date.now() });

/** Survives walks inside the player's one document. */
export const memory = { homeScroll: 0, albumScroll: 0 };

/* ---------- art ---------- */

export function Art({ a, size, radius = 10, name, label = false }: { a: Album; size: number | string; radius?: number; name?: string; label?: boolean }) {
	const [c0, c1, c2] = a.colors;
	const shape =
		a.shape === "sun"
			? `radial-gradient(circle at 68% 38%, ${c2} 0 22%, transparent 22.5%)`
			: a.shape === "rings"
				? `repeating-radial-gradient(circle at 30% 70%, ${c2}55 0 6%, transparent 6% 12%)`
				: a.shape === "stripes"
					? `repeating-linear-gradient(115deg, ${c2}40 0 7%, transparent 7% 14%)`
					: `radial-gradient(${c2}aa 18%, transparent 19%) 0 0 / 22% 22%`;
	return (
		<span
			data-art={a.id}
			className="relative block shrink-0 overflow-hidden"
			style={{
				width: size,
				height: size,
				borderRadius: radius,
				background: `${shape}, radial-gradient(circle at 20% 15%, ${c1}, transparent 65%), linear-gradient(160deg, ${c1}, ${c0})`,
				viewTransitionName: name,
			}}
		>
			{label ? (
				<span className="absolute bottom-[8%] left-[8%] font-bold text-[#fff]/90 leading-none tracking-tight" style={{ fontSize: "clamp(9px, 9cqw, 30px)" }}>
					{a.title}
				</span>
			) : null}
		</span>
	);
}

/* ---------- bars ---------- */

/** Clear over a large title, frosted once content slides under it. */
export function NavBar({ title, solid, left, right, tint = "rgba(11,11,13,0.72)" }: { title: ReactNode; solid: MotionValue<number>; left?: ReactNode; right?: ReactNode; tint?: string }) {
	return (
		<div className="pointer-events-none absolute inset-x-0 top-0 z-20" style={{ paddingTop: TOP }}>
			<motion.div className="absolute inset-0 border-[#fff]/10 border-b-[0.5px] backdrop-blur-xl backdrop-saturate-150" style={{ opacity: solid, background: tint }} />
			<div className="pointer-events-auto relative flex h-[44px] items-center justify-between px-4">
				<span className="min-w-[90px]">{left}</span>
				<motion.span className="truncate font-semibold text-[17px]" style={{ opacity: solid }}>
					{title}
				</motion.span>
				<span className="flex min-w-[90px] justify-end">{right}</span>
			</div>
		</div>
	);
}

export const TABS = ["Home", "Search", "Library"] as const;
export type Tab = (typeof TABS)[number];

function TabIcon({ tab }: { tab: Tab }) {
	if (tab === "Home")
		return (
			<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d="M12 3.2 3 10.4V20a1 1 0 0 0 1 1h5.5v-6h5v6H20a1 1 0 0 0 1-1v-9.6z" />
			</svg>
		);
	if (tab === "Search")
		return (
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
				<circle cx="10.5" cy="10.5" r="6.5" />
				<path d="m15.5 15.5 5 5" />
			</svg>
		);
	return (
		<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
			<path d="M5 4v16M10 4v16M15 5l4 15" />
		</svg>
	);
}

/** The floating glass tab bar. Named for view transitions, so a push leaves it in place. */
export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
	return (
		<div className="absolute inset-x-0 z-30 flex justify-center" style={{ bottom: `calc(${BOTTOM} + 4px)`, viewTransitionName: "tonal-tabs" }}>
			<div className="flex h-[62px] w-[calc(100%-40px)] items-center rounded-full border border-[#fff]/10 bg-[#1C1C1F]/88 p-1 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-150">
				{TABS.map((x) => (
					<button
						key={x}
						type="button"
						onClick={() => {
							if (x !== tab) haptic();
							onTab(x);
						}}
						className="relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 text-[10px]"
						style={{ color: x === tab ? ACCENT : "rgba(245,245,247,0.6)" }}
					>
						{x === tab ? <motion.span layoutId="tonal-tab" className="absolute inset-0 rounded-full bg-[#fff]/10" transition={POP} /> : null}
						<span className="relative">
							<TabIcon tab={x} />
						</span>
						<span className="relative font-medium">{x}</span>
					</button>
				))}
			</div>
		</div>
	);
}

/* ---------- pages ---------- */

/** A scroller with a large title that folds into its bar. Keeps its offset in `memory[key]`. */
export function Page({ title, children, still = false, keep, right }: { title: string; children: ReactNode; still?: boolean; keep?: "homeScroll"; right?: ReactNode }) {
	const ref = useRef<HTMLDivElement | null>(null);
	const solid = useMotionValue(0);
	const big = useTransform(solid, [0, 1], [1, 0]);
	useLayoutEffect(() => {
		const el = ref.current;
		if (el === null || keep === undefined) return;
		el.scrollTop = memory[keep];
		solid.set(Math.min(1, Math.max(0, (el.scrollTop - 20) / 30)));
	}, [keep, solid]);
	return (
		<div className={`absolute inset-0 ${still ? "pointer-events-none" : ""}`} style={{ background: BG }}>
			<div
				ref={ref}
				className="absolute inset-0 overflow-y-auto overscroll-y-contain [scrollbar-width:none]"
				onScroll={(e) => {
					const top = e.currentTarget.scrollTop;
					solid.set(Math.min(1, Math.max(0, (top - 20) / 30)));
					if (keep !== undefined && !still) memory[keep] = top;
				}}
			>
				<div style={{ paddingTop: `calc(${TOP} + 44px)`, paddingBottom: `calc(${BOTTOM} + 170px)` }}>
					<motion.h1 className="px-5 pb-2 font-bold text-[34px] leading-tight tracking-tight" style={{ opacity: big }}>
						{title}
					</motion.h1>
					{children}
				</div>
			</div>
			<NavBar title={title} solid={solid} right={right} />
		</div>
	);
}

function Shelf({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="pt-5">
			<h2 className="flex items-center gap-1 px-5 pb-3 font-bold text-[21px] tracking-tight">
				{title}
				<svg width="9" height="15" viewBox="0 0 9 15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="mt-0.5 text-[#fff]/40" aria-hidden="true">
					<path d="m1.5 1.5 6 6-6 6" />
				</svg>
			</h2>
			<div className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</div>
		</section>
	);
}

/** Opening an album: the card's art is the one that flies, so it takes the shared name first. */
export function Card({ a, size, onOpen, current, wide = false }: { a: Album; size: number; onOpen: (a: Album) => void; current: boolean; wide?: boolean }) {
	return (
		<motion.button
			type="button"
			whileTap={{ scale: 0.96 }}
			transition={POP}
			onClick={(e) => {
				// the walk films the page as it is now, so the name has to be on this card before it starts
				for (const el of document.querySelectorAll<HTMLElement>("[data-art]")) if (el.style.viewTransitionName === "tonal-art") el.style.viewTransitionName = "";
				const art = e.currentTarget.querySelector<HTMLElement>("[data-art]");
				if (art) art.style.viewTransitionName = "tonal-art";
				onOpen(a);
			}}
			className="shrink-0 snap-start text-left"
			style={{ width: size }}
		>
			<span className="block [container-type:inline-size]">
				<Art a={a} size={size} radius={wide ? 14 : 10} name={current ? "tonal-art" : undefined} label={wide} />
			</span>
			<span className="mt-2 block truncate font-medium text-[14px]">{a.title}</span>
			<span className="block truncate text-[#fff]/55 text-[13px]">{a.artist}</span>
		</motion.button>
	);
}

/** Home tab. `current` is the album last opened: its card carries the shared art name, so back flies home. */
export function HomeTab({ onOpen, current, onPlay }: { onOpen: (a: Album) => void; current?: string; onPlay: (a: Album) => void }) {
	const named = new Set<string>();
	const isCurrent = (a: Album) => {
		if (a.id !== current || named.has(a.id)) return false;
		named.add(a.id);
		return true;
	};
	return (
		<>
			<Shelf title="Top picks for you">
				{ALBUMS.slice(0, 4).map((a) => (
					<Card key={a.id} a={a} size={250} wide onOpen={onOpen} current={isCurrent(a)} />
				))}
			</Shelf>
			<Shelf title="New releases">
				{ALBUMS.slice(4).map((a) => (
					<Card key={a.id} a={a} size={150} onOpen={onOpen} current={isCurrent(a)} />
				))}
			</Shelf>
			<section className="px-5 pt-6">
				<h2 className="pb-3 font-bold text-[21px] tracking-tight">Recently played</h2>
				<div className="grid grid-cols-2 gap-2.5">
					{[...ALBUMS].reverse().map((a) => (
						<motion.button key={a.id} type="button" whileTap={{ scale: 0.97 }} transition={POP} onClick={() => onPlay(a)} className="flex items-center gap-2.5 overflow-hidden rounded-[10px] bg-[#fff]/8 pr-2 text-left">
							<Art a={a} size={52} radius={0} />
							<span className="min-w-0 flex-1 truncate font-medium text-[13px]">{a.title}</span>
						</motion.button>
					))}
				</div>
			</section>
		</>
	);
}

const GENRES: [string, string][] = [
	["Pop", "#E13300"],
	["Indie", "#7D4B32"],
	["Electronic", "#0D73EC"],
	["Chill", "#477D95"],
	["Jazz", "#8C67AB"],
	["Focus", "#503750"],
	["Folk", "#27856A"],
	["Ambient", "#1E3264"],
];

/** Search tab: the field takes the keyboard, results fold in as you type. */
export function SearchTab({ onOpen }: { onOpen: (a: Album) => void }) {
	const [q, setQ] = useState("");
	const [focus, setFocus] = useState(false);
	const hits = ALBUMS.filter((a) => q !== "" && `${a.title} ${a.artist} ${a.tracks.map((x) => x[0]).join(" ")}`.toLowerCase().includes(q.toLowerCase()));
	return (
		<div className="px-5">
			<div className="flex items-center gap-3 pb-4">
				<label className="flex h-[40px] flex-1 items-center gap-2 rounded-[12px] bg-[#fff]/10 px-3 text-[#fff]/50">
					<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
						<circle cx="10.5" cy="10.5" r="6.5" />
						<path d="m15.5 15.5 5 5" />
					</svg>
					<input
						value={q}
						onChange={(e) => setQ(e.target.value)}
						onFocus={() => setFocus(true)}
						onBlur={() => setFocus(false)}
						placeholder="Artists, songs, albums"
						className="w-full select-text bg-transparent text-[#F5F5F7] text-[17px] outline-none placeholder:text-[#fff]/40"
					/>
				</label>
				<AnimatePresence initial={false}>
					{focus || q !== "" ? (
						<motion.button
							type="button"
							initial={{ opacity: 0, width: 0 }}
							animate={{ opacity: 1, width: "auto" }}
							exit={{ opacity: 0, width: 0 }}
							transition={{ duration: 0.25, ease: IOS }}
							onClick={() => {
								setQ("");
								(document.activeElement as HTMLElement | null)?.blur();
							}}
							className="overflow-hidden whitespace-nowrap text-[17px]"
							style={{ color: ACCENT }}
						>
							Cancel
						</motion.button>
					) : null}
				</AnimatePresence>
			</div>
			<AnimatePresence mode="popLayout" initial={false}>
				{q === "" ? (
					<motion.div key="genres" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-2 gap-3">
						{GENRES.map(([g, c]) => (
							<motion.button key={g} type="button" whileTap={{ scale: 0.96 }} transition={POP} onClick={() => setQ(g === "Chill" ? "low" : g.slice(0, 2).toLowerCase())} className="relative h-[100px] overflow-hidden rounded-[12px] p-3 text-left font-bold text-[17px]" style={{ background: c }}>
								{g}
								<span className="absolute -right-4 -bottom-3 size-[64px] rotate-[25deg] rounded-[8px] bg-[#000]/20" />
							</motion.button>
						))}
					</motion.div>
				) : (
					<motion.div key="hits" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
						{hits.length === 0 ? <p className="pt-10 text-center text-[#fff]/45 text-[15px]">No results for “{q}”.</p> : null}
						{hits.map((a, i) => (
							<motion.button key={a.id} type="button" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03, duration: 0.25, ease: IOS }} onClick={() => onOpen(a)} className="flex w-full items-center gap-3 py-2 text-left active:opacity-60">
								<Art a={a} size={56} radius={8} />
								<span className="min-w-0">
									<span className="block truncate text-[16px]">{a.title}</span>
									<span className="block truncate text-[#fff]/55 text-[14px]">Album · {a.artist}</span>
								</span>
							</motion.button>
						))}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

export function LibraryTab({ onOpen }: { onOpen: (a: Album) => void }) {
	return (
		<div className="px-5">
			{ALBUMS.map((a) => (
				<button key={a.id} type="button" onClick={() => onOpen(a)} className="flex w-full items-center gap-3 py-2 text-left active:opacity-60">
					<Art a={a} size={64} radius={8} />
					<span className="min-w-0 flex-1 border-[#fff]/10 border-b py-4">
						<span className="block truncate text-[16px]">{a.title}</span>
						<span className="block truncate text-[#fff]/55 text-[14px]">{a.artist}</span>
					</span>
				</button>
			))}
		</div>
	);
}

/* ---------- playing ---------- */

/** Tracks a playing Now in real time: seconds played, refreshed four times a second. */
export function useElapsed(now: Now | null) {
	const [s, setS] = useState(now === null ? 0 : elapsed(now));
	useEffect(() => {
		if (now === null) return;
		setS(elapsed(now));
		const id = window.setInterval(() => setS(elapsed(now)), 250);
		return () => window.clearInterval(id);
	}, [now]);
	return s;
}

export function Equalizer({ playing, color = ACCENT }: { playing: boolean; color?: string }) {
	return (
		<span className="flex h-[14px] w-[16px] items-end justify-between">
			{[0, 1, 2, 3].map((i) => (
				<motion.span
					key={i}
					className="w-[3px] rounded-full"
					style={{ background: color }}
					animate={playing ? { height: ["30%", "100%", "50%", "85%", "30%"] } : { height: "30%" }}
					transition={playing ? { duration: 0.9 + i * 0.13, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" } : { duration: 0.2 }}
				/>
			))}
		</span>
	);
}

function PlayIcon({ playing, size }: { playing: boolean; size: number }) {
	return (
		<AnimatePresence mode="popLayout" initial={false}>
			<motion.svg key={playing ? "pause" : "play"} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={POP} aria-hidden="true">
				{playing ? <path d="M6 4h4v16H6zM14 4h4v16h-4z" /> : <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />}
			</motion.svg>
		</AnimatePresence>
	);
}

function SkipIcon({ back = false, size = 30 }: { back?: boolean; size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ transform: back ? "scaleX(-1)" : undefined }} aria-hidden="true">
			<path d="M3 5.5v13a.8.8 0 0 0 1.2.7L13 13.6v4.9a.8.8 0 0 0 1.2.7l9-6.5a.8.8 0 0 0 0-1.4l-9-6.5a.8.8 0 0 0-1.2.7v4.9L4.2 4.8A.8.8 0 0 0 3 5.5z" />
		</svg>
	);
}

/** The mini player: a glass capsule over the tab bar. Tap to grow it; swipe it sideways to skip. */
function Mini({ now, onChange, onOpen }: { now: Now; onChange: (n: Now) => void; onOpen: () => void }) {
	const a = album(now.album);
	const [title] = a.tracks[now.index] ?? ["", 0];
	return (
		<motion.div
			className="absolute inset-x-0 z-30 flex justify-center"
			style={{ bottom: `calc(${BOTTOM} + 74px)`, viewTransitionName: "tonal-mini" }}
			initial={{ y: 40, opacity: 0 }}
			animate={{ y: 0, opacity: 1 }}
			exit={{ y: 40, opacity: 0 }}
			transition={SHEET}
		>
			<motion.div
				layoutId="tonal-player"
				drag="x"
				dragConstraints={{ left: 0, right: 0 }}
				dragElastic={0.35}
				onDragEnd={(_: unknown, info: PanInfo) => {
					if (Math.abs(info.offset.x) > 70) {
						haptic();
						onChange(skip(now, info.offset.x < 0 ? 1 : -1));
					}
				}}
				onTap={onOpen}
				className="flex h-[56px] w-[calc(100%-28px)] items-center gap-3 rounded-[18px] border border-[#fff]/10 bg-[#2A2A2E]/90 pr-2 pl-2 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
				style={{ borderRadius: 18 }}
			>
				<motion.span layoutId="tonal-player-art" className="block" style={{ borderRadius: 8 }}>
					<Art a={a} size={40} radius={8} />
				</motion.span>
				<AnimatePresence mode="popLayout" initial={false}>
					<motion.span key={`${a.id}-${now.index}`} className="min-w-0 flex-1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25, ease: IOS }}>
						<span className="block truncate font-medium text-[15px]">{title}</span>
						<span className="block truncate text-[#fff]/55 text-[13px]">{a.artist}</span>
					</motion.span>
				</AnimatePresence>
				<motion.button
					type="button"
					whileTap={{ scale: 0.8 }}
					onPointerDown={(e) => e.stopPropagation()}
					onClick={(e) => {
						e.stopPropagation();
						haptic();
						onChange(toggle(now));
					}}
					className="flex size-[40px] items-center justify-center"
				>
					<PlayIcon playing={now.playing} size={24} />
				</motion.button>
				<motion.button
					type="button"
					whileTap={{ scale: 0.8 }}
					onPointerDown={(e) => e.stopPropagation()}
					onClick={(e) => {
						e.stopPropagation();
						haptic();
						onChange(skip(now, 1));
					}}
					className="flex size-[40px] items-center justify-center"
				>
					<SkipIcon size={24} />
				</motion.button>
			</motion.div>
		</motion.div>
	);
}

/** Scrubbing: the bar thickens under your thumb and ticks at either end. */
function Scrubber({ now, onChange, color }: { now: Now; onChange: (n: Now) => void; color: string }) {
	const a = album(now.album);
	const dur = a.tracks[now.index]?.[1] ?? 200;
	const s = useElapsed(now);
	const [held, setHeld] = useState<number | null>(null);
	const bar = useRef<HTMLDivElement | null>(null);
	const ratio = Math.min(1, (held ?? s) / dur);
	const at = (x: number) => {
		const r = bar.current?.getBoundingClientRect();
		if (r === undefined) return 0;
		return Math.min(1, Math.max(0, (x - r.left) / r.width)) * dur;
	};
	return (
		<div>
			<div
				ref={bar}
				className="relative flex h-[28px] touch-none items-center"
				onPointerDown={(e) => {
					e.currentTarget.setPointerCapture(e.pointerId);
					setHeld(at(e.clientX));
				}}
				onPointerMove={(e) => {
					if (held === null) return;
					const next = at(e.clientX);
					if ((next <= 0 || next >= dur) && next !== held) haptic();
					setHeld(next);
				}}
				onPointerUp={() => {
					if (held !== null) onChange(seek(now, held));
					setHeld(null);
				}}
			>
				<motion.div className="w-full overflow-hidden rounded-full bg-[#fff]/25" animate={{ height: held === null ? 6 : 12 }} transition={POP}>
					<div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: color }} />
				</motion.div>
			</div>
			<div className="flex justify-between text-[#fff]/55 text-[12px] tabular-nums">
				<span>{fmt(held ?? s)}</span>
				<span>-{fmt(Math.max(0, dur - (held ?? s)))}</span>
			</div>
		</div>
	);
}

/** Now Playing: grows out of the mini player, drifts its colours, drags back down. */
function Full({ now, onChange, onClose }: { now: Now; onChange: (n: Now) => void; onClose: () => void }) {
	const a = album(now.album);
	const [title] = a.tracks[now.index] ?? ["", 0];
	const [c0, c1, c2] = a.colors;
	const y = useMotionValue(0);
	const corner = useTransform(y, [0, 120], [0, 38]);
	const [vol, setVol] = useState(0.7);
	return (
		<motion.div
			layoutId="tonal-player"
			className="absolute inset-0 z-50 overflow-hidden"
			style={{ y, borderRadius: corner, background: c0 }}
			drag="y"
			dragConstraints={{ top: 0, bottom: 0 }}
			dragElastic={{ top: 0, bottom: 0.9 }}
			onDragEnd={(_: unknown, info: PanInfo) => {
				if (info.offset.y > 120 || info.velocity.y > 600) onClose();
			}}
			transition={SHEET}
		>
			<div className="pointer-events-none absolute inset-0 overflow-hidden">
				<motion.span className="absolute size-[420px] rounded-full opacity-70 blur-[70px]" style={{ background: c1, left: -120, top: -60 }} animate={{ x: [0, 80, -20, 0], y: [0, 60, 120, 0] }} transition={{ duration: 18, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }} />
				<motion.span className="absolute size-[360px] rounded-full opacity-50 blur-[70px]" style={{ background: c2, right: -140, bottom: 80 }} animate={{ x: [0, -60, 30, 0], y: [0, -80, -20, 0] }} transition={{ duration: 22, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }} />
				<span className="absolute inset-0 bg-[#000]/25" />
			</div>
			<div className="relative flex h-full flex-col px-7" style={{ paddingTop: `calc(${TOP} + 6px)`, paddingBottom: `calc(${BOTTOM} + 10px)` }}>
				<button type="button" onClick={onClose} className="mx-auto mb-6 h-[5px] w-[40px] rounded-full bg-[#fff]/40" aria-label="Close" />
				<div className="flex flex-1 items-center justify-center">
					<motion.span layoutId="tonal-player-art" className="block overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.45)]" style={{ borderRadius: 14 }} animate={{ scale: now.playing ? 1 : 0.8 }} transition={SHEET}>
						<AnimatePresence mode="popLayout" initial={false}>
							<motion.span key={`${a.id}-${now.index}`} className="block" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.3, ease: IOS }}>
								<Art a={a} size="min(calc(100vw - 56px), 48vh)" radius={14} />
							</motion.span>
						</AnimatePresence>
					</motion.span>
				</div>
				<div className="pt-8">
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.div key={`${a.id}-${now.index}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: IOS }}>
							<div className="truncate font-semibold text-[22px]">{title}</div>
							<div className="truncate text-[#fff]/60 text-[19px]">{a.artist}</div>
						</motion.div>
					</AnimatePresence>
					<div className="pt-5">
						<Scrubber now={now} onChange={onChange} color="#fff" />
					</div>
					<div className="flex items-center justify-around py-5">
						<motion.button type="button" whileTap={{ scale: 0.75 }} transition={POP} onClick={() => (haptic(), onChange(skip(now, -1)))} className="flex size-[64px] items-center justify-center">
							<SkipIcon back size={34} />
						</motion.button>
						<motion.button type="button" whileTap={{ scale: 0.8 }} transition={POP} onClick={() => (haptic(), onChange(toggle(now)))} className="flex size-[80px] items-center justify-center">
							<PlayIcon playing={now.playing} size={46} />
						</motion.button>
						<motion.button type="button" whileTap={{ scale: 0.75 }} transition={POP} onClick={() => (haptic(), onChange(skip(now, 1)))} className="flex size-[64px] items-center justify-center">
							<SkipIcon size={34} />
						</motion.button>
					</div>
					<div className="flex items-center gap-3 text-[#fff]/60">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path d="M4 9v6h4l5 4V5L8 9z" />
						</svg>
						<input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVol(Number(e.target.value))} className="tonal-range h-[6px] flex-1" style={{ background: `linear-gradient(90deg, #fff ${vol * 100}%, rgba(255,255,255,0.25) ${vol * 100}%)` }} />
						<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path d="M4 9v6h4l5 4V5L8 9zM16 8a5 5 0 0 1 0 8M18.5 5.5a8.5 8.5 0 0 1 0 13" stroke="currentColor" strokeWidth="1.8" fill="none" />
						</svg>
					</div>
				</div>
			</div>
		</motion.div>
	);
}

/** Everything that plays, over whichever page is showing. Auto-advances at a track's end. */
export function Player({ now, onChange }: { now: Now | null; onChange: (n: Now) => void }) {
	const [open, setOpen] = useState(false);
	useEffect(() => {
		if (now === null || !now.playing) return;
		const dur = album(now.album).tracks[now.index]?.[1] ?? 200;
		const id = window.setTimeout(() => onChange(skip(now, 1)), Math.max(0, (dur - elapsed(now)) * 1000));
		return () => window.clearTimeout(id);
	}, [now, onChange]);
	if (now === null) return null;
	return (
		<>
			<style>{".tonal-range{appearance:none;-webkit-appearance:none;border-radius:999px}.tonal-range::-webkit-slider-thumb{-webkit-appearance:none;width:0;height:0}"}</style>
			<AnimatePresence initial={false}>{open ? null : <Mini key="mini" now={now} onChange={onChange} onOpen={() => (haptic(), setOpen(true))} />}</AnimatePresence>
			<AnimatePresence>{open ? <Full key="full" now={now} onChange={onChange} onClose={() => setOpen(false)} /> : null}</AnimatePresence>
		</>
	);
}

/* ---------- album ---------- */

/** Long-press a song: it lifts out, the page blurs, a menu unfolds under it. */
function SongMenu({ a, index, rect, onClose, onPick }: { a: Album; index: number; rect: DOMRect; onClose: () => void; onPick: (what: string) => void }) {
	const [title, len] = a.tracks[index] ?? ["", 0];
	const below = rect.bottom + 240 < window.innerHeight;
	const items = ["Play Next", "Play Last", "Add to Library", "Share Song"];
	return (
		<div className="fixed inset-0 z-[60]">
			<motion.div className="absolute inset-0 bg-[#000]/45 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
			<motion.div
				className="absolute flex items-center gap-3 rounded-[14px] bg-[#2A2A2E] px-4"
				style={{ left: 12, right: 12, top: rect.top, height: rect.height }}
				initial={{ scale: 1 }}
				animate={{ scale: 1.03 }}
				exit={{ scale: 1, opacity: 0 }}
				transition={POP}
			>
				<Art a={a} size={40} radius={6} />
				<span className="flex-1 truncate text-[16px]">{title}</span>
				<span className="text-[#fff]/50 text-[14px] tabular-nums">{fmt(len)}</span>
			</motion.div>
			<motion.div
				className="absolute w-[250px] overflow-hidden rounded-[14px] bg-[#2A2A2E]/95 backdrop-blur-xl"
				style={{ left: 24, ...(below ? { top: rect.bottom + 12 } : { bottom: window.innerHeight - rect.top + 12 }), transformOrigin: below ? "top left" : "bottom left" }}
				initial={{ scale: 0.3, opacity: 0 }}
				animate={{ scale: 1, opacity: 1 }}
				exit={{ scale: 0.3, opacity: 0 }}
				transition={POP}
			>
				{items.map((it) => (
					<button key={it} type="button" onClick={() => onPick(it)} className="flex w-full items-center justify-between border-[#fff]/8 border-b px-4 py-3 text-left text-[16px] last:border-b-0 active:bg-[#fff]/10">
						{it}
					</button>
				))}
			</motion.div>
		</div>
	);
}

function Toast({ text }: { text: string | null }) {
	return (
		<AnimatePresence>
			{text !== null ? (
				<motion.div
					key={text}
					className="pointer-events-none absolute left-1/2 z-[70] flex items-center gap-2 rounded-full bg-[#2A2A2E]/90 px-4 py-2.5 font-medium text-[14px] shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl"
					style={{ top: `calc(${TOP} + 8px)`, x: "-50%" }}
					initial={{ y: -40, opacity: 0, scale: 0.9 }}
					animate={{ y: 0, opacity: 1, scale: 1 }}
					exit={{ y: -30, opacity: 0, scale: 0.95 }}
					transition={POP}
				>
					<span style={{ color: ACCENT }}>✓</span> {text}
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

function SongRow({ a, index, now, onPlay, onHold }: { a: Album; index: number; now: Now | null; onPlay: () => void; onHold: (rect: DOMRect) => void }) {
	const [title, len] = a.tracks[index] ?? ["", 0];
	const current = now !== null && now.album === a.id && now.index === index;
	const timer = useRef(0);
	const held = useRef(false);
	const start = useRef({ x: 0, y: 0 });
	const row = useRef<HTMLButtonElement | null>(null);
	return (
		<motion.button
			ref={row}
			type="button"
			className="flex w-full items-center gap-4 px-5 text-left transition-colors active:bg-[#fff]/8"
			whileTap={{ scale: 0.985 }}
			onPointerDown={(e) => {
				held.current = false;
				start.current = { x: e.clientX, y: e.clientY };
				timer.current = window.setTimeout(() => {
					held.current = true;
					haptic();
					if (row.current) onHold(row.current.getBoundingClientRect());
				}, 420);
			}}
			onPointerMove={(e) => {
				if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) window.clearTimeout(timer.current);
			}}
			onPointerUp={() => window.clearTimeout(timer.current)}
			onPointerCancel={() => window.clearTimeout(timer.current)}
			onContextMenu={(e) => e.preventDefault()}
			onClick={() => {
				if (held.current) return;
				haptic();
				onPlay();
			}}
		>
			<span className="flex w-[18px] justify-center text-[#fff]/45 text-[15px] tabular-nums">{current ? <Equalizer playing={now.playing} /> : index + 1}</span>
			<span className="flex min-w-0 flex-1 items-center border-[#fff]/8 border-b py-3.5">
				<span className="flex-1 truncate text-[16px]" style={{ color: current ? ACCENT : undefined }}>
					{title}
				</span>
				<span className="text-[#fff]/45 text-[14px] tabular-nums">{fmt(len)}</span>
			</span>
		</motion.button>
	);
}

/**
 * The album page. The art is named `tonal-art` so the card's art flies into it,
 * and pulling past the top stretches it the way iOS headers do.
 */
export function AlbumPage({ a, now, onChange, onBack }: { a: Album; now: Now | null; onChange: (n: Now) => void; onBack: () => void }) {
	const ref = useRef<HTMLDivElement | null>(null);
	const scroll = useMotionValue(0);
	const solid = useTransform(scroll, [200, 260], [0, 1]);
	const stretch = useTransform(scroll, [-200, 0], [1.35, 1]);
	const lift = useTransform(scroll, [0, 300], [0, 90]);
	const fade = useTransform(scroll, [0, 260], [1, 0.2]);
	const [menu, setMenu] = useState<{ index: number; rect: DOMRect } | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	useEffect(() => {
		if (toast === null) return;
		const id = window.setTimeout(() => setToast(null), 1600);
		return () => window.clearTimeout(id);
	}, [toast]);
	const total = a.tracks.reduce((s, x) => s + x[1], 0);
	return (
		<div className="absolute inset-0" style={{ background: BG }}>
			<div className="pointer-events-none absolute inset-x-0 top-0 h-[520px]" style={{ background: `linear-gradient(180deg, ${a.colors[0]} 0%, ${BG} 100%)` }} />
			<div ref={ref} className="absolute inset-0 overflow-y-auto [scrollbar-width:none]" onScroll={(e) => scroll.set(e.currentTarget.scrollTop)}>
				<div style={{ paddingTop: `calc(${TOP} + 56px)`, paddingBottom: `calc(${BOTTOM} + 170px)` }}>
					<motion.div className="flex justify-center" style={{ y: lift, opacity: fade, scale: stretch, transformOrigin: "50% 100%" }}>
						<span className="shadow-[0_24px_60px_rgba(0,0,0,0.5)]" style={{ borderRadius: 12 }}>
							<Art a={a} size={250} radius={12} name="tonal-art" />
						</span>
					</motion.div>
					<div className="px-5 pt-6 text-center">
						<h1 className="font-bold text-[24px] leading-tight tracking-tight">{a.title}</h1>
						<p className="text-[20px]" style={{ color: ACCENT }}>
							{a.artist}
						</p>
						<p className="pt-1 text-[#fff]/50 text-[13px]">
							Album · {a.year} · {a.tracks.length} songs, {Math.round(total / 60)} min
						</p>
					</div>
					<div className="flex gap-3 px-5 pt-5 pb-3">
						{["Play", "Shuffle"].map((label, i) => (
							<motion.button
								key={label}
								type="button"
								whileTap={{ scale: 0.95 }}
								transition={POP}
								onClick={() => {
									haptic();
									onChange(play(a, i === 0 ? 0 : Math.floor(Math.random() * a.tracks.length)));
								}}
								className="flex h-[48px] flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#fff]/10 font-semibold text-[16px]"
								style={{ color: ACCENT }}
							>
								{i === 0 ? (
									<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
										<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
									</svg>
								) : (
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
										<path d="M3 7h3c4 0 6 10 10 10h5M18 14l3 3-3 3M3 17h3c1.5 0 2.7-1.4 3.7-3M14 10c.6-1.6 1.6-3 2-3h5M18 4l3 3-3 3" />
									</svg>
								)}
								{label}
							</motion.button>
						))}
					</div>
					{a.tracks.map((_, i) => (
						<SongRow key={a.tracks[i]?.[0]} a={a} index={i} now={now} onPlay={() => onChange(play(a, i))} onHold={(rect) => setMenu({ index: i, rect })} />
					))}
					<p className="px-5 pt-5 text-[#fff]/40 text-[13px]">Hold a song for more.</p>
				</div>
			</div>
			<NavBar
				title={a.title}
				solid={solid}
				tint={`color-mix(in srgb, ${a.colors[0]} 70%, transparent)`}
				left={
					<button type="button" onClick={onBack} className="-ml-2 flex size-[36px] items-center justify-center rounded-full bg-[#000]/25 backdrop-blur-md" aria-label="Back">
						<svg width="11" height="18" viewBox="0 0 12 20" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<path d="M10 2 2 10l8 8" />
						</svg>
					</button>
				}
			/>
			<AnimatePresence>
				{menu !== null ? (
					<SongMenu
						a={a}
						index={menu.index}
						rect={menu.rect}
						onClose={() => setMenu(null)}
						onPick={(what) => {
							haptic();
							setMenu(null);
							if (what === "Play Next" && now !== null) onChange({ ...now });
							setToast(what === "Add to Library" ? "Added to Library" : what === "Share Song" ? "Link copied" : "Queued");
						}}
					/>
				) : null}
			</AnimatePresence>
			<Toast text={toast} />
		</div>
	);
}

/* ---------- the edge swipe ---------- */

/**
 * iOS back: drag from the left edge and this page follows your finger, the page
 * below waiting a third of the way over. Let go far enough and it finishes;
 * `onBack` then walks back with the transition switched off, since the hand
 * already moved everything.
 */
export function EdgeBack({ under, children, onBack }: { under: ReactNode; children: ReactNode; onBack: () => void }) {
	const width = typeof window === "undefined" ? 390 : window.innerWidth;
	const x = useMotionValue(0);
	const below = useTransform(x, [0, width], [-width * 0.3, 0]);
	const shade = useTransform(x, [0, width], [0.35, 0]);
	const [swiping, setSwiping] = useState(false);
	const finish = () =>
		animate(x, width, { duration: 0.28, ease: IOS }).then(() => {
			document.documentElement.dataset.tonalSwipe = "";
			onBack();
			window.setTimeout(() => delete document.documentElement.dataset.tonalSwipe, 400);
		});
	return (
		<>
			{swiping ? (
				<motion.div className="absolute inset-0" style={{ x: below }}>
					{under}
					<motion.div className="absolute inset-0 bg-[#000]" style={{ opacity: shade }} />
				</motion.div>
			) : null}
			<motion.div className="absolute inset-0 shadow-[-12px_0_30px_rgba(0,0,0,0.5)]" style={{ x }}>
				{children}
			</motion.div>
			<motion.div
				className="absolute top-0 bottom-0 left-0 z-40 w-[22px]"
				style={{ touchAction: "none" }}
				onPanStart={() => setSwiping(true)}
				onPan={(_: unknown, info: PanInfo) => x.set(Math.max(0, info.offset.x))}
				onPanEnd={(_: unknown, info: PanInfo) => {
					if (info.offset.x > width * 0.33 || info.velocity.x > 500) return finish();
					animate(x, 0, { duration: 0.3, ease: IOS }).then(() => setSwiping(false));
				}}
			/>
		</>
	);
}

/** Frame-level glue every Tonal frame shares: the dark root that marks the document for its transitions. */
export function Shell({ children }: { children: ReactNode }) {
	return (
		<div data-tonal className="fixed inset-0 select-none overflow-hidden font-sans text-[#F5F5F7] antialiased [-webkit-touch-callout:none]" style={{ background: "#000" }}>
			{children}
		</div>
	);
}
