import { AnimatePresence, type MotionValue, motion, useMotionValue } from "motion/react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WhatsNewContent, WhatsNewHighlight } from "../daemon/whats-new";
import type { WhatsNewAnswer } from "../daemon/whats-new-routes";
import { fetchWhatsNew, postWhatsNewSeen } from "./api";
import { cn } from "./cn";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { ChevronIcon, CloseIcon } from "./icons";
import { IconButton } from "./primitives/actions";
import { TextAction } from "./primitives/feedback";
import { Clip } from "./whats-new-clip";

/**
 * What's new, as the update pill unfolded. The first time the
 * window opens on a new version, the pill comes back as "Updated to Spool
 * 0.52.0" and opens upward into one card, one highlight at a time, its row
 * staying at the foot where the pill was. The ticks in that row are the clips'
 * clocks. Dismissed, the card folds back into the pill, the pill into a dot,
 * and the dot flies to the bar's ? and lands there: help's menu is where What's
 * new is found again, and choosing it flies the dot back down and unfolds the
 * card again. Drawn as `app/spool-canvas--whats-new*` on the canvas.
 *
 * The daemon decides what there is and whether it unfolds by itself; the
 * window only says once it has been shown.
 */

type Phase = "arrived" | "open" | "folding" | "flying" | "away" | "returning";

/** a box in the window's own coordinates */
interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Help's What's new row: the version it names, and its press. */
export interface WhatsNewRow {
	version: string;
	open: () => void;
}

const SNAP = [0.32, 0.72, 0, 1] as const;
const OUT = [0.22, 0.61, 0.36, 1] as const;
const DOT = 10;
const CARD_W = 480;

function helpBox(): Box | null {
	const el = document.querySelector<HTMLElement>('[data-bar-end="help"]');
	if (el === null) return null;
	const box = el.getBoundingClientRect();
	return { x: box.left, y: box.top, w: box.width, h: box.height };
}

/**
 * What's new for this window: asked of the daemon once as it opens. `row` is
 * help's menu row, `surface` the pill, card and dot, and `showing` says the
 * pill's place at the foot is taken, so the update pill waits.
 *
 * `foot` is how far above the window's bottom the pill sits: over the canvas
 * tools on a canvas, lower on Home.
 */
