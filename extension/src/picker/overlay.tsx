import {
	AnimatePresence,
	animate,
	type MotionValue,
	motion,
	useMotionValue,
	useReducedMotion,
	useTransform,
} from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../../src/ui/cn";
import { CheckIcon } from "../../../src/ui/icons";
import { Button, IconButton } from "../../../src/ui/primitives/actions";
import { Kbd, SpinRing } from "../../../src/ui/primitives/display";
import { TextAction } from "../../../src/ui/primitives/feedback";
import type { Box, Picker } from "./use-picker";

/**
 * The picker, drawn over the page: `app/extension/capture` (design/), built. The highlight is one body on springs and
 * its controls ride it: a dark tab on the body's top edge says what it is on while the hand moves, and unfolds into ↑ ↓,
 * Whole page and Send to spool when the hand rests. Sending runs a line round the body's edge and the tab turns into
 * the receipt. ↑ past body opens the body out to the window's edge and the tab names the site; a rail down the right
 * edge is the page's whole length, the part on screen lit. Sending fills that rail top to bottom.
 */

export const MOTION = {
	body: { stiffness: 520, damping: 42 },
	tab: { stiffness: 460, damping: 38 },
	/** how long the hand stays on one element before the tab unfolds, in seconds */
	rest: 0.32,
	/** how long the send's line takes round the body, in seconds */
	send: 1.1,
};

const GAP = 6;
/** where the body flies out of and home to: the toolbar icon, above the window's top right */
const HOME_RIGHT = 120;

type Spring = { stiffness: number; damping: number; mass?: number };

function springTo(mv: MotionValue<number>, to: number, cfg: Spring, still: boolean) {
	if (still) mv.jump(to);
	else animate(mv, to, { type: "spring", ...cfg });
}

function smooth(e0: number, e1: number, x: number) {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
}

export function Overlay({ c, onOpen }: { c: Picker; onOpen: () => void }) {
	return (
		<div className="pointer-events-none fixed inset-0 overflow-hidden">
			<Rider c={c} onOpen={onOpen} />
		</div>
	);
}

/* --------------------------------------------------------------- the body -- */

function Rider({ c, onOpen }: { c: Picker; onOpen: () => void }) {
	const still = useReducedMotion() === true;
	const VW = c.view.w;
	const VH = c.view.h;
	const home = (): Box => ({ x: VW - HOME_RIGHT, y: -36, w: 28, h: 28 });

	const bx = useMotionValue(VW - HOME_RIGHT);
	const by = useMotionValue(-36);
	const bw = useMotionValue(28);
	const bh = useMotionValue(28);
	const nudge = useMotionValue(0);
	const scale = useMotionValue(1);
	const shown = useRef(false);
	const [lit, setLit] = useState(false);

	// where the body goes: the aim's box, or home to the toolbar icon when there is none
	// biome-ignore lint/correctness/useExhaustiveDependencies: the motion values are stable, home() reads the view
	useLayoutEffect(() => {
		const on = c.open && c.box !== null;
		if (on && c.box !== null) {
			if (!shown.current) {
				const h = home();
				bx.jump(h.x);
				by.jump(h.y);
				bw.jump(h.w);
				bh.jump(h.h);
			}
			const b = c.aim.whole ? { x: GAP, y: GAP, w: VW - GAP * 2, h: VH - GAP * 2 } : c.box;
			springTo(bx, b.x, MOTION.body, still);
			springTo(by, b.y, MOTION.body, still);
			springTo(bw, b.w, MOTION.body, still);
			springTo(bh, b.h, MOTION.body, still);
		} else {
			const h = home();
			springTo(bx, h.x, MOTION.body, still);
			springTo(by, h.y, MOTION.body, still);
			springTo(bw, h.w, MOTION.body, still);
			springTo(bh, h.h, MOTION.body, still);
		}
		shown.current = on;
		setLit(on);
	}, [c.open, c.box, c.aim.whole, VW, VH, still]);

	// a walk past either end of the tree: a small knock in the direction it tried
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the knock's count alone
	useEffect(() => {
		if (c.bump.n === 0 || still) return;
		nudge.jump(c.bump.dir === 1 ? -5 : 5);
		animate(nudge, 0, { type: "spring", stiffness: 700, damping: 14 });
	}, [c.bump.n]);

	// the grab: the body gives under the click, then comes back
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the grab
	useEffect(() => {
		if (c.phase !== "sending" || still) return;
		animate(scale, 0.985, { duration: 0.07 }).then(() =>
			animate(scale, 1, { type: "spring", stiffness: 640, damping: 16 }),
		);
	}, [c.phase, c.grab?.n]);

	const y = useTransform(() => by.get() + nudge.get());

	/* the tab: sits on the body's top edge, slides inside when there is no room above */
	const tw = useMotionValue(220);
	const th = useMotionValue(28);
	const outside = useTransform(() => smooth(-2, 14, by.get() - th.get()));
	const tx = useTransform(() => {
		const t = outside.get();
		const x = bx.get() + GAP * (1 - t);
		return Math.min(VW - tw.get() - GAP, Math.max(GAP, x));
	});
	const ty = useTransform(() => {
		const t = outside.get();
		const top = by.get() + nudge.get();
		const v = t * (top - th.get()) + (1 - t) * (top + GAP);
		return Math.min(VH - th.get() - GAP, Math.max(GAP, v));
	});
	const tabFoot = useTransform(() => 7 * (1 - outside.get()));
	const bodyCorner = useTransform(() => 5 * (1 - outside.get()));

	const failed = c.phase === "failed";
	const sent = c.phase === "sent";

	return (
		<>
			<motion.div
				aria-hidden="true"
				className="absolute top-0 left-0 origin-center border-[1.5px]"
				style={{
					x: bx,
					y,
					width: bw,
					height: bh,
					scale,
					borderTopLeftRadius: bodyCorner,
					borderTopRightRadius: 5,
					borderBottomLeftRadius: 5,
					borderBottomRightRadius: 5,
					boxShadow: "0 0 0 1px color-mix(in srgb, var(--color-surface-window) 45%, transparent)",
				}}
				initial={false}
				animate={{
					opacity: lit ? 1 : 0,
					borderColor: failed ? "var(--color-secondary)" : "var(--color-accent)",
					backgroundColor: sent
						? "color-mix(in srgb, var(--color-accent) 0%, transparent)"
						: failed
							? "color-mix(in srgb, var(--color-surface-window) 30%, transparent)"
							: c.aim.whole
								? "color-mix(in srgb, var(--color-accent) 0%, transparent)"
								: "color-mix(in srgb, var(--color-accent) 4%, transparent)",
				}}
				transition={{ duration: still ? 0 : 0.18, ease: [0.22, 0.61, 0.36, 1] }}
			>
				<Trace c={c} still={still} />
				<Rail c={c} still={still} />
			</motion.div>
			<Tab c={c} x={tx} y={ty} w={tw} h={th} foot={tabFoot} still={still} onOpen={onOpen} />
		</>
	);
}

