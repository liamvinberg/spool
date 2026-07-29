import { type ReactNode, useEffect, useRef, useState } from "react";
import { CAPTURED_NOW, type RateLimitInfo, WARNED, limitReadout } from "../../../shared/lib/agent-limit";
import { CAPTURED, useModels } from "../../../shared/lib/agent-model";
import { readout } from "../../../shared/lib/agent-model";
import { cn } from "../../../shared/lib/utils";
import { ChevronIcon } from "../../../shared/ui/spool-icons";

/**
 * agent-footer-fit — the composer footer across every width the rail can be.
 *
 * #184 asked which of #118's model, #122's limit and #165's stop should give way
 * in one 18px line. The ticket's five candidates all assumed one width. **The rail
 * is drag-resizable and has been since before any of this**, which nothing on this
 * page had noticed: `inspector.tsx` clamps it to `STRIP_WIDTH` 44 or `MIN_WIDTH`
 * 200 through `MAX_WIDTH` 480, snaps to the strip below 144, and ships at
 * `RAIL_WIDTH` 300. #144 widening the agent rail to 420 picked a *default* inside
 * that range, not a fixed width. So the question is not which one moves. It is
 * what the row does across a 280px range that already exists and already snaps.
 *
 * **At the two ends it answers itself.** Measured in #180: model 160, limit 179,
 * stop 73, one 10px gap. The box is the rail less 29px of padding.
 *
 *   480 → 451 of box, 422 wanted. everything fits, and only here.
 *   420 → 391 of box. 31 short, which is the wrap #184 was filed for.
 *   300 → 271 of box. the shipped default cannot hold model and limit at all.
 *   200 → 171 of box. the model alone is 160. nothing else fits, at all.
 *
 * So a rail at its own default already cannot draw what three tickets put in this
 * line, and the frames on this page never showed it because they all hard-code 420.
 *
 * **Four orders.** Every column keeps the model, because the row is the model's
 * line and the other two moved in. They disagree about the rest: `drop` says a
 * thing you cannot fit is a thing you do not show, `shorten` says the words are
 * spool's to cut but the facts are not, `stop last` says one of these is a control
 * on a running process and the other two are readouts, and `limit out` is what the
 * first three turned out to be saying together.
 *
 * **Two things the ladder settled that no amount of arguing would have.**
 *
 * `shorten` cannot cover the range. Cut all the way down to `Opus › 92%` it still
 * overflows the 171px floor — the one cell in twenty-four that flags it. So the
 * gentlest policy is not a policy: something has to go at the narrow end whatever
 * you do with the words.
 *
 * And **the limit appears in exactly one row of eighteen** across the first three
 * columns, the 480 ceiling. Not at `RAIL_WIDTH` 300, not at #144's 420, nowhere
 * below. "Keep it and shed it when tight" is therefore the limit being absent by
 * default and present only if you drag the rail to maximum — invisible precisely
 * when you would want it. That is what `limit out` is: the conclusion drawn rather
 * than described.
 *
 * Each cell draws at its real box width and measures itself, so a cell that says
 * it overflows has actually overflowed. Nothing here is computed.
 */

/* ---------- the ladder ----------
 * The widths are the shipped constants rather than a spread: 200 and 480 are the
 * clamp, 300 is `RAIL_WIDTH`, 420 is what #144 gave the agent, and 260 and 360 sit
 * between so a threshold has somewhere to land. 44 is not drawn — below 72 the
 * inspector swaps to a bare strip with no composer in it at all. */

const RAILS = [200, 260, 300, 360, 420, 480] as const;

/** the composer's own padding, measured off the 420 rail: 391px of box in 420 of rail */
const CHROME = 29;

const QUIET = "font-mono text-2xs leading-3";

function Model({ label }: { label: string }) {
	return (
		<span className={cn(QUIET, "flex shrink-0 items-center gap-1 text-muted/45")}>
			{label}
			<ChevronIcon open={false} className="h-2 w-2 shrink-0" />
		</span>
	);
}

function Limit({ text }: { text: string }) {
	return <span className={cn(QUIET, "min-w-0 truncate text-muted/45")}>{text}</span>;
}

