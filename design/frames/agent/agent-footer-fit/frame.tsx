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
 * **At the two ends it answers itself.** Every cell prints what it wanted, and the
 * three occupants come out at model 160, limit 179, stop 73, with two 10px gaps
 * between them — 432 for all of it. The box is the rail less 29px of padding.
 *
 *   480 → 451 of box. 432 fits, with 19 to spare, and this is the only width it does.
 *   420 → 391 of box. 41 short, which is the wrap #184 was filed for.
 *   300 → 271 of box. model and limit alone are 349. the shipped default cannot
 *         hold the two readouts, before the stop is even asked for.
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
 * **Three things the ladder settled that no amount of arguing would have.**
 *
 * **The model name is not spool's to cut, so two of these columns were never
 * legal.** `readout` already said so — the name is the binary's `displayName`
 * "uncased and unshortened, because the moment Spool rewrites it Spool owns it" —
 * and the captured `list_models` reply is what gives that rule teeth. Five rows
 * come back and none of them is `Opus`: there is `Default (recommended)` and there
 * is `Opus (1M context)`, both resolving to the same `claude-opus-5[1m]`, and the
 * parenthetical is the only thing telling them apart. `/model opus` meanwhile is
 * accepted and resolves to Opus *without* the 1M window. So `Opus · high` in this
 * row is not a short name for this machine. It is the correct name of a different
 * one, printed under a transcript the other machine wrote.
 *
 * What is legal is an ellipsis, and the difference is not a technicality. `Opus
 * (1M cont…` is visibly cut and reads as cut, the whole string stays in the DOM,
 * and the full name is one click up in the menu. The layout ran out of room and
 * said so; nobody renamed anything. So the surviving columns truncate.
 *
 * **The limit cannot be whole below the ceiling.** In `drop` and `stop last`, the
 * two columns that keep the words the binary wrote, it is drawn at 480 and at no
 * other width — two rows out of twelve. `shorten` is the only column that carries
 * it all the way down, and it does that by turning it into `92%`, a number with no
 * noun in a row that no longer says which window it is a number about. So "keep the
 * limit and shed it when tight" is the limit being absent at every width anyone
 * uses, and "keep it and cut it" is keeping the digits and dropping the fact.
 * `limit out` is that read as a conclusion instead of a table.
 *
 * **And `limit out` wants 243 at every width, which is the whole argument in one
 * number.** No threshold, no ladder, no rung that only fires at one size — 160 and
 * 73 and the gap between them, from 200 to 480. It clears the shipped 300's box by
 * 28 and only truncates below 260, only while a turn is in flight.
 *
 * Each cell draws at its real box width and measures itself, so a cell that says it
 * overflows has actually overflowed. Nothing here is computed — including the four
 * paragraphs above, two of which said something else until the measurement stopped
 * lying about rows whose children truncate.
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

