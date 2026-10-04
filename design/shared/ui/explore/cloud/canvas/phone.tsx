import { AnimatePresence, animate, motion, type PanInfo, useMotionValue, useTransform } from "motion/react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { haptic } from "shared/ui/explore/cloud/phone-link/tonal";
import { DEVICE, FrameBody, GLIDE, type Page, PAGES, type Rect, SPRING, type Spec, walkOn } from "./fixture";

/**
 * The phone's shell and play, under the read-only canvas on a phone (DEV-114,
 * DEV-161). The four takes first drawn here (canvas, shelf, deck, list) lost to
 * `reach` (./reach.tsx) and were deleted; git keeps them.
 *
 * A screen is drawn (the 390 × 844 phone on the canvas, with a fake status bar
 * and Safari) or the device (exported with `spool build` and opened from the
 * Home Screen: the real screen size and safe areas). Play grows a frame out of
 * its card to the whole screen and runs it live when it has an export.
 *
 * Prototype only.
 */

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

	return { root, changed, play, open, close, over };
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
	const thumb = "thumb" in spec.content ? spec.content : null;
	// a frame wider than a phone plays whole, contained: the site fixture, or a real desktop frame
	const site = "site" in spec.content || (thumb !== null && spec.w > 500);
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

	// where the frame shows inside the played screen, so a card grows into exactly that spot and shrinks back from it
	const shown = (): { left: number; top: number; w: number } => {
		if (thumb?.live !== undefined && !site) return { left: 0, top: 0, w: screen.w };
		if (thumb !== null && site) {
			const box = contained(screen, spec);
			return { left: box.left, top: box.top, w: box.w };
		}
		return { left: 0, top: screen.top, w: screen.w };
	};
	const at = (r: Rect) => {
		const box = shown();
		const s = r.w / (thumb === null && !site ? spec.w : box.w);
		return { x: r.x - box.left * s, y: r.y - box.top * s, scale: s, borderRadius: 22 };
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
					{thumb?.live !== undefined ? <LiveFrame key={thumb.live} spec={spec} live={thumb.live} cover={thumb.play} wide={site} /> : null}
					<div className={cn("absolute inset-x-0 overflow-hidden", thumb?.live !== undefined && "hidden")} style={{ top: screen.top, bottom: screen.bottom }}>
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
								{thumb !== null ? (
									<img
										src={thumb.play}
										alt=""
										draggable={false}
										className={cn("block h-full w-full", site ? "object-contain" : "object-cover object-top")}
										style={{ backgroundImage: `url(${thumb.thumb})`, backgroundSize: site ? "contain" : "cover", backgroundPosition: site ? "center" : "top", backgroundRepeat: "no-repeat" }}
									/>
								) : site ? (
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
				{hint && !leaving && thumb !== null && site && screen.h > screen.w ? (
					<motion.div
						key="turn"
						className="pointer-events-none absolute left-1/2 z-10 whitespace-nowrap rounded-sm border border-white/10 bg-black/80 px-2.5 py-1.5 text-white/80 backdrop-blur type-detail"
						style={{ x: "-50%", bottom: screen.bottom + 16 }}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={SPRING}
					>
						{`${spec.w} × ${spec.h} · turn the phone${thumb.live === undefined ? " · cover only" : ""}`}
					</motion.div>
				) : null}
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

/** a frame wider than the phone, whole and centred: between the notch and the home bar upright, the whole screen sideways */
function contained(screen: Screen, spec: { w: number; h: number }) {
	const side = screen.w > screen.h;
	const top = side ? 0 : screen.top;
	const room = screen.h - top - (side ? 0 : screen.bottom);
	const s = Math.min(screen.w / spec.w, room / spec.h);
	const w = spec.w * s;
	const h = spec.h * s;
	return { s, w, h, left: (screen.w - w) / 2, top: top + (room - h) / 2 };
}

/**
 * The real frame, exported with `spool build` and running: touch, scroll and
 * walk inside it are the frame's. A phone frame gets the whole screen and pads
 * its own safe areas; a desktop frame runs at its authored size, scaled to fit.
 * Its cover stands in until it has painted.
 */
function LiveFrame({ spec, live, cover, wide }: { spec: Spec; live: string; cover: string; wide: boolean }) {
	const screen = useScreenSize();
	const [ready, setReady] = useState(false);
	const box = wide ? contained(screen, spec) : null;
	const place = box === null ? { left: 0, top: 0, width: screen.w, height: screen.h } : { left: box.left, top: box.top, width: box.w, height: box.h };
	return (
		<div className={cn("absolute inset-0", wide ? "bg-[#0A0A0B]" : "bg-black")}>
			<img src={cover} alt="" draggable={false} className="absolute object-cover object-top" style={place} />
			<iframe
				title={spec.name}
				src={live}
				onLoad={() => window.setTimeout(() => setReady(true), 350)}
				className="absolute border-0 transition-opacity duration-200"
				style={
					box === null
						? { ...place, opacity: ready ? 1 : 0 }
						: { left: box.left, top: box.top, width: spec.w, height: spec.h, transform: `scale(${box.s})`, transformOrigin: "0 0", opacity: ready ? 1 : 0 }
				}
			/>
		</div>
	);
}
