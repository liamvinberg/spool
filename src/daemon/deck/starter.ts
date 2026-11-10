/**
 * The starter a new presentation is made with (spool#265, the team canvas's `app/spool-deck--new`): five slides in
 * spool's own look, an honest talk about giving a talk. A title, one statement, a live slide, one big number, a
 * close. Each says what that kind of slide is for, so the starter teaches the deck by being one, and the agent
 * rewrites it from what the person says the talk is about.
 *
 * Each slide is a frame that stands on its own, as an agent would write one: it imports nothing but `spool` and
 * React, so it plays in any project whatever its tokens, shared/ folder or import map hold, and it keeps working once
 * it is copied, moved or rewritten one slide at a time. Its colours are spool's dark theme as literal values, its
 * faces spool's own, and its one animation is in the slide.
 */

export interface StarterSlide {
	/** its folder on the page, and its place in the talk */
	readonly folder: string;
	readonly source: string;
	/** its `notes.md`: what the presenter says, one paragraph per beat */
	readonly notes: string;
}

/**
 * What every slide carries in its own `<style>`: spool's face, and the words arriving up from a few pixels under in
 * the order the slide reads, with nothing moving for a person who asked for less motion.
 */
const STYLE = `const STYLE = [
	'@import url("https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700&family=Fragment+Mono&display=swap");',
	"@keyframes line-up { from { opacity: 0; transform: translateY(14px); } }",
	".line-up { animation: line-up 620ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }",
	"@media (prefers-reduced-motion: reduce) { .line-up { animation: none; } }",
].join("\\n");`;

/** The slide's ground: spool's window, its ink and face. */
const GROUND =
	"relative h-full overflow-hidden bg-[#0e0e0e] font-['Instrument_Sans',system-ui,sans-serif] text-[#f0efed] antialiased";
const SECONDARY = "text-[#94918d]";

const title = `${STYLE}

export default function Title() {
	return (
		<main className="${GROUND}">
			<style>{STYLE}</style>
			<div className="absolute top-[236px] left-24 w-[880px]">
				<h1 className="line-up text-[112px] leading-[112px] font-medium tracking-[-0.03em]">Your talk</h1>
				<p className="line-up mt-8 text-[30px] leading-[40px] ${SECONDARY} [animation-delay:120ms]">
					Tell your agent what it is about, and these five slides become it.
				</p>
			</div>
		</main>
	);
}
`;

const statement = `${STYLE}

export default function Statement() {
	return (
		<main className="${GROUND}">
			<style>{STYLE}</style>
			<div className="absolute top-[210px] left-24 w-[1000px]">
				<p className="line-up text-[72px] leading-[82px] font-medium tracking-[-0.02em]">
					One idea to a slide, in words the back row can read.
				</p>
			</div>
		</main>
	);
}
`;

