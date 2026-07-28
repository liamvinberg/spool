import { useState } from "react";
import { ELSEWHERE, type Thread } from "../../../shared/lib/agent-threads";
import { type Overflow, OverflowStrip } from "./strip";

/**
 * agent-nav-strip — six threads in a rail that holds three.
 *
 * A sheet, at the real 420px, with the real strip in it five times and six real
 * threads: the four the page already carries plus two more, because the question only
 * exists once the row overflows. Every one of them is live — drag, wheel, and press.
 *
 * **The plus moved to the left in all four**, and that is what this sheet is for. The
 * end of the row is the only place a *there is more that way* control can live, and
 * with the plus sitting there it was competing with the one thing the row cannot say
 * without it.
 *
 * **A scroll bar is not on the table.** A trough across the top of a 420px rail is the
 * loudest object in a near-black interface, it appears and disappears with the pointer
 * on every platform differently, and it says *scroll me* when the thing worth saying is
 * *there are four more conversations and two of them are unread*.
 *
 *   fade    what ships today. Wheel and drag both work and nothing announces it, so
 *           the fourth thread exists only for people who guess.
 *   centre  nothing is added. Pressing a thread centres the row on it, so the half-cut
 *           name at the edge is itself the way to the next one, and the fade is what says
 *           there is a next one. The click was already spent on opening the thread, so
 *           this is the only answer that costs no pixels and no new gesture. What it
 *           costs instead: reading the far end means switching to it, because one press
 *           does both.
 *   arrows  a caret at whichever end has more, and only that end — it is absent at the
 *           start of the row and absent again at the end, so the control is never a
 *           switch over nothing (#34's rule for the threads toggle, same reasoning).
 *           Two cells wide at worst, 24px each, taken from the names.
 *   marks   the ones that do not fit keep their marks and lose their names, and nothing
 *           scrolls at all. It is the only answer that carries state: at 420px it draws
 *           two names and four marks, two of those unread, which is more than three
 *           names and a fade ever said. It costs a name, and it forced one change to
 *           #136's vocabulary — `read` draws nothing there, and a mark you cannot see is
 *           a thread you cannot press, so out here read is a hollow dot.
 *   count   one number for how many are out of sight, opening the rest as a list. The
 *           cheapest in pixels and the only one that admits it is a menu, which #136
 *           already weighed against the strip and lost on: a menu is a surface you have
 *           to go to, and the strip exists so nothing is behind anything.
 *
 * The count is measured, not guessed: it is how many names are *wholly* out of view,
 * read off the row's own scroll position, so it changes as you drag and it is never a
 * number about a thread you can see.
 */

/** two more than the page's four, because three fit and the question needs six */
const MORE: readonly Thread[] = [
	{
		id: "tokens",
		page: "app",
		ask: "align the tokens with the paper file",
		life: "read",
		since: "3h",
		last: "edit tokens.css",
		entries: [],
	},
	{
		id: "receipt",
		page: "app",
		ask: "receipt needs the order number bigger",
		life: "unread",
		since: "48m",
		last: "edit receipt",
		entries: [],
	},
];

const THREADS: readonly Thread[] = [
	{
		id: "live",
		page: "app",
		ask: "plan the whole build before you write anything",
		life: "streaming",
		since: "now",
		last: "run Generate deterministic habit history data",
		entries: [],
	},
	...[...ELSEWHERE].reverse(),
	...MORE,
];

const ANSWERS: readonly { overflow: Overflow; note: string }[] = [
	{ overflow: "fade", note: "today — drag and wheel work, nothing says so" },
	{ overflow: "centre", note: "press the half-cut one and the row centres it — no control at all" },
	{ overflow: "arrows", note: "a caret at the end that has more, and only that end" },
	{ overflow: "marks", note: "two names, four marks — two of them unread, and every one pressable" },
	{ overflow: "count", note: "how many are out of sight, as a list you open" },
];

export default function AgentNavStripFrame() {
	const [open, setOpen] = useState("live");
	return (
		<div className="flex h-full w-full flex-col gap-5 overflow-hidden bg-canvas px-8 py-6 font-sans text-text antialiased [font-synthesis:none]">
			<div className="flex items-baseline gap-3">
				<span className="font-mono text-sm text-text leading-4">nav strip</span>
				<span className="font-mono text-2xs text-muted/70 leading-3">
					#144 — six threads, 420px of rail, no scroll bar. all five are live: press and drag them
				</span>
			</div>
			{ANSWERS.map((answer) => (
				<div key={answer.overflow} className="flex flex-col gap-2">
					<div className="flex items-baseline gap-3">
						<span className="w-[52px] shrink-0 font-mono text-muted text-sm leading-4">{answer.overflow}</span>
						<span className="font-mono text-2xs text-muted/60 leading-3">{answer.note}</span>
					</div>
					<div className="w-[420px] border-border border-x bg-bg">
						<OverflowStrip threads={THREADS} open={open} onOpen={setOpen} overflow={answer.overflow} />
					</div>
				</div>
			))}
		</div>
	);
}
