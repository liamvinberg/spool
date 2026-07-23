import { motion } from "motion/react";
import {
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * landing--selfsource: the landing that performs its own promise. A source
 * rail types an abridged-but-honest frame.tsx of this very page; each element
 * mounts on the right the moment its lines finish, so the viewer watches the
 * landing become the landing. Exploration for #31 (canonical: landing/).
 *
 * The engine is one index over a fixed source string, advanced on an interval:
 * `typed` is a char count, `stage` is derived from which chunks have finished.
 * Scaffold + header are seeded present at load (chrome the agent wrote in a
 * burst); the watchable assembly is statement onward. Clicking the rail skips
 * to done; prefers-reduced-motion mounts fully assembled.
 */

// The honest source, chunk by chunk. Concatenated, this is what the rail types.
// Each chunk records the assembly stage it completes. Lines stay short so the
// mono pane never wraps (wrapping would desync the line-number gutter).
const SCAFFOLD = `import { motion } from "motion/react"
import { SpoolMark } from "./spool-mark"

export default function Landing() {
  return (
    <main className="min-h-full bg-bg">
`;

const HEADER = `      <header className="flex gap-2.5">
        <SpoolMark className="text-thread" />
        <span>spool</span>
      </header>
`;

const STATEMENT = `      <h1 className="text-6xl font-semibold">
        feel an app before it exists
      </h1>
`;

const SUBLINE = `      <p className="max-w-md text-muted">
        a live prototyping canvas. your agent
        authors live tsx frames and links them
        into walkable flows.
      </p>
`;

const INSTALL = `      <div className="font-mono">
        {[
          "npm i -g spool.page",
          "spool init",
          "spool serve",
        ].map((c) => (
          <CommandLine key={c} command={c} />
        ))}
      </div>
`;

const STANCE = `      <section className="grid grid-cols-2">
        {[
          ["your agent", "files and a cli"],
          ["your disk", "local-first files"],
          ["real depth", "frames are real tsx"],
          ["flows", "walk screen to screen"],
        ].map(([k, v]) => (
          <Stance key={k} name={k} body={v} />
        ))}
      </section>
`;

const FOOTER = `      <footer className="flex justify-between">
        <span>spool.page</span>
        <span>github.com/liamvinberg/spool</span>
      </footer>
`;

const CLOSING = `    </main>
  )
}

`;

const META = "// this page is a spool frame. it wrote itself.";

type Chunk = { src: string; stage: number };

const PROGRAM: Chunk[] = [
	{ src: SCAFFOLD, stage: 0 },
	{ src: HEADER, stage: 1 },
	{ src: STATEMENT, stage: 2 },
	{ src: SUBLINE, stage: 3 },
	{ src: INSTALL, stage: 4 },
	{ src: STANCE, stage: 5 },
	{ src: FOOTER, stage: 6 },
	{ src: CLOSING, stage: 6 },
	{ src: META, stage: 6 },
];

const SOURCE = PROGRAM.map((p) => p.src).join("");
const FULL = SOURCE.length;

const BOUNDS: { end: number; stage: number }[] = (() => {
	let acc = 0;
	return PROGRAM.map((p) => {
		acc += p.src.length;
		return { end: acc, stage: p.stage };
	});
})();

// Seeded present at load: scaffold, header, statement (through index 2). The
// hero is the page's established top; live typing then writes the subline
// through the meta comment. This anchors the fresh-boot shot, which is captured
// ~300ms in, long before anything typed live could mount.
const SEED = BOUNDS[2].end;

function stageAt(typed: number): number {
	let s = 0;
	for (const b of BOUNDS) {
		if (typed >= b.end) s = b.stage;
		else break;
	}
	return s;
}

// Cadence: self-tunes to land the whole assembly in ~6.5s regardless of the
// exact source length, with a small per-tick jitter and a beat at each newline.
const INTERVAL = 26;
const TARGET_MS = 6500;
const ANIM = FULL - SEED;
const BASE = Math.max(2, Math.round(ANIM / (TARGET_MS / INTERVAL)));
const JITTER = [0, 1, -1, 1, 0, -1, 1, 0];

const WORD = /[A-Za-z0-9_$.-]/;
const KEYWORD = new Set([
	"import",
	"from",
	"export",
	"default",
	"function",
	"return",
]);

// Syntax coloring inside the identity: words in ink, keywords and every symbol
// in muted, nothing else. Two shades, no rainbow. The caret is the only red.
function colorize(line: string, dim: boolean): ReactNode[] {
	const runs = line.match(/[A-Za-z0-9_$.-]+|[^A-Za-z0-9_$.-]+/g);
	if (!runs) return [];
	return runs.map((run, i) => {
		const isWord = WORD.test(run[0] ?? "");
		const ink = dim || !isWord || KEYWORD.has(run) ? "text-muted" : "text-text";
		return (
			<span key={i} className={cn("transition-colors duration-700", ink)}>
				{run}
			</span>
		);
	});
}

function Caret({ blink, still }: { blink: boolean; still: boolean }) {
	return (
		<motion.span
			aria-hidden
			className="ml-px inline-block w-[2px] bg-thread align-[-0.16em]"
			style={{ height: "1.05em" }}
			animate={
				blink && !still ? { opacity: [1, 1, 0.12, 0.12, 1] } : { opacity: 1 }
			}
			transition={
				blink && !still
					? {
							duration: 1.15,
							repeat: Number.POSITIVE_INFINITY,
							ease: "easeInOut",
							times: [0, 0.42, 0.5, 0.92, 1],
						}
					: { duration: 0.18 }
			}
		/>
	);
}

// Paste-ready copy. Frames run in a null-origin sandboxed srcdoc, so the async
// Clipboard API can reject outright, so try it, then fall back to the classic
// hidden-textarea execCommand path. Silent on both branches.
async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const ta = document.createElement("textarea");
			ta.value = text;
			ta.setAttribute("readonly", "");
			ta.style.position = "fixed";
			ta.style.top = "0";
			ta.style.left = "0";
			ta.style.width = "1px";
			ta.style.height = "1px";
			ta.style.padding = "0";
			ta.style.border = "none";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			ta.setSelectionRange(0, text.length);
			const ok = document.execCommand("copy");
			document.body.removeChild(ta);
			return ok;
		} catch {
			return false;
		}
	}
}