export function useWhatsNew({ foot }: { foot: number }): {
	row: WhatsNewRow | undefined;
	surface: ReactNode;
	showing: boolean;
} {
	const [content, setContent] = useState<WhatsNewContent | null>(null);
	/** null: never on screen this session */
	const [phase, setPhase] = useState<Phase | null>(null);
	const [page, setPage] = useState(0);
	const [dir, setDir] = useState(1);
	const [ring, setRing] = useState(0);
	const [help, setHelp] = useState<Box | null>(null);
	const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
	const told = useRef(false);

	useEffect(() => {
		let gone = false;
		void fetchWhatsNew().then((answer: WhatsNewAnswer | undefined) => {
			if (gone || answer?.content == null) return;
			setContent(answer.content);
			if (answer.pop) setPhase("arrived");
		});
		return () => {
			gone = true;
		};
	}, []);

	// where the ? is, so the dot can fly to it and the ring land on it
	useLayoutEffect(() => {
		if (phase === null) return;
		const measure = () => {
			setHelp(helpBox());
			setView({ w: window.innerWidth, h: window.innerHeight });
		};
		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, [phase]);

	// the beats between the states a hand moves it to
	useEffect(() => {
		const after = (ms: number, next: () => void) => {
			const timer = setTimeout(next, ms);
			return () => clearTimeout(timer);
		};
		switch (phase) {
			case "arrived":
				return after(900, () => setPhase("open"));
			case "folding":
				return after(330, () => setPhase("flying"));
			case "flying":
				return after(760, () => {
					setPhase("away");
					setRing((n) => n + 1);
				});
			case "returning":
				return after(640, () => setPhase("arrived"));
			default:
				return undefined;
		}
	}, [phase]);

	// shown: remembered, so it unfolds by itself no more
	useEffect(() => {
		if (phase !== "open" || told.current) return;
		told.current = true;
		postWhatsNewSeen();
	}, [phase]);

	const pages = (content?.highlights.length ?? 0) + 1;
	const go = useCallback(
		(to: number) => {
			const next = Math.max(0, Math.min(pages - 1, to));
			if (next === page) return;
			setDir(next > page ? 1 : -1);
			setPage(next);
		},
		[page, pages],
	);
	const dismiss = useCallback(() => setPhase("folding"), []);

	const keys = useRef({ phase, page, go, dismiss });
	keys.current = { phase, page, go, dismiss };
	useEffect(() => {
		if (content === null) return;
		return attachHotkeyLayer({
			scope: "toast",
			active: () => keys.current.phase === "open",
			handlers: {
				"whatsNew.next": (event) => {
					event?.preventDefault();
					keys.current.go(keys.current.page + 1);
				},
				"whatsNew.previous": (event) => {
					event?.preventDefault();
					keys.current.go(keys.current.page - 1);
				},
				"whatsNew.close": (event) => {
					event?.preventDefault();
					keys.current.dismiss();
				},
			},
		});
	}, [content]);

	const open = useCallback(() => {
		setPage(0);
		setDir(1);
		setHelp(helpBox());
		const was = keys.current.phase;
		// never on screen yet: it starts as the dot at the ?, then flies down as if it had landed there
		if (was === null) {
			setPhase("away");
			setTimeout(() => setPhase("returning"), 60);
		} else setPhase(was === "away" ? "returning" : "open");
	}, []);

	// where the ? is, from the foot of the pill
	const to =
		help === null
			? { x: view.w / 2 - 80, y: -(view.h - 160) }
			: { x: help.x + help.w / 2 - view.w / 2, y: help.y + help.h / 2 + DOT / 2 - (view.h - foot) };

	const surface =
		content === null || phase === null ? null : (
			<>
				<Surface phase={phase} to={to} foot={foot}>
					{phase === "arrived" || phase === "folding" ? (
						<Pill key="arrived">
							Updated to Spool <span className="text-secondary type-value">{content.version}</span>
						</Pill>
					) : phase === "open" ? (
						<Card key="card" content={content} page={page} dir={dir} onGo={go} onDismiss={dismiss} />
					) : null}
				</Surface>
				{help !== null && ring > 0 ? <LandRing key={ring} at={help} /> : null}
			</>
		);

	return {
		row: content === null ? undefined : { version: content.version, open },
		surface,
		showing: phase !== null && phase !== "away",
	};
}

/* --------------------------------------------------------------- Surface -- */

/**
 * The one raised thing every state is drawn on: pill, card and dot. It sizes
 * itself to whatever it holds, measured, and springs between sizes; what it
 * holds sits at its foot, centred, so growing reveals it upward from the row
 * where the pill was.
 */
function Surface({
	phase,
	to,
	foot,
	children,
}: {
	phase: Phase;
	to: { x: number; y: number };
	foot: number;
	children: ReactNode;
}) {
	const [held, setHeld] = useState<HTMLElement | null>(null);
	const [size, setSize] = useState<{ w: number; h: number } | null>(null);
	const dot = phase === "flying" || phase === "away" || phase === "returning";
	// the first size is taken as it is; every one after that springs
	const [settled, setSettled] = useState(false);

	useLayoutEffect(() => {
		if (held === null) return;
		const measure = () => setSize({ w: held.offsetWidth + 2, h: held.offsetHeight + 2 });
		measure();
		const watch = new ResizeObserver(measure);
		watch.observe(held);
		return () => watch.disconnect();
	}, [held]);
	useEffect(() => {
		if (settled || (size === null && !dot)) return;
		const frame = requestAnimationFrame(() => setSettled(true));
		return () => cancelAnimationFrame(frame);
	}, [size, dot, settled]);

	const atHelp = phase === "flying" || phase === "away";
	const w = dot ? DOT : (size?.w ?? 220);
	const h = dot ? DOT : (size?.h ?? 40);

	const transition =
		phase === "flying"
			? {
					width: { duration: 0.22, ease: SNAP },
					height: { duration: 0.22, ease: SNAP },
					marginLeft: { duration: 0.22, ease: SNAP },
					borderRadius: { duration: 0.22, ease: SNAP },
					x: { duration: 0.56, delay: 0.16, ease: [0.55, 0.05, 0.7, 0.3] as const },
					y: { duration: 0.56, delay: 0.16, ease: [0.15, 0.55, 0.3, 1] as const },
					opacity: { duration: 0.2 },
				}
			: phase === "returning"
				? {
						x: { duration: 0.56, ease: [0.3, 0.7, 0.45, 0.95] as const },
						y: { duration: 0.56, ease: [0.6, 0.05, 0.85, 0.45] as const },
						opacity: { duration: 0.12 },
						default: { duration: 0.2, ease: SNAP },
					}
				: phase === "folding"
					? { default: { type: "spring" as const, duration: 0.32, bounce: 0 } }
					: { default: { type: "spring" as const, duration: 0.5, bounce: 0.14 }, opacity: { duration: 0.2 } };

	return (
		<div className="pointer-events-none fixed left-1/2 z-20 size-0" style={{ bottom: foot }}>
			<motion.div
				className={cn(
					"absolute bottom-0 overflow-hidden border border-line-strong bg-surface-raised shadow-float",
					dot ? "pointer-events-none" : "pointer-events-auto",
				)}
				initial={false}
				animate={{
					width: w,
					height: h,
					marginLeft: -w / 2,
					borderRadius: dot ? DOT / 2 : h > 48 ? 12 : 8,
					x: atHelp ? to.x : 0,
					y: atHelp ? to.y : 0,
					opacity: phase === "away" ? 0 : 1,
				}}
				transition={settled ? transition : { duration: 0 }}
			>
				<motion.span
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 bg-accent"
					initial={false}
					animate={{ opacity: dot ? 1 : 0 }}
					transition={{ duration: 0.18 }}
				/>
				<AnimatePresence initial={false}>
					{children === null ? null : (
						<motion.div
							key={(children as { key?: string }).key ?? "held"}
							ref={(node: HTMLDivElement | null) => {
								if (node !== null) setHeld(node);
							}}
							className="absolute bottom-0 left-1/2 -translate-x-1/2"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1, transition: { duration: 0.2, delay: 0.1, ease: OUT } }}
							exit={{ opacity: 0, transition: { duration: 0.1 } }}
						>
							{children}
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>
		</div>
	);
}

function Pill({ children }: { children: ReactNode }) {
	return (
		<div
			role="status"
			className="relative flex h-[38px] w-max items-center gap-1.5 whitespace-nowrap px-4 text-primary type-control"
		>
			{children}
		</div>
	);
}

/* ------------------------------------------------------------------ Card -- */

function Card({
	content,
	page,
	dir,
	onGo,
	onDismiss,
}: {
	content: WhatsNewContent;
	page: number;
	dir: number;
	onGo: (page: number) => void;
	onDismiss: () => void;
}) {
	const t0 = useMotionValue(0);
	const t1 = useMotionValue(0);
	const t2 = useMotionValue(0);
	const t3 = useMotionValue(0);
	const clocks = [t0, t1, t2, t3];
	const items = content.highlights;
	const rest = page >= items.length;
	const item = items[page];

	return (
		<section aria-label="What's new" className="flex flex-col" style={{ width: CARD_W - 2 }}>
			<div className="relative">
				<AnimatePresence mode="popLayout" initial={false} custom={dir}>
					<motion.div
						key={page}
						custom={dir}
						variants={{
							enter: (d: number) => ({ opacity: 0, x: d * 28 }),
							center: { opacity: 1, x: 0 },
							exit: (d: number) => ({ opacity: 0, x: d * -28 }),
						}}
						initial="enter"
						animate="center"
						exit="exit"
						transition={{ duration: 0.24, ease: OUT }}
					>
						{rest || item === undefined ? (
							<RestPage content={content} />
						) : (
							<HighlightPage item={item} time={clocks[page]} />
						)}
					</motion.div>
				</AnimatePresence>
			</div>
			<div className="flex h-11 items-center gap-3 border-line-subtle border-t pr-2 pl-4">
				<span className="flex min-w-0 grow items-baseline gap-1.5">
					<span className="text-primary type-control">What's new</span>
					<span className="text-tertiary type-value">{content.version}</span>
				</span>
				<div className="flex items-center">
					{[...items.map((h) => h.title), "The rest"].map((title, at) => (
						<Tick
							key={title}
							title={title}
							current={at === page}
							time={at < items.length && items[at]?.clip !== undefined ? clocks[at] : undefined}
							onClick={() => onGo(at)}
						/>
					))}
				</div>
				<div className="flex items-center">
					<IconButton
						size="sm"
						label="Previous"
						icon={
							<span className="block size-3 rotate-180">
								<ChevronIcon />
							</span>
						}
						disabled={page === 0}
						onClick={() => onGo(page - 1)}
					/>
					<IconButton
						size="sm"
						label="Next"
						icon={
							<span className="block size-3">
								<ChevronIcon />
							</span>
						}
						disabled={rest}
						onClick={() => onGo(page + 1)}
					/>
				</div>
				<span aria-hidden="true" className="h-4 w-px bg-line-strong" />
				<IconButton size="sm" label="Dismiss (esc)" icon={<CloseIcon />} onClick={onDismiss} />
			</div>
		</section>
	);
}

/**
 * A step in the row. The one you are on is wider and fills with its clip's
 * time as the clip plays, or stands full when there is no clip to wait for.
 */
function Tick({
	title,
	current,
	time,
	onClick,
}: {
	title: string;
	current: boolean;
	time: MotionValue<number> | undefined;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			aria-current={current || undefined}
			onClick={onClick}
			className="group flex h-control-sm items-center rounded-xs px-[3px] focus-ring"
		>
			<motion.span
				className={cn(
					"relative block h-[3px] overflow-hidden rounded-full transition-colors duration-fast ease-out",
					current ? "bg-tertiary/45" : "bg-tertiary/45 group-hover:bg-secondary",
				)}
				initial={false}
				animate={{ width: current ? 22 : 8 }}
				transition={{ type: "spring", duration: 0.4, bounce: 0.1 }}
			>
				{current ? (
					<motion.span className="absolute inset-0 origin-left bg-accent" style={{ scaleX: time ?? 1 }} />
				) : null}
			</motion.span>
		</button>
	);
}

function HighlightPage({ item, time }: { item: WhatsNewHighlight; time: MotionValue<number> | undefined }) {
	if (item.clip === undefined) {
		return (
			<div className="px-5 pt-5 pb-4">
				<h3 className="text-primary type-heading">{item.title}</h3>
				<p className="mt-1.5 max-w-[42ch] text-secondary type-body">
					<Words text={item.says} />
				</p>
			</div>
		);
	}
	return (
		<div className="p-1.5 pb-0">
			<div className="relative aspect-[16/10] overflow-hidden rounded-md">
				<Clip src={item.clip.src} poster={item.clip.poster} time={time} />
			</div>
			<div className="px-3.5 pt-3 pb-3.5">
				<h3 className="text-primary type-title">{item.title}</h3>
				<p className="mt-0.5 text-secondary type-control">
					<Words text={item.says} />
				</p>
			</div>
		</div>
	);
}

function RestPage({ content }: { content: WhatsNewContent }) {
	const { features, fixes } = content;
	return (
		<div className="px-5 pt-4 pb-3.5">
			<h3 className="text-primary type-title">Also in {content.version}</h3>
			{features.length === 0 ? null : (
				<ul className="mt-2 flex max-h-[50vh] flex-col overflow-y-auto">
					{features.map((feature) => (
						<li key={feature.name} className="border-line-subtle border-b py-2 last:border-b-0">
							<p className="text-primary type-control">
								<Words text={feature.name} />
							</p>
							{feature.says === undefined ? null : (
								<p className="text-secondary type-label">
									<Words text={feature.says} />
								</p>
							)}
						</li>
					))}
				</ul>
			)}
			<div className="mt-2 flex items-center gap-3 rounded-sm bg-surface-control py-2 pr-1.5 pl-3">
				<span className="min-w-0 grow text-secondary type-label">
					{fixes === 0 ? (
						"Every change, told in full."
					) : (
						<>
							<span className="text-primary type-value">
								{fixes} {fixes === 1 ? "fix" : "fixes"}
							</span>{" "}
							as well, each told in full.
						</>
					)}
				</span>
				<TextAction href={content.changelog}>Full changelog ↗</TextAction>
			</div>
		</div>
	);
}

/** The changelog's words, its `code` set in the value face. */
function Words({ text }: { text: string }) {
	const parts = text.split("`");
	if (parts.length < 3) return <>{text}</>;
	return (
		<>
			{parts.map((part, at) =>
				at % 2 === 1 && at < parts.length - 1 ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string, in order
					<span key={at} className="type-value">
						{part}
					</span>
				) : (
					part
				),
			)}
		</>
	);
}

/** one ring out of the ? as something lands in it */
function LandRing({ at }: { at: Box }) {
	return (
		<motion.span
			aria-hidden="true"
			className="pointer-events-none fixed z-50 rounded-sm border-[1.5px] border-accent"
			style={{ left: at.x, top: at.y, width: at.w, height: at.h }}
			initial={{ opacity: 0.9, scale: 0.7 }}
			animate={{ opacity: 0, scale: 1.45 }}
			transition={{ duration: 0.6, ease: OUT }}
		/>
	);
}
