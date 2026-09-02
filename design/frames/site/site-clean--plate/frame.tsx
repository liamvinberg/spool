import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool-mark";
import {
	ArrowUpRight,
	CanvasPlate,
	CopyGlyph,
	DirectPlate,
	DownloadGlyph,
	LivePlate,
	MONO,
	PlayTri,
	RepoPlate,
	TakesPlate,
	Tick,
} from "./product";

/**
 * site-clean--plate. The spool.page landing, converged.
 *
 * Forty takes went at the wall on this page. This one does the opposite: the
 * pattern every tool with this shape has settled on (Cursor, Bun, Linear,
 * Raycast) executed carefully and nothing else. Slim nav, one headline, two
 * doors, one honest picture of the product, four sections that each do one job,
 * the first minute as steps, and the licence at the bottom.
 *
 * The take, among the three: centred, plated, mid density. Everything sits in
 * one 1120 column and every product picture is a bordered plate on that column,
 * so the page reads as a stack of evenly weighted objects and the eye never has
 * to decide where to look next. The hero plate is 1118 wide and shows a 1440 by
 * 620 spool window at 1:1, cut off at the right, because a canvas that ends at
 * the plate edge is a diagram and one that runs off it is a screenshot.
 *
 * Every pixel of spool in those plates is read off the shipped source; product.tsx
 * lists the file each number came from.
 *
 * Motion is opacity and transform only, one 620ms reveal per section driven by
 * this frame's own scroller through an IntersectionObserver, and it stops under
 * prefers-reduced-motion. Nothing on this page loops.
 *
 * Interactivity is real where it is drawn: the install line copies, the download
 * button is the release URL, and the form inside the first section's frame takes
 * text and moves its own total, which is the section's whole claim.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

const DMG_URL = "https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg";
const REPO_URL = "https://github.com/liamvinberg/spool";

/** read off design/frames on 2026-09-01: 190 frames plus these three. */
const FRAME_COUNT = 193;
const PAGE_COUNT = 13;

/* ---------- reveal ---------- */

function useReveal<T extends HTMLElement>(rootRef: React.RefObject<HTMLDivElement | null>) {
	const ref = useRef<T | null>(null);
	const [shown, setShown] = useState(false);
	useEffect(() => {
		const el = ref.current;
		const root = rootRef.current;
		if (el === null || root === null) return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) if (entry.isIntersecting) setShown(true);
			},
			{ root, rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
		);
		io.observe(el);
		return () => {
			io.disconnect();
		};
	}, [rootRef]);
	return { ref, shown };
}

function Reveal({
	rootRef,
	delay = 0,
	className,
	children,
}: {
	rootRef: React.RefObject<HTMLDivElement | null>;
	delay?: number;
	className?: string;
	children: ReactNode;
}) {
	const { ref, shown } = useReveal<HTMLDivElement>(rootRef);
	const reduce = useReducedMotion() === true;
	return (
		<motion.div
			ref={ref}
			className={className}
			initial={false}
			animate={{ opacity: shown ? 1 : 0, y: shown || reduce ? 0 : 16 }}
			transition={{ duration: reduce ? 0.2 : 0.62, ease: EASE, delay: shown ? delay : 0 }}
		>
			{children}
		</motion.div>
	);
}

/* ---------- the quiet second door ---------- */

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function InstallLine({ command, className }: { command: string; className?: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	return (
		<button
			type="button"
			aria-label={copied ? `Copied ${command}` : `Copy ${command}`}
			onClick={() => {
				void copyText(command).then((ok) => {
					if (!ok) return;
					setCopied(true);
					if (timer.current !== null) window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => setCopied(false), 1600);
				});
			}}
			className={cn(
				"group/line flex h-[46px] cursor-pointer items-center gap-3 rounded-md border bg-canvas px-4 text-left transition-colors duration-200 focus-visible:outline-none",
				copied ? "border-thread/50" : "border-border hover:border-border-raised",
				className,
			)}
		>
			<span className={cn("select-none text-[13px] text-muted leading-none", MONO)}>$</span>
			<span className={cn("min-w-0 flex-1 truncate text-[14px] text-text leading-none", MONO)}>{command}</span>
			<span className="relative block h-3.5 w-3.5 shrink-0">
				<CopyGlyph
					className={cn(
						"absolute inset-0 h-3.5 w-3.5 transition-opacity duration-200",
						copied ? "opacity-0" : "text-muted/70 opacity-100 group-hover/line:text-text",
					)}
				/>
				<Tick
					className={cn(
						"absolute inset-0 h-3.5 w-3.5 text-thread transition-opacity duration-200",
						copied ? "opacity-100" : "opacity-0",
					)}
				/>
			</span>
		</button>
	);
}

