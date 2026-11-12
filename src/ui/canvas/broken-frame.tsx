import { AnimatePresence, motion } from "motion/react";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BrokenFrame as Broken } from "../../daemon/thumbs";
import { cn } from "../cn";
import { Button } from "../primitives/actions";
import { EASE } from "./agent-motion";
import { type Box, type NearScreen, shellRadius } from "./camera";
import { type CameraStore, useCameraFollow } from "./camera-store";
import { boxDrawn, type FrameMotion } from "./frame-motion";
import { useStillness } from "./stillness";

/**
 * A frame that does not compile or throws as it starts, drawn over its last
 * good picture (spool-canvas--broken). The picture stays, dimmed well down, so
 * the screen is still the one you know and nobody takes it for working. The
 * edge is danger, and the label above says it in the same ink.
 *
 * At the frame's centre one pin says what broke, at one size on screen as the
 * label is, so no zoom ever reflows or cuts its words (task 518). It says as
 * much as the frame has room for: the failure and the toolchain's first line,
 * the failure alone, a dot, then nothing, each step a morph. Pressing it opens
 * the whole error under it, with the one act that fixes it.
 */

/** What the pin says, richest first; null is a frame too small to carry one. */
export type PinForm = "summary" | "bare" | "dot" | null;

const FORMS: readonly Exclude<PinForm, null>[] = ["summary", "bare", "dot"];
/** The room each form takes on screen, as width and height, with its clearance from the edge. */
const ROOM: Record<Exclude<PinForm, null>, { w: number; h: number }> = {
	summary: { w: 608, h: 120 },
	bare: { w: 220, h: 64 },
	dot: { w: 28, h: 28 },
};
/** How far past its room a richer form must fit to come back, so a zoom resting on the edge never flickers. */
const MARGIN_PX = 24;

/** The form a frame this size on screen carries, given the one it carries now. */
export function pinForm(now: PinForm, w: number, h: number): PinForm {
	const fits = (margin: number) =>
		FORMS.find((form) => w >= ROOM[form].w + margin && h >= ROOM[form].h + margin) ?? null;
	const next = fits(0);
	const rank = (form: PinForm) => (form === null ? FORMS.length : FORMS.indexOf(form));
	if (rank(next) >= rank(now)) return next;
	// richer than now: only once it fits by the margin
	const sure = fits(MARGIN_PX);
	return rank(sure) < rank(now) ? sure : now;
}

/** The dot, on screen. */
const DOT_PX = 10;
/** The pill's height, on screen. */
const PILL_PX = 32;
/** The pill's padding round its words: the start inset and the end inset, on screen. */
const PILL_PAD_PX = 26;

