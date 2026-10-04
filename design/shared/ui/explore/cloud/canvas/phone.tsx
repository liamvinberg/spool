import { AnimatePresence, animate, type MotionValue, motion, type PanInfo, useDragControls, useMotionValue, useTransform } from "motion/react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { ChevronIcon, FolderIcon } from "shared/ui/spool/icons";
import { UnseenMark } from "shared/ui/spool/unseen-mark";
import { Face, Faces, TeamMark } from "shared/ui/explore/cloud/home/parts";
import { haptic } from "shared/ui/explore/cloud/phone-link/tonal";
import { Field, useCamera } from "./camera";
import { bounds, DEVICE, FrameBody, fit, GLIDE, type Page, PAGES, type Rect, SPRING, type Spec, walkOn } from "./fixture";
import { Cursors } from "./rail";

/**
 * The read-only canvas on a phone (DEV-114, 2026-10-04). Liam picked the rail
 * for the desktop; a phone has no room for a rail, so this sub-page asks what
 * the canvas becomes at 390 wide. Four takes down:
 *
 *   canvas  the same canvas, touch first: drag, flick, pinch. Pages live in a
 *           sheet you pull up from the crumb.
 *   shelf   no field until you ask for one: every page is a row of its frames
 *           you swipe sideways, the canvas one push away.
 *   deck    one frame at a time, big, swiped through in thread order. Pages are
 *           a step out, like the app switcher.
 *   list    a native list: what changed today, then the pages. A page pushes
 *           its canvas.
 *
 * Play is the same in all four and is the part that should feel native: the
 * frame grows out of its card to the whole screen, the browser's bars go, and
 * a swipe down shrinks it back to where it came from. Whether a browser tab can
 * really drop its bars belongs to "Prototype a shared link on a phone" (DEV-115);
 * here it is drawn the way it should feel.
 *
 * Prototype only. Drag with the mouse to stand in for a finger; ctrl scroll is
 * the pinch.
 *
 * `device` (DEV-161) is the same take for a real phone, exported with
 * `spool build` and opened from the Home Screen: no drawn status bar or Safari,
 * the real screen size, and the real safe areas padded by the frame itself.
 */

export type PhoneTake = "canvas" | "shelf" | "deck" | "list";
export type PhoneState = "base" | "pages" | "canvas" | "play";

const STATUS = 47;
const SAFARI = 82;
const AREA_H = DEVICE.h - STATUS - SAFARI;
/** the home indicator's strip: an app keeps its buttons above it */
const HOME = 34;

/**
 * The screen a take lays itself out on. Drawn: the 390 × 844 phone on the
 * canvas, its area between a fake status bar and Safari. Device: the real
 * window, its area from the notch down, and `chin` the home bar's strip that
 * scrolling content keeps clear at its end.
 */
export interface Screen {
	device: boolean;
	w: number;
	h: number;
	/** where the area starts, and where a played frame's content starts */
	top: number;
	/** where a played frame's content stops above the bottom */
	bottom: number;
	chin: number;
}

const DRAWN: Screen = { device: false, w: DEVICE.w, h: DEVICE.h, top: STATUS, bottom: HOME, chin: 0 };
export const ScreenContext = createContext<Screen>(DRAWN);
export const useScreenSize = () => useContext(ScreenContext);

function readDevice(): Screen {
	const probe = document.createElement("div");
	probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
	document.body.appendChild(probe);
	const style = getComputedStyle(probe);
	const top = Number.parseFloat(style.paddingTop) || 0;
	const bottom = Number.parseFloat(style.paddingBottom) || 0;
	probe.remove();
	return { device: true, w: window.innerWidth, h: window.innerHeight, top, bottom, chin: bottom };
}

export function useDevice(): Screen {
	const [screen, setScreen] = useState<Screen>(() => readDevice());
	useEffect(() => {
		const read = () => setScreen(readDevice());
		window.addEventListener("resize", read);
		window.visualViewport?.addEventListener("resize", read);
		return () => {
			window.removeEventListener("resize", read);
			window.visualViewport?.removeEventListener("resize", read);
		};
	}, []);
	return screen;
}

/* ---------- shell ---------- */

function StatusBar({ dark = false }: { dark?: boolean }) {
	return (
		<div className={cn("pointer-events-none absolute inset-x-0 top-0 z-20 flex h-[47px] items-end justify-between px-8 pb-[9px] font-sans font-semibold text-[16px]", dark ? "text-[#111]" : "text-white")}>
			<span>9:41</span>
			<span className="flex items-center gap-[6px]">
				<svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" fill="currentColor">
					<rect x="0" y="8" width="3" height="4" rx="1" />
					<rect x="5" y="5.5" width="3" height="6.5" rx="1" />
					<rect x="10" y="3" width="3" height="9" rx="1" />
					<rect x="15" y="0" width="3" height="12" rx="1" />
				</svg>
				<span className="relative h-[12px] w-[25px] rounded-[4px] border border-current/50 p-[1.5px]">
					<span className="block h-full w-[78%] rounded-[2px] bg-current" />
				</span>
			</span>
		</div>
	);
}

function Safari() {
	return (
		<div className="absolute inset-x-0 bottom-0 z-20 flex h-[82px] flex-col items-center border-white/5 border-t bg-[#1C1C1E]/95 pt-[9px] backdrop-blur-xl">
			<span className="flex h-[40px] w-[366px] items-center rounded-[12px] bg-[#2C2C2E] px-3.5 font-sans text-[#EBEBF5] text-[16px]">
				<span className="text-[15px] text-[#EBEBF5]/70">
					<span className="text-[12px]">A</span>A
				</span>
				<span className="flex-1 text-center">spool.page</span>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-[#EBEBF5]/70" aria-hidden="true">
					<path d="M12.5 8a4.5 4.5 0 1 1-1.4-3.3M11.5 1.8v3h-3" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			</span>
			<span className="mt-auto mb-[8px] h-[5px] w-[134px] rounded-full bg-white/90" />
		</div>
	);
}

/** the whole phone: status bar, the page between, Safari's bar, and whatever is played over all of it */
export function PhoneShell({ rootRef, children, over }: { rootRef: React.RefObject<HTMLDivElement | null>; children: ReactNode; over?: ReactNode }) {
	const screen = useScreenSize();
	if (screen.device)
		return (
			<div ref={rootRef} className="fixed inset-0 select-none overflow-hidden bg-bg font-sans text-text antialiased [-webkit-touch-callout:none]">
				<div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ top: screen.top }}>
					{children}
				</div>
				{over}
			</div>
		);
	return (
		<div ref={rootRef} className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased">
			<StatusBar />
			<div className="absolute inset-x-0 overflow-hidden" style={{ top: STATUS, height: AREA_H }}>
				{children}
			</div>
			<Safari />
			{over}
		</div>
	);
}

