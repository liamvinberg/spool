import { motion, useAnimationControls } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "../../../shared/lib/utils";

/**
 * site-terminals: one section of spool.page's canvas-as-navigation landing.
 * The edge nothing else has: prototyping TUIs spatially, on the same canvas.
 * The body is the demo, a real-feeling terminal frame in spool chrome running
 * a little deploy-queue dashboard that types and updates itself on a slow loop.
 * Copy is drawn from the true mechanics (real pty, freeze-when-idle, every key
 * reaches it, cells snap to whole columns). The hub tile morphs into the
 * terminal card via the shared view-transition-name "site-terminals-card".
 *
 * Font note: font-mono is Fragment Mono, which carries no box-drawing, block or
 * arrow glyphs, so mixing a fallback for those would break the cell grid.
 * Spool's real terminal frames render in JetBrains Mono, so the screen alone
 * uses a terminal-monospace stack; every other surface stays on font-mono.
 */

const TERM_FONT =
	'"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

const dotGrid: React.CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "30px 30px",
	backgroundPosition: "-1px -1px",
};

const threadSpine: React.CSSProperties = {
	background:
		"linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-thread) 48%, transparent) 12%, color-mix(in srgb, var(--color-thread) 48%, transparent) 88%, transparent)",
};

/* ---------------- the deploy-queue TUI: 80 cols x 24 rows ---------------- */

const W = 80;
const INNER = W - 2; // interior between the │ box borders

const dash = (n: number) => "─".repeat(Math.max(0, n));
const RULE = `├${dash(INNER)}┤`;
const BOTTOM = `╰${dash(INNER)}╯`;

type Seg = { t: string; c?: string };
const segLen = (s: Seg[]) => s.reduce((n, x) => n + x.t.length, 0);

/** Space-fill between a left group and a right group so the row is exactly 78. */
function padRow(left: Seg[], right: Seg[] = []): Seg[] {
	const gap = Math.max(0, INNER - segLen(left) - segLen(right));
	return [...left, { t: " ".repeat(gap) }, ...right];
}

const SERVICES = [
	{ name: "web", sha: "3f9a1c0", from: "v18", to: "v19", base: "live", elapsed: "1m 48s", age: "6m ago" },
	{ name: "edge", sha: "b72e4d1", from: "v07", to: "v08", base: "live", elapsed: "0m 52s", age: "5m ago" },
	{ name: "api", sha: "a10c8f5", from: "v41", to: "v42", base: "building", elapsed: "1m 12s", age: "3m ago" },
	{ name: "auth", sha: "6d5b9a2", from: "v23", to: "v24", base: "building", elapsed: "1m 34s", age: "3m ago" },
	{ name: "worker", sha: "9c1f0e7", from: "v31", to: "v32", base: "building", elapsed: "0m 47s", age: "2m ago" },
	{ name: "gateway", sha: "4a8e2c3", from: "v12", to: "v13", base: "queued", elapsed: "", age: "2m ago" },
	{ name: "ingest", sha: "e0d7b41", from: "v05", to: "v06", base: "queued", elapsed: "", age: "2m ago" },
	{ name: "search", sha: "1b6c9f8", from: "v14", to: "v15", base: "queued", elapsed: "", age: "1m ago" },
	{ name: "docs", sha: "7f2a3d5", from: "v02", to: "v03", base: "queued", elapsed: "", age: "1m ago" },
	{ name: "billing", sha: "c93e5a0", from: "v27", to: "v28", base: "queued", elapsed: "", age: "1m ago" },
	{ name: "media", sha: "a5b1d8c", from: "v09", to: "v10", base: "queued", elapsed: "", age: "now" },
	{ name: "cron", sha: "2e4f7b6", from: "v16", to: "v17", base: "queued", elapsed: "", age: "now" },
] as const;

const TARGET = 2; // api, the row that flips building -> live when promoted
const CMD = "promote api"; // typed into the prompt before it fires

const STATUS_C: Record<string, string> = {
	queued: "text-muted/55",
	building: "text-text/85",
	live: "text-text/60",
};

const statusOf = (i: number, promoted: boolean) =>
	i === TARGET && promoted ? "live" : SERVICES[i].base;

const HEADER = padRow(
	[
		{ t: "   " },
		{ t: "service".padEnd(9), c: "text-muted/50" },
		{ t: "  " },
		{ t: "commit".padEnd(8), c: "text-muted/50" },
		{ t: "  " },
		{ t: "version".padEnd(11), c: "text-muted/50" },
		{ t: "  " },
		{ t: "status".padEnd(9), c: "text-muted/50" },
	],
	[
		{ t: "elapsed".padStart(7), c: "text-muted/50" },
		{ t: "  " },
		{ t: "age".padStart(7), c: "text-muted/50" },
	],
);

