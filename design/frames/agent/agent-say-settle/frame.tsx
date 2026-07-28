import { useCallback, useMemo, useState } from "react";
import { type CaptureEvent, useCapture } from "../../../shared/lib/claude-turn";
import { type Cell, Column, Head, type Reading, type Readings, type Sample, Sheet, Sweep, UNIT_NOTE, UNITS } from "./settle";

/**
 * agent-say-settle — what a settled message leaves behind in the DOM (#163).
 *
 * **Nothing. And it never had to.**
 *
 * The ticket asked whether the 660 spans a finished message keeps are worth unwrapping, and
 * whether unwrapping would reflow. The measurement answered a better question than the one
 * asked: **the spans were not the price of a stable edge, they were a typographic defect**,
 * and taking them off the settled part is not a cost saving with a risk attached but a plain
 * correction with no downside on any reading here.
 *
 * `Said` wrapped every word, live or settled, in `inline-block whitespace-pre`. #148 put it
 * there on the argument that a word boundary is a space and shaping costs nothing to break
 * at one. That is true about a word's *width* and false about a word's *line breaking*:
 * `white-space: pre` is `text-wrap: nowrap` inside the box, so a wrapped word cannot break
 * inside itself — and this corpus is made of words that should. `'kaffe-receipt-copy'`,
 * `finance/service-design`, `expense-reporting`, `design/shared/tokens.css`.
 *
 * **What is measured, and how.** Four real messages — the three streamed blocks over 500
 * characters the repo has, plus the shortest streamed one, because the median message is 87
 * characters and a sheet that only measures the outlier is measuring the tail. Each is drawn
 * seven ways at twelve column widths from 240px to 512px, the rail's own 392px among them,
 * and every word is located with a `Range` per token so the comparison is per word rather
 * than per block. **A single width would prove nothing** — where a line happens to break at
 * 392px is an accident of one message — so the reading that carries the argument is how many
 * of twelve widths move.
 *
 *   raw      no span at all: one text node per markdown run. The reference.
 *   block    `inline-block whitespace-pre`, what every word carried before this ticket.
 *   nowrap   the same span without `inline-block` — `white-space` alone.
 *   inline   a plain span. Display untouched, opacity still animatable.
 *   nodes    no span either, but a text node per word: what a settled message is now.
 *   said     `Said` itself, settled.
 *   live     `Said` itself with the real 150-character window open over the tail.
 *
 * **The reflow is lateral, which is why nobody caught it.** Height never moves: `sweep Δh`
 * is 0.0px for every treatment on every sample at every width, and the line count is
 * identical too — 54, 22, 21. No word's advance ever differs from a bare word's by as much
 * as a twentieth of a pixel. What differs is *which line a word lands on*, and there `block`
 * breaks the prose differently from raw text at **3, 8 and 9 of 12 widths — the rail's own
 * 392px included**, where the long message puts word #102, `'kaffe-receipt-copy',`, on a
 * different line. Look at the `block` column in `standing up`: `title contains` ends a line
 * early and `text:` is left alone on one, because the token that should have broken after
 * its hyphen could not. Every other markdown renderer breaks it.
 *
 * **`inline-block` was doing nothing at all.** `nowrap` — the same span with only
 * `white-space: pre` — diverges at exactly the same widths and names the same first word, so
 * the display change was never the mechanism. And a plain span diverges at 0, 2 and 1 of 12,
 * never at 392px, and splits the same word raw splits.
 *
 * **The residual is per-word tokenisation itself, not the span.** `nodes` has no elements in
 * it whatsoever and diverges at the same 0, 2 and 1 widths as `inline` — identical combs. So
 * cutting a text run into per-word pieces is worth one moved break at a couple of widths
 * however it is done, and that is the floor for any per-word animation rather than a cost of
 * this decision.
 *
 * **So the settled part carries no spans, and the boundary needs no event.** `said` measures
 * **0 elements** from raw's own DOM — 74 for the 3,372-character message where `block` was
 * 633, 41 against 234, 38 against 253 — and `live`, the half-arrived state, is that plus the
 * 27 spans its window holds. Streamdown unwraps at a finish line; there is nothing here to
 * unwrap, because the window was the only thing ever wrapped and its trailing edge moves for
 * free. That answers the ticket's third question by deleting it.
 *
 * **The cost was never the reason, and saying so is the honest part.** Across the four
 * archived parent sessions the whole of an agent's prose is 35 messages and 1,784 words, and
 * the largest single thread is 8 messages and 836 — so 633 spans on one outlier message was
 * affordable and would have stayed affordable. What made it worth changing is that it was
 * wrong, not that it was expensive. The one place the count does bite is that
 * `railEntries()` rebuilds every entry on every tick of the turn's clock and `Entry` is not
 * memoised, so a settled message's whole tree is re-created while the next one streams —
 * 8.5× smaller now, and the real fix for that is not to re-render a settled entry at all.
 *
 * **One thing this sheet cannot measure.** A plain inline span has no box of its own, so an
 * opacity animation on it is likelier to run on the main thread than on the compositor,
 * where an `inline-block` could be promoted. It is a fade of 170ms over at most two words at
 * a time against a tree #149's pace already re-renders continuously, so it is not the same
 * order of problem as the blur #149 rejected — but it is stated rather than assumed.
 *
 * A note on the rig, which is honest about itself: `block` is drawn by this folder rather
 * than by `Said`, because `Said` can no longer draw it. Before the change it measured 0.0px
 * of height and 0 elements apart from `Said`, which is what earns it the right to stand for
 * what the renderer used to do. From here the control is `said` and `live` against raw, and
 * it caught a real fault in the rig on the way: the list marker `Said` draws is the
 * renderer's own glyph, not the agent's word, and counting it put every token index one out
 * of step on the two messages that have lists.
 */