/* ---------- shared state ---------- */

/**
 * How a played frame is left. `down`: a swipe down anywhere, which only works
 * because these fixture frames never scroll. `edge` (DEV-161): a pull from the
 * right edge, the one strip a real frame rarely claims (iOS back is the left
 * edge, a frame's own lists and sheets scroll vertically) and the edge a right
 * thumb reaches without moving the hand.
 */
export type Exit = "down" | "edge";

export function usePhone(state: PhoneState, opts: { exit?: Exit; onWalk?: (name: string) => void } = {}) {
	const screen = useScreenSize();
	const root = useRef<HTMLDivElement | null>(null);
	const [changed, setChanged] = useState(false);
	const [play, setPlay] = useState<{ page: Page; name: string; from: Rect | null } | null>(
		state === "play" ? { page: PAGES[0]!, name: "cart", from: null } : null,
	);
	const [closing, setClosing] = useState<Rect | null>(null);

	useEffect(() => {
		if (state === "play") return;
		const timer = window.setTimeout(() => setChanged(true), 4000);
		return () => window.clearTimeout(timer);
	}, [state]);

	const rectOf = useCallback((el: Element | null | undefined): Rect | null => {
		if (el === null || el === undefined) return null;
		const box = el.getBoundingClientRect();
		const origin = root.current?.getBoundingClientRect();
		return { x: box.left - (origin?.left ?? 0), y: box.top - (origin?.top ?? 0), w: box.width, h: box.height };
	}, []);

	const open = (page: Page, name: string, el: Element | null | undefined) => {
		setClosing(null);
		setPlay({ page, name, from: rectOf(el) });
	};
	const close = () => {
		if (play === null) return;
		const el = root.current?.querySelector(`[data-frame="${play.name}"]`);
		const rect = rectOf(el);
		// a card scrolled out of sight: shrink toward the middle and fade
		setClosing(rect ?? { x: screen.w / 2 - 60, y: screen.h / 2 - 130, w: 120, h: 260 });
	};

	const over =
		play === null ? null : (
			<PhonePlay
				page={play.page}
				name={play.name}
				from={play.from}
				closing={closing}
				changed={changed}
				exit={opts.exit ?? "down"}
				onWalk={(name) => {
					opts.onWalk?.(name);
					setPlay((p) => (p === null ? p : { ...p, name }));
				}}
				onClose={close}
				onClosed={() => {
					setPlay(null);
					setClosing(null);
				}}
			/>
		);

	return { root, changed, play, open, over };
}

/* ---------- play: the part that should feel native ---------- */