function rowSegs(
	s: (typeof SERVICES)[number],
	i: number,
	promoted: boolean,
	selected: boolean,
): Seg[] {
	const status = statusOf(i, promoted);
	return padRow(
		[
			{ t: selected ? " › " : "   ", c: selected ? undefined : "text-muted" },
			{ t: s.name.padEnd(9), c: "text-text/90" },
			{ t: "  " },
			{ t: s.sha.padEnd(8), c: "text-muted/50" },
			{ t: "  " },
			{ t: s.from, c: "text-muted/55" },
			{ t: " → ", c: "text-muted/35" },
			{ t: s.to, c: "text-text/85" },
			{ t: "    " }, // version padded to 11, then the column gap
			{ t: status.padEnd(9).slice(0, 9), c: STATUS_C[status] },
		],
		[
			{ t: (status === "queued" ? "" : s.elapsed).padStart(7), c: "text-muted/65" },
			{ t: "  " },
			{ t: s.age.padStart(7), c: "text-muted/45" },
		],
	);
}

function summarySegs(promoted: boolean): Seg[] {
	const counts = { queued: 0, building: 0, live: 0 };
	for (let i = 0; i < SERVICES.length; i++)
		counts[statusOf(i, promoted) as keyof typeof counts]++;
	const total = SERVICES.length;
	const done = counts.live;
	const pct = Math.round((done / total) * 100);
	const barW = 14;
	const fill = Math.round((done / total) * barW);
	return padRow(
		[
			{ t: " " },
			{ t: "queued ", c: "text-muted/60" },
			{ t: String(counts.queued), c: "text-text" },
			{ t: "    building ", c: "text-muted/60" },
			{ t: String(counts.building), c: "text-text/80" },
			{ t: "    live ", c: "text-muted/60" },
			{ t: String(counts.live), c: "text-thread" },
		],
		[
			{ t: "▕", c: "text-muted/40" },
			{ t: "█".repeat(fill), c: "text-thread" },
			{ t: "░".repeat(barW - fill), c: "text-muted/30" },
			{ t: "▏ ", c: "text-muted/40" },
			{ t: `${pct}%`, c: "text-text/80" },
		],
	);
}

function keybarSegs(hint: Hint): Seg[] {
	const lbl = "text-muted/55";
	return padRow(
		[
			{ t: " " },
			{ t: "↵", c: hint === "enter" ? "text-thread" : "text-text/80" },
			{ t: " promote", c: lbl },
			{ t: "    " },
			{ t: "↑↓", c: hint === "down" ? "text-thread" : "text-text/80" },
			{ t: " move", c: lbl },
			{ t: "    " },
			{ t: "/", c: "text-text/80" },
			{ t: " filter", c: lbl },
			{ t: "    " },
			{ t: "⌘esc", c: "text-text/80" },
			{ t: " leave", c: lbl },
		],
		[{ t: "12 services", c: "text-muted/45" }],
	);
}

const BORDER = "text-muted/55";

function BorderLine({ text }: { text: string }) {
	return (
		<div>
			<span className={BORDER}>{text}</span>
		</div>
	);
}

function TopBorder() {
	const l = "╭─ ";
	const title = "deploys";
	const r = " prod · fra1 ─╮";
	const mid = dash(W - l.length - title.length - 1 - r.length);
	return (
		<div>
			<span className={BORDER}>{l}</span>
			<span className="text-text/70">{title}</span>
			<span className={BORDER}>{` ${mid}${r}`}</span>
		</div>
	);
}

function SegLine({ segs, selected }: { segs: Seg[]; selected?: boolean }) {
	if (selected) {
		const flat = segs
			.map((s) => s.t)
			.join("")
			.slice(0, INNER)
			.padEnd(INNER);
		return (
			<div>
				<span className={BORDER}>│</span>
				<span className="bg-thread text-on-thread">{flat}</span>
				<span className={BORDER}>│</span>
			</div>
		);
	}
	return (
		<div>
			<span className={BORDER}>│</span>
			{segs.map((s, i) => (
				<span key={i} className={s.c}>
					{s.t}
				</span>
			))}
			<span className={BORDER}>│</span>
		</div>
	);
}

const BLANK = padRow([]);

/* ---------------- the block caret, blinking on the prompt line ---------------- */