/** the rail's own text column: 420px of rail less `px-3.5` either side */
const RAIL_TEXT = 392;

/**
 * The sweep. A single width proves nothing — where a line happens to break at 392px is an
 * accident of this message — so every reading is taken again across the band a rail could
 * plausibly be, and the answer is how many of them move.
 */
const SWEEP: readonly number[] = [240, 264, 288, 312, 336, 360, RAIL_TEXT, 416, 440, 464, 488, 512];

/** every streamed text block, as one string, in the order the wire sent them */
function blocksOf(name: string, events: readonly CaptureEvent[] | undefined): readonly Sample[] {
	if (events === undefined) return [];
	const found: Sample[] = [];
	let text = "";
	let deltas = 0;
	let open = false;
	for (const event of events) {
		const wire = event.type === "stream_event" ? event.event : undefined;
		if (wire === undefined) continue;
		if (wire.type === "content_block_start" && wire.content_block?.type === "text") {
			text = "";
			deltas = 0;
			open = true;
		}
		if (wire.type === "content_block_delta" && wire.delta?.type === "text_delta" && open) {
			text += wire.delta.text ?? "";
			deltas += 1;
		}
		if (wire.type === "content_block_stop" && open) {
			if (text.trim() !== "")
				found.push({
					id: `${name.replace("claude-", "")}-${text.length}`,
					note: `${name.replace("claude-", "")} ${text.length.toLocaleString()}c / ${deltas}d`,
					text,
				});
			open = false;
		}
	}
	return found;
}

/**
 * The samples: every streamed block over 500 characters the repo has — the three the other
 * say sheets use — plus the shortest one over forty, because the median message is 87
 * characters and a sheet that only measures the outlier is measuring the tail.
 */
function samplesOf(all: readonly Sample[]): readonly Sample[] {
	const long = all.filter((sample) => sample.text.length > 500);
	const short = all
		.filter((sample) => sample.text.length > 40 && sample.text.length <= 500)
		.sort((a, b) => a.text.length - b.text.length)[0];
	return [...(short === undefined ? [] : [short]), ...long.sort((a, b) => a.text.length - b.text.length)];
}