function PhonePlay({
	page,
	name,
	from,
	closing,
	changed,
	exit,
	onWalk,
	onClose,
	onClosed,
}: {
	page: Page;
	name: string;
	from: Rect | null;
	closing: Rect | null;
	changed: boolean;
	exit: Exit;
	onWalk: (name: string) => void;
	onClose: () => void;
	onClosed: () => void;
}) {
	const screen = useScreenSize();
	const spec = page.frames.find((f) => f.name === name) ?? page.frames[0]!;
	const site = "site" in spec.content;
	const dragY = useMotionValue(0);
	const shrink = useTransform(dragY, [0, 520], [1, 0.7]);
	const corner = useTransform(dragY, [0, 70], [0, 46]);
	// edge: the pull from the right edge, in px; the frame steps back into the canvas under the thumb
	const pull = useMotionValue(0);
	const pullX = useTransform(pull, (v: number) => -v * 0.45);
	const pullShrink = useTransform(pull, [0, 320], [1, 0.68]);
	const pullCorner = useTransform(pull, [0, 60], [0, 40]);
	const dim = useTransform(exit === "edge" ? pull : dragY, [0, 420], [1, 0.15]);
	const pulling = useRef<{ x: number; t: number } | null>(null);
	const leaving = closing !== null;
	const [hint, setHint] = useState(false);
	const [past, setPast] = useState<string[]>([]);

	useEffect(() => {
		const a = window.setTimeout(() => setHint(true), 700);
		const b = window.setTimeout(() => setHint(false), 3400);
		return () => {
			window.clearTimeout(a);
			window.clearTimeout(b);
		};
	}, []);

	useEffect(() => {
		if (!leaving) return;
		animate(dragY, 0, GLIDE);
		animate(pull, 0, GLIDE);
	}, [leaving, dragY, pull]);

	// a card is a 390 × 844 frame at scale s; the played frame starts under the status bar
	const at = (r: Rect) => {
		const s = r.w / (site ? screen.w : spec.w);
		return { x: r.x, y: r.y - screen.top * s, scale: s, borderRadius: 22 };
	};
	const full = { x: 0, y: 0, scale: 1, borderRadius: 0 };
	const back = () => {
		const prev = past[past.length - 1];
		if (prev === undefined) return onClose();
		setPast((p) => p.slice(0, -1));
		onWalk(prev);
	};

	return (
		<div className="absolute inset-0 z-50">
			<motion.div
				className="absolute inset-0"
				initial={{ opacity: from === null ? 1 : 0 }}
				animate={{ opacity: leaving ? 0 : 1 }}
				transition={{ duration: leaving ? 0.35 : 0.3 }}
			>
				<motion.div className="absolute inset-0 bg-black" style={{ opacity: dim }} />
			</motion.div>
			<motion.div
				className="absolute top-0 left-0 overflow-hidden"
				style={{ width: screen.w, height: screen.h, originX: 0, originY: 0 }}
				initial={from === null ? full : at(from)}
				animate={leaving ? at(closing) : full}
				transition={GLIDE}
				onAnimationComplete={() => {
					if (leaving) onClosed();
				}}
			>
				<motion.div
					drag={exit === "down" ? "y" : false}
					dragConstraints={{ top: 0, bottom: 0 }}
					dragElastic={{ top: 0.04, bottom: 0.8 }}
					dragMomentum={false}
					onDragEnd={(_: unknown, info: PanInfo) => {
						if (info.offset.y > 110 || info.velocity.y > 600) onClose();
					}}
					className={cn("absolute inset-0 overflow-hidden", site ? "bg-[#0A0A0B]" : "bg-[#FEFEFE]")}
					style={exit === "down" ? { y: dragY, scale: shrink, borderRadius: corner } : { x: pullX, scale: pullShrink, borderRadius: pullCorner }}
				>
					{screen.device ? null : <StatusBar dark={!site} />}
					<div className="absolute inset-x-0 overflow-hidden" style={{ top: screen.top, bottom: screen.bottom }}>
						<AnimatePresence initial={false}>
							<motion.div
								key={spec.name}
								className={cn("absolute inset-0 shadow-[-12px_0_30px_rgba(0,0,0,0.12)]", site ? "bg-[#0A0A0B]" : "bg-[#FEFEFE]")}
								initial={{ x: screen.w }}
								animate={{ x: 0, opacity: 1 }}
								exit={{ x: -110, opacity: 0.4 }}
								transition={GLIDE}
								onClick={(event: React.MouseEvent) =>
									walkOn(event, spec, (next) => {
										setPast((p) => [...p, spec.name]);
										onWalk(next);
									})
								}
							>
								{site ? (
									<div style={{ width: 1440, transform: `scale(${screen.w / 1440})`, transformOrigin: "0 0" }}>
										<FrameBody spec={spec} />
									</div>
								) : (
									<div className="h-full w-full [&>div]:w-full!">
										<FrameBody spec={spec as Spec} changed={changed} fill />
									</div>
								)}
							</motion.div>
						</AnimatePresence>
						{/* the iOS edge: a swipe from the left goes back a frame */}
						{past.length > 0 ? (
							<motion.button
								type="button"
								aria-label="Back"
								onClick={back}
								className="absolute top-0 bottom-0 left-0 w-4"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
							/>
						) : null}
					</div>
					{screen.device ? null : (
						<span className={cn("pointer-events-none absolute bottom-[8px] left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full", site ? "bg-white/90" : "bg-black/85")} />
					)}
				</motion.div>
			</motion.div>
			{exit === "edge" && !leaving ? (
				<div
					className="absolute top-0 right-0 bottom-0 z-20 w-5 touch-none"
					onPointerDown={(event) => {
						event.currentTarget.setPointerCapture(event.pointerId);
						pull.stop();
						pulling.current = { x: event.clientX, t: event.timeStamp };
						setHint(false);
					}}
					onPointerMove={(event) => {
						if (pulling.current === null) return;
						pull.set(Math.max(0, pulling.current.x - event.clientX));
					}}
					onPointerUp={(event) => {
						const start = pulling.current;
						pulling.current = null;
						if (start === null) return;
						const speed = pull.get() / Math.max(1, event.timeStamp - start.t);
						if (pull.get() > 90 || (pull.get() > 24 && speed > 0.6)) {
							haptic();
							onClose();
						} else animate(pull, 0, GLIDE);
					}}
					onPointerCancel={() => {
						pulling.current = null;
						animate(pull, 0, GLIDE);
					}}
				/>
			) : null}
			<AnimatePresence>
				{hint && !leaving && exit === "edge" ? (
					<motion.div
						className="pointer-events-none absolute right-2 z-10 flex items-center gap-1.5 rounded-sm border border-white/10 bg-black/80 py-1.5 pr-2.5 pl-2 text-white backdrop-blur type-detail"
						style={{ top: "50%" }}
						initial={{ opacity: 0, x: 12 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: 8 }}
						transition={SPRING}
					>
						<motion.span animate={{ x: [0, -4, 0] }} transition={{ duration: 1, repeat: 2, ease: "easeInOut" }}>
							‹
						</motion.span>
						pull for the canvas
					</motion.div>
				) : null}
				{hint && !leaving && exit === "down" ? (
					<motion.div
						className="pointer-events-none absolute left-1/2 z-10 flex items-center gap-2 rounded-full bg-black/75 px-3 py-1.5 font-sans text-[13px] text-white backdrop-blur"
						style={{ x: "-50%", top: screen.top + 7 }}
						initial={{ opacity: 0, y: -8, scale: 0.95 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: -6 }}
						transition={SPRING}
					>
						<motion.span animate={{ y: [0, 4, 0] }} transition={{ duration: 1.2, repeat: 2, ease: "easeInOut" }}>
							↓
						</motion.span>
						Swipe down for the canvas
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}

/* ---------- pieces ---------- */

/** a frame at card size: the real frame, scaled, so play is the same element grown */
function Card({ spec, height, changed, onOpen, className }: { spec: Spec; height: number; changed: boolean; onOpen: (el: HTMLElement) => void; className?: string }) {
	const s = height / spec.h;
	const lit = changed && spec.name === "cart";
	return (
		<motion.button
			type="button"
			data-frame={spec.name}
			className={cn("relative shrink-0 cursor-pointer overflow-visible rounded-[14px] text-left", className)}
			style={{ width: spec.w * s, height }}
			whileTap={{ scale: 0.96 }}
			transition={SPRING}
			onClick={(event: React.MouseEvent<HTMLButtonElement>) => onOpen(event.currentTarget)}
		>
			<span className="pointer-events-none absolute top-0 left-0 block" style={{ width: spec.w, height: spec.h, transform: `scale(${s})`, transformOrigin: "0 0" }}>
				<FrameBody spec={spec} changed={changed} />
			</span>
			{lit ? (
				<motion.span
					className="pointer-events-none absolute -inset-[4px] rounded-[16px] border-2 border-thread"
					initial={{ opacity: 0 }}
					animate={{ opacity: [0, 1, 1, 0] }}
					transition={{ duration: 1.6, times: [0, 0.1, 0.5, 1] }}
				/>
			) : null}
		</motion.button>
	);
}

function Here({ size = 22 }: { size?: number }) {
	return <Faces ids={["jonas", "mira", "ada"]} size={size} />;
}

const hereOn = (frame: string) => (frame === "cart" ? ["jonas"] : frame === "menu" ? ["mira"] : []);

function Saved({ show }: { show: boolean }) {
	return (
		<AnimatePresence>
			{show ? (
				<motion.span
					className="flex items-center gap-1.5 overflow-hidden text-muted type-detail"
					initial={{ opacity: 0, height: 0 }}
					animate={{ opacity: 1, height: "auto" }}
					transition={GLIDE}
				>
					<Face id="jonas" size={14} />
					jonas saved cart · now
				</motion.span>
			) : null}
		</AnimatePresence>
	);
}

/** A page's canvas pushed over whatever was there, the way a navigation stack pushes. A swipe from the left edge pops it. */
function Pushed({ page, title, back, changed, onOpen, onBack, leaving }: { page: Page; title: string; back: string; changed: boolean; onOpen: (name: string, el: HTMLElement) => void; onBack: () => void; leaving: boolean }) {
	const screen = useScreenSize();
	const cam = useCamera();
	const field = useRef<HTMLDivElement | null>(null);
	const controls = useDragControls();
	const x = useMotionValue(0);
	useLayoutEffect(() => {
		const el = field.current;
		if (el === null) return;
		cam.set(fit(bounds(page.frames), el.clientWidth, el.clientHeight, { x: 22, top: 36, bottom: 30 }, 1));
	}, [cam, page]);
	return (
		<motion.div
			className="absolute inset-0 z-10 bg-bg shadow-[-20px_0_40px_rgba(0,0,0,0.5)]"
			initial={{ x: screen.w }}
			animate={{ x: leaving ? screen.w : 0 }}
			transition={GLIDE}
			drag="x"
			dragControls={controls}
			dragListener={false}
			dragConstraints={{ left: 0, right: screen.w }}
			dragElastic={0}
			dragMomentum={false}
			style={{ x }}
			onDragEnd={(_: unknown, info: PanInfo) => {
				if (info.offset.x > 110 || info.velocity.x > 500) onBack();
				else animate(x, 0, SPRING);
			}}
		>
			<div className="relative z-10 flex h-11 items-center border-border border-b bg-bg/90 px-2 backdrop-blur">
				<button type="button" onClick={onBack} className="flex cursor-pointer items-center gap-0.5 rounded-sm px-1.5 py-1 text-thread text-[16px] active:opacity-60">
					<svg viewBox="0 0 12 20" className="h-[18px] w-[11px]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
						<path d="M10 2 2 10l8 8" />
					</svg>
					<span className="ml-1">{back}</span>
				</button>
				<span className="absolute left-1/2 -translate-x-1/2 font-semibold text-[16px]">{title}</span>
			</div>
			<div className="absolute inset-x-0 top-11 bottom-0">
				<Field
					fieldRef={field}
					cam={cam}
					page={page}
					member
					changed={changed}
					onTap={(name, el) => onOpen(name, el)}
					small
					cursors={page.name === "app" ? <Cursors cam={cam} small /> : null}
				/>
			</div>
			<div className="absolute top-0 bottom-0 left-0 z-20 w-5 touch-none" onPointerDown={(event) => controls.start(event)} />
		</motion.div>
	);
}

function useStack(initial: Page | null) {
	const [pushed, setPushed] = useState<Page | null>(initial);
	const [leaving, setLeaving] = useState(false);
	const push = (page: Page) => {
		setLeaving(false);
		setPushed(page);
	};
	const pop = () => {
		setLeaving(true);
		window.setTimeout(() => {
			setPushed(null);
			setLeaving(false);
		}, 450);
	};
	return { pushed, leaving, push, pop, under: pushed !== null && !leaving };
}

/** what sits under a pushed view slides a third over and dims, the way UIKit does it */
function Under({ pushed, children }: { pushed: boolean; children: ReactNode }) {
	const screen = useScreenSize();
	return (
		<motion.div className="absolute inset-0" animate={{ x: pushed ? -screen.w * 0.3 : 0 }} transition={GLIDE}>
			{children}
			<motion.div className="pointer-events-none absolute inset-0 bg-black" animate={{ opacity: pushed ? 0.35 : 0 }} transition={GLIDE} />
		</motion.div>
	);
}

/* ---------- take: canvas ---------- */

function CanvasTake({ state }: { state: PhoneState }) {
	const screen = useScreenSize();
	const p = usePhone(state);
	const [pageName, setPageName] = useState("app");
	const page = PAGES.find((x) => x.name === pageName) ?? PAGES[0]!;
	const pageRef = useRef(page);
	pageRef.current = page;
	const [sheet, setSheet] = useState(state === "pages");
	const cam = useCamera();
	const field = useRef<HTMLDivElement | null>(null);
	const pad = { x: 22, top: 70, bottom: 40 };

	const fitPage = useCallback(() => {
		const el = field.current;
		if (el !== null) cam.set(fit(bounds(pageRef.current.frames), el.clientWidth, el.clientHeight, pad, 1));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [cam]);
	useLayoutEffect(fitPage, [fitPage]);

	const flyTo = (name: string) => {
		const spec = page.frames.find((f) => f.name === name);
		const el = field.current;
		if (spec !== undefined && el !== null) cam.fly(fit(spec, el.clientWidth, el.clientHeight, pad, 1));
	};

	return (
		<PhoneShell rootRef={p.root} over={p.over}>
			<Field
				fieldRef={field}
				cam={cam}
				page={page}
				member
				changed={p.changed}
				away={p.play?.name}
				onTap={(name, el) => p.open(page, name, el)}
				onSwap={fitPage}
				small
				cursors={page.name === "app" && p.play === null ? <Cursors cam={cam} small /> : null}
			/>
			<div data-chrome="" className="absolute inset-x-3 top-3 flex items-center justify-between">
				<motion.button
					type="button"
					onClick={() => setSheet(true)}
					whileTap={{ scale: 0.95 }}
					className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-raised/80 pr-3 pl-2 backdrop-blur-xl"
				>
					<TeamMark size={24} />
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span key={page.name} className="text-[15px]" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
							{page.name}
						</motion.span>
					</AnimatePresence>
					<ChevronIcon open className="h-2.5 w-2.5 text-muted" />
				</motion.button>
				<span className="flex h-10 items-center rounded-full border border-white/10 bg-raised/80 px-1.5 backdrop-blur-xl">
					<Here size={26} />
				</span>
			</div>
			<AnimatePresence>
				{p.changed && p.play === null ? (
					<motion.div
						data-chrome=""
						className="pointer-events-none absolute left-1/2 flex items-center gap-2 rounded-full border border-white/10 bg-raised/90 px-3 py-2 text-[13px] backdrop-blur-xl"
						style={{ x: "-50%", bottom: 12 + screen.chin }}
						initial={{ opacity: 0, y: 16, scale: 0.94 }}
						animate={{ opacity: [0, 1, 1, 0], y: [16, 0, 0, 8], scale: [0.94, 1, 1, 1] }}
						transition={{ duration: 3.4, times: [0, 0.1, 0.85, 1] }}
					>
						<Face id="jonas" size={18} />
						jonas saved cart
					</motion.div>
				) : null}
			</AnimatePresence>
			<Sheet open={sheet} onClose={() => setSheet(false)}>
				<div className="px-4 pt-1 pb-2">
					<div className="flex items-center gap-2.5 pb-3">
						<TeamMark size={28} />
						<div className="flex flex-col">
							<span className="font-semibold text-[17px]">tidemark app</span>
							<span className="text-[13px] text-muted">3 pages · Jonas and Mira are here</span>
						</div>
					</div>
					{PAGES.map((x) => {
						const on = x.name === page.name;
						return (
							<div key={x.name} className="border-border border-t">
								<button type="button" onClick={() => setPageName(x.name)} className="flex h-12 w-full cursor-pointer items-center gap-3 text-left active:opacity-60">
									<FolderIcon className={cn("h-[18px] w-[18px]", on ? "text-thread" : "text-muted")} />
									<span className="flex-1 text-[17px]">{x.name}</span>
									<span className="text-[15px] text-muted">{x.frames.length}</span>
									<ChevronIcon open={on} className="h-3 w-3 text-muted" />
								</button>
								<AnimatePresence initial={false}>
									{on ? (
										<motion.div className="overflow-hidden" initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} transition={GLIDE}>
											<div className="flex gap-3 overflow-x-auto pb-3 pl-8 [scrollbar-width:none]">
												{x.frames.map((f) => (
													<button
														key={f.name}
														type="button"
														onClick={() => {
															setSheet(false);
															window.setTimeout(() => flyTo(f.name), 180);
														}}
														className="flex shrink-0 cursor-pointer flex-col items-start gap-1.5"
													>
														<span className="relative block overflow-hidden rounded-[8px]" style={{ width: f.w * (110 / f.h), height: 110 }}>
															<span className="absolute top-0 left-0 block" style={{ width: f.w, height: f.h, transform: `scale(${110 / f.h})`, transformOrigin: "0 0" }}>
																<FrameBody spec={f} changed={p.changed} />
															</span>
														</span>
														<span className="flex items-center gap-1 text-[13px] text-muted">
															{f.name}
															{p.changed && f.name === "cart" ? <UnseenMark mark="changed" /> : null}
														</span>
													</button>
												))}
											</div>
										</motion.div>
									) : null}
								</AnimatePresence>
							</div>
						);
					})}
				</div>
			</Sheet>
		</PhoneShell>
	);
}

function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
	const screen = useScreenSize();
	return (
		<AnimatePresence>
			{open ? (
				<>
					<motion.div
						key="scrim"
						data-chrome=""
						className="absolute inset-0 z-30 bg-black/45"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.25 }}
						onClick={onClose}
					/>
					<motion.div
						key="sheet"
						data-chrome=""
						className="absolute inset-x-0 bottom-0 z-40 rounded-t-[22px] border-white/10 border-t bg-surface"
						style={{ paddingBottom: 16 + screen.chin }}
						initial={{ y: "100%" }}
						animate={{ y: 0 }}
						exit={{ y: "100%" }}
						transition={{ type: "spring", visualDuration: 0.4, bounce: 0.08 }}
						drag="y"
						dragConstraints={{ top: 0, bottom: 0 }}
						dragElastic={{ top: 0.06, bottom: 0.9 }}
						onDragEnd={(_: unknown, info: PanInfo) => {
							if (info.offset.y > 90 || info.velocity.y > 500) onClose();
						}}
					>
						<div className="mx-auto mt-2 mb-2 h-[5px] w-9 rounded-full bg-white/25" />
						{children}
					</motion.div>
				</>
			) : null}
		</AnimatePresence>
	);
}