function Caret() {
	return (
		<motion.span
			className="text-thread"
			animate={{ opacity: [1, 1, 0, 0] }}
			transition={{
				duration: 1.06,
				repeat: Infinity,
				ease: "linear",
				times: [0, 0.5, 0.5, 1],
			}}
		>
			█
		</motion.span>
	);
}

function PromptRow({ typed }: { typed: number }) {
	const shown = CMD.slice(0, typed);
	const fill = INNER - 2 - shown.length - 1;
	return (
		<div>
			<span className={BORDER}>│</span>
			<span className="text-muted">{": "}</span>
			<span className="text-text/90">{shown}</span>
			<Caret />
			<span>{" ".repeat(Math.max(0, fill))}</span>
			<span className={BORDER}>│</span>
		</div>
	);
}

/* ---------------- the animation timeline ---------------- */

type Hint = "enter" | "down" | null;
type Scene = {
	dur: number;
	sel: number;
	typed: number;
	promoted: boolean;
	hint: Hint;
	flick: boolean;
};

const TYPING: Scene[] = Array.from({ length: CMD.length }, (_, i) => ({
	dur: 68 + (i % 3) * 22,
	sel: TARGET,
	typed: i + 1,
	promoted: false,
	hint: null,
	flick: false,
}));

const STEPS: Scene[] = [
	{ dur: 1700, sel: TARGET, typed: 0, promoted: false, hint: null, flick: false },
	...TYPING,
	{ dur: 640, sel: TARGET, typed: CMD.length, promoted: false, hint: "enter", flick: false },
	{ dur: 1450, sel: TARGET, typed: 0, promoted: true, hint: null, flick: false },
	{ dur: 900, sel: TARGET + 1, typed: 0, promoted: true, hint: "down", flick: false },
	{ dur: 1250, sel: TARGET + 1, typed: 0, promoted: true, hint: null, flick: false },
	{ dur: 1300, sel: TARGET + 1, typed: 0, promoted: true, hint: null, flick: true },
	{ dur: 1100, sel: TARGET + 1, typed: 0, promoted: true, hint: null, flick: false },
];

/* ---------------- chrome: name tab, ring, corners, size chip, key hint ---------------- */

function SizeChip({ nonce }: { nonce: number }) {
	const controls = useAnimationControls();
	useEffect(() => {
		if (nonce > 0)
			controls.start(
				{ opacity: [1, 0.25, 1, 0.45, 1], scale: [1, 1.05, 1, 1.03, 1] },
				{ duration: 0.66, ease: "easeInOut" },
			);
	}, [nonce, controls]);
	return (
		<div className="absolute -bottom-[11px] left-1/2 -translate-x-1/2">
			<motion.div
				animate={controls}
				className="rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs leading-none text-on-thread"
			>
				80 × 24
			</motion.div>
		</div>
	);
}

function KeyHint({ hint }: { hint: Hint }) {
	const show = hint !== null;
	return (
		<motion.div
			initial={false}
			animate={{ opacity: show ? 1 : 0, y: show ? 0 : 5, scale: show ? 1 : 0.94 }}
			transition={{ duration: 0.22, ease: "easeOut" }}
			className="pointer-events-none absolute -top-[30px] right-0 flex items-center gap-2 font-mono text-xs text-muted"
		>
			<span className="inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-xs border border-border-raised bg-surface px-1.5 text-text">
				{hint === "enter" ? "↵" : hint === "down" ? "↓" : ""}
			</span>
			<span>{hint === "enter" ? "promote api" : hint === "down" ? "next build" : ""}</span>
		</motion.div>
	);
}

const CORNER =
	"absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-bg";