/** the shipped states read at full strength; the candidates and the baseline sit back */
const TONE: Record<Cell, string> = {
	raw: "text-muted/55",
	block: "text-muted/55",
	nowrap: "text-muted/55",
	inline: "text-muted/55",
	nodes: "text-muted/55",
	said: "text-text/85",
	live: "text-text/85",
};

function px(value: number): string {
	return value.toFixed(1);
}

function Cols() {
	return (
		<div className="flex shrink-0 items-center gap-0 px-5 py-1 font-mono text-2xs text-muted/40 leading-3">
			<span className="w-[112px] shrink-0">unit</span>
			<span className="w-[58px] shrink-0 text-right">nodes</span>
			<span className="w-[66px] shrink-0 text-right">height</span>
			<span className="w-[58px] shrink-0 text-right">Δ raw</span>
			<span className="w-[48px] shrink-0 text-right">lines</span>
			<span className="w-[54px] shrink-0 text-right">split</span>
			<span className="w-[74px] shrink-0 text-right">words off</span>
			<span className="w-[62px] shrink-0 text-right">worst px</span>
			<span className="w-[76px] shrink-0 text-right">sweep Δh</span>
			<span className="w-[158px] shrink-0 pl-4">first word that moved</span>
			<span className="w-[142px] shrink-0">widths that move</span>
			<span className="min-w-0 flex-1">what it is</span>
		</div>
	);
}

/** the sweep as a comb: one tick per width, lit where the prose moved */
function Comb({ divergent }: { divergent: readonly number[] }) {
	return (
		<span className="flex w-[142px] shrink-0 items-end gap-[3px]">
			{SWEEP.map((width) => {
				const moved = divergent.includes(width);
				return (
					<span
						key={width}
						className={moved ? "h-[11px] w-[6px] bg-thread" : "h-[4px] w-[6px] bg-border-raised"}
						title={`${width}px`}
					/>
				);
			})}
			<span className="pl-1.5 font-mono text-2xs text-muted/50 leading-3">
				{divergent.length}/{SWEEP.length}
			</span>
		</span>
	);
}

function Row({ reading, raw }: { reading: Reading; raw: Reading | undefined }) {
	const unit = reading.unit;
	const delta = raw === undefined ? 0 : reading.height - raw.height;
	return (
		<div className="flex shrink-0 items-center gap-0 px-5 py-[3px]">
			<span className={`w-[112px] shrink-0 font-mono text-sm leading-4 ${TONE[unit]}`}>{unit}</span>
			<span className="w-[58px] shrink-0 text-right font-mono text-2xs text-muted leading-4 tabular-nums">
				{reading.nodes.toLocaleString()}
			</span>
			<span className="w-[66px] shrink-0 text-right font-mono text-2xs text-muted leading-4 tabular-nums">
				{px(reading.height)}
			</span>
			<span
				className={`w-[58px] shrink-0 text-right font-mono text-2xs leading-4 tabular-nums ${
					Math.abs(delta) > 0.5 ? "text-thread" : "text-muted/45"
				}`}
			>
				{unit === "raw" ? "—" : `${delta > 0 ? "+" : ""}${px(delta)}`}
			</span>
			<span className="w-[48px] shrink-0 text-right font-mono text-2xs text-muted leading-4 tabular-nums">
				{reading.lines}
			</span>
			<span
				className={`w-[54px] shrink-0 text-right font-mono text-2xs leading-4 tabular-nums ${
					reading.split > 0 ? "text-text/80" : "text-muted/45"
				}`}
			>
				{reading.split}
			</span>
			<span
				className={`w-[74px] shrink-0 text-right font-mono text-2xs leading-4 tabular-nums ${
					reading.widthOff > 0 ? "text-text/80" : "text-muted/45"
				}`}
			>
				{unit === "raw" ? "—" : `${reading.widthOff}/${reading.words}`}
			</span>
			<span className="w-[62px] shrink-0 text-right font-mono text-2xs text-muted leading-4 tabular-nums">
				{unit === "raw" ? "—" : px(reading.worstWidth)}
			</span>
			<span
				className={`w-[76px] shrink-0 text-right font-mono text-2xs leading-4 tabular-nums ${
					reading.worstHeight > 0.5 ? "text-thread" : "text-muted/45"
				}`}
			>
				{unit === "raw" ? "—" : px(reading.worstHeight)}
			</span>
			<span className="w-[158px] shrink-0 truncate pl-4 font-mono text-2xs leading-4">
				{unit === "raw" ? (
					<span className="text-muted/40">—</span>
				) : reading.breakOff === -1 ? (
					<span className="text-muted/40">none</span>
				) : (
					<span className="text-thread">
						#{reading.breakOff} {reading.breakWord}
					</span>
				)}
			</span>
			{unit === "raw" ? <span className="w-[142px] shrink-0" /> : <Comb divergent={reading.divergent} />}
			<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/70 leading-4">{UNIT_NOTE[unit]}</span>
		</div>
	);
}

