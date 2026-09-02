import { useCallback, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * site-type--sentence. The landing as one continuous paragraph.
 *
 * The argument: the whole of getting started is a single thought, so the page
 * refuses sections. There are no headings, no cards and no rows. One text block
 * runs from the top of the document to the bottom, and emphasis is done inside
 * the flow by size alone. The load-bearing fragments are set at 74px, the
 * connective tissue at 23px, the machine text in mono at 40px, and every one of
 * them sits on the same ragged right edge in one measure.
 *
 * That mix is the composition. A line holding a large run takes a 70px line
 * box, a line of small runs takes 34, so the block breathes unevenly on its own
 * and the rhythm is written by the sentence rather than laid over it. The
 * column is offset left, not centered, and a hairline in the margin marks where
 * the sentence starts and where it ends, which is the only rule on the page.
 *
 * Reading light: a fixed wash at the top and foot of the viewport takes the
 * block down toward the background at both edges, so whatever is in the middle
 * of the screen is the brightest thing on it. Scrolling reads.
 */

const LEFT = 176;
const RIGHT = 300;
const RULE_X = 128;

type Run =
	| { k: "sm"; t: string }
	| { k: "lg"; t: string }
	| { k: "mono"; t: string }
	| { k: "red"; t: string };

/**
 * One sentence, hand-typeset. Punctuation stays inside the run it belongs to so
 * the flow never breaks between a word and its comma.
 */
const SENTENCE: readonly Run[] = [
	{ k: "lg", t: "I made spool for myself," },
	{ k: "sm", t: " and the whole of getting into it goes like this: " },
	{ k: "lg", t: "install it," },
	{ k: "sm", t: " which is one command, " },
	{ k: "red", t: "npm i -g spool.page" },
	{ k: "sm", t: ", on Node 22 and up, in Chrome, " },
	{ k: "lg", t: "or drag one DMG to Applications" },
	{ k: "sm", t: " if you would rather have the Mac app, and either way " },
	{ k: "lg", t: "the first run is an empty canvas," },
	{ k: "sm", t: " a window with a rail and a field and nothing at all in either of them, " },
	{ k: "lg", t: "until you press" },
	{ k: "red", t: " +" },
	{ k: "sm", t: " and hand it a folder, any folder on your disk, at which point spool writes " },
	{ k: "mono", t: "design/" },
	{ k: "sm", t: " beside your source and opens that project in its own tab, and the folder after it opens beside that one, so " },
	{ k: "lg", t: "several projects stand side by side" },
	{ k: "sm", t: " in the same window all day. " },
	{ k: "lg", t: "This page was drawn in it." },
	{ k: "sm", t: " spool's own design folder carries " },
	{ k: "mono", t: "142 frames" },
	{ k: "sm", t: " across twelve pages, and every one of them is a TSX file sitting in the repo where you can read it. The license is " },
	{ k: "lg", t: "MIT," },
	{ k: "sm", t: " so: " },
	{ k: "lg", t: "fork it, rework it, rename it, ship it." },
];

const RUN_CLASS: Record<Run["k"], string> = {
	sm: "text-[23px] leading-[34px] text-muted",
	lg: "font-semibold text-[74px] leading-[76px] tracking-[-0.035em] text-text",
	mono: "font-mono text-[40px] leading-[62px] tracking-[-0.02em] text-text",
	red: "font-mono text-[40px] leading-[62px] tracking-[-0.02em] text-thread",
};

export default function SiteTypeSentence() {
	const scroller = useRef<HTMLDivElement | null>(null);
	const [end, setEnd] = useState(false);

	const onScroll = useCallback(() => {
		const el = scroller.current;
		if (el === null) return;
		const max = el.scrollHeight - el.clientHeight;
		const near = max > 0 && el.scrollTop / max > 0.7;
		setEnd((prev) => (prev === near ? prev : near));
	}, []);

	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div
				ref={scroller}
				onScroll={onScroll}
				className="h-full w-full overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				<div style={{ paddingLeft: LEFT, paddingRight: RIGHT, paddingTop: 172 }}>
					{/* the sentence. one block, mixed sizes, one ragged edge. */}
					<div className="relative pb-[64px]">
						{/* the margin rule: where the sentence starts and where it stops */}
						<span
							className="absolute top-[18px] bottom-[78px] block w-px bg-thread/55"
							style={{ left: RULE_X - LEFT }}
						/>
						<p className="[text-wrap:pretty]">
							{SENTENCE.map((r) => (
								<span key={r.t} className={RUN_CLASS[r.k]}>
									{r.t}
								</span>
							))}
						</p>
					</div>

					{/* below the fold: the video, labelled the same way everything else is */}
					<div className="border-border border-t pt-[44px] pb-[96px]">
						<div className="flex items-baseline justify-between pb-6">
							<h2 className="font-semibold text-[34px] leading-[38px] tracking-[-0.02em]">
								Or watch it happen once.
							</h2>
							<span className="font-mono text-[14px] text-muted">get-started.mp4 · 06:12</span>
						</div>
						<button
							type="button"
							className="group relative block h-[352px] w-full border border-border transition-colors duration-200 hover:border-border-raised"
						>
							<span className="absolute inset-0 flex items-center justify-center gap-4">
								<span className="flex h-12 w-12 items-center justify-center rounded-full border border-border-raised text-thread transition-colors duration-200 group-hover:border-thread">
									<span className="ml-[3px] block text-[14px] leading-none">▶</span>
								</span>
								<span className="font-mono text-[15px] text-muted transition-colors duration-200 group-hover:text-text">
									an empty folder to a walkable flow
								</span>
							</span>
						</button>
					</div>

					<footer className="flex items-baseline justify-between border-border border-t pt-6 pb-[64px] font-mono text-[13px] text-muted">
						<span>github.com/liamvinberg/spool</span>
						<span
							className={cn(
								"transition-colors duration-500",
								end ? "text-thread" : "text-muted",
							)}
						>
							mit
						</span>
					</footer>
				</div>
			</div>

			{/* reading light: the middle of the viewport is the brightest place on the page */}
			<div
				className="pointer-events-none absolute inset-x-0 h-[128px]"
				style={{ top: 96, background: "linear-gradient(to bottom, var(--color-bg) 34%, transparent)" }}
			/>
			<div className="pointer-events-none absolute inset-x-0 top-0 h-[96px] bg-bg" />
			<div
				className="pointer-events-none absolute inset-x-0 bottom-0 h-[152px]"
				style={{ background: "linear-gradient(to top, var(--color-bg) 28%, transparent)" }}
			/>

			{/* the chrome stands clear of the reading light */}
			<header
				className="pointer-events-none absolute top-[50px] right-0 left-0 flex items-center justify-between"
				style={{ paddingLeft: LEFT, paddingRight: RIGHT }}
			>
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-[18px] w-[18px] text-thread" title="spool" />
					<span className="font-semibold text-[15px] tracking-tight">spool</span>
				</div>
				<span className="font-mono text-[13px] text-muted">spool.page</span>
			</header>
		</div>
	);
}
