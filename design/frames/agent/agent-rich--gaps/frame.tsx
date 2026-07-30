import { useCallback, useState } from "react";
import { GAPS_SAID, RAIL_DEFAULT } from "../../../shared/lib/rich-copy";
import { closedText } from "../../../shared/lib/say-markers";
import { Said } from "../../../shared/ui/spool-say";
import { RichSaid } from "../../../shared/ui/spool-rich-say";
import {
	RailColumn,
	RichHead,
	RichNote,
	RichSheet,
	StreamWalk,
	type Walk,
	WalkTable,
} from "../../../shared/ui/spool-rich-sheet";

/**
 * agent-rich--gaps — everything the renderer cannot draw except the table, decided at once.
 *
 * **What it proposes.** One message exercising the whole remaining list — a heading, italic,
 * a link, an image, strikethrough, a rule, a two-level nested list, a list item that wraps, a
 * three-line blockquote, a fence with a language on it, a task list, and bold containing
 * emphasis — drawn beside the same message through the renderer that ships. The left column
 * is the bug: every marker in it is visible as its own syntax, in the middle of a sentence.
 *
 * **Most of these have no taste in them and are decided by naming the obvious answer.** A
 * rule is a rule. Strikethrough is a strikethrough. A nested list is indented and its bullet
 * goes quiet. A wrapped list item belongs to the item above it, and the fact that it did not
 * is a one-character bug: `^\s*` in the item pattern strips the indent, so a continuation
 * line was a new paragraph starting under the bullet with a gap above it. A multi-line
 * blockquote is one quote and drawing three stacked rules for it was the same class of
 * mistake. None of these deserve a frame each and none get one.
 *
 * **Three of them are real decisions and they are the reason this frame exists.**
 *
 * *A heading is a bold lead-in.* #148 found no heading in any of the thirty-five messages,
 * and it also found that every long message in the corpus opens each of its findings with
 * `**a bold lead-in.**` doing exactly the job a heading would. A 392px column beside the
 * thing the message is about has no room for a type scale, and 20px type in a chat reads as
 * a document title rather than as a break. So `#` renders as what the agent already writes
 * by hand, and the level decides only how much air sits above it.
 *
 * *Italic is a synthesized oblique, and that is a fact about the typeface rather than a
 * preference.* Familjen Grotesk ships no italic and `fonts.css` asks Google for weights
 * only, so there is no slanted file to load. Every sheet on this page also sets
 * `font-synthesis: none`, which turns `italic` into nothing at all: the run renders identical
 * to the prose around it and the marker has no effect. The alternative was a colour lift from
 * `text/90` to `text`, and it loses on collision, because bold is already colour plus weight
 * and a lift would make the two markers neighbours on one axis. A slant is the only axis
 * nothing else in the rail uses, so emphasis re-enables synthesis for itself alone.
 *
 * *An image draws its own words and is never fetched.* The rail already has a picture
 * vocabulary and it is #194's: a real thumbnail of a frame spool rendered itself, which
 * presses to life size. A remote `![](https://…)` is not that. It is a network request made
 * on the agent's say-so, from a surface with no loading state and no failure state, into a
 * 392px column. The alt text stands where the picture would, wearing the glyph, and the
 * destination is one press away.
 *
 * *A link is an underline and not the accent*, which is the same rule the rest of the rail
 * follows: the thread red belongs to the selection and nothing else borrows it. *A fence's
 * language is a label above the box* rather than inside it, where it would collide with the
 * first line, which is the one line every fence has. **Nothing is syntax-highlighted**: a
 * highlighter is a dependency and a second palette in a column that already carries one
 * accent, and the label answers the question the colour was going to answer. *A task's box
 * is the transcript's own 10px square* rather than a bullet, because a task is the one list
 * item that has a state and the rail has drawn `done` as a stroke since #142.
 *
 * **And the closers are measured rather than asserted.** Half of these markers can be half
 * arrived, and #148's invariant is that what is on screen must be a prefix of what will be
 * drawn: a nascent `#`, a nascent `---`, a lone `!`, an open `~~`, an open `*`, and a link
 * in either of its two unfinished states. The band at the bottom walks all **1,337
 * characters** of this message through both closers and counts the frames where the block
 * got shorter. `closedText` alone is the control and it scores **2 drops, worst 18px, the
 * first at character 3** while `## W` is being written, which is #148's own nascent-marker
 * rule meeting a marker it was never told about. `closedRich` scores **0**.
 *
 * **Two of the fixes came out of the walk rather than out of thinking about it, and both
 * are the same shape.** A lone `!` at the start of a line is a paragraph that the very next
 * character deletes, exactly as `\n\n*` was in #148, so it waits for its bracket. And a task
 * list shrinks the line it is on: a bullet's glyph is a 20px line and a task's box is 10px,
 * so the frame `- [` becomes `- [ ]` the item lost 5px of height. The item is `min-h-5`
 * now, which every real item already was.
 */

interface Gap {
	readonly name: string;
	readonly now: string;
	readonly then: string;
	readonly why: string;
	/** true when there was a decision in it rather than an obvious answer */
	readonly taste: boolean;
}

