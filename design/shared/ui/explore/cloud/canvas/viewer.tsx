import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { TidemarkLanding } from "shared/ui/demo/tidemark-landing";
import { PlayedTab } from "shared/ui/spool/browser-tab";
import { ChevronIcon } from "shared/ui/spool/icons";
import { UnseenMark } from "shared/ui/spool/unseen-mark";
import { Cursor, Face, Faces, TeamMark } from "shared/ui/explore/cloud/home/parts";

/**
 * The read-only cloud canvas (DEV-114): what someone sees at
 * spool.page/tidemark/tidemark-app when they look in the browser instead of
 * spool on their Mac. Browse pages, move your own camera, enter and play
 * frames. No tools, no agent, no source, and nothing you do writes anywhere:
 * the camera and whatever you click inside a frame live in this tab only.
 *
 * Takes go down, each a different idea of what the canvas is for here. The
 * first, rail, won (2026-10-04) and lives in `rail.tsx`; these two stand until
 * it is built:
 *   bare  the field full bleed, one floating crumb for pages. Play happens in
 *         place: the frame grows to fill the window and walking glides the
 *         camera to the next frame along the thread.
 *   walk  opens inside the first frame with the canvas peeking around it, a
 *         flow strip at the bottom. Using the prototype is the default; the
 *         canvas is one zoom out.
 *
 * States go across: the member (live, who's looking, open in spool), `--play`
 * (inside a frame), `--outsider` (a client someone shared one page with; the
 * other pages do not exist for them, nobody sees them, the copy moves when an
 * agent's turn ends), `--phone`.
 *
 * Try it: scroll pans, ⌘ or ctrl scroll zooms, drag the empty field. In the
 * member state jonas saves `cart` four seconds in.
 *
 * Prototype only.
 */

export type Take = "bare" | "walk";
export type View = "member" | "play" | "outsider" | "phone";

/* ---------- the project ---------- */

type Content = { coffee: CoffeeScreenName; action?: string } | { site: number };

interface Spec {
	name: string;
	x: number;
	y: number;
	w: number;
	h: number;
	content: Content;
	/** where its primary action walks */
	next?: string;
}

interface Page {
	name: string;
	frames: Spec[];
	threads: { from: string; to: string; might?: boolean }[];
}

const PHONE = { w: 240, h: 520 };
const SITE = { w: 576, h: 360 };

const PAGES: Page[] = [
	{
		name: "app",
		frames: [
			{ name: "menu", x: 0, y: 40, ...PHONE, content: { coffee: "menu" }, next: "cart" },
			{ name: "cart", x: 340, y: 0, ...PHONE, content: { coffee: "cart" }, next: "receipt" },
			{ name: "receipt", x: 680, y: 60, ...PHONE, content: { coffee: "receipt" } },
		],
		threads: [
			{ from: "menu", to: "cart" },
			{ from: "cart", to: "receipt", might: true },
		],
	},
	{
		name: "site",
		frames: [
			{ name: "landing", x: 0, y: 0, ...SITE, content: { site: 0 }, next: "pricing" },
			{ name: "pricing", x: 656, y: 0, ...SITE, content: { site: 1500 } },
		],
		threads: [{ from: "landing", to: "pricing" }],
	},
	{
		name: "drafts",
		frames: [
			{ name: "checkout-v2", x: 0, y: 0, ...PHONE, content: { coffee: "cart", action: "Pay with Apple Pay" } },
			{ name: "loyalty", x: 340, y: 30, ...PHONE, content: { coffee: "menu", action: "Join rewards" } },
		],
		threads: [],
	},
];

/** who is in the canvas right now, on which frame, where their pointer rests */
const HERE = [
	{ id: "jonas", frame: "cart", dx: 170, dy: 330 },
	{ id: "mira", frame: "menu", dx: 60, dy: 150 },
];

const OUTSIDER = { email: "erik@kaffebar.se", by: "jonas" };

/* ---------- camera ---------- */