export default function AgentSaySettleFrame() {
	const mcp = useCapture("claude-mcp");
	const fanout = useCapture("claude-fanout");
	const samples = useMemo(
		() => samplesOf([...blocksOf("claude-mcp", mcp), ...blocksOf("claude-fanout", fanout)]),
		[mcp, fanout],
	);
	const [readings, setReadings] = useState<Readings | null>(null);
	const onDone = useCallback((next: Readings) => setReadings(next), []);

	const longest = samples[samples.length - 1];
	const at = (sample: Sample, unit: string): Reading | undefined => readings?.[`${sample.id}-${unit}`]?.[0];

	/**
	 * The check the rest of the sheet rests on: the two shipped states against raw text.
	 *
	 * `said` and `live` are `Said` itself, so if either of them diverges from a plain
	 * markdown render the decision below is wrong — and it is the same check whether the
	 * message has finished or is half arrived.
	 */
	const control = useMemo(() => {
		if (readings === null) return null;
		let worst = 0;
		let settledNodes = 0;
		let liveSpans = 0;
		let moved = 0;
		let aligned = true;
		for (const sample of samples) {
			const raw = readings[`${sample.id}-raw`]?.[0];
			if (raw === undefined) continue;
			for (const unit of ["said", "live"] as const) {
				const mine = readings[`${sample.id}-${unit}`]?.[0];
				if (mine === undefined) continue;
				worst = Math.max(worst, Math.max(mine.worstHeight, Math.abs(mine.height - raw.height)));
				moved += mine.divergent.length;
				if (!mine.aligned) aligned = false;
				// a settled message must leave raw text's own DOM; a live one is allowed exactly
				// the spans its window holds, which is the whole of what the change bought
				if (unit === "said") settledNodes = Math.max(settledNodes, Math.abs(mine.nodes - raw.nodes));
				else liveSpans = Math.max(liveSpans, mine.nodes - raw.nodes);
			}
		}
		return { worst, settledNodes, liveSpans, moved, aligned };
	}, [readings, samples]);

	/**
	 * The first width at which the old span moves the prose, and the paragraph it moves it in.
	 *
	 * The paragraph matters: the first draft of the band below drew the message from the top
	 * at the divergent width, and the two columns read identically because the word that moves
	 * is a hundred words down and off the bottom of the box. So the band is cut to the block
	 * the moved word sits in.
	 */
	const firstMove = useMemo(() => {
		if (readings === null || longest === undefined) return null;
		const reading = readings[`${longest.id}-block`]?.[0];
		const width = reading?.divergent[0];
		if (reading === undefined || width === undefined) return null;
		const word = reading.breakWord;
		const block = longest.text.split(/\n\n+/).find((part) => part.includes(word));
		return { unit: "block" as const, width, word, text: block ?? longest.text };
	}, [readings, longest]);

	return (
		<Sheet>
			<Sweep samples={samples} widths={SWEEP} real={RAIL_TEXT} onDone={onDone} />

			<Head
				title="say settle"
				note={`#163 — every word wrapped, or not, measured at the rail's ${RAIL_TEXT}px and across ${SWEEP.length} widths`}
			/>
			{readings === null ? (
				<div className="px-5 py-3 font-mono text-2xs text-muted/60 leading-4">measuring…</div>
			) : (
				<>
					<Cols />
					{samples.map((sample) => (
						<div key={sample.id} className="flex flex-col border-border border-t">
							<span className="px-5 pt-1.5 pb-0.5 font-mono text-2xs text-muted/50 leading-3">
								{sample.note} — {at(sample, "raw")?.words ?? 0} words
							</span>
							{UNITS.map((unit) => {
								const reading = at(sample, unit);
								if (reading === undefined) return null;
								return <Row key={unit} reading={reading} raw={at(sample, "raw")} />;
							})}
						</div>
					))}
					<div className="border-border border-t px-5 py-1.5 font-mono text-2xs text-muted/60 leading-4">
						control — <span className="text-text/80">said</span> and <span className="text-text/80">live</span>,
						which are `Said` itself, against raw text across every width:{" "}
						{control === null
							? "—"
							: `${px(control.worst)}px of height anywhere in the sweep, settled ${
									control.settledNodes
								} elements from raw's own, the window worth ${control.liveSpans} spans, ${
									control.moved
								} widths moved, tokens ${control.aligned ? "aligned" : "OUT OF STEP"}`}
					</div>
				</>
			)}

			<div className="border-border border-t px-5 py-1.5 font-mono text-2xs text-muted/60 leading-4">
				the cost that was never the reason — the four archived sessions hold{" "}
				<span className="text-text/80">35 messages and 1,784 words</span> of agent prose all told, and the largest
				single thread 8 messages and 836
			</div>

			<Head
				title="standing up"
				note={`the longest message the repo has, at the real ${RAIL_TEXT}px — raw text, what the rail drew, and what it draws now`}
			/>
			<div className="flex shrink-0 gap-5 px-5 py-3">
				{longest === undefined
					? null
					: (["raw", "block", "said"] as const).map((unit) => (
							<Column
								key={unit}
								label={unit}
								note={UNIT_NOTE[unit]}
								width={RAIL_TEXT}
								height={330}
								text={longest.text}
								unit={unit}
								tone={unit === "block" ? "text-thread" : unit === "said" ? "text-text/85" : "text-muted"}
							/>
						))}
			</div>

			<Head
				title="where it moves"
				note={
					firstMove === null
						? "nothing in the sweep moved a word off its line"
						: `${firstMove.unit} at ${firstMove.width}px — "${firstMove.word}" is the first word on a different line`
				}
			/>
			<div className="flex min-h-0 flex-1 gap-5 px-5 py-3">
				{longest === undefined || firstMove === null ? (
					<span className="font-mono text-2xs text-muted/60 leading-4">
						nothing to draw: every treatment broke the prose exactly where raw text broke it, at every width in
						the sweep
					</span>
				) : (
					<>
						<Column
							label="raw"
							note={`${firstMove.width}px — breaks the token after its hyphen`}
							width={firstMove.width}
							height={250}
							text={firstMove.text}
							unit="raw"
						/>
						<Column
							label={firstMove.unit}
							note={`${firstMove.width}px — cannot, so the token goes down whole`}
							width={firstMove.width}
							height={250}
							text={firstMove.text}
							unit={firstMove.unit}
							tone="text-thread"
						/>
						<Column
							label="said"
							note={`${firstMove.width}px — what it draws now`}
							width={firstMove.width}
							height={250}
							text={firstMove.text}
							unit="said"
							tone="text-text/85"
						/>
					</>
				)}
			</div>
		</Sheet>
	);
}
