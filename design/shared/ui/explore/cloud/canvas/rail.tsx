import { AnimatePresence, motion, useTransform } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { PlayedTab } from "shared/ui/spool/browser-tab";
import { ChevronIcon, FolderIcon, FrameIcon } from "shared/ui/spool/icons";
import { UnseenMark } from "shared/ui/spool/unseen-mark";
import { Face, Faces, TeamMark } from "shared/ui/explore/cloud/home/parts";
import { type Camera, Field, LiveCursor, useCamera } from "./camera";
import { bounds, CROSS, FrameBody, fit, GLIDE, OUTSIDER, type Page, PAGES, type Rect, SPRING, type Spec, url, useSize, walkOn } from "./fixture";

/**
 * The read-only canvas in a desktop browser, the take Liam picked (DEV-114,
 * 2026-10-04): the shipped canvas with every authoring control taken off. The
 * pages rail stays, the tool bar, dock and agent go, and play leaves the canvas
 * for the player the way it does on the Mac.
 *
 * Motion: the camera glides on one spring, a flick coasts, a page swap fades
 * the old page out and lays the new one in frame by frame, and a played frame
 * grows out of its own spot on the canvas and shrinks back into it.
 *
 * Views: `member` (live: jonas saves `cart` four seconds in, who's looking,
 * open in spool), `play` (inside cart), `outsider` (a client Jonas shared one
 * page with; the other pages do not exist for them and nobody sees them).
 *
 * Prototype only.
 */

export type RailView = "member" | "play" | "outsider";

const PAD = { x: 96, top: 88, bottom: 72 };

export function RailCanvas({ view }: { view: RailView }) {
	const member = view !== "outsider";
	const pages = member ? PAGES : PAGES.filter((p) => p.name === "app");
	const [pageName, setPageName] = useState("app");
	const page = pages.find((p) => p.name === pageName) ?? pages[0]!;
	const pageRef = useRef(page);
	pageRef.current = page;

	const cam = useCamera();
	const host = useRef<HTMLDivElement | null>(null);
	const field = useRef<HTMLDivElement | null>(null);
	const size = useSize(field);
	const hostSize = useSize(host);

	const [changed, setChanged] = useState(false);
	const [toast, setToast] = useState(false);
	const [play, setPlay] = useState<{ name: string; from: Rect | null } | null>(view === "play" ? { name: "cart", from: null } : null);
	const [closing, setClosing] = useState<Rect | null>(null);

	useEffect(() => {
		if (view !== "member") return;
		const a = window.setTimeout(() => {
			setChanged(true);
			setToast(true);
		}, 4000);
		const b = window.setTimeout(() => setToast(false), 7500);
		return () => {
			window.clearTimeout(a);
			window.clearTimeout(b);
		};
	}, [view]);

	const fitPage = useCallback(
		(glide: boolean) => {
			if (size.w === 0) return;
			const to = fit(bounds(pageRef.current.frames), size.w, size.h, PAD, 1);
			if (glide) cam.fly(to);
			else cam.set(to);
		},
		[cam, size.w, size.h],
	);
	const sized = size.w > 0;
	// biome-ignore lint/correctness/useExhaustiveDependencies: fit once, when the field first has a size
	useLayoutEffect(() => fitPage(false), [sized]);

	const rectOf = (el: Element): Rect => {
		const box = el.getBoundingClientRect();
		const origin = host.current?.getBoundingClientRect();
		return { x: box.left - (origin?.left ?? 0), y: box.top - (origin?.top ?? 0), w: box.width, h: box.height };
	};

	const open = (name: string) => {
		const el = field.current?.querySelector(`[data-frame="${name}"]`);
		setClosing(null);
		setPlay({ name, from: el ? rectOf(el) : null });
	};
	const close = () => {
		if (play === null) return;
		const el = field.current?.querySelector(`[data-frame="${play.name}"]`);
		setClosing(el ? rectOf(el) : { x: hostSize.w / 2, y: hostSize.h / 2, w: 1, h: 1 });
	};

	useEffect(() => {
		const on = (event: KeyboardEvent) => {
			if (event.key === "Escape") close();
		};
		window.addEventListener("keydown", on);
		return () => window.removeEventListener("keydown", on);
	});

	const toFrame = (name: string) => {
		const spec = page.frames.find((f) => f.name === name);
		if (spec !== undefined && size.w > 0) cam.fly(fit(spec, size.w, size.h, PAD, 1));
	};

	return (
		<PlayedTab title="tidemark app · spool" url={url(page.name, play?.name)} sibling="Slack">
			<div ref={host} className="relative flex h-full overflow-hidden bg-bg text-text">
				<PagesRail
					pages={pages}
					page={page}
					member={member}
					changed={changed}
					onPage={(name) => name !== page.name && setPageName(name)}
					onFrame={toFrame}
					onPlay={open}
				/>
				<div className="relative min-w-0 flex-1">
					<Field
						fieldRef={field}
						cam={cam}
						page={page}
						member={member}
						changed={changed}
						away={play?.name}
						onTap={(name) => open(name)}
						onSwap={() => fitPage(false)}
						cursors={member && page.name === "app" && play === null ? <Cursors cam={cam} /> : null}
					/>
					<div data-chrome="" className="absolute top-3 right-3 flex items-center gap-3">
						{member ? (
							<>
								<Faces ids={["jonas", "mira", "ada"]} size={22} />
								<button
									type="button"
									className="flex h-8 cursor-pointer items-center rounded-sm border border-border-raised bg-bg px-3 text-text transition-colors hover:bg-surface active:scale-[0.97] type-control"
								>
									Open in spool
								</button>
							</>
						) : (
							<span className="flex items-center gap-2 rounded-sm border border-border bg-bg/90 py-1.5 pr-3 pl-1.5 text-muted backdrop-blur type-detail">
								<Face id={OUTSIDER.by} size={20} />
								Jonas shared app with you · updated 2 min ago
							</span>
						)}
					</div>
					<div data-chrome="" className="absolute right-3 bottom-3">
						<Zoom cam={cam} onFit={() => fitPage(true)} />
					</div>
					<AnimatePresence>
						{toast ? (
							<motion.div
								data-chrome=""
								className="pointer-events-none absolute bottom-4 left-1/2 flex items-center gap-2 rounded-sm border border-border-raised bg-raised px-3 py-2 text-text type-detail"
								style={{ x: "-50%" }}
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, transition: CROSS }}
								transition={SPRING}
							>
								<Face id="jonas" size={16} />
								jonas saved cart
							</motion.div>
						) : null}
					</AnimatePresence>
				</div>
				{play === null ? null : (
					<Player
						key="player"
						page={page}
						name={play.name}
						from={play.from}
						closing={closing}
						area={hostSize}
						changed={changed}
						onWalk={(name) => setPlay((p) => (p === null ? p : { ...p, name }))}
						onClose={close}
						onClosed={() => {
							setPlay(null);
							setClosing(null);
						}}
					/>
				)}
			</div>
		</PlayedTab>
	);
}