const GAPS: readonly Gap[] = [
	{
		name: "heading",
		now: "a literal # in the sentence",
		then: "a bold lead-in with air above it",
		why: "no heading in 35 messages, and the corpus writes this by hand already",
		taste: true,
	},
	{
		name: "italic",
		now: "literal asterisks",
		then: "a synthesized oblique, synthesis re-enabled for it alone",
		why: "Familjen Grotesk ships no italic; a colour lift collides with bold",
		taste: true,
	},
	{
		name: "link",
		now: "[text](url) drawn whole",
		then: "the label, underlined in border-raised, url behind it",
		why: "the accent is the selection's and a log of links must not wear it",
		taste: false,
	},
	{
		name: "image",
		now: "![alt](url) drawn whole",
		then: "the alt text as a mono chip with a picture glyph",
		why: "the rail never fetches: no loading state, no failure state, 392px",
		taste: true,
	},
	{
		name: "strikethrough",
		now: "literal tildes",
		then: "struck, at text/45",
		why: "nothing to decide",
		taste: false,
	},
	{
		name: "rule",
		now: "a paragraph of three dashes",
		then: "one hairline at the column's width",
		why: "nothing to decide",
		taste: false,
	},
	{
		name: "nested list",
		now: "every level flattened to one",
		then: "16px per level, bullet quieter past the first",
		why: "depth is read off a stack of open indents, so 2 and 4 spaces agree",
		taste: false,
	},
	{
		name: "wrapped item",
		now: "a second paragraph under the bullet",
		then: "the same item, one block",
		why: "a bug rather than a gap: ^\\s* dropped the indent that said so",
		taste: false,
	},
	{
		name: "multi-line quote",
		now: "one bordered block per > line",
		then: "one quotation",
		why: "the same bug from the other end",
		taste: false,
	},
	{
		name: "fence language",
		now: "dropped",
		then: "a mono label above the box, nothing highlighted",
		why: "inside the box it collides with the first line; a highlighter is a palette",
		taste: true,
	},
	{
		name: "task list",
		now: "a bullet and a literal [ ]",
		then: "the transcript's own 10px box, checked or not",
		why: "the one list item with a state, and #142 already draws state",
		taste: false,
	},
	{
		name: "bold with emphasis",
		now: "asterisks all the way through",
		then: "bold containing an oblique",
		why: "[^*]+? could not cross an inner *; the class is [\\s\\S] now",
		taste: false,
	},
];

function GapRow({ gap }: { gap: Gap }) {
	return (
		<div className="flex items-baseline px-5 py-[3px]">
			<span className="w-[136px] shrink-0 font-mono text-sm text-text/90 leading-4">{gap.name}</span>
			<span className="w-[62px] shrink-0 font-mono text-2xs text-muted/40 leading-4">
				{gap.taste ? "decided" : "obvious"}
			</span>
			<span className="w-[230px] shrink-0 pr-4 font-mono text-2xs text-thread/70 leading-4">{gap.now}</span>
			<span className="w-[290px] shrink-0 pr-4 font-mono text-2xs text-text/80 leading-4">{gap.then}</span>
			<span className="min-w-0 flex-1 font-mono text-2xs text-muted/60 leading-4">{gap.why}</span>
		</div>
	);
}

export default function AgentRichGapsFrame() {
	const [rich, setRich] = useState<readonly Walk[]>([]);
	const [plain, setPlain] = useState<readonly Walk[]>([]);
	const onRich = useCallback((next: readonly Walk[]) => setRich(next), []);
	const onPlain = useCallback((next: readonly Walk[]) => setPlain(next), []);
	const draw = useCallback(
		(shown: string, live: number) => <RichSaid text={shown} live={live} table="stack" />,
		[],
	);

	return (
		<RichSheet>
			<StreamWalk text={GAPS_SAID} widths={[RAIL_DEFAULT]} render={draw} onDone={onRich} />
			<StreamWalk text={GAPS_SAID} widths={[RAIL_DEFAULT]} render={draw} onDone={onPlain} close={closedText} />

			<RichHead
				title="the rest of the gap list"
				note="one message carrying all of it, through the renderer that ships and through this one"
			/>
			<div className="flex shrink-0 gap-5 px-5 py-3">
				<RailColumn
					width={RAIL_DEFAULT}
					label="today"
					note="agent-markdown.ts at the rail's own 420"
					height={720}
					tone="text-thread"
				>
					<Said text={GAPS_SAID} />
				</RailColumn>
				<RailColumn
					width={RAIL_DEFAULT}
					label="rich"
					note="the same message, the same width"
					height={720}
					tone="text-text"
				>
					<RichSaid text={GAPS_SAID} table="stack" />
				</RailColumn>
				<RailColumn width={300} label="300" note="the old default, unchanged by any of it" height={720}>
					<RichSaid text={GAPS_SAID} table="stack" />
				</RailColumn>
			</div>

			<RichHead
				title="what each one draws"
				note="eight of the twelve had no taste in them and are named rather than argued"
			/>
			<div className="flex shrink-0 flex-col py-1.5">
				{GAPS.map((gap) => (
					<GapRow key={gap.name} gap={gap} />
				))}
			</div>

			<RichHead
				title="the closers"
				note="every prefix of this message, through both closers, at the rail's 420, and the height must never go down"
			/>
			<div className="flex min-h-0 flex-1 flex-col gap-2 py-2">
				<div className="px-5 font-mono text-2xs text-muted/50 leading-4">
					closedText alone, the control: a nascent #, a nascent ---, an open ~~ and a link in either
					unfinished state are all blocks that leave
				</div>
				<WalkTable walks={plain} note="what the shipped closer does with markers it does not know about" />
				<div className="px-5 pt-1 font-mono text-2xs text-muted/50 leading-4">
					closedRich, the same function with those five rules added, and a link drawn as its own label from
					its first character
				</div>
				<WalkTable walks={rich} note="the invariant #148 measured at zero, held" />
				<RichNote>
					a link is the interesting one: `[the map]` is seven drawn characters wearing two brackets that
					vanish when `(url)` lands, so the brackets come off while they are all that has arrived and only
					the styling changes when the destination shows up
				</RichNote>
			</div>
		</RichSheet>
	);
}
