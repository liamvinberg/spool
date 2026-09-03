import { periodOf, SAY } from "shared/lib/explore/agent/stream-script";
import { SayProse, STAGE_CSS, useSayLoop, type Words } from "shared/ui/explore/agent/stream-stage";

/**
 * agent-say-sheet: the six word takes on one clock, side by side, and nothing else.
 *
 * The frames in the column to the left are the takes in the rail they would ship in. This
 * sheet strips the rail away so the only thing moving is the words, six times over, on the
 * same message at the same instant. Read across a line and the difference between two
 * takes is visible in one glance rather than remembered across two frames.
 *
 * Same loop as the column: a seven-delta message over 3.3 seconds, the drain clearing about
 * a second after, held, then again.
 */

const TAKES: readonly { words: Words; note: string }[] = [
	{ words: "fade", note: "today: each word fades in over 170ms" },
	{ words: "plain", note: "the same edge, no fade" },
	{ words: "pen", note: "a mask uncovers one character at a time" },
	{ words: "soft", note: "the mask with a 36px feather, no caret" },
	{ words: "line", note: "a line at a time, once its wrap is final" },
	{ words: "paragraph", note: "a paragraph at a time, opening in like a row" },
];

export default function AgentSaySheetFrame() {
	const { elapsed, run, still } = useSayLoop();
	const period = periodOf(SAY);
	const fading = Number.isFinite(elapsed) && elapsed > period - 360;
	return (
		<div className="flex h-full w-full flex-col gap-5 bg-canvas px-8 py-6 font-sans text-text antialiased [font-synthesis:none]">
			<style>{STAGE_CSS}</style>
			<div className="flex items-baseline gap-3">
				<span className="font-mono text-sm text-text leading-4">say</span>
				<span className="font-mono text-2xs text-muted/70 leading-3">six takes, one clock, the words alone</span>
			</div>
			<div className="flex min-h-0 flex-1 gap-6">
				{TAKES.map((take) => (
					<div key={take.words} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
						<div className="flex h-8 shrink-0 flex-col gap-1">
							<span className="font-mono text-muted text-sm leading-4">{take.words}</span>
							<span className="truncate font-mono text-2xs text-muted/60 leading-3">{take.note}</span>
						</div>
						<div className="relative min-h-0 flex-1 overflow-hidden border-border border-x bg-bg px-3.5 pt-4">
							<div key={run} className={fading ? "opacity-0 transition-opacity duration-300" : "opacity-100 transition-opacity duration-300"}>
								<SayProse words={take.words} elapsed={elapsed} still={still} />
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