function Stop() {
	return (
		<span className="flex h-[18px] w-fit shrink-0 items-center gap-2 rounded-sm border border-border-raised bg-raised px-2">
			<span className="h-2 w-2 shrink-0 rounded-[1px] bg-text" />
			<span className={cn(QUIET, "text-text")}>stop</span>
			<span className={cn(QUIET, "text-muted/60")}>⎋</span>
		</span>
	);
}

/**
 * One footer at one width, reporting whether it actually fit.
 *
 * Two things had to be got right before the flag could be trusted, and both were
 * wrong on the first pass.
 *
 * It waits for `document.fonts.ready`. Measured before the mono face lands, every
 * width is the fallback's and the flag reads clear on rows that visibly clip.
 *
 * And it sums the children rather than reading `scrollWidth`. The row is a flex
 * with a truncating limit in it, so overflow gets absorbed *into* that child and
 * the scroll width never exceeds the client width even when the stop is being cut
 * off the end — the layout hides the very thing the flag is for. Summing natural
 * widths asks the question the ladder actually cares about: was this ever going to
 * fit, before anything gave way to make it look like it did.
 */
function Footer({ rail, children }: { rail: number; children: ReactNode }) {
	const box = useRef<HTMLDivElement>(null);
	const [over, setOver] = useState<boolean | null>(null);
	useEffect(() => {
		const node = box.current;
		if (node === null) return;
		const read = () => {
			const kids = Array.from(node.children) as HTMLElement[];
			const gaps = Math.max(0, kids.length - 1) * 10;
			const wanted = kids.reduce((sum, kid) => sum + kid.scrollWidth, gaps);
			setOver(wanted > node.clientWidth + 1);
		};
		void document.fonts.ready.then(read);
		const watch = new ResizeObserver(read);
		watch.observe(node);
		return () => watch.disconnect();
	}, []);
	return (
		<div className="flex flex-col gap-1">
			<div style={{ width: rail - CHROME }} className="rounded-xs border border-border/60 bg-surface/30 px-1 py-0.5">
				<div ref={box} className="flex h-[18px] items-center justify-between gap-2.5 overflow-hidden">{children}</div>
			</div>
			<span className={cn(QUIET, over === true ? "text-text/70" : "text-muted/30")}>
				{rail} rail · {rail - CHROME} box{over === true ? " · over" : ""}
			</span>
		</div>
	);
}

/* ---------- drop ----------
 * A thing that does not fit is a thing you do not show. The limit goes first
 * because it is the only one of the three that is pure readout and the only one
 * whose own ticket put it here for a borrowed reason: #122 chose the footer
 * because #118's menu was already in it. Below that the stop goes too, and esc is
 * what is left — which #165 already made the real answer, the press existing only
 * because clicking onto the canvas gives esc back to the ladder.
 *
 * The cost is that the limit vanishes exactly when a narrow rail means you are
 * least likely to widen it to go looking. */

function Drop({ rail, model, limit }: { rail: number; model: string; limit: string }) {
	const box = rail - CHROME;
	return (
		<Footer rail={rail}>
			<Model label={model} />
			{box >= 420 ? <Limit text={limit} /> : <span />}
			{box >= 240 ? <Stop /> : null}
		</Footer>
	);
}

/** the model's own string, cut one word at a time: full, then no context, then no effort */
function modelAt(model: string, step: 0 | 1 | 2): string {
	if (step === 0) return model;
	const bare = model.replace(/\s*\([^)]*\)/, "");
	return step === 1 ? bare : (bare.split(" · ")[0] ?? bare);
}

/** the limit's own string, cut the same way: full, then no label, then the number alone */
function limitAt(limit: string, step: 0 | 1 | 2): string {
	if (step === 0) return limit;
	const bare = limit.replace(/^weekly limit /, "");
	return step === 1 ? bare : (bare.split(" · ")[0] ?? bare);
}

/* ---------- shorten ----------
 * The words are spool's to cut, the facts are not. `weekly limit 92% · resets wed`
 * loses its label and then its reset; the model loses its parenthetical and then
 * its effort. Nothing is invented — every step is the same string with words
 * removed, which is the one edit spool can make to the binary's own phrasing
 * without putting words in its mouth.
 *
 * The cost is that the row stops reading as the machine's and starts reading as
 * spool's summary of it, and at the narrow end `92%` alone is a number with no
 * noun. */