function DownloadButton({ className }: { className?: string }) {
	return (
		<a
			href={DMG_URL}
			className={cn(
				"flex h-[46px] cursor-pointer items-center justify-center gap-2.5 rounded-md bg-thread px-6 font-semibold text-[14px] text-on-thread leading-none transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none",
				className,
			)}
		>
			<DownloadGlyph className="h-3.5 w-3.5" />
			Download for Mac
		</a>
	);
}

/* ---------- the two doors, as a pair ---------- */

function Doors({ align = "center" }: { align?: "center" | "start" }) {
	return (
		<div className={cn("flex flex-col", align === "center" ? "items-center" : "items-start")}>
			<div className="flex items-center gap-3">
				<DownloadButton />
				<InstallLine command="npm i -g spool.page" className="w-[288px]" />
			</div>
			<div
				className={cn(
					"mt-4 flex items-center gap-2 text-[11px] text-muted/80 leading-none",
					MONO,
					align === "center" ? "justify-center" : "",
				)}
			>
				<span>Spool.dmg · apple silicon</span>
				<span className="text-border-raised">/</span>
				<span>node 22+ · macos, linux, wsl</span>
			</div>
		</div>
	);
}

/* ---------- one section: copy on one side, the product on the other ---------- */

function Feature({
	rootRef,
	title,
	body,
	flip = false,
	children,
}: {
	rootRef: React.RefObject<HTMLDivElement | null>;
	title: string;
	body: ReactNode;
	flip?: boolean;
	children: ReactNode;
}) {
	return (
		<section className="grid grid-cols-[1fr_552px] items-center gap-[72px] py-[88px]">
			<Reveal rootRef={rootRef} className={cn("max-w-[420px]", flip && "order-2 justify-self-end")}>
				<h2 className="font-semibold text-[30px] leading-[1.14] tracking-[-0.025em]">{title}</h2>
				<div className="mt-5 text-[15px] text-muted leading-[26px]">{body}</div>
			</Reveal>
			<Reveal rootRef={rootRef} delay={0.08} className={cn(flip && "order-1")}>
				<div className="overflow-hidden rounded-lg border border-border">{children}</div>
			</Reveal>
		</section>
	);
}

/* ---------- the first minute ---------- */

const STEPS: readonly { n: string; head: string; body: ReactNode; mono?: string }[] = [
	{
		n: "1",
		head: "Install it",
		body: "Take the Mac app, which carries its own Node, or the global package.",
		mono: "npm i -g spool.page",
	},
	{
		n: "2",
		head: "Point it at a folder",
		body: "A repo you already have is the right place. design/ appears beside your source.",
		mono: "cd chamfer && spool init",
	},
	{
		n: "3",
		head: "Ask your agent for a screen",
		body: "It writes one folder with one component in it. The frame is on the canvas before you switch windows.",
		mono: "design/frames/runs/pt-journal/frame.tsx",
	},
	{
		n: "4",
		head: "Walk the flow",
		body: "Link the frames, press play, and click from screen to screen at full size.",
		mono: "localhost:7766",
	},
];

/**
 * The recording, posed. The poster is the canvas itself rather than a black
 * rectangle, dimmed so the play mark is the only thing with contrast on it.
 */