/* ---------- the rail ---------- */

function PagesRail({
	pages,
	page,
	member,
	changed,
	onPage,
	onFrame,
	onPlay,
}: {
	pages: Page[];
	page: Page;
	member: boolean;
	changed: boolean;
	onPage: (name: string) => void;
	onFrame: (name: string) => void;
	onPlay: (name: string) => void;
}) {
	return (
		<aside className="flex w-[232px] shrink-0 flex-col border-border border-r bg-bg">
			<div className="flex h-11 shrink-0 items-center gap-2 border-border border-b pr-2 pl-3.5">
				<TeamMark size={18} />
				<span className="truncate type-control">tidemark app</span>
				{member ? null : <span className="ml-auto text-muted type-detail">view only</span>}
			</div>
			<div className="min-h-0 flex-1 overflow-hidden py-2">
				{pages.map((p) => {
					const open = p.name === page.name;
					return (
						<div key={p.name}>
							<button
								type="button"
								onClick={() => onPage(p.name)}
								className={cn("relative flex h-8 w-full cursor-pointer items-center pr-3 text-left transition-colors hover:bg-surface/60")}
							>
								{open ? (
									<motion.span layoutId="rail-row" className="absolute inset-0 bg-surface" transition={{ duration: 0 }}>
										<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
									</motion.span>
								) : null}
								<span className="relative flex h-8 w-6 shrink-0 items-center justify-center text-muted">
									<ChevronIcon open={open} className="h-2.5 w-2.5 transition-transform" />
								</span>
								<FolderIcon className={cn("relative mr-2 h-3.5 w-3.5 shrink-0 transition-colors", open ? "text-thread" : "text-muted")} />
								<span className={cn("relative min-w-0 flex-1 truncate transition-colors type-value", open ? "text-text" : "text-muted")}>{p.name}</span>
								<span className="relative text-muted type-detail">{p.frames.length}</span>
							</button>
							<AnimatePresence initial={false}>
								{open ? (
									<motion.div
										className="relative overflow-hidden"
										initial={{ height: 0 }}
										animate={{ height: "auto" }}
										exit={{ height: 0 }}
										transition={SPRING}
									>
										<span className="absolute top-0 bottom-1 left-[18px] w-px bg-border-raised" />
										{p.frames.map((f) => {
											const lit = changed && f.name === "cart";
											const here = member ? (f.name === "cart" ? ["jonas"] : f.name === "menu" ? ["mira"] : []) : [];
											return (
												<div key={f.name} className="group relative flex h-7 w-full items-center pr-2 hover:bg-surface">
													<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
													<button type="button" onClick={() => onFrame(f.name)} className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 pl-[34px] text-left">
														<FrameIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
														<span className={cn("min-w-0 flex-1 truncate transition-colors type-value", lit ? "text-text" : "text-muted")}>{f.name}</span>
													</button>
													{lit ? <UnseenMark mark="changed" /> : null}
													{here.length > 0 ? (
														<span className="ml-1.5 group-hover:hidden">
															<Faces ids={here} size={14} />
														</span>
													) : null}
													<button
														type="button"
														onClick={() => onPlay(f.name)}
														aria-label={`Play ${f.name}`}
														className="ml-1 hidden h-5 cursor-pointer items-center gap-1 rounded-xs px-1 text-muted hover:text-thread group-hover:flex type-detail"
													>
														<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
															<path d="M2 1.2 8.4 5 2 8.8Z" />
														</svg>
														play
													</button>
												</div>
											);
										})}
									</motion.div>
								) : null}
							</AnimatePresence>
						</div>
					);
				})}
			</div>
			<div className="border-border border-t px-3.5 py-3 text-muted type-detail">{member ? "ada@tidemark.app" : OUTSIDER.email}</div>
		</aside>
	);
}