/** `cut` is the shipped behaviour: the label gives way with an ellipsis and the chevron never does */
function Model({ label, cut = false }: { label: string; cut?: boolean }) {
	return (
		<span className={cn(QUIET, "flex items-center gap-1 text-muted/45", cut ? "min-w-0" : "shrink-0")}>
			<span className={cn(cut && "min-w-0 truncate")}>{label}</span>
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
 * The flag was wrong twice before it could be trusted, both times because the
 * layout was hiding the thing being measured.
 *
 * It waits for `document.fonts.ready`. Measured before the mono face lands, every
 * width is the fallback's and the flag reads clear on rows that visibly clip.
 *
 * And it measures a second copy of the row rather than the row. A flex row with a
 * truncating child absorbs its own overflow: the child shrinks, the row fits, and
 * `scrollWidth` reports fitting even while the text is being cut off — the layout
 * hides the very thing the flag is for. Summing the children's scroll widths fixed
 * that for one level, then broke again the moment the *model* became the thing
 * that truncates, because the cut now happens a level deeper and the child's own
 * box shrinks with it. So the row is drawn twice, once constrained and once at
 * `w-max` and invisible, and the invisible one is asked how wide this would like
 * to be. That question has one answer at every nesting depth.
 */
function Footer({ rail, children }: { rail: number; children: ReactNode }) {
	const box = useRef<HTMLDivElement>(null);
	const ghost = useRef<HTMLDivElement>(null);
	const [wanted, setWanted] = useState<number | null>(null);
	useEffect(() => {
		const natural = ghost.current;
		if (natural === null) return;
		const read = () => setWanted(Math.round(natural.getBoundingClientRect().width));
		void document.fonts.ready.then(read);
		const watch = new ResizeObserver(read);
		watch.observe(natural);
		return () => watch.disconnect();
	}, []);
	const over = wanted !== null && wanted > rail - CHROME + 1;
	return (
		<div className="flex flex-col gap-1">
			<div
				style={{ width: rail - CHROME }}
				className="relative rounded-xs border border-border/60 bg-surface/30 px-1 py-0.5"
			>
				<div ref={box} className="flex h-[18px] items-center justify-between gap-2.5 overflow-hidden">{children}</div>
				<div
					ref={ghost}
					aria-hidden="true"
					className="pointer-events-none invisible absolute top-0 left-0 flex h-[18px] w-max items-center gap-2.5"
				>
					{children}
				</div>
			</div>
			<span className={cn(QUIET, over ? "text-text/70" : "text-muted/30")}>
				{rail} rail · {rail - CHROME} box · {wanted === null ? "…" : `${wanted} wanted`}
				{over ? " · over" : ""}
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
 * **Which is exactly where it dies, and the model half is what kills it.** Removing
 * words from a sentence leaves a shorter sentence. Removing them from a *name*
 * leaves another name, and here it leaves a name that is taken: `Opus (1M context)`
 * cut to `Opus` is the model `/model opus` gets you, which is Opus without the 1M
 * window. The row would print one machine's name over another machine's transcript
 * and look completely unremarkable doing it.
 *
 * It is also the column that fits everywhere — 148 in the 171px floor — which is
 * the point of keeping it. Nothing about the pixels rules this out. It loses on
 * what the words mean after they are cut, and it is drawn so that is visible next
 * to the limit, where the identical edit is harmless. */

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
 * running but not on what. It also inherits `shorten`'s fatal step wholesale — its
 * middle rung is the same rename — so what it really contributes is the ordering,
 * which is the part `limit out` keeps. */

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
 * Look along the other three. Wherever the limit keeps the binary's own words it is
 * drawn at 480 and nowhere else — not at `RAIL_WIDTH` 300, not at the 420 #144 gave
 * the agent, nowhere below. The only column that carries it further carries `92%`,
 * which is the number without the fact. So "keep the limit and shed it when tight"
 * is the limit being absent at every width anyone actually uses, and present only
 * if you drag the rail to its maximum first.
 *
 * So it leaves the row, and #122's own reasoning says where it goes. It chose the
 * footer *because* #118's menu was already in the same eighteen pixels and the
 * binary's remedy for a limit is a model switch every time. That argument does not
 * want the limit *beside* the trigger, it wants it *next to the remedy* — and #186
 * has just made that menu a list of rows with a slot that describes what the
 * cursor is on. A window is one more line in it, readable at every rail width,
 * next to the five things you would do about it.
 *
 * What is left in the row is the model and a stop, and neither of them shortens.
 * The model keeps its whole name at every width and truncates at the floor, which
 * is the one degrade available to it that is not a rename; the stop is `shrink-0`
 * and never gives way, because a cut name is still readable and half a stop button
 * is not. There is no threshold in this column and no step ladder — one rule, all
 * 280 pixels of range.
 *
 * The 200 floor is also the transient case rather than the standing one. A stop is
 * only drawn against a turn in flight (`cutting` wants `phase === "playing"`), so
 * for most of a session that row is a model alone in 171px of box against its own
 * 160, and the ellipsis appears only while something is running. */

function LimitOut({ rail, model }: { rail: number; model: string; limit: string }) {
	return (
		<Footer rail={rail}>
			<Model label={model} cut={true} />
			<Stop />
		</Footer>
	);
}

const ORDERS = [
	{ id: "drop", says: "a thing that does not fit is not shown. limit first, then the stop", render: Drop },
	{
		id: "shorten",
		says: "words go, facts stay. but `Opus (1M context)` cut to `Opus` is a different model",
		render: Shorten,
	},
	{ id: "stop last", says: "the only control never leaves. inherits the rename at its middle rung", render: StopLast },
	{ id: "limit out", says: "limit to the menu, name truncated never shortened · shipped", render: LimitOut },
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