interface Cam {
	x: number;
	y: number;
	z: number;
}

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function bounds(frames: Spec[]): Rect {
	const x = Math.min(...frames.map((f) => f.x));
	const y = Math.min(...frames.map((f) => f.y));
	const r = Math.max(...frames.map((f) => f.x + f.w));
	const b = Math.max(...frames.map((f) => f.y + f.h));
	return { x, y, w: r - x, h: b - y };
}

function fit(rect: Rect, vw: number, vh: number, pad: { x: number; top: number; bottom: number }, max: number): Cam {
	const z = Math.min((vw - pad.x * 2) / rect.w, (vh - pad.top - pad.bottom) / rect.h, max);
	return {
		z,
		x: vw / 2 - (rect.x + rect.w / 2) * z,
		y: pad.top + (vh - pad.top - pad.bottom) / 2 - (rect.y + rect.h / 2) * z,
	};
}

function useSize(ref: React.RefObject<HTMLElement | null>) {
	const [size, setSize] = useState({ w: 0, h: 0 });
	useLayoutEffect(() => {
		const el = ref.current;
		if (el === null) return;
		const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
		read();
		const observer = new ResizeObserver(read);
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref]);
	return size;
}

/* ---------- the live part: one frame ---------- */

function FrameBody({ spec, full = false, changed = false }: { spec: Spec; full?: boolean; changed?: boolean }) {
	const content = spec.content;
	if ("site" in content) {
		const scale = full ? 1 : spec.w / 1440;
		return (
			<div className="h-full w-full overflow-hidden rounded-[6px] bg-[#0A0A0B]">
				<div style={{ width: 1440, transform: `scale(${scale}) translateY(-${content.site}px)`, transformOrigin: "0 0" }}>
					<div style={{ height: 3200 }}>
						<TidemarkLanding />
					</div>
				</div>
			</div>
		);
	}
	const action = spec.name === "cart" && changed ? "Pay $9.00 with Apple Pay" : content.action;
	return <CoffeeScreen screen={content.coffee} scale={full ? "full" : "canvas"} actionLabel={action} />;
}

/** Clicking a frame's primary action walks; the rest of the frame is the frame's own. */
function walkOn(event: React.MouseEvent, spec: Spec, go: (name: string) => void) {
	if (spec.next === undefined) return;
	let el = event.target as HTMLElement | null;
	for (let i = 0; i < 4 && el !== null; i += 1) {
		const text = el.textContent?.trim() ?? "";
		if (text.length < 40 && /checkout|pay|order|join|get started|start/i.test(text)) {
			go(spec.next);
			return;
		}
		el = el.parentElement;
	}
}

/* ---------- the field ---------- */

interface FieldProps {
	page: Page;
	cam: Cam;
	setCam: (update: (cam: Cam) => Cam) => void;
	glide: boolean;
	setGlide: (on: boolean) => void;
	/** frames take clicks (bare in play, walk always); otherwise the field is all camera */
	live?: string | "all" | undefined;
	/** the frame being played in place: the rest step back */
	focus?: string | undefined;
	dim?: number;
	member: boolean;
	changed: boolean;
	onFrame?: ((name: string) => void) | undefined;
	onPlay?: ((name: string) => void) | undefined;
	onWalk?: ((name: string) => void) | undefined;
	phone?: boolean;
	children?: ReactNode;
}

/**
 * The field proper. Pan with scroll or a drag on empty canvas, zoom with ⌘ or
 * ctrl scroll around the pointer. Labels and cursors sit in an unscaled layer
 * above, because a label is the one thing on the canvas that does not shrink.
 */
