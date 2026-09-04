import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool/mark";
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
} from "../../clean/site-clean-ledger/product";

/**
 * site-clean--ledger. The same landing, set as a technical document.
 *
 * The structure is the converged one and does not move: slim nav, one headline,
 * two doors, one honest picture, four sections each doing one job, the first
 * minute as steps, the licence, a footer. What changes is the setting.
 *
 * Every band on this page is ruled and every band carries a margin column of
 * machine text at 180px: a shell fragment, a folder listing, a status line. The
 * margin is not a label for the section, it is the section's evidence, which is
 * why it holds a command and its output rather than a word. Type runs smaller
 * and tighter than the other two takes, 46px at the headline against 62 and 76,
 * and the vertical rhythm is 72px instead of 88 or 130, so more of the page is
 * in view at once and the reading feels like documentation with pictures.
 *
 * The hero picture is the one full-bleed object on the page: the whole spool
 * window at 1:1, 1440 by 620, running to both frame edges with no border and no
 * rounding. Nothing else on the page bleeds, so the canvas is the only thing
 * that behaves like it continues past the page, which it does at its own right
 * edge where the third frame in the walk runs out of field.
 *
 * Motion is opacity and a 16px rise per band, driven by this frame's own
 * scroller, and it stops under prefers-reduced-motion. The install line copies,
 * the download is the release URL, and the frame in the first section is a real
 * form.
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
			{ root, rootMargin: "0px 0px -10% 0px", threshold: 0.06 },
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
			transition={{ duration: reduce ? 0.2 : 0.58, ease: EASE, delay: shown ? delay : 0 }}
		>
			{children}
		</motion.div>
	);
}

/* ---------- doors ---------- */

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
				"group/line flex h-[42px] cursor-pointer items-center gap-3 rounded-[6px] border bg-canvas px-3.5 text-left transition-colors duration-200 focus-visible:outline-none",
				copied ? "border-thread/50" : "border-border hover:border-border-raised",
				className,
			)}
		>
			<span className={cn("select-none text-[12px] text-muted leading-none", MONO)}>$</span>
			<span className={cn("min-w-0 flex-1 truncate text-[13px] text-text leading-none", MONO)}>{command}</span>
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

function Doors() {
	return (
		<div>
			<div className="flex items-center gap-2.5">
				<a
					href={DMG_URL}
					className="flex h-[42px] cursor-pointer items-center gap-2.5 rounded-[6px] bg-thread px-5 font-semibold text-[13px] text-on-thread leading-none transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none"
				>
					<DownloadGlyph className="h-3.5 w-3.5" />
					Download for Mac
				</a>
				<InstallLine command="npm i -g spool.page" className="w-[270px]" />
			</div>
			<div className={cn("mt-3 flex gap-6 text-[10.5px] text-muted/75 leading-none", MONO)}>
				<span>spool.dmg · apple silicon</span>
				<span>node 22+ · macos, linux, wsl</span>
			</div>
		</div>
	);
}

/* ---------- the margin column: a command and what it prints ---------- */

function Margin({ lines }: { lines: readonly string[] }) {
	return (
		<div className="pt-1.5">
			{lines.map((l, i) => (
				<div
					key={`m${i}`}
					className={cn(
						"whitespace-pre text-[10.5px] leading-[19px]",
						MONO,
						l.startsWith("$") ? "text-text/70" : "text-muted/70",
					)}
				>
					{l}
				</div>
			))}
		</div>
	);
}

/* ---------- one ruled band ---------- */

function Band({
	rootRef,
	margin,
	title,
	body,
	flip = false,
	children,
}: {
	rootRef: React.RefObject<HTMLDivElement | null>;
	margin: readonly string[];
	title: string;
	body: ReactNode;
	flip?: boolean;
	children: ReactNode;
}) {
	return (
		<section className="grid grid-cols-[180px_1fr] border-border border-t py-[72px]">
			<Reveal rootRef={rootRef}>
				<Margin lines={margin} />
			</Reveal>
			<div className="grid grid-cols-[1fr_520px] items-center gap-[56px]">
				<Reveal rootRef={rootRef} className={cn("max-w-[400px]", flip && "order-2 justify-self-end")}>
					<h2 className="font-semibold text-[24px] leading-[1.16] tracking-[-0.022em]">{title}</h2>
					<div className="mt-4 text-[14px] text-muted leading-[24px]">{body}</div>
				</Reveal>
				<Reveal rootRef={rootRef} delay={0.06} className={cn(flip && "order-1")}>
					<div className="overflow-hidden rounded-[8px] border border-border">{children}</div>
				</Reveal>
			</div>
		</section>
	);
}

/* ---------- the first minute, as a ruled table ---------- */