const live = `import { type PointerEvent, useRef } from "react";
import { ui } from "spool";

${STYLE}

/** The slide's one control, kept in ui.state so the room's screen moves with the presenter's. */
export default function Live() {
	ui.live();
	const state = ui.use();
	const minutes = (state.minutes as number | undefined) ?? 15;
	const track = useRef<HTMLDivElement>(null);
	const share = (minutes - 5) / 40;
	const slides = Math.max(3, Math.round(minutes / 1.5));
	const set = (clientX: number) => {
		const box = track.current?.getBoundingClientRect();
		if (box === undefined || box.width === 0) return;
		const k = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
		ui.state.minutes = Math.round(5 + k * 40);
	};
	const press = (event: PointerEvent<HTMLDivElement>) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		set(event.clientX);
	};
	const move = (event: PointerEvent<HTMLDivElement>) => {
		if (event.currentTarget.hasPointerCapture(event.pointerId)) set(event.clientX);
	};
	return (
		<main className="${GROUND}">
			<style>{STYLE}</style>
			<div className="absolute top-[230px] left-24 w-[520px]">
				<h2 className="line-up text-[60px] leading-[66px] font-medium tracking-[-0.02em]">
					A slide is a frame, so it runs.
				</h2>
				<p className="line-up mt-6 text-[24px] leading-[34px] ${SECONDARY} [animation-delay:120ms]">
					Clicks reach it while you present. Drag the slider.
				</p>
			</div>
			<div className="line-up absolute top-[200px] left-[720px] w-[464px] [animation-delay:200ms]">
				<p className="font-['Fragment_Mono',ui-monospace,monospace] text-[20px] leading-[28px] text-[#6c6a67]">how long is the talk</p>
				<p className="mt-4 text-[96px] leading-[96px] font-medium tracking-[-0.03em] tabular-nums">
					{minutes}
					<span className="ml-3 text-[40px] ${SECONDARY}">min</span>
				</p>
				<div ref={track} className="relative mt-10 h-10 cursor-pointer" onPointerDown={press} onPointerMove={move}>
					<span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#363636]" />
					<span
						className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 rounded-full bg-[#f5391a]"
						style={{ width: \`\${share * 100}%\` }}
					/>
					<span
						className="absolute top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[#f5391a] bg-[#0e0e0e]"
						style={{ left: \`\${share * 100}%\` }}
					/>
				</div>
				<p className="mt-6 text-[24px] leading-[34px] ${SECONDARY}">About {slides} slides at a minute and a half each.</p>
			</div>
		</main>
	);
}
`;

const number = `import { useEffect, useRef } from "react";
import { ui } from "spool";

${STYLE}

/** Two beats: the number counts up to itself, then what it means arrives beside it. */
export default function BigNumber() {
	const beat = ui.beats(["number", "meaning"]);
	return (
		<main className="${GROUND}">
			<style>{STYLE}</style>
			<div className="absolute inset-x-24 top-[150px] flex items-end gap-16">
				<CountTo to={5} className="text-[360px] leading-[360px] font-medium tracking-[-0.04em] tabular-nums" />
				<p
					className={
						beat.reached("meaning")
							? "line-up mb-12 w-[520px] text-[36px] leading-[46px] ${SECONDARY} [animation-delay:200ms]"
							: "mb-12 w-[520px] text-[36px] leading-[46px] ${SECONDARY} opacity-0"
					}
				>
					slides to start from. Keep the ones that help.
				</p>
			</div>
		</main>
	);
}

/** A number counting up to itself as the slide arrives, and standing still for a person who asked for less motion. */
function CountTo({ to, className }: { to: number; className: string }) {
	const ref = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (el === null || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const start = performance.now();
		let frame = 0;
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / 900);
			el.textContent = String(Math.round(to * (1 - (1 - t) ** 4)));
			if (t < 1) frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
		return () => {
			cancelAnimationFrame(frame);
			el.textContent = String(to);
		};
	}, [to]);
	return (
		<span ref={ref} className={className}>
			{to}
		</span>
	);
}
`;

const close = `${STYLE}

export default function Close() {
	return (
		<main className="${GROUND}">
			<style>{STYLE}</style>
			<div className="absolute top-[250px] left-24 w-[900px]">
				<h2 className="line-up text-[112px] leading-[112px] font-medium tracking-[-0.03em]">Thank you.</h2>
				<p className="line-up mt-8 text-[30px] leading-[40px] ${SECONDARY} [animation-delay:120ms]">
					End on the one thing you want the room to keep.
				</p>
			</div>
		</main>
	);
}
`;

/** The talk New presentation makes, in order. */
export const STARTER: readonly StarterSlide[] = [
	{ folder: "title", source: title, notes: "Say who you are and why this talk, in one breath.\n" },
	{ folder: "statement", source: statement, notes: "Read the line, then stop and let it land.\n" },
	{
		folder: "live",
		source: live,
		notes: "Click into the slide and drag. Whatever it holds runs while you talk.\n",
	},
	{ folder: "number", source: number, notes: "Say the number.\n\nThen what it means.\n" },
	{ folder: "close", source: close, notes: "Thank the room and ask for questions.\n" },
];