function Zoom({ cam, onFit }: { cam: Camera; onFit: () => void }) {
	const pct = useTransform(() => `${Math.round(cam.z.get() * 100)}%`);
	return (
		<div className="flex h-8 items-center gap-1 rounded-sm border border-border bg-bg/90 px-1 backdrop-blur">
			<motion.span className="w-11 text-center text-muted tabular-nums type-value">{pct}</motion.span>
			<span className="h-3.5 w-px bg-border-raised" />
			<button type="button" onClick={onFit} className="cursor-pointer rounded-xs px-2 py-1 text-muted transition-colors hover:text-text active:scale-95 type-value">
				fit
			</button>
		</div>
	);
}

/** jonas heads for cart's pay button and saves at four seconds; mira reads the menu */
const JONAS = [
	{ at: 0, x: 860, y: 420 },
	{ at: 1200, x: 820, y: 640 },
	{ at: 2500, x: 760, y: 800 },
	{ at: 5400, x: 900, y: 300 },
	{ at: 8200, x: 1330, y: 520 },
];
const MIRA = [
	{ at: 0, x: 140, y: 330 },
	{ at: 1800, x: 270, y: 410 },
	{ at: 3900, x: 170, y: 500 },
	{ at: 6600, x: 300, y: 860 },
];

function Cursors({ cam, small = false }: { cam: Camera; small?: boolean }) {
	return (
		<>
			<LiveCursor cam={cam} id="jonas" path={JONAS} small={small} />
			<LiveCursor cam={cam} id="mira" path={MIRA} small={small} />
		</>
	);
}
export { Cursors };

/* ---------- the player ---------- */

/**
 * The shipped player (src/runtime/player-chrome.tsx, styled in src/daemon/play.ts):
 * a permanent 30px bar, the frame switcher on the left, size, exit, eye and close
 * on the right. The page is never scaled: it lays out at its own width, capped by
 * the window, flush under the bar. In the cloud the close returns to the canvas
 * rather than closing the tab, and nothing else changes.
 */
const BAR = 30;
const BAR_CSS = "bg-[#282828] border-[#363636] border-b font-['Fragment_Mono'] text-[#f0efed] text-[12px] leading-[18px] antialiased";