const FieldView = ({
	fieldRef,
	page,
	cam,
	setCam,
	glide,
	setGlide,
	live,
	focus,
	dim = 0.14,
	member,
	changed,
	onFrame,
	onPlay,
	onWalk,
	phone = false,
	children,
}: FieldProps & { fieldRef: React.RefObject<HTMLDivElement | null> }) => {
	const drag = useRef<{ x: number; y: number } | null>(null);

	useEffect(() => {
		const el = fieldRef.current;
		if (el === null) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			setGlide(false);
			if (event.ctrlKey || event.metaKey) {
				const box = el.getBoundingClientRect();
				const px = event.clientX - box.left;
				const py = event.clientY - box.top;
				setCam((c) => {
					const z = clamp(c.z * Math.exp(-event.deltaY * 0.01), 0.08, 3);
					return { z, x: px - ((px - c.x) * z) / c.z, y: py - ((py - c.y) * z) / c.z };
				});
			} else {
				setCam((c) => ({ ...c, x: c.x - event.deltaX, y: c.y - event.deltaY }));
			}
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [fieldRef, setCam, setGlide]);

	const byName = new Map(page.frames.map((f) => [f.name, f]));
	const takes = (name: string) => live === "all" || live === name;

	return (
		<div
			ref={fieldRef}
			className="absolute inset-0 touch-none overflow-hidden bg-canvas select-none"
			onPointerDown={(event) => {
				if ((event.target as HTMLElement).closest("[data-takes],button") !== null) return;
				drag.current = { x: event.clientX, y: event.clientY };
				setGlide(false);
				(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
			}}
			onPointerMove={(event) => {
				const from = drag.current;
				if (from === null) return;
				const dx = event.clientX - from.x;
				const dy = event.clientY - from.y;
				drag.current = { x: event.clientX, y: event.clientY };
				setCam((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
			}}
			onPointerUp={() => {
				drag.current = null;
			}}
		>
			<div
				className={cn("absolute top-0 left-0 origin-top-left", glide && "transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]")}
				style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}
			>
				<svg className="pointer-events-none absolute overflow-visible" style={{ left: 0, top: 0 }} width="1" height="1" aria-hidden="true">
					{page.threads.map((thread) => {
						const a = byName.get(thread.from);
						const b = byName.get(thread.to);
						if (a === undefined || b === undefined) return null;
						const x1 = a.x + a.w + 6;
						const y1 = a.y + a.h / 2;
						const x2 = b.x - 10;
						const y2 = b.y + b.h / 2;
						const mid = (x1 + x2) / 2;
						return (
							<g key={`${thread.from}-${thread.to}`} className={cn("transition-opacity duration-300", focus !== undefined && "opacity-20")}>
								<path
									d={`M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
									stroke="var(--color-thread)"
									strokeWidth="1.5"
									fill="none"
									vectorEffect="non-scaling-stroke"
									strokeDasharray={thread.might === true ? "5 5" : undefined}
								/>
								<path d={`M${x2 + 8} ${y2}l-9 -5v10Z`} fill="var(--color-thread)" />
							</g>
						);
					})}
				</svg>
				{page.frames.map((spec) => (
					<div
						key={spec.name}
						data-takes={takes(spec.name) ? "" : undefined}
						className={cn(
							"absolute transition-opacity duration-300",
							focus !== undefined && focus !== spec.name && "pointer-events-none",
							!takes(spec.name) && "cursor-default",
						)}
						style={{
							left: spec.x,
							top: spec.y,
							width: spec.w,
							height: spec.h,
							opacity: focus === undefined || focus === spec.name ? 1 : dim,
						}}
						onClick={(event) => {
							if (takes(spec.name)) {
								if (onWalk !== undefined) walkOn(event, spec, onWalk);
								return;
							}
							onFrame?.(spec.name);
						}}
						onDoubleClick={() => onPlay?.(spec.name)}
					>
						<div className={cn("h-full w-full", !takes(spec.name) && "pointer-events-none")}>
							<FrameBody spec={spec} changed={changed} />
						</div>
						{changed && spec.name === "cart" ? (
							<span className="pointer-events-none absolute -inset-[3px] animate-[ping_1.2s_ease-out_1] rounded-[12px] border-2 border-thread" />
						) : null}
					</div>
				))}
			</div>

			{/* labels and people: screen space, so they never shrink with the zoom */}
			{page.frames.map((spec) => {
				const left = spec.x * cam.z + cam.x;
				const top = spec.y * cam.z + cam.y;
				const width = Math.max(spec.w * cam.z, 60);
				const here = member ? HERE.filter((h) => h.frame === spec.name).map((h) => h.id) : [];
				const quiet = focus !== undefined && focus !== spec.name;
				return (
					<div
						key={spec.name}
						className={cn(
							"group absolute flex items-center gap-1.5",
							glide && "transition-[left,top,width,opacity] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]",
							quiet && "opacity-0",
							focus === spec.name && "opacity-0",
						)}
						style={{ left, top: top - (phone ? 20 : 24), width }}
					>
						<span className={cn("min-w-0 truncate type-value", changed && spec.name === "cart" ? "text-text" : "text-muted")}>
							{spec.name}
						</span>
						{changed && spec.name === "cart" ? <UnseenMark mark="changed" /> : null}
						{here.length > 0 ? <Faces ids={here} size={16} /> : null}
						{onPlay !== undefined && width > 120 ? (
							<button
								type="button"
								onClick={() => onPlay(spec.name)}
								className="ml-auto flex shrink-0 cursor-pointer items-center gap-1 rounded-xs px-1 text-muted opacity-0 transition-[color,opacity] group-hover:opacity-100 hover:text-thread type-detail"
							>
								<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
									<path d="M2 1.2 8.4 5 2 8.8Z" />
								</svg>
								play
							</button>
						) : null}
					</div>
				);
			})}
			{member && focus === undefined
				? HERE.map((h) => {
						const spec = byName.get(h.frame);
						if (spec === undefined) return null;
						return (
							<div key={h.id} className={cn(glide && "transition-all duration-500")}>
								<Cursor id={h.id} x={(spec.x + h.dx) * cam.z + cam.x} y={(spec.y + h.dy) * cam.z + cam.y} />
							</div>
						);
					})
				: null}
			{children}
		</div>
	);
};

/* ---------- small chrome ---------- */

function OpenInSpool({ compact = false }: { compact?: boolean }) {
	return (
		<button
			type="button"
			className={cn(
				"flex shrink-0 cursor-pointer items-center gap-2 rounded-sm border border-border-raised bg-bg text-text transition-colors hover:bg-surface type-control",
				compact ? "h-7 px-2.5" : "h-8 px-3",
			)}
		>
			Open in spool
		</button>
	);
}

function Looking({ size = 22 }: { size?: number }) {
	return (
		<span className="flex items-center gap-2">
			<Faces ids={["jonas", "mira", "ada"]} size={size} />
		</span>
	);
}

function SharedBy({ compact = false }: { compact?: boolean }) {
	return (
		<span className="flex items-center gap-2 text-muted type-detail">
			<Face id={OUTSIDER.by} size={compact ? 18 : 20} />
			{compact ? "jonas shared app" : <span>Jonas shared app with you · updated 2 min ago</span>}
		</span>
	);
}

function Zoom({ z, onFit }: { z: number; onFit: () => void }) {
	return (
		<div className="flex h-8 items-center gap-1 rounded-sm border border-border bg-bg/90 px-1 backdrop-blur">
			<span className="w-11 text-center text-muted type-value">{Math.round(z * 100)}%</span>
			<span className="h-3.5 w-px bg-border-raised" />
			<button type="button" onClick={onFit} className="cursor-pointer rounded-xs px-2 py-1 text-muted hover:text-text type-value">
				fit
			</button>
		</div>
	);
}

function Toast({ show, children }: { show: boolean; children: ReactNode }) {
	return (
		<div
			className={cn(
				"pointer-events-none absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-sm border border-border-raised bg-raised px-3 py-2 text-text transition-[opacity,translate] duration-300 type-detail",
				show ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
			)}
		>
			{children}
		</div>
	);
}

/* ---------- state shared by every take ---------- */

function useViewer(view: View, start: { page: string; play?: string | undefined }) {
	const member = view !== "outsider";
	const pages = member ? PAGES : PAGES.filter((p) => p.name === "app");
	const [pageName, setPageName] = useState(start.page);
	const page = pages.find((p) => p.name === pageName) ?? pages[0]!;
	const [cam, setCamState] = useState<Cam>({ x: 0, y: 0, z: 0.5 });
	const [glide, setGlide] = useState(false);
	const [playing, setPlaying] = useState<string | undefined>(start.play);
	const [changed, setChanged] = useState(false);
	const setCam = useCallback((update: (cam: Cam) => Cam) => setCamState(update), []);

	useEffect(() => {
		if (view !== "member") return;
		const timer = window.setTimeout(() => setChanged(true), 4000);
		return () => window.clearTimeout(timer);
	}, [view]);

	return { member, pages, page, setPageName, cam, setCam, setCamState, glide, setGlide, playing, setPlaying, changed };
}

function useKey(handler: (event: KeyboardEvent) => void) {
	const ref = useRef(handler);
	ref.current = handler;
	useEffect(() => {
		const on = (event: KeyboardEvent) => ref.current(event);
		window.addEventListener("keydown", on);
		return () => window.removeEventListener("keydown", on);
	}, []);
}

const url = (page: string, frame?: string) => `spool.page/tidemark/tidemark-app/${page}${frame === undefined ? "" : `/${frame}`}`;

/* ---------- hosts ---------- */

function Browser({ url: address, children }: { url: string; children: ReactNode }) {
	return (
		<PlayedTab title="tidemark app · spool" url={address} sibling="Slack">
			<div className="relative h-full overflow-hidden bg-bg text-text">{children}</div>
		</PlayedTab>
	);
}

function Phone({ url: address, children }: { url: string; children: ReactNode }) {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased">
			<div className="flex h-[47px] shrink-0 items-end justify-between px-7 pb-2 text-[15px] font-semibold">
				<span>9:41</span>
				<span className="flex items-center gap-1.5">
					<span className="h-[10px] w-[17px] rounded-[2px] bg-text" />
				</span>
			</div>
			<div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
			<div className="flex h-[82px] shrink-0 flex-col items-center gap-2 border-border border-t bg-[#17171A] pt-2.5">
				<span className="flex h-[38px] w-[358px] items-center justify-center rounded-[12px] bg-[#2A2A2E] text-[#C8C8CC] text-[15px]">
					<span className="truncate px-3">{address.replace("spool.page/", "spool.page/…/").replace("tidemark/tidemark-app/", "")}</span>
				</span>
				<span className="mt-auto mb-2 h-[5px] w-[134px] rounded-full bg-text/80" />
			</div>
		</div>
	);
}

/* ---------- take: bare ---------- */

function Crumb({ pages, page, onPage, member, compact = false }: { pages: Page[]; page: Page; onPage: (name: string) => void; member: boolean; compact?: boolean }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-bg/90 pr-2.5 pl-2 backdrop-blur hover:border-border-raised"
			>
				<TeamMark size={20} />
				{compact ? null : (
					<>
						<span className="type-control">tidemark app</span>
						<span className="text-muted type-value">/</span>
					</>
				)}
				<span className="type-value">{page.name}</span>
				<ChevronIcon open={open} className="h-2.5 w-2.5 text-muted" />
			</button>
			{open ? (
				<div className="absolute top-11 left-0 z-20 w-[220px] rounded-md border border-border-raised bg-bg p-1.5 shadow-2xl">
					{pages.map((p) => (
						<button
							key={p.name}
							type="button"
							onClick={() => {
								onPage(p.name);
								setOpen(false);
							}}
							className={cn(
								"flex w-full cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 text-left hover:bg-surface type-value",
								p.name === page.name ? "text-text" : "text-muted",
							)}
						>
							<span className={cn("h-[2px] w-2", p.name === page.name ? "bg-thread" : "bg-transparent")} />
							{p.name}
							<span className="ml-auto text-muted type-detail">{p.frames.length}</span>
						</button>
					))}
					{member ? null : (
						<p className="border-border border-t px-2 pt-2 pb-1 text-muted type-detail">Jonas shared this page with you.</p>
					)}
				</div>
			) : null}
		</div>
	);
}

function BareTake({ view }: { view: View }) {
	const phone = view === "phone";
	const v = useViewer(view, { page: "app" });
	const fieldRef = useRef<HTMLDivElement | null>(null);
	const size = useSize(fieldRef);
	const pad = phone ? { x: 20, top: 64, bottom: 24 } : { x: 96, top: 80, bottom: 64 };
	const tight = phone ? { x: 0, top: 0, bottom: 0 } : { x: 40, top: 56, bottom: 24 };

	const fitPage = useCallback(
		(glide: boolean) => {
			if (size.w === 0) return;
			v.setGlide(glide);
			v.setCamState(fit(bounds(v.page.frames), size.w, size.h, pad, 1));
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[size.w, size.h, v.page.name],
	);

	const play = useCallback(
		(name: string, glide = true) => {
			const spec = v.page.frames.find((f) => f.name === name);
			if (spec === undefined || size.w === 0) return;
			v.setGlide(glide);
			v.setPlaying(name);
			v.setCamState(fit(spec, size.w, size.h, tight, phone ? 3 : 2.2));
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[size.w, size.h, v.page.name],
	);

	useLayoutEffect(() => {
		if (view === "play") play("cart", false);
		else fitPage(false);
	}, [fitPage, play, view]);

	const leave = () => {
		v.setPlaying(undefined);
		fitPage(true);
	};
	useKey((event) => {
		if (event.key === "Escape" && v.playing !== undefined) leave();
	});

	const body = (
		<>
			<FieldView
				fieldRef={fieldRef}
				page={v.page}
				cam={v.cam}
				setCam={v.setCam}
				glide={v.glide}
				setGlide={v.setGlide}
				live={v.playing}
				focus={v.playing}
				dim={0.1}
				member={v.member}
				changed={v.changed}
				onFrame={(name) => play(name)}
				onWalk={(name) => play(name)}
				phone={phone}
			/>
			{v.playing === undefined ? (
				<>
					<div className="absolute top-3 left-3">
						<Crumb pages={v.pages} page={v.page} onPage={v.setPageName} member={v.member} compact={phone} />
					</div>
					<div className="absolute top-3 right-3 flex items-center gap-3">
						{v.member ? (
							<>
								<Looking size={phone ? 20 : 22} />
								{phone ? null : <OpenInSpool />}
							</>
						) : (
							<SharedBy compact={phone} />
						)}
					</div>
					{phone ? null : (
						<div className="absolute right-3 bottom-3 flex items-center gap-2">
							<span className="text-muted type-detail">click a frame to play it</span>
							<Zoom z={v.cam.z} onFit={() => fitPage(true)} />
						</div>
					)}
				</>
			) : (
				<button
					type="button"
					onClick={leave}
					className={cn(
						"absolute left-1/2 flex -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full border border-border-raised bg-bg/90 px-3 py-1.5 backdrop-blur hover:text-text type-detail",
						phone ? "bottom-3" : "top-3",
					)}
				>
					<span className="h-1.5 w-1.5 rounded-full bg-thread" />
					<span className="text-text">{v.playing}</span>
					<span className="text-muted">{phone ? "· back to canvas" : "· esc back to canvas"}</span>
				</button>
			)}
			<Toast show={v.changed && v.playing === undefined}>
				<Face id="jonas" size={16} />
				jonas saved cart
			</Toast>
		</>
	);

	const address = url(v.page.name, v.playing);
	return phone ? <Phone url={address}>{body}</Phone> : <Browser url={address}>{body}</Browser>;
}

/* ---------- take: walk ---------- */

function WalkTake({ view }: { view: View }) {
	const phone = view === "phone";
	const v = useViewer(view, { page: "app" });
	const fieldRef = useRef<HTMLDivElement | null>(null);
	const size = useSize(fieldRef);
	const [out, setOut] = useState(false);
	const [at, setAt] = useState(view === "play" ? "cart" : "menu");
	const pad = phone ? { x: 0, top: 0, bottom: 0 } : { x: 120, top: 40, bottom: 96 };

	const go = useCallback(
		(name: string, glide = true) => {
			const spec = v.page.frames.find((f) => f.name === name);
			if (spec === undefined || size.w === 0) return;
			setAt(name);
			setOut(false);
			v.setGlide(glide);
			v.setCamState(fit(spec, size.w, size.h, pad, phone ? 3 : 1.5));
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[size.w, size.h, v.page.name],
	);

	const zoomOut = () => {
		setOut(true);
		v.setGlide(true);
		v.setCamState(fit(bounds(v.page.frames), size.w, size.h, phone ? { x: 20, top: 40, bottom: 80 } : { x: 96, top: 56, bottom: 110 }, 1));
	};

	useLayoutEffect(() => {
		go(v.page.frames.some((f) => f.name === at) ? at : v.page.frames[0]!.name, false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [size.w, size.h, v.page.name]);

	const index = v.page.frames.findIndex((f) => f.name === at);
	useKey((event) => {
		if (event.key === "ArrowRight") go(v.page.frames[Math.min(index + 1, v.page.frames.length - 1)]!.name);
		if (event.key === "ArrowLeft") go(v.page.frames[Math.max(index - 1, 0)]!.name);
		if (event.key === "Escape") zoomOut();
	});

	const body = (
		<>
			<FieldView
				fieldRef={fieldRef}
				page={v.page}
				cam={v.cam}
				setCam={v.setCam}
				glide={v.glide}
				setGlide={v.setGlide}
				live={out ? undefined : "all"}
				focus={out ? undefined : at}
				dim={phone ? 0 : 0.35}
				member={v.member}
				changed={v.changed}
				onFrame={(name) => go(name)}
				onWalk={(name) => go(name)}
				phone={phone}
			/>
			<div className={cn("absolute flex items-center gap-3", phone ? "top-2 right-2" : "top-3 right-3")}>
				{v.member ? (
					<>
						<Looking size={phone ? 20 : 22} />
						{phone ? null : <OpenInSpool />}
					</>
				) : phone ? null : (
					<SharedBy />
				)}
			</div>
			{/* the strip: the page's frames in thread order, the canvas one press out */}
			<div
				className={cn(
					"absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border-raised bg-bg/95 p-1 backdrop-blur",
					phone ? "bottom-3" : "bottom-4",
				)}
			>
				{phone ? null : (
					<select
						value={v.page.name}
						onChange={(e) => v.setPageName(e.target.value)}
						className="h-8 cursor-pointer rounded-sm bg-transparent px-2 text-text outline-none hover:bg-surface type-value"
					>
						{v.pages.map((p) => (
							<option key={p.name} value={p.name}>
								{p.name}
							</option>
						))}
					</select>
				)}
				{phone ? null : <span className="mx-1 h-4 w-px bg-border-raised" />}
				{v.page.frames.map((f, i) => (
					<span key={f.name} className="flex items-center">
						{i > 0 && !phone ? <span className="px-0.5 text-muted type-detail">→</span> : null}
						<button
							type="button"
							onClick={() => go(f.name)}
							className={cn(
								"relative flex h-8 cursor-pointer items-center rounded-sm hover:bg-surface type-value",
								phone ? "w-8 justify-center" : "px-2.5",
								!out && f.name === at ? "text-text" : "text-muted",
							)}
						>
							{phone ? (
								<span className={cn("h-2 w-2 rounded-full", !out && f.name === at ? "bg-thread" : "bg-border-raised")} />
							) : (
								f.name
							)}
							{!phone && !out && f.name === at ? <span className="absolute inset-x-2.5 bottom-1 h-[2px] rounded-full bg-thread" /> : null}
							{v.changed && f.name === "cart" ? <UnseenMark mark="changed" className="ml-1.5" /> : null}
						</button>
					</span>
				))}
				<span className="mx-1 h-4 w-px bg-border-raised" />
				<button
					type="button"
					onClick={() => (out ? go(at) : zoomOut())}
					className={cn("flex h-8 cursor-pointer items-center rounded-sm px-2.5 hover:bg-surface type-value", out ? "text-thread" : "text-muted")}
				>
					{out ? "back in" : "canvas"}
				</button>
			</div>
			<Toast show={v.changed && out}>
				<Face id="jonas" size={16} />
				jonas saved cart
			</Toast>
		</>
	);

	const address = url(v.page.name, out ? undefined : at);
	return phone ? <Phone url={address}>{body}</Phone> : <Browser url={address}>{body}</Browser>;
}

/* ---------- entry ---------- */

export function ViewerCanvas({ take, view }: { take: Take; view: View }) {
	if (take === "bare") return <BareTake view={view} />;
	return <WalkTake view={view} />;
}