function Shorten({ rail, model, limit }: { rail: number; model: string; limit: string }) {
	const box = rail - CHROME;
	const step = box >= 420 ? 0 : box >= 300 ? 1 : 2;
	return (
		<Footer rail={rail}>
			<Model label={modelAt(model, step)} />
			<Limit text={limitAt(limit, step)} />
			<Stop />
		</Footer>
	);
}

/* ---------- stop last ----------
 * One of these three is a control on a process that is spending tokens and writing
 * files, and the other two say what it is spending them as. So the stop is the one
 * thing that never leaves, and everything else gives way to it in turn: the limit,
 * then the model's words down to nothing, and the trigger survives as a bare
 * chevron because #118's menu still has to be reachable at any width.
 *
 * The cost is that the narrowest row is a control and a word, which says what is
 * running but not on what. */

function StopLast({ rail, model, limit }: { rail: number; model: string; limit: string }) {
	const box = rail - CHROME;
	return (
		<Footer rail={rail}>
			<Model label={modelAt(model, box >= 300 ? 0 : box >= 220 ? 1 : 2)} />
			{box >= 420 ? <Limit text={limit} /> : <span />}
			<Stop />
		</Footer>
	);
}

/* ---------- limit out ----------
 * The recommendation, and the ladder is what produced it rather than taste.
 *
 * Look along the other three: the limit appears in exactly one row of eighteen,
 * the 480 ceiling. It cannot be drawn at `RAIL_WIDTH` 300, or at the 420 #144 gave
 * the agent, or anywhere below. So "keep the limit and shed it when tight" is not
 * a policy — it is the limit being absent by default and present only if you drag
 * the rail to its maximum, which is invisible exactly when you would want it.
 *
 * So it leaves the row, and #122's own reasoning says where it goes. It chose the
 * footer *because* #118's menu was already in the same eighteen pixels and the
 * binary's remedy for a limit is a model switch every time. That argument does not
 * want the limit *beside* the trigger, it wants it *next to the remedy* — and #186
 * has just made that menu a list of rows with a slot that describes what the
 * cursor is on. A window is one more line in it, readable at every rail width,
 * next to the five things you would do about it.
 *
 * What is left in the row is a model that shortens and a stop that never leaves,
 * and it fits from the 200 floor to the 480 ceiling with nothing clipped. */

function LimitOut({ rail, model }: { rail: number; model: string; limit: string }) {
	const box = rail - CHROME;
	return (
		<Footer rail={rail}>
			<Model label={modelAt(model, box >= 300 ? 0 : box >= 220 ? 1 : 2)} />
			<Stop />
		</Footer>
	);
}

const ORDERS = [
	{ id: "drop", says: "a thing that does not fit is not shown. limit first, then the stop", render: Drop },
	{ id: "shorten", says: "words go, facts stay. overflows at the floor, so it cannot cover the range", render: Shorten },
	{ id: "stop last", says: "the only control on the row never leaves. the readouts give way to it", render: StopLast },
	{ id: "limit out", says: "the limit goes to the model menu, next to the remedy · recommended", render: LimitOut },
] as const;

export default function AgentFooterFitFrame() {
	const models = useModels();
	const model = readout(CAPTURED, models);
	const info: RateLimitInfo = WARNED;
	const limit = limitReadout(info, CAPTURED_NOW) ?? "weekly limit 92% · resets wed";

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="flex shrink-0 items-baseline gap-3 border-border border-b bg-surface/40 px-6 py-2">
				<span className="font-mono text-sm text-text leading-4">footer fit</span>
				<span className="min-w-0 flex-1 font-mono text-2xs text-muted/70 leading-3">
					#184 — the rail is 200 to 480 and ships at 300. every cell measured, not computed.
				</span>
			</div>
			<div className="flex min-h-0 flex-1 gap-9 overflow-auto p-6">
				{ORDERS.map((order) => (
					<div key={order.id} className="flex shrink-0 flex-col gap-4">
						<div className="flex flex-col gap-1">
							<span className="font-mono text-xs text-text leading-4">{order.id}</span>
							<span className="w-[460px] font-mono text-2xs text-muted/45 leading-[1.5]">{order.says}</span>
						</div>
						<div className="flex flex-col gap-3">
							{RAILS.map((rail) => (
								<order.render key={rail} rail={rail} model={model} limit={limit} />
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