function Tick({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-3 w-3 shrink-0", className)}
		>
			<path
				d="M2.5 6.5 5 8.75 9.5 3.5"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CopyGlyph({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-3 w-3 shrink-0", className)}
		>
			<rect
				x="4.25"
				y="4.25"
				width="6"
				height="6"
				rx="1"
				stroke="currentColor"
				strokeWidth="1.2"
			/>
			<path
				d="M2.75 7.75h-.5a.75.75 0 0 1-.75-.75V2.25a.75.75 0 0 1 .75-.75H7a.75.75 0 0 1 .75.75v.5"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

// One install line. The whole line is the button; the "$" prompt hover-swaps to
// a copy glyph, the command itself never covered. Copying strips the prompt so
// the clipboard is paste-ready; the copied tick holds for a beat.
function CommandLine({ command }: { command: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	async function handleCopy() {
		const ok = await copyText(command);
		if (!ok) return;
		setCopied(true);
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), 1500);
	}

	return (
		<button
			type="button"
			onClick={handleCopy}
			aria-label={copied ? `copied ${command}` : `copy ${command}`}
			className="group block w-full cursor-pointer text-left focus-visible:outline-none"
		>
			<span className="inline-flex w-[2ch] select-none items-center align-middle">
				{copied ? (
					<Tick className="text-thread" />
				) : (
					<>
						<span className="text-muted group-hover:hidden group-focus-visible:hidden">
							$
						</span>
						<CopyGlyph className="hidden text-thread group-hover:block group-focus-visible:block" />
					</>
				)}
			</span>
			{command}
		</button>
	);
}

const EASE = [0.16, 1, 0.3, 1] as const;

function Reveal({
	children,
	className,
	delay = 0,
	still,
}: {
	children: ReactNode;
	className?: string;
	delay?: number;
	still: boolean;
}) {
	return (
		<motion.div
			className={className}
			initial={still ? false : { opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.55, ease: EASE, delay }}
		>
			{children}
		</motion.div>
	);
}

const stance = [
	{ k: "your agent", v: "works through files and a cli, not a captive chat." },
	{
		k: "your disk",
		v: "local-first. plain files inside your repo. git-friendly, no cloud, no accounts.",
	},
	{
		k: "real depth",
		v: "frames are real tsx. arbitrary js, real motion, real state.",
	},
	{ k: "flows", v: "walk screen to screen, with morphing transitions." },
];

const commands = ["npm i -g spool.page", "spool init", "spool serve"];

export default function LandingSelfsource() {
	const [still] = useState(
		() =>
			typeof window !== "undefined" &&
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
	);
	const [typed, setTyped] = useState(() => (still ? FULL : SEED));
	const [done, setDone] = useState(() => still);
	const [cycle, setCycle] = useState(0);
	const nRef = useRef(SEED);
	const timer = useRef<number | null>(null);

	useEffect(() => {
		if (still) {
			setTyped(FULL);
			setDone(true);
			return;
		}
		nRef.current = SEED;
		setTyped(SEED);
		setDone(false);
		let t = 0;
		const id = window.setInterval(() => {
			t += 1;
			const pos = nRef.current;
			const atNewline = SOURCE.charCodeAt(pos) === 10;
			const inc = atNewline
				? 1
				: Math.max(1, BASE + (JITTER[t % JITTER.length] ?? 0));
			nRef.current = Math.min(pos + inc, FULL);
			setTyped(nRef.current);
			if (nRef.current >= FULL) {
				window.clearInterval(id);
				timer.current = null;
				setDone(true);
			}
		}, INTERVAL);
		timer.current = id;
		return () => window.clearInterval(id);
	}, [cycle, still]);

	function skip() {
		if (done) return;
		if (timer.current !== null) {
			window.clearInterval(timer.current);
			timer.current = null;
		}
		nRef.current = FULL;
		setTyped(FULL);
		setDone(true);
	}

	function replay(e: ReactMouseEvent) {
		e.stopPropagation();
		setCycle((c) => c + 1);
	}

	const stage = stageAt(typed);
	const lines = SOURCE.slice(0, typed).split("\n");

	return (
		<div className="flex h-full w-full overflow-hidden bg-bg font-sans text-text antialiased">
			{/* source rail: the agent writing frame.tsx */}
			<aside
				onClick={skip}
				className="relative flex h-full w-[452px] shrink-0 flex-col border-r border-border bg-surface"
			>
				<div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-5">
					<div className="flex items-center gap-2.5 font-mono text-xs">
						<motion.span
							className="h-1.5 w-1.5 rounded-full bg-muted"
							animate={
								done || still
									? { opacity: 0.55 }
									: { opacity: [0.35, 1, 0.35] }
							}
							transition={
								done || still
									? { duration: 0.3 }
									: {
											duration: 1.5,
											repeat: Number.POSITIVE_INFINITY,
											ease: "easeInOut",
										}
							}
						/>
						<span className="text-text">frame.tsx</span>
					</div>
					{done ? (
						<button
							type="button"
							onClick={replay}
							className="font-mono text-xs text-muted transition-colors hover:text-text focus-visible:outline-none"
						>
							replay
						</button>
					) : (
						<span className="font-mono text-xs text-muted">writing</span>
					)}
				</div>

				<div className="min-h-0 flex-1 overflow-hidden px-5 py-4 font-mono text-[12px] leading-[19px]">
					{lines.map((line, i) => {
						const last = i === lines.length - 1;
						return (
							<div
								key={i}
								className={cn(
									"flex",
									last && !done && "-mx-5 bg-raised/50 px-5",
								)}
							>
								<span className="w-7 shrink-0 select-none pr-3 text-right text-muted/45 tabular-nums">
									{i + 1}
								</span>
								<span className="whitespace-pre">
									{colorize(line, done && !line.trimStart().startsWith("//"))}
									{last ? <Caret blink={done} still={still} /> : null}
								</span>
							</div>
						);
					})}
				</div>
			</aside>

			{/* the page, assembling on the canvas */}
			<main className="relative h-full min-w-0 flex-1 overflow-hidden bg-bg">
				<div
					className="pointer-events-none absolute inset-0"
					style={{
						backgroundImage:
							"radial-gradient(circle, rgba(240,239,237,0.045) 1px, transparent 1.4px)",
						backgroundSize: "26px 26px",
					}}
				/>
				<div className="relative flex h-full flex-col justify-start px-16 pt-24">
					<div className="w-full" style={{ maxWidth: 620 }}>
						{/* header + statement are seeded present; they fade rather than
						    slide so the fresh-boot shot catches them already composed. */}
						{stage >= 1 ? (
							<motion.div
								className="flex items-center gap-2.5"
								initial={still ? false : { opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ duration: 0.3 }}
							>
								<SpoolMark className="h-5 w-5 text-thread" title="spool" />
								<span className="text-md font-semibold tracking-tight">
									spool
								</span>
							</motion.div>
						) : null}

						{stage >= 2 ? (
							<motion.h1
								className="mt-11 text-[56px] font-semibold leading-[1.03] tracking-[-0.02em]"
								initial={still ? false : { opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ duration: 0.3 }}
							>
								feel an app
								<br />
								before it exists
							</motion.h1>
						) : null}

						{stage >= 3 ? (
							<Reveal className="mt-7" still={still}>
								<p
								className="text-[17px] leading-[26px] text-muted"
								style={{ maxWidth: 470 }}
							>
									a live prototyping canvas. your agent authors live tsx frames
									on an infinite canvas and links them into walkable flows. you
									feel the real thing, interactions and motion and inputs, before
									it exists.
								</p>
							</Reveal>
						) : null}

						{stage >= 4 ? (
							<div className="mt-9">
								<div className="flex gap-5">
									<motion.span
										className="w-px shrink-0 origin-top self-stretch bg-thread/70"
										initial={still ? false : { scaleY: 0 }}
										animate={{ scaleY: 1 }}
										transition={{ duration: 0.5, ease: EASE }}
									/>
									<div className="w-[300px] font-mono text-[15px] leading-[30px]">
										{commands.map((c, i) => (
											<Reveal key={c} delay={i * 0.06} still={still}>
												<CommandLine command={c} />
											</Reveal>
										))}
									</div>
								</div>
								<Reveal className="mt-5" delay={0.14} still={still}>
									<div className="pl-[21px] font-mono text-xs text-muted">
										requires node 22+ · best in chrome · macos-first today
									</div>
								</Reveal>
							</div>
						) : null}

						{stage >= 5 ? (
							<Reveal
								className="mt-12 border-t border-border pt-10"
								still={still}
							>
								<div className="grid grid-cols-2 gap-x-12 gap-y-9">
									{stance.map((s, i) => (
										<div key={s.k} className="flex gap-4">
											<span className="mt-1 font-mono text-xs text-thread">
												{String(i + 1).padStart(2, "0")}
											</span>
											<div>
												<div className="text-md font-semibold tracking-tight">
													{s.k}
												</div>
												<p className="mt-2 max-w-[260px] text-[13px] leading-[20px] text-muted">
													{s.v}
												</p>
											</div>
										</div>
									))}
								</div>
							</Reveal>
						) : null}

						{stage >= 6 ? (
							<Reveal
								className="mt-12 border-t border-border pt-8"
								still={still}
							>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2.5">
										<SpoolMark className="h-4 w-4 text-thread" />
										<span className="text-sm text-muted">spool.page</span>
									</div>
									<a
										href="https://github.com/liamvinberg/spool"
										className="font-mono text-xs text-muted transition-colors hover:text-thread"
									>
										github.com/liamvinberg/spool
									</a>
								</div>
							</Reveal>
						) : null}
					</div>
				</div>
			</main>
		</div>
	);
}