/* ---------- take: shelf ---------- */

function ShelfTake({ state }: { state: PhoneState }) {
	const screen = useScreenSize();
	const p = usePhone(state);
	const stack = useStack(state === "canvas" ? PAGES[0]! : null);
	return (
		<PhoneShell rootRef={p.root} over={p.over}>
			<Under pushed={stack.under}>
				<div className="absolute inset-0 overflow-y-auto overscroll-contain [scrollbar-width:none]">
					<div className="flex items-center gap-3 px-5 pt-5 pb-1">
						<TeamMark size={30} />
						<h1 className="flex-1 font-semibold text-[28px] tracking-tight">tidemark app</h1>
						<Here size={24} />
					</div>
					<div className="px-5 pb-2">
						<Saved show={p.changed} />
					</div>
					{PAGES.map((page) => (
						<section key={page.name} className="pt-4 pb-2">
							<div className="flex items-baseline gap-2 px-5 pb-2.5">
								<span className="font-semibold text-[19px]">{page.name}</span>
								<span className="text-[15px] text-muted">{page.frames.length}</span>
								<motion.button
									type="button"
									whileTap={{ scale: 0.94 }}
									onClick={() => stack.push(page)}
									className="ml-auto flex cursor-pointer items-center gap-1 text-[15px] text-thread"
								>
									Canvas
									<svg viewBox="0 0 8 14" className="h-3 w-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
										<path d="m1 1 6 6-6 6" />
									</svg>
								</motion.button>
							</div>
							<div className="flex snap-x snap-mandatory items-start gap-2 overflow-x-auto scroll-px-5 px-5 pb-1 [scrollbar-width:none]">
								{page.frames.map((f, i) => {
									const thread = page.threads.find((t) => t.from === page.frames[i - 1]?.name && t.to === f.name);
									return (
										<div key={f.name} className="flex shrink-0 snap-start items-start gap-2">
											{i > 0 ? (
												<span className="flex w-4 items-center justify-center self-center pb-6">
													{thread ? (
														<svg viewBox="0 0 16 10" className="h-2.5 w-4" fill="none" aria-hidden="true">
															<path d="M1 5h11" stroke="var(--color-thread)" strokeWidth="1.5" strokeDasharray={thread.might ? "2.5 2.5" : undefined} />
															<path d="m15 5-4-3v6Z" fill="var(--color-thread)" />
														</svg>
													) : null}
												</span>
											) : null}
											<div className="flex flex-col gap-1.5">
												<Card spec={f} height={"site" in f.content ? 190 : 340} changed={p.changed} onOpen={(el) => p.open(page, f.name, el)} />
												<span className="flex items-center gap-1.5 text-[13px] text-muted">
													{f.name}
													{p.changed && f.name === "cart" ? <UnseenMark mark="changed" /> : null}
													{page.name === "app" && hereOn(f.name).length > 0 ? <Faces ids={hereOn(f.name)} size={14} /> : null}
												</span>
											</div>
										</div>
									);
								})}
								<span className="w-3 shrink-0" />
							</div>
						</section>
					))}
					<div style={{ height: 24 + screen.chin }} />
				</div>
			</Under>
			{stack.pushed === null ? null : (
				<Pushed
					page={stack.pushed}
					title={stack.pushed.name}
					back="tidemark app"
					changed={p.changed}
					leaving={stack.leaving}
					onBack={stack.pop}
					onOpen={(name, el) => p.open(stack.pushed!, name, el)}
				/>
			)}
		</PhoneShell>
	);
}