function Terminal({ scene, flick }: { scene: Scene; flick: number }) {
	return (
		<div
			className="absolute"
			style={{ left: 636, top: 236, viewTransitionName: "site-terminals-card" }}
		>
			{/* name tab */}
			<div className="absolute -top-[27px] left-0 flex items-center gap-2 font-mono text-xs leading-none text-thread">
				<span className="block h-1.5 w-1.5 rounded-full bg-thread" />
				<span>deploys.term</span>
			</div>

			<KeyHint hint={scene.hint} />

			{/* the screen: a real terminal grid, 80 x 24 */}
			<div
				className="relative whitespace-pre rounded-[3px] bg-bg px-4 py-3 [font-variant-ligatures:none]"
				style={{ fontFamily: TERM_FONT, fontSize: 14, lineHeight: "19px" }}
			>
				<TopBorder />
				<SegLine segs={HEADER} />
				<BorderLine text={RULE} />
				{SERVICES.map((s, i) => (
					<SegLine
						key={s.name}
						segs={rowSegs(s, i, scene.promoted, i === scene.sel)}
						selected={i === scene.sel}
					/>
				))}
				<BorderLine text={RULE} />
				<SegLine segs={summarySegs(scene.promoted)} />
				<SegLine segs={BLANK} />
				<BorderLine text={RULE} />
				<PromptRow typed={scene.typed} />
				<SegLine segs={BLANK} />
				<SegLine segs={keybarSegs(scene.hint)} />
				<SegLine segs={BLANK} />
				<BorderLine text={BOTTOM} />
			</div>

			{/* selection chrome: this frame is the focused one, so it wears thread */}
			<div className="pointer-events-none absolute -inset-[3px] rounded-[6px] border-[1.5px] border-thread" />
			<span className={cn(CORNER, "-left-[7px] -top-[7px]")} />
			<span className={cn(CORNER, "-right-[7px] -top-[7px]")} />
			<span className={cn(CORNER, "-bottom-[7px] -left-[7px]")} />
			<span className={cn(CORNER, "-bottom-[7px] -right-[7px]")} />
			<SizeChip nonce={flick} />
		</div>
	);
}

/* ---------------- beats: three truths, nodes on a thread ---------------- */

const BEATS: { lead: string; hi: string; tail: string }[] = [
	{ lead: "a real process in a real ", hi: "pty", tail: "." },
	{ lead: "frozen when idle. ", hi: "instant", tail: " when near." },
	{ lead: "every key reaches it. ", hi: "esc", tail: " too." },
];

function BeatNode() {
	return (
		<span className="absolute -left-[36px] top-[2px] block h-[7px] w-[7px]">
			<span className="absolute -inset-1 rounded-full border border-thread/25" />
			<span className="absolute inset-0 rounded-full border-2 border-canvas bg-thread" />
		</span>
	);
}

/* ---------------- section ---------------- */

export default function SiteTerminals() {
	const [scene, setScene] = useState<Scene>(STEPS[0]);
	const [flick, setFlick] = useState(0);

	useEffect(() => {
		let i = 0;
		let timer: number | undefined;
		const tick = () => {
			const s = STEPS[i];
			setScene(s);
			if (s.flick) setFlick((n) => n + 1);
			const nextI = (i + 1) % STEPS.length;
			timer = window.setTimeout(() => {
				i = nextI;
				tick();
			}, s.dur);
		};
		tick();
		return () => {
			if (timer) window.clearTimeout(timer);
		};
	}, []);

	return (
		<div className="relative h-full w-full overflow-hidden bg-canvas font-sans text-text antialiased [font-synthesis:none]">
			<div aria-hidden className="pointer-events-none absolute inset-0" style={dotGrid} />

			{/* back to the hub */}
			<button
				type="button"
				data-go="site-hub"
				className="group absolute left-14 top-12 z-10 inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface/50 px-3.5 py-1.5 font-mono text-xs text-muted transition-colors duration-200 hover:border-thread/60 hover:text-text"
			>
				<span className="text-thread transition-transform duration-200 group-hover:-translate-x-0.5">
					←
				</span>
				<span>canvas</span>
			</button>

			{/* the thread: one line the title and the three truths hang on */}
			<div
				className="absolute left-[100px] top-[260px] w-px"
				style={{ ...threadSpine, height: 372 }}
			/>

			{/* heading, hung on the thread */}
			<div className="absolute left-[136px] top-[232px] w-[440px]">
				<span className="absolute -left-[40px] top-[24px] block h-[9px] w-[9px]">
					<span className="absolute -inset-[5px] rounded-full border border-thread/25" />
					<span className="absolute inset-0 rounded-full border-[3px] border-canvas bg-thread" />
				</span>
				<h1 className="text-[64px] font-semibold leading-[0.96] tracking-[-0.02em]">
					terminals
				</h1>
				<p className="mt-6 max-w-[352px] text-lg leading-md text-muted">
					prototype tuis on the same canvas. real processes, real keys.
				</p>
			</div>

			{/* three truths, each a node on the thread */}
			<div className="absolute left-[136px] top-[556px] font-mono text-xs leading-none text-muted">
				{BEATS.map((b) => (
					<div key={b.hi} className="relative mb-[18px] last:mb-0">
						<BeatNode />
						<span>{b.lead}</span>
						<span className="text-text">{b.hi}</span>
						<span>{b.tail}</span>
					</div>
				))}
			</div>

			<Terminal scene={scene} flick={flick} />
		</div>
	);
}