/** a line that runs once round the body's edge while it sends, and closes when spool has it */
function Trace({ c, still }: { c: Picker; still: boolean }) {
	const sending = c.phase === "sending";
	const sent = c.phase === "sent";
	return (
		<svg
			className="absolute overflow-visible"
			style={{ left: -1.5, top: -1.5, width: "calc(100% + 3px)", height: "calc(100% + 3px)" }}
			aria-hidden="true"
		>
			<AnimatePresence>
				{(sending || sent) && (
					<motion.rect
						key={c.grab?.n}
						x="0"
						y="0"
						width="100%"
						height="100%"
						rx="5"
						fill="none"
						stroke="var(--color-accent)"
						strokeWidth="2"
						strokeLinecap="round"
						initial={{ pathLength: still ? 1 : 0, opacity: 1 }}
						animate={
							sent
								? { pathLength: 1, opacity: [1, 1, 0], transition: { duration: 0.9, times: [0, 0.4, 1] } }
								: {
										pathLength: 0.86,
										transition: { duration: still ? 0 : MOTION.send, ease: [0.22, 0.61, 0.36, 1] },
									}
						}
						exit={{ opacity: 0, transition: { duration: 0.2 } }}
					/>
				)}
			</AnimatePresence>
			<AnimatePresence>
				{sent && (
					<motion.rect
						key={`wash-${c.grab?.n}`}
						x="0"
						y="0"
						width="100%"
						height="100%"
						rx="5"
						fill="var(--color-accent)"
						initial={{ opacity: still ? 0 : 0.16 }}
						animate={{ opacity: 0, transition: { duration: 0.7, ease: [0.22, 0.61, 0.36, 1] } }}
						exit={{ opacity: 0 }}
					/>
				)}
			</AnimatePresence>
		</svg>
	);
}

/* ---------------------------------------------------------------- the rail -- */

/**
 * The page's whole length, down the body's right edge while it holds the whole page: the track is all of it, the lit
 * part is what is on screen and follows the scroll. Sending fills it top to bottom, so "the whole page" is something
 * you watch go, not a word.
 */