function VideoPlate() {
	const [hover, setHover] = useState(false);
	return (
		<button
			type="button"
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			className="group/vid relative block cursor-pointer overflow-hidden rounded-lg border border-border bg-canvas text-left transition-colors duration-300 hover:border-border-raised focus-visible:outline-none"
			style={{ width: 880, height: 495 }}
		>
			<div className="absolute inset-0 opacity-[0.30] transition-opacity duration-500 group-hover/vid:opacity-40">
				<CanvasPlate w={880} h={495} />
			</div>
			<div className="absolute inset-0 flex items-center justify-center">
				<span
					className={cn(
						"flex h-[64px] w-[64px] items-center justify-center rounded-full border transition-colors duration-300",
						hover ? "border-thread bg-thread" : "border-border-raised bg-bg/80",
					)}
				>
					<PlayTri className={cn("ml-[3px] h-3.5 w-3.5", hover ? "text-on-thread" : "text-text")} />
				</span>
			</div>
			<span className={cn("absolute bottom-5 left-6 text-[11px] text-muted leading-none", MONO)}>
				a minute with spool · 1:04
			</span>
		</button>
	);
}

/* ---------- the page ---------- */

export default function SiteCleanPlate() {
	const rootRef = useRef<HTMLDivElement | null>(null);

	return (
		<div
			ref={rootRef}
			className="h-full w-full overflow-y-auto bg-bg font-sans text-text antialiased [font-synthesis:none]"
		>
			<div className="mx-auto w-[1120px]">
				<header className="flex h-[76px] items-center justify-between">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-[19px] w-[15px] text-thread" title="spool" />
						<span className="font-semibold text-[15px] tracking-[-0.01em]">spool</span>
					</div>
					<nav className="flex items-center gap-7 text-[13px] text-muted">
						<a href="/docs" className="transition-colors duration-200 hover:text-text">
							Docs
						</a>
						<a
							href={REPO_URL}
							className="flex items-center gap-1.5 transition-colors duration-200 hover:text-text"
						>
							GitHub
							<ArrowUpRight className="h-3 w-3" />
						</a>
						<a
							href={DMG_URL}
							className="flex h-[30px] items-center rounded-[6px] border border-border-raised px-3.5 text-[13px] text-text transition-colors duration-200 hover:border-text/40"
						>
							Download
						</a>
					</nav>
				</header>

				{/* hero */}
				<section className="pt-[74px] text-center">
					<h1 className="mx-auto max-w-[820px] text-balance font-semibold text-[62px] leading-[1.04] tracking-[-0.033em]">
						A canvas where the frames are alive.
					</h1>
					<p className="mx-auto mt-7 max-w-[560px] text-pretty text-[17px] text-muted leading-[28px]">
						spool is a prototyping canvas that lives in your project folder. Your agent writes the screens as
						TSX and you click through the flow the way a user would.
					</p>
					<div className="mt-10 flex justify-center">
						<Doors />
					</div>
				</section>

				<div className="pt-[68px] pb-[24px]">
					<div className="overflow-hidden rounded-lg border border-border">
						<CanvasPlate w={1118} h={620} />
					</div>
					<p className={cn("mt-4 text-center text-[11px] text-muted/70 leading-none", MONO)}>
						one project, five frames, three of them linked into a walk
					</p>
				</div>

				{/* the four jobs */}
				<Feature
					rootRef={rootRef}
					title="See it before you build it."
					body={
						<>
							<p>
								A frame is one TSX component in your project, rendered live. The select opens, the field
								takes text, and pressing play walks the flow at full size.
							</p>
							<p className="mt-4">
								The frame in this plate is the real thing, running on this page. Answer it.
							</p>
						</>
					}
				>
					<LivePlate w={552} h={500} />
				</Feature>

				<Feature
					rootRef={rootRef}
					flip
					title="Make variations until one feels right."
					body={
						<>
							<p>
								Half the time you know what you want and not what it looks like. Ask for four readings of
								the same screen and they land as{" "}
								<span className={cn("text-[14px] text-text", MONO)}>--</span> siblings on the canvas, side
								by side at true size.
							</p>
							<p className="mt-4">
								Look at them together, keep the one that works, and put the rest in the trash. The
								decision is the point; the takes are cheap.
							</p>
						</>
					}
				>
					<TakesPlate w={552} h={500} k={0.172} />
				</Feature>

				<Feature
					rootRef={rootRef}
					title="It lives in your repo."
					body={
						<>
							<p>
								spool writes to <span className={cn("text-[14px] text-text", MONO)}>design/</span> beside
								your source. A frame is a folder, a component is a file, and git tracks all of it.
							</p>
							<p className="mt-4">
								The daemon runs on your own machine, so the canvas is a projection of files you already
								own. Branch it, review it, delete it.
							</p>
						</>
					}
				>
					<RepoPlate w={552} h={500} />
				</Feature>

				<Feature
					rootRef={rootRef}
					flip
					title="The agent types. You decide."
					body={
						<>
							<p>
								<span className={cn("text-[14px] text-text", MONO)}>spool skill</span> prints the whole
								contract, so an agent in your repo knows how to author a frame without being told twice.
							</p>
							<p className="mt-4">
								It writes the files. You move them on the field, draw the links between them, walk the
								result, and say which one is right.
							</p>
						</>
					}
				>
					<DirectPlate w={552} h={500} />
				</Feature>

				{/* the first minute */}
				<section className="border-border border-t pt-[88px] pb-[96px]">
					<Reveal rootRef={rootRef} className="text-center">
						<h2 className="font-semibold text-[34px] leading-[1.1] tracking-[-0.028em]">
							A minute with spool
						</h2>
						<p className="mx-auto mt-4 max-w-[520px] text-[15px] text-muted leading-[26px]">
							From nothing to a walkable flow, in the order it actually happens.
						</p>
					</Reveal>

					<Reveal rootRef={rootRef} delay={0.06} className="mt-14 grid grid-cols-4 gap-8">
						{STEPS.map((s) => (
							<div key={s.n} className="border-border border-t pt-5">
								<div className={cn("text-[11px] text-thread leading-none", MONO)}>{s.n}</div>
								<h3 className="mt-4 font-semibold text-[15px] leading-none tracking-[-0.01em]">{s.head}</h3>
								<p className="mt-3 text-[13px] text-muted leading-[21px]">{s.body}</p>
								{s.mono === undefined ? null : (
									<p className={cn("mt-4 text-[11px] text-text/70 leading-[18px]", MONO)}>{s.mono}</p>
								)}
							</div>
						))}
					</Reveal>

					<Reveal rootRef={rootRef} delay={0.12} className="mt-14 flex justify-center">
						<VideoPlate />
					</Reveal>
				</section>

				{/* bookend */}
				<section className="border-border border-t pt-[92px] pb-[96px] text-center">
					<Reveal rootRef={rootRef}>
						<h2 className="mx-auto max-w-[760px] font-semibold text-[40px] leading-[1.1] tracking-[-0.03em]">
							MIT. Fork it, rework it, rename it, ship it.
						</h2>
						<p className="mx-auto mt-6 max-w-[520px] text-pretty text-[15px] text-muted leading-[26px]">
							It is a tool for designing things, so make it your own if you want to. spool is pre-1.0 and
							designed on its own canvas: this page is one of {FRAME_COUNT} frames there, across{" "}
							{PAGE_COUNT} pages.
						</p>
						<div className="mt-11 flex justify-center">
							<Doors />
						</div>
					</Reveal>
				</section>

				<footer className="flex items-center justify-between border-border border-t py-8">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-4 w-[13px] text-thread" />
						<span className="text-[13px] text-muted">spool.page</span>
					</div>
					<div className="flex items-center gap-7 text-[13px] text-muted">
						<a href="/docs" className="transition-colors duration-200 hover:text-text">
							Docs
						</a>
						<a href={REPO_URL} className="transition-colors duration-200 hover:text-text">
							GitHub
						</a>
						<a href={`${REPO_URL}/blob/main/LICENSE.md`} className="transition-colors duration-200 hover:text-text">
							MIT
						</a>
					</div>
				</footer>
			</div>
		</div>
	);
}