const STEPS: readonly { n: string; head: string; mono: string; body: string }[] = [
	{
		n: "1",
		head: "Install it",
		mono: "npm i -g spool.page",
		body: "Take the Mac app, which carries its own Node, or the global package.",
	},
	{
		n: "2",
		head: "Point it at a folder",
		mono: "cd brasa && spool init",
		body: "A repo you already have is the right place. design/ appears beside your source.",
	},
	{
		n: "3",
		head: "Ask your agent for a screen",
		mono: "design/frames/brasa/reserve/",
		body: "It writes one folder with one component in it. The frame is on the canvas before you switch windows.",
	},
	{
		n: "4",
		head: "Walk the flow",
		mono: "localhost:7766",
		body: "Link the frames, press play, and click from screen to screen at full size.",
	},
];

function VideoPlate() {
	const [hover, setHover] = useState(false);
	return (
		<button
			type="button"
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			className="group/vid relative block cursor-pointer overflow-hidden rounded-[8px] border border-border bg-canvas text-left transition-colors duration-300 hover:border-border-raised focus-visible:outline-none"
			style={{ width: 1020, height: 500 }}
		>
			<div className="absolute inset-0 opacity-[0.28] transition-opacity duration-500 group-hover/vid:opacity-40">
				<CanvasPlate w={1020} h={500} />
			</div>
			<div className="absolute inset-0 flex items-center justify-center">
				<span
					className={cn(
						"flex h-[58px] w-[58px] items-center justify-center rounded-full border transition-colors duration-300",
						hover ? "border-thread bg-thread" : "border-border-raised bg-bg/80",
					)}
				>
					<PlayTri className={cn("ml-[3px] h-3 w-3", hover ? "text-on-thread" : "text-text")} />
				</span>
			</div>
			<span className={cn("absolute bottom-4 left-5 text-[10.5px] text-muted leading-none", MONO)}>
				a minute with spool · 1:04
			</span>
		</button>
	);
}

/* ---------- the page ---------- */