function Player({
	page,
	name,
	from,
	closing,
	area,
	changed,
	onWalk,
	onClose,
	onClosed,
}: {
	page: Page;
	name: string;
	from: Rect | null;
	closing: Rect | null;
	area: { w: number; h: number };
	changed: boolean;
	onWalk: (name: string) => void;
	onClose: () => void;
	onClosed: () => void;
}) {
	const spec = page.frames.find((f) => f.name === name) ?? page.frames[0]!;
	const [picking, setPicking] = useState(false);
	const site = "site" in spec.content;
	const width = Math.min(area.w, spec.w);
	const target = { x: (area.w - width) / 2, y: BAR, scale: 1 };
	const leaving = closing !== null;

	if (area.w === 0) return null;
	return (
		<div className="absolute inset-0 z-30">
			<motion.div
				className="absolute inset-0 bg-canvas"
				initial={{ opacity: from === null ? 1 : 0 }}
				animate={{ opacity: leaving ? 0 : 1 }}
				transition={{ duration: leaving ? 0.2 : 0.16, delay: leaving ? 0.04 : 0, ease: "easeOut" }}
			/>
			<motion.div
				className="absolute top-0 left-0 overflow-hidden"
				style={{ width, height: site ? area.h - BAR : spec.h, originX: 0, originY: 0 }}
				initial={from === null ? target : { x: from.x, y: from.y, scale: from.w / width }}
				animate={leaving ? { x: closing.x, y: closing.y, scale: closing.w / width } : target}
				transition={GLIDE}
				onAnimationComplete={() => {
					if (leaving) onClosed();
				}}
			>
				<AnimatePresence initial={false} mode="popLayout">
					<motion.div
						key={spec.name}
						className="absolute inset-0"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={CROSS}
						onClick={(event: React.MouseEvent) => walkOn(event, spec, onWalk)}
					>
						<FrameBody spec={spec as Spec} changed={changed} fill />
					</motion.div>
				</AnimatePresence>
			</motion.div>
			<motion.div
				className={cn("absolute inset-x-0 top-0 z-10 flex items-center gap-3 pr-3 pl-4", BAR_CSS)}
				style={{ height: BAR }}
				initial={{ y: from === null ? 0 : -BAR }}
				animate={{ y: leaving ? -BAR : 0 }}
				transition={SPRING}
			>
				<span className="relative flex self-stretch">
					<button
						type="button"
						onClick={() => setPicking((p) => !p)}
						className="-mx-1.5 flex cursor-pointer items-center gap-2 self-center rounded-[4px] px-1.5 py-1 hover:bg-[#1c1c1c]"
					>
						<span className="text-[#94918d]">tidemark app /</span>
						<span className="whitespace-nowrap">{spec.name}</span>
						<ChevronIcon open className={cn("h-2.5 w-2.5 text-[#94918d] transition-[rotate] duration-150", picking && "rotate-180")} />
					</button>
					<AnimatePresence>
						{picking ? (
							<motion.div
								className="absolute top-full -left-1.5 z-10 w-[280px] overflow-hidden rounded-b-[12px] border border-[#363636] border-t-0 bg-[#161616] p-1.5"
								initial={{ opacity: 0, y: -4 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, transition: CROSS }}
								transition={SPRING}
							>
								{page.frames.map((f) => (
									<button
										key={f.name}
										type="button"
										onClick={() => {
											onWalk(f.name);
											setPicking(false);
										}}
										className={cn(
											"flex w-full cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1.5 text-left hover:bg-[#1c1c1c]",
											f.name === spec.name ? "text-[#f0efed]" : "text-[#94918d]",
										)}
									>
										<span className={cn("h-[2px] w-2", f.name === spec.name ? "bg-thread" : "bg-transparent")} />
										{f.name}
									</button>
								))}
							</motion.div>
						) : null}
					</AnimatePresence>
				</span>
				<span className="ml-auto flex items-center gap-3">
					<span className="whitespace-nowrap text-[#94918d] text-[11px]">
						{area.w} × {area.h - BAR}
					</span>
					<span className="whitespace-nowrap text-[#94918d] text-[11px]">esc exits</span>
					<span className="h-3.5 w-px bg-[#363636]" />
					<button type="button" aria-label="Hide the bar" className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[4px] text-[#94918d] hover:bg-[#1c1c1c] hover:text-[#f0efed]">
						<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
							<path d="M1.5 8c1.6-2.7 3.9-4 6.5-4s4.9 1.3 6.5 4c-1.6 2.7-3.9 4-6.5 4S3.1 10.7 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
							<circle cx="8" cy="8" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
						</svg>
					</button>
					<span className="h-3.5 w-px bg-[#363636]" />
					<button
						type="button"
						onClick={onClose}
						aria-label="Back to the canvas"
						className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[4px] text-[#94918d] hover:bg-[#1c1c1c] hover:text-[#f0efed]"
					>
						<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
							<path d="M2 2 8 8M8 2 2 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
						</svg>
					</button>
				</span>
			</motion.div>
		</div>
	);
}