function Rail({ c, still }: { c: Picker; still: boolean }) {
	const top = useMotionValue(0);
	const len = useMotionValue(1);
	const fill = useMotionValue(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the motion values are stable
	useEffect(() => {
		const read = () => {
			const d = document.documentElement;
			const h = Math.max(1, d.scrollHeight, document.body.scrollHeight);
			springTo(top, window.scrollY / h, { stiffness: 900, damping: 60 }, still);
			len.jump(Math.min(1, window.innerHeight / h));
		};
		read();
		window.addEventListener("scroll", read, { passive: true });
		return () => window.removeEventListener("scroll", read);
	}, [still]);

	const whole = c.aim.whole || (c.phase !== "aim" && c.grab?.whole === true);
	const sending = c.phase === "sending" && c.grab?.whole === true;
	const sent = c.phase === "sent" && c.grab?.whole === true;
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the grab
	useEffect(() => {
		if (sending) {
			fill.jump(0);
			animate(fill, 1, { duration: still ? 0 : MOTION.send, ease: [0.22, 0.61, 0.36, 1] });
		} else if (sent) animate(fill, 1, { duration: still ? 0 : 0.2 });
		else fill.jump(0);
	}, [sending, sent, c.grab?.n]);

	const thumbTop = useTransform(() => `${top.get() * 100}%`);
	const thumbH = useTransform(() => `${len.get() * 100}%`);
	const fillH = useTransform(() => `${fill.get() * 100}%`);

	return (
		<AnimatePresence>
			{whole && (
				<motion.div
					key="rail"
					aria-hidden="true"
					className="absolute top-3 right-2.5 bottom-3 w-[3px] origin-top rounded-full bg-[color-mix(in_srgb,var(--color-accent)_18%,transparent)]"
					initial={{ opacity: 0, scaleY: still ? 1 : 0.2 }}
					animate={{
						opacity: 1,
						scaleY: 1,
						transition: { type: "spring", stiffness: 380, damping: 34, delay: still ? 0 : 0.06 },
					}}
					exit={{ opacity: 0, scaleY: still ? 1 : 0.6, transition: { duration: still ? 0 : 0.14 } }}
				>
					<motion.span
						className="absolute inset-x-0 rounded-full bg-accent"
						style={{ top: thumbTop, height: thumbH }}
					/>
					<motion.span className="absolute inset-x-0 top-0 rounded-full bg-accent" style={{ height: fillH }} />
				</motion.div>
			)}
		</AnimatePresence>
	);
}

/* ----------------------------------------------------------------- the tab -- */

type Mode = "howto" | "aim" | "sending" | "sent" | "failed" | "opening";

function Tab({
	c,
	x,
	y,
	w,
	h,
	foot,
	still,
	onOpen,
}: {
	c: Picker;
	x: MotionValue<number>;
	y: MotionValue<number>;
	w: MotionValue<number>;
	h: MotionValue<number>;
	foot: MotionValue<number>;
	still: boolean;
	onOpen: () => void;
}) {
	const [howto, setHowto] = useState(true);
	const [opening, setOpening] = useState(false);

	// the one line of how-to: shown on opening, gone two seconds after the hand finds something, or at the first walk
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on each opening
	useEffect(() => {
		if (c.open) {
			setHowto(true);
			setOpening(false);
		}
	}, [c.openedAt]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on finding something, a walk, a send
	useEffect(() => {
		if (!howto || c.aim.el === null) return;
		if (c.dir !== 0 || c.phase !== "aim") return setHowto(false);
		const t = window.setTimeout(() => setHowto(false), 2000);
		return () => window.clearTimeout(t);
	}, [c.aim.el !== null, c.dir, c.phase]);

	const mode: Mode = opening ? "opening" : c.phase !== "aim" ? c.phase : howto ? "howto" : "aim";
	const resting = mode === "aim" && c.resting;
	const holds = resting || mode === "sent" || mode === "failed" || mode === "howto";

	const measure = useRef<HTMLDivElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the motion values are stable
	useLayoutEffect(() => {
		const el = measure.current;
		if (el === null) return;
		let first = true;
		const ro = new ResizeObserver(() => {
			const r = el.getBoundingClientRect();
			const to = first || still;
			first = false;
			springTo(w, r.width, MOTION.tab, to);
			springTo(h, r.height, MOTION.tab, to);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [still]);

	const openInSpool = () => {
		setOpening(true);
		onOpen();
		window.setTimeout(() => c.close(), 760);
	};

	// walking out, the new name comes up from below; walking in, it comes down from above
	const enterY = c.dir === 1 ? 7 : c.dir === -1 ? -7 : 0;

	return (
		<motion.div
			data-spool-tab=""
			className={cn(
				"absolute top-0 left-0 overflow-hidden rounded-t-[7px] rounded-br-[7px] border border-line-strong bg-surface-window text-primary",
				holds && c.open ? "pointer-events-auto" : "pointer-events-none",
			)}
			style={{ x, y, width: w, height: h, borderBottomLeftRadius: foot }}
			initial={false}
			animate={{ opacity: c.open ? 1 : 0 }}
			transition={{ duration: still ? 0 : 0.16 }}
		>
			<div ref={measure} className="absolute top-0 left-0 flex w-max items-center whitespace-nowrap">
				<AnimatePresence mode="popLayout" initial={false}>
					<motion.div
						key={mode}
						className="flex items-center"
						initial={{ opacity: 0, y: mode === "aim" ? 0 : 6, filter: "blur(2px)" }}
						animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
						exit={{ opacity: 0, y: -6, filter: "blur(2px)" }}
						transition={{ duration: still ? 0 : 0.18, ease: [0.22, 0.61, 0.36, 1] }}
					>
						{mode === "howto" && (
							<Row pad="button">
								<span className="type-control">Point at anything and click to send it to spool.</span>
								<span className="text-secondary type-control">Whole page</span>
								<Kbd>⌘↵</Kbd>
							</Row>
						)}
						{mode === "aim" && (
							<Row pad={resting ? "button" : "tight"}>
								<span className="relative flex h-control-sm items-center">
									<AnimatePresence mode="popLayout" initial={false}>
										<motion.span
											key={`${c.aim.label}-${c.step}`}
											className="type-value"
											initial={{ opacity: 0, y: enterY }}
											animate={{ opacity: 1, y: 0 }}
											exit={{ opacity: 0, y: -enterY }}
											transition={{ duration: still ? 0 : 0.14, ease: [0.22, 0.61, 0.36, 1] }}
										>
											{c.aim.label}
											{c.aim.whole && <span className="text-secondary"> · whole page</span>}
										</motion.span>
									</AnimatePresence>
								</span>
								<AnimatePresence initial={false}>
									{resting && (
										<motion.span
											key="more"
											className="flex items-center gap-2"
											initial={{ opacity: 0, x: -6 }}
											animate={{
												opacity: 1,
												x: 0,
												transition: { duration: still ? 0 : 0.2, delay: still ? 0 : 0.05 },
											}}
											exit={{ opacity: 0, transition: { duration: 0.06 } }}
										>
											<span className="text-secondary type-value">{c.aim.size}</span>
											<span aria-hidden="true" className="h-4 w-px bg-line-strong" />
											<span className="flex items-center">
												<IconButton
													size="sm"
													label="Parent  ↑"
													icon={<Arrow up />}
													onClick={() => c.walk(true)}
												/>
												<IconButton
													size="sm"
													label="Child  ↓"
													icon={<Arrow />}
													onClick={() => c.walk(false)}
												/>
											</span>
											{!c.aim.whole && (
												<Button variant="ghost" size="sm" onClick={() => c.pick(true)}>
													Whole page
													<span className="opacity-60">⌘↵</span>
												</Button>
											)}
											<Button variant="primary" size="sm" onClick={() => c.pick(false)}>
												{c.aim.whole ? "Send whole page" : "Send to spool"}
												<span className="opacity-60">↵</span>
											</Button>
										</motion.span>
									)}
								</AnimatePresence>
							</Row>
						)}
						{mode === "sending" && (
							<Row>
								<SpinRing className="size-3.5 text-accent" />
								<span className="type-control">Sending to spool</span>
								<span className="text-secondary type-value">{c.grab?.label}</span>
							</Row>
						)}
						{mode === "sent" && (
							<Row>
								<CheckIcon className="size-3.5 text-accent" />
								<span className="type-control">
									In <span className="type-value">references/</span> on {c.receipt?.name}
								</span>
								<TextAction onClick={openInSpool}>Open in spool</TextAction>
							</Row>
						)}
						{mode === "failed" && (
							<Row>
								<span className="type-control">
									{c.failure?.offline === false
										? `spool couldn't take this: ${c.failure.error}`
										: "spool isn't running on this Mac. Open it, then try again."}
								</span>
								<TextAction onClick={c.retry}>Try again</TextAction>
							</Row>
						)}
						{mode === "opening" && (
							<Row>
								<SpinRing className="size-3.5 text-secondary" />
								<span className="type-control">Opening spool</span>
							</Row>
						)}
					</motion.div>
				</AnimatePresence>
			</div>
		</motion.div>
	);
}

function Row({ pad = "normal", children }: { pad?: "tight" | "normal" | "button"; children: ReactNode }) {
	return (
		<div
			className={cn(
				"flex items-center gap-2.5",
				pad === "tight" ? "h-6 px-2" : pad === "button" ? "h-9 pr-1.5 pl-3" : "h-9 px-3",
			)}
		>
			{children}
		</div>
	);
}

function Arrow({ up = false }: { up?: boolean }) {
	return (
		<svg
			viewBox="0 0 16 16"
			className="size-4"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d={up ? "M8 12.5v-9M4.5 7 8 3.5 11.5 7" : "M8 3.5v9M4.5 9 8 12.5 11.5 9"} />
		</svg>
	);
}