/* ---------- take: deck ---------- */

const DECK_DRAWN = 500;
const GAP = 26;

function DeckTake({ state }: { state: PhoneState }) {
	const screen = useScreenSize();
	const p = usePhone(state);
	const [pageName, setPageName] = useState("app");
	const page = PAGES.find((x) => x.name === pageName) ?? PAGES[0]!;
	const [index, setIndex] = useState(0);
	// on a real phone the deck takes what the screen has under its header and above its dots
	const DECK_H = screen.device ? Math.max(420, Math.min(620, screen.h - screen.top - screen.chin - 190)) : DECK_DRAWN;
	const [overview, setOverview] = useState(state === "pages");
	const site = "site" in page.frames[0]!.content;
	const cardW = site ? Math.min(340, screen.w - 50) : (DEVICE.w * DECK_H) / DEVICE.h;
	const cardH = site ? (cardW * 900) / 1440 : DECK_H;
	const step = cardW + GAP;
	const center = (screen.w - cardW) / 2;
	const tx = useMotionValue(center);
	const dragged = useRef(false);

	const go = useCallback(
		(i: number, glide = true) => {
			const n = clampIndex(i, page.frames.length);
			setIndex(n);
			if (glide) animate(tx, center - n * step, SPRING);
			else tx.set(center - n * step);
		},
		[page.frames.length, center, step, tx],
	);
	useLayoutEffect(() => go(0, false), [page.name]); // eslint-disable-line react-hooks/exhaustive-deps

	const current = page.frames[index] ?? page.frames[0]!;

	return (
		<PhoneShell rootRef={p.root} over={p.over}>
			<motion.div
				className="absolute inset-0"
				animate={{ scale: overview ? 0.9 : 1, opacity: overview ? 0 : 1, filter: overview ? "blur(6px)" : "blur(0px)" }}
				transition={GLIDE}
			>
				<div className="flex h-14 items-center justify-between px-4">
					<TeamMark size={26} />
					<motion.button
						type="button"
						whileTap={{ scale: 0.94 }}
						onClick={() => setOverview(true)}
						className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-raised/80 px-3.5 text-[15px]"
					>
						<AnimatePresence mode="popLayout" initial={false}>
							<motion.span key={page.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}>
								{page.name}
							</motion.span>
						</AnimatePresence>
						<span className="grid grid-cols-2 gap-[2px]">
							{[0, 1, 2, 3].map((d) => (
								<span key={d} className="h-[4px] w-[4px] rounded-[1px] bg-muted" />
							))}
						</span>
					</motion.button>
					<Here size={24} />
				</div>
				<div className="relative overflow-hidden" style={{ height: DECK_H + 20 }}>
					<motion.div
						className="absolute top-[10px] left-0 flex cursor-grab items-center active:cursor-grabbing"
						style={{ x: tx, gap: GAP, height: DECK_H }}
						drag="x"
						dragConstraints={{ left: center - (page.frames.length - 1) * step, right: center }}
						dragElastic={0.18}
						dragMomentum={false}
						onDragStart={() => {
							dragged.current = true;
						}}
						onDragEnd={(_: unknown, info: PanInfo) => {
							const projected = tx.get() + info.velocity.x * 0.18;
							go(Math.round((center - projected) / step));
							window.setTimeout(() => {
								dragged.current = false;
							}, 60);
						}}
					>
						{page.frames.map((f, i) => (
							<DeckCard
								key={`${page.name}-${f.name}`}
								spec={f}
								i={i}
								tx={tx}
								center={center}
								step={step}
								w={cardW}
								h={cardH}
								changed={p.changed}
								away={p.play?.name === f.name}
								thread={page.threads.find((t) => t.from === f.name)}
								onTap={(el) => {
									if (dragged.current) return;
									if (i === index) p.open(page, f.name, el);
									else go(i);
								}}
							/>
						))}
					</motion.div>
				</div>
				<div className="flex flex-col items-center gap-3 pt-3">
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={current.name}
							className="flex items-center gap-1.5 text-[15px]"
							initial={{ opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -6 }}
							transition={SPRING}
						>
							{current.name}
							{p.changed && current.name === "cart" ? <UnseenMark mark="changed" /> : null}
							{page.name === "app" && hereOn(current.name).length > 0 ? <Faces ids={hereOn(current.name)} size={16} /> : null}
						</motion.span>
					</AnimatePresence>
					<span className="flex items-center gap-1.5">
						{page.frames.map((f, i) => (
							<motion.button
								key={f.name}
								type="button"
								onClick={() => go(i)}
								className="h-[6px] cursor-pointer rounded-full"
								animate={{ width: i === index ? 18 : 6, backgroundColor: i === index ? "var(--color-thread)" : "rgba(255,255,255,0.22)" }}
								transition={SPRING}
							/>
						))}
					</span>
					<span className="text-[13px] text-muted">Tap to play · swipe for the next</span>
				</div>
			</motion.div>
			<AnimatePresence>
				{overview ? (
					<motion.div
						className="absolute inset-0 overflow-y-auto px-4 pt-4 [scrollbar-width:none]"
						initial={{ opacity: 0, scale: 1.08 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 1.08 }}
						transition={GLIDE}
					>
						<div className="flex items-center gap-2.5 pb-4">
							<TeamMark size={28} />
							<span className="flex-1 font-semibold text-[22px]">tidemark app</span>
							<button type="button" onClick={() => setOverview(false)} className="cursor-pointer text-[16px] text-thread">
								Done
							</button>
						</div>
						<Saved show={p.changed} />
						{PAGES.map((pg, n) => (
							<motion.div
								key={pg.name}
								className="pt-4"
								initial={{ opacity: 0, y: 16 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ ...GLIDE, delay: 0.05 + n * 0.05 }}
							>
								<div className="flex items-baseline gap-2 pb-2">
									<span className={cn("font-semibold text-[17px]", pg.name === page.name && "text-thread")}>{pg.name}</span>
									<span className="text-[13px] text-muted">{pg.frames.length}</span>
								</div>
								<div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]">
									{pg.frames.map((f, i) => (
										<motion.button
											key={f.name}
											type="button"
											whileTap={{ scale: 0.95 }}
											className={cn(
												"relative shrink-0 cursor-pointer overflow-hidden rounded-[8px] ring-2",
												pg.name === page.name && i === index ? "ring-thread" : "ring-transparent",
											)}
											style={{ width: "site" in f.content ? 168 : 84, height: "site" in f.content ? 105 : 182 }}
											onClick={() => {
												setPageName(pg.name);
												setOverview(false);
												window.setTimeout(() => go(i, true), 30);
											}}
										>
											<span
												className="absolute top-0 left-0 block"
												style={{ width: f.w, height: f.h, transform: `scale(${("site" in f.content ? 168 : 84) / f.w})`, transformOrigin: "0 0" }}
											>
												<FrameBody spec={f} changed={p.changed} />
											</span>
										</motion.button>
									))}
								</div>
							</motion.div>
						))}
						<div style={{ height: 24 + screen.chin }} />
					</motion.div>
				) : null}
			</AnimatePresence>
		</PhoneShell>
	);
}