export const BrokenFrame = memo(function BrokenFrame({
	name,
	frame,
	broken,
	camera,
	near,
	act,
	onAct,
	frameMotion,
}: {
	name: string;
	/** the frame, in world units */
	frame: Box;
	/** Frames drawn other than where they stand: the mark rides its frame where it is drawn (spool#299). */
	frameMotion?: FrameMotion | undefined;
	broken: Broken;
	camera: CameraStore;
	near: NearScreen;
	/** what the act says: "Ask agent to fix", or "Copy prompt" with no agent on this machine */
	act: string;
	onAct: (name: string, broken: Broken) => void;
}) {
	const edge = useRef<HTMLDivElement | null>(null);
	const centre = useRef<HTMLDivElement | null>(null);
	const box = useRef<HTMLDivElement | null>(null);
	const words = useRef<HTMLSpanElement | null>(null);
	const formNow = useRef<PinForm>(null);
	const [form, setForm] = useState<PinForm>(null);
	const [wordsPx, setWordsPx] = useState(0);
	const [open, setOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const still = useStillness();
	const outer = useRef<HTMLDivElement | null>(null);
	// where it is drawn is written here, never rendered, so a render between two frames of motion cannot put it back
	const place = () => {
		const element = outer.current;
		if (element === null) return;
		const drawn = boxDrawn(frame, frameMotion?.drawn(name));
		const transform = `translate(${drawn.x}px, ${drawn.y}px) scale(${drawn.w / frame.w})`;
		if (element.style.transform !== transform) element.style.transform = transform;
	};
	const latest = useRef(place);
	latest.current = place;
	useLayoutEffect(place);
	useLayoutEffect(() => frameMotion?.listen(() => latest.current()), [frameMotion]);

	useCameraFollow(
		camera,
		(at, moving) => {
			if (moving && !near(at, frame)) return;
			const { k } = at;
			if (edge.current !== null) {
				edge.current.style.borderWidth = `${1 / k}px`;
				edge.current.style.borderRadius = `${shellRadius(k)}px`;
			}
			if (centre.current !== null) centre.current.style.transform = `scale(${1 / k})`;
			const next = pinForm(formNow.current, frame.w * k, frame.h * k);
			if (next !== formNow.current) {
				formNow.current = next;
				setForm(next);
			}
		},
		[frame.x, frame.y, frame.w, frame.h, near],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the pill's width follows its words, which change only with the form or the error
	useLayoutEffect(() => {
		if (words.current !== null) setWordsPx(words.current.offsetWidth);
	}, [form, broken]);

	useEffect(() => {
		if (form === null) setOpen(false);
	}, [form]);

	useEffect(() => {
		if (!open) return;
		const close = (event: PointerEvent) => {
			if (!box.current?.contains(event.target as Node)) setOpen(false);
		};
		const esc = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopImmediatePropagation();
			setOpen(false);
		};
		window.addEventListener("pointerdown", close, true);
		window.addEventListener("keydown", esc, true);
		return () => {
			window.removeEventListener("pointerdown", close, true);
			window.removeEventListener("keydown", esc, true);
		};
	}, [open]);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 1400);
		return () => clearTimeout(timer);
	}, [copied]);

	const failure = broken.kind === "compile" ? "failed to compile" : "threw on boot";
	const dot = form === "dot";
	const move = still ? { duration: 0 } : { duration: 0.26, ease: EASE.snap };
	return (
		<div
			ref={outer}
			data-broken-frame={name}
			className="pointer-events-none absolute origin-top-left"
			style={{ width: frame.w, height: frame.h }}
		>
			<div ref={edge} className="absolute inset-0 border-danger border-solid bg-surface-canvas/80" />
			<div className="absolute top-1/2 left-1/2 h-0 w-0">
				<div ref={centre} className="absolute top-0 left-0 origin-top-left">
					{/* biome-ignore lint/a11y/noStaticElementInteractions: it only keeps presses from the canvas under it; its controls are buttons */}
					<div
						ref={box}
						// the canvas under it would take a press as the start of a drag
						onPointerDown={(event) => event.stopPropagation()}
						onDoubleClick={(event) => event.stopPropagation()}
					>
						<AnimatePresence initial={false}>
							{form !== null && (
								<motion.button
									key="pin"
									type="button"
									aria-expanded={open}
									aria-label={`${failure}: show the error`}
									initial={{ opacity: 0, scale: 0.6, x: "-50%", y: "-50%" }}
									animate={{
										opacity: 1,
										scale: 1,
										x: "-50%",
										y: "-50%",
										width: dot ? DOT_PX : wordsPx + PILL_PAD_PX,
										height: dot ? DOT_PX : PILL_PX,
									}}
									exit={{ opacity: 0, scale: 0.6, x: "-50%", y: "-50%" }}
									transition={move}
									onClick={() => setOpen((was) => !was)}
									className={cn(
										"group pointer-events-auto absolute top-0 left-0 flex items-center overflow-hidden rounded-full border transition-colors duration-fast ease-out active:brightness-90",
										dot
											? "border-transparent bg-danger"
											: "border-line-subtle bg-surface-panel hover:border-line-strong hover:bg-surface-raised aria-expanded:border-line-strong aria-expanded:bg-surface-raised",
									)}
								>
									{!dot && (
										<motion.span
											key={form}
											initial={still ? false : { opacity: 0 }}
											animate={{ opacity: 1 }}
											transition={move}
											className="flex shrink-0 items-center whitespace-nowrap pl-3"
										>
											<span ref={words} className="flex items-center gap-2">
												<span className="size-1.5 shrink-0 rounded-full bg-danger" />
												<span className="text-danger-strong type-value">{failure}</span>
												{form === "summary" && (
													<span className="max-w-96 truncate text-secondary type-value">
														{headline(broken)}
													</span>
												)}
												<svg
													viewBox="0 0 10 10"
													aria-hidden="true"
													className={cn(
														"size-2.5 shrink-0 text-tertiary transition-transform duration-fast ease-out group-hover:text-secondary",
														open && "rotate-180",
													)}
												>
													<path
														d="M2 3.5 5 6.5 8 3.5"
														fill="none"
														stroke="currentColor"
														strokeWidth="1.2"
														strokeLinecap="round"
													/>
												</svg>
											</span>
										</motion.span>
									)}
								</motion.button>
							)}
							{open && form !== null && (
								<motion.div
									key="error"
									initial={{ opacity: 0, y: 8, scale: 0.97, x: "-50%" }}
									animate={{ opacity: 1, y: dot ? DOT_PX + 6 : PILL_PX / 2 + 10, scale: 1, x: "-50%" }}
									exit={{ opacity: 0, y: 8, scale: 0.97, x: "-50%" }}
									transition={move}
									style={{ transformOrigin: "top center" }}
									className="pointer-events-auto absolute top-0 left-0 flex w-[600px] flex-col gap-3 rounded-md border border-line-subtle bg-surface-raised p-4"
								>
									<pre
										data-broken-error
										className="max-h-64 overflow-auto whitespace-pre text-secondary type-detail"
									>
										{said(broken)}
									</pre>
									<div className="flex items-center gap-1">
										<Button
											size="sm"
											variant="primary"
											onClick={(event) => {
												event.stopPropagation();
												setOpen(false);
												onAct(name, broken);
											}}
										>
											{act}
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												void navigator.clipboard?.writeText(said(broken)).then(
													() => setCopied(true),
													() => undefined,
												);
											}}
										>
											{copied ? "Copied" : "Copy error"}
										</Button>
										<span className="ml-auto text-tertiary type-detail">esc closes</span>
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>
			</div>
		</div>
	);
});

/** The error as the frame's own: a throw's words without the booth's prefix, which the status line already says. */
function said(broken: Broken): string {
	return broken.kind === "boot" ? broken.error.replace(/^threw on boot: /u, "") : broken.error;
}

/** The toolchain's first line, without esbuild's mark and plugin: what one line of the pin has room for. */
export function headline(broken: Broken): string {
	const first = said(broken).trim().split("\n")[0] ?? "";
	return first
		.replace(/^✘ \[ERROR\] /u, "")
		.replace(/ \[plugin [^\]]+\]$/u, "")
		.trim();
}

/** What Ask agent to fix sends: the frame, what broke, the toolchain's words, and how to know it is fixed. */
export function brokenAsk(frame: string, broken: Broken): string {
	const what = broken.kind === "compile" ? "fails to compile" : "throws as it starts";
	return [
		`The frame ${frame} (design/frames/${frame}/frame.tsx) ${what} on the canvas:`,
		"",
		said(broken),
		"",
		`Fix it, then run \`spool check design/frames/${frame}\` and \`spool shot ${frame}\` to confirm it compiles and boots.`,
	].join("\n");
}