export default function SiteCleanLedger() {
	const rootRef = useRef<HTMLDivElement | null>(null);

	return (
		<div
			ref={rootRef}
			className="h-full w-full overflow-y-auto bg-bg font-sans text-text antialiased [font-synthesis:none]"
		>
			<div className="mx-auto w-[1200px]">
				<header className="flex h-[64px] items-center justify-between border-border border-b">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-[18px] w-[14px] text-thread" title="spool" />
						<span className="font-semibold text-[14px] tracking-[-0.01em]">spool</span>
						<span className={cn("ml-2 text-[10.5px] text-muted/70 leading-none", MONO)}>0.6.0</span>
					</div>
					<nav className="flex items-center gap-7 text-[13px] text-muted">
						<a href="/docs" className="transition-colors duration-200 hover:text-text">
							Docs
						</a>
						<a href={REPO_URL} className="flex items-center gap-1.5 transition-colors duration-200 hover:text-text">
							GitHub
							<ArrowUpRight className="h-3 w-3" />
						</a>
						<a href={DMG_URL} className="text-text transition-colors duration-200 hover:text-thread">
							Download
						</a>
					</nav>
				</header>

				<section className="grid grid-cols-[180px_1fr] pt-[86px] pb-[76px]">
					<Margin lines={["$ spool", "canvas on 7766", "", "mit · pre-1.0"]} />
					<div>
						<h1 className="max-w-[660px] font-semibold text-[46px] leading-[1.06] tracking-[-0.03em]">
							A canvas where the frames are alive.
						</h1>
						<p className="mt-6 max-w-[520px] text-[15px] text-muted leading-[26px]">
							spool is a prototyping canvas that lives in your project folder. Your agent writes the screens as TSX and
							you click through the flow the way a user would.
						</p>
						<div className="mt-9">
							<Doors />
						</div>
					</div>
				</section>
			</div>

			{/* the one full-bleed object on the page */}
			<div className="border-border border-y">
				<CanvasPlate w={1440} h={620} />
			</div>

			<div className="mx-auto w-[1200px]">
				<div className="grid grid-cols-[180px_1fr] pt-4 pb-[14px]">
					<span />
					<span className={cn("text-[10.5px] text-muted/70 leading-none", MONO)}>
						one project, five frames, three of them linked into a walk
					</span>
				</div>

				<Band
					rootRef={rootRef}
					margin={["$ spool url reserve-card", "localhost:7766", "  /play/reserve-card"]}
					title="See it before you build it."
					body={
						<>
							<p>
								A frame is one TSX component in your project, rendered live. The dates pick, the field takes text, and
								pressing play walks the flow at full size.
							</p>
							<p className="mt-3.5">The frame in this plate is the real thing, running on this page. Answer it.</p>
						</>
					}
				>
					<LivePlate w={520} h={470} />
				</Band>

				<Band
					rootRef={rootRef}
					flip
					margin={[
						"design/frames/brasa/",
						"  home--candlelit/",
						"  home--classic/",
						"  home--editorial/",
						"  home--playful/",
					]}
					title="Make variations until one feels right."
					body={
						<>
							<p>
								Half the time you know what you want and not what it looks like. Ask for four readings of the same
								screen and they land as <span className={cn("text-[13px] text-text", MONO)}>--</span> siblings on the
								canvas, side by side at true size.
							</p>
							<p className="mt-3.5">
								Look at them together, keep the one that works, and put the rest in the trash. The decision is the
								point; the takes are cheap.
							</p>
						</>
					}
				>
					<TakesPlate w={520} h={470} k={0.16} />
				</Band>

				<Band
					rootRef={rootRef}
					margin={["$ git status", " M design/frames/", "    brasa/reserve/", "      frame.tsx"]}
					title="It lives in your repo."
					body={
						<>
							<p>
								spool writes to <span className={cn("text-[13px] text-text", MONO)}>design/</span> beside your source. A
								frame is a folder, a component is a file, and git tracks all of it.
							</p>
							<p className="mt-3.5">
								The daemon runs on your own machine, so the canvas is a projection of files you already own. Branch it,
								review it, delete it.
							</p>
						</>
					}
				>
					<RepoPlate w={520} h={470} />
				</Band>

				<Band
					rootRef={rootRef}
					flip
					margin={["$ spool skill", "the complete", "  contract", "", "$ spool flows"]}
					title="The agent types. You decide."
					body={
						<>
							<p>
								<span className={cn("text-[13px] text-text", MONO)}>spool skill</span> prints the whole contract, so an
								agent in your repo knows how to author a frame without being told twice.
							</p>
							<p className="mt-3.5">
								It writes the files. You move them on the field, draw the links between them, walk the result, and say
								which one is right.
							</p>
						</>
					}
				>
					<DirectPlate w={520} h={470} k={0.31} />
				</Band>

				{/* the first minute */}
				<section className="grid grid-cols-[180px_1fr] border-border border-t py-[72px]">
					<Reveal rootRef={rootRef}>
						<Margin lines={["00:00 → 01:04", "", "four steps", "one machine"]} />
					</Reveal>
					<div>
						<Reveal rootRef={rootRef}>
							<h2 className="font-semibold text-[24px] leading-none tracking-[-0.022em]">A minute with spool</h2>
							<p className="mt-4 max-w-[440px] text-[14px] text-muted leading-[24px]">
								From nothing to a walkable flow, in the order it actually happens.
							</p>
						</Reveal>

						<Reveal rootRef={rootRef} delay={0.06} className="mt-9">
							{STEPS.map((s) => (
								<div
									key={s.n}
									className="grid grid-cols-[28px_212px_240px_1fr] items-start gap-6 border-border border-t py-5"
								>
									<span className={cn("text-[11px] text-thread leading-[20px]", MONO)}>{s.n}</span>
									<span className="font-semibold text-[14px] leading-[20px] tracking-[-0.01em]">{s.head}</span>
									<span className={cn("text-[11px] text-text/70 leading-[20px]", MONO)}>{s.mono}</span>
									<span className="text-[13px] text-muted leading-[21px]">{s.body}</span>
								</div>
							))}
						</Reveal>

						<Reveal rootRef={rootRef} delay={0.1} className="mt-12">
							<VideoPlate />
						</Reveal>
					</div>
				</section>

				{/* bookend */}
				<section className="grid grid-cols-[180px_1fr] border-border border-t py-[76px]">
					<Reveal rootRef={rootRef}>
						<Margin lines={["mit licence", "", `${FRAME_COUNT} frames`, `${PAGE_COUNT} pages`]} />
					</Reveal>
					<Reveal rootRef={rootRef}>
						<h2 className="max-w-[720px] font-semibold text-[34px] leading-[1.1] tracking-[-0.028em]">
							MIT. Fork it, rework it, rename it, ship it.
						</h2>
						<p className="mt-5 max-w-[520px] text-[14px] text-muted leading-[24px]">
							It is a tool for designing things, so make it your own if you want to. spool is pre-1.0 and designed on
							its own canvas: this page is one of {FRAME_COUNT} frames there, across {PAGE_COUNT} pages.
						</p>
						<div className="mt-9">
							<Doors />
						</div>
					</Reveal>
				</section>

				<footer className="grid grid-cols-[180px_1fr] border-border border-t py-7">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-4 w-[13px] text-thread" />
						<span className="text-[13px] text-muted">spool.page</span>
					</div>
					<div className={cn("flex items-center gap-8 text-[11px] text-muted/75 leading-none", MONO)}>
						<a href="/docs" className="transition-colors duration-200 hover:text-text">
							docs
						</a>
						<a href={REPO_URL} className="transition-colors duration-200 hover:text-text">
							github.com/liamvinberg/spool
						</a>
						<a href={`${REPO_URL}/blob/main/LICENSE.md`} className="transition-colors duration-200 hover:text-text">
							mit
						</a>
					</div>
				</footer>
			</div>
		</div>
	);
}