const clampIndex = (i: number, n: number) => Math.max(0, Math.min(n - 1, i));

function DeckCard({
	spec,
	i,
	tx,
	center,
	step,
	w,
	h,
	changed,
	away,
	thread,
	onTap,
}: {
	spec: Spec;
	i: number;
	tx: MotionValue<number>;
	center: number;
	step: number;
	w: number;
	h: number;
	changed: boolean;
	away: boolean;
	thread: { might?: boolean } | undefined;
	onTap: (el: HTMLElement) => void;
}) {
	const d = useTransform(tx, (v: number) => Math.min(Math.abs((v + i * step - center) / step), 1.4));
	const scale = useTransform(d, [0, 1], [1, 0.88]);
	const opacity = useTransform(d, [0, 1, 1.4], [1, 0.45, 0.3]);
	const s = w / spec.w;
	const lit = changed && spec.name === "cart";
	return (
		<motion.div className="relative shrink-0" style={{ width: w, height: h, scale, opacity }}>
			<button
				type="button"
				data-frame={spec.name}
				onClick={(event) => onTap(event.currentTarget)}
				className={cn("absolute inset-0 cursor-pointer overflow-hidden rounded-[18px] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.8)]", away && "opacity-0")}
			>
				<span className="pointer-events-none absolute top-0 left-0 block" style={{ width: spec.w, height: spec.h, transform: `scale(${s})`, transformOrigin: "0 0" }}>
					<FrameBody spec={spec} changed={changed} />
				</span>
			</button>
			{lit ? (
				<motion.span
					className="pointer-events-none absolute -inset-[5px] rounded-[22px] border-2 border-thread"
					initial={{ opacity: 0 }}
					animate={{ opacity: [0, 1, 1, 0] }}
					transition={{ duration: 1.6, times: [0, 0.1, 0.5, 1] }}
				/>
			) : null}
			{thread ? (
				<svg viewBox="0 0 22 10" className="pointer-events-none absolute top-1/2 h-2.5 w-[22px] -translate-y-1/2" style={{ left: w + 2 }} fill="none" aria-hidden="true">
					<path d="M1 5h16" stroke="var(--color-thread)" strokeWidth="1.5" strokeDasharray={thread.might ? "2.5 2.5" : undefined} />
					<path d="m21 5-5-3.5v7Z" fill="var(--color-thread)" />
				</svg>
			) : null}
		</motion.div>
	);
}

/* ---------- take: list ---------- */

function ListTake({ state }: { state: PhoneState }) {
	const screen = useScreenSize();
	const p = usePhone(state);
	const stack = useStack(state === "canvas" ? PAGES[0]! : null);
	const scroller = useRef<HTMLDivElement | null>(null);
	const scrollY = useMotionValue(0);
	const big = useTransform(scrollY, [0, 40], [1, 0]);
	const small = useTransform(scrollY, [30, 50], [0, 1]);
	const app = PAGES[0]!;
	const recent: { spec: Spec; who: string; when: string }[] = [
		...(p.changed ? [{ spec: app.frames[1]!, who: "jonas", when: "now" }] : []),
		{ spec: app.frames[0]!, who: "mira", when: "2 h ago" },
		{ spec: PAGES[1]!.frames[0]!, who: "ada", when: "this morning" },
	];

	return (
		<PhoneShell rootRef={p.root} over={p.over}>
			<Under pushed={stack.under}>
				<div className="absolute inset-x-0 top-0 z-10 flex h-11 items-center justify-center border-white/0 bg-bg/80 backdrop-blur-xl">
					<motion.span className="font-semibold text-[16px]" style={{ opacity: small }}>
						tidemark app
					</motion.span>
				</div>
				<div
					ref={scroller}
					className="absolute inset-0 overflow-y-auto pt-11 [scrollbar-width:none]"
					onScroll={(event) => scrollY.set(event.currentTarget.scrollTop)}
				>
					<motion.div className="px-4 pb-1" style={{ opacity: big }}>
						<h1 className="font-bold text-[32px] tracking-tight">tidemark app</h1>
						<span className="flex items-center gap-2 pt-1 text-[14px] text-muted">
							<Faces ids={["jonas", "mira"]} size={18} />
							Jonas and Mira are here
						</span>
					</motion.div>
					<Group title="Changed today">
						<AnimatePresence initial={false}>
							{recent.map((r) => (
								<motion.button
									key={r.spec.name}
									type="button"
									layout
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: 72 }}
									transition={GLIDE}
									onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
										const thumb = event.currentTarget.querySelector("[data-frame]");
										const pg = PAGES.find((x) => x.frames.includes(r.spec)) ?? app;
										p.open(pg, r.spec.name, thumb);
									}}
									className="flex w-full cursor-pointer items-center gap-3 overflow-hidden border-white/[0.06] border-b px-3 text-left last:border-b-0 active:bg-white/[0.04]"
								>
									<Thumb spec={r.spec} changed={p.changed} away={p.play?.name === r.spec.name} />
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="flex items-center gap-1.5 text-[17px]">
											{r.spec.name}
											{p.changed && r.spec.name === "cart" ? <UnseenMark mark="changed" /> : null}
										</span>
										<span className="flex items-center gap-1.5 text-[14px] text-muted">
											<Face id={r.who} size={14} />
											{r.who === "ada" ? "you" : r.who} · {r.when}
										</span>
									</span>
									<PlayGlyph />
								</motion.button>
							))}
						</AnimatePresence>
					</Group>
					<Group title="Pages">
						{PAGES.map((pg) => (
							<button
								key={pg.name}
								type="button"
								onClick={() => stack.push(pg)}
								className="flex h-[52px] w-full cursor-pointer items-center gap-3 border-white/[0.06] border-b px-3 text-left last:border-b-0 active:bg-white/[0.04]"
							>
								<FolderIcon className="h-[18px] w-[18px] text-thread" />
								<span className="flex-1 text-[17px]">{pg.name}</span>
								<span className="text-[15px] text-muted">{pg.frames.length}</span>
								<svg viewBox="0 0 8 14" className="h-3 w-2 text-white/30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
									<path d="m1 1 6 6-6 6" />
								</svg>
							</button>
						))}
					</Group>
					<p className="px-8 pt-1 text-[13px] text-muted" style={{ paddingBottom: 32 + screen.chin }}>
						You can look and play. Changes are made in spool on a Mac.
					</p>
				</div>
			</Under>
			{stack.pushed === null ? null : (
				<Pushed
					page={stack.pushed}
					title={stack.pushed.name}
					back="tidemark app"
					changed={p.changed}
					leaving={stack.leaving}
					onBack={stack.pop}
					onOpen={(name, el) => p.open(stack.pushed!, name, el)}
				/>
			)}
		</PhoneShell>
	);
}

function Group({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="px-4 pt-5">
			<span className="block px-3 pb-1.5 text-[13px] text-muted uppercase tracking-wide">{title}</span>
			<div className="overflow-hidden rounded-[12px] bg-surface">{children}</div>
		</div>
	);
}

function Thumb({ spec, changed, away }: { spec: Spec; changed: boolean; away: boolean }) {
	const h = 56;
	const w = "site" in spec.content ? 64 : (spec.w * h) / spec.h;
	const s = "site" in spec.content ? 64 / spec.w : h / spec.h;
	return (
		<span className="flex w-16 shrink-0 justify-center">
			<span data-frame={spec.name} className={cn("relative block overflow-hidden rounded-[6px]", away && "opacity-0")} style={{ width: w, height: "site" in spec.content ? 40 : h }}>
				<span className="absolute top-0 left-0 block" style={{ width: spec.w, height: spec.h, transform: `scale(${s})`, transformOrigin: "0 0" }}>
					<FrameBody spec={spec} changed={changed} />
				</span>
			</span>
		</span>
	);
}

function PlayGlyph() {
	return (
		<span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[0.08] text-text">
			<svg viewBox="0 0 10 10" className="ml-[1px] h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
				<path d="M2 1.2 8.4 5 2 8.8Z" />
			</svg>
		</span>
	);
}

/* ---------- entry ---------- */

function Take({ take, state }: { take: PhoneTake; state: PhoneState }) {
	if (take === "canvas") return <CanvasTake state={state} />;
	if (take === "shelf") return <ShelfTake state={state} />;
	if (take === "deck") return <DeckTake state={state} />;
	return <ListTake state={state} />;
}

function OnDevice({ take, state }: { take: PhoneTake; state: PhoneState }) {
	const screen = useDevice();
	return (
		<ScreenContext.Provider value={screen}>
			<Take take={take} state={state} />
		</ScreenContext.Provider>
	);
}

export function PhoneCanvas({ take, state, device = false }: { take: PhoneTake; state: PhoneState; device?: boolean }) {
	if (device) return <OnDevice take={take} state={state} />;
	return <Take take={take} state={state} />;
}
