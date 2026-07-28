import { useEffect, useRef, useState } from "react";
import type { Life, Thread } from "../../../shared/lib/agent-threads";
import { cn } from "../../../shared/lib/utils";
import { PanelCaret, PlusIcon } from "../../../shared/ui/spool-icons";
import { ThreadMark } from "../../../shared/ui/spool-thread-mark";

/**
 * The threads strip when there are more threads than room (#144).
 *
 * #136 measured the ceiling and left it there: a name floors at 112px, so a 420px
 * rail carries three and the fourth is under a fade. The fade is honest about there
 * being more and says nothing about how to get to it, and a scroll bar is not the
 * answer — a 6px trough across the top of a rail is the loudest thing in a
 * near-black interface, and it says *scroll me* rather than *there are two more
 * conversations*.
 *
 * So four answers, each of which only ever exists when it has something to do.
 *
 *   fade    what is drawn today: wheel and drag work, nothing announces it.
 *   centre  no control at all: pressing a thread centres it, so the half-cut one at the
 *           edge is the way to the next one. The click was already spent on opening it.
 *   arrows  a caret at whichever end has more, and only that end.
 *   marks   the ones that do not fit keep their marks and lose their names — press one
 *           and it takes the last name's seat. No scrolling at all, and the only answer
 *           that carries state: at 420px it is two names and four marks, two of which
 *           are unread, which is more than three names and a fade ever said.
 *   count   how many are out of sight, as one number that opens the rest.
 *
 * All four keep the plus on the left, where it stops competing for the end of the row
 * that has to carry this.
 */

export type Overflow = "fade" | "centre" | "arrows" | "marks" | "count";

const STEP = 168;

/* the row's own arithmetic, from #136's measurements: a name floors at 112, the plus
 * takes 36, the names area is padded 14 either side, and a mark cell is 22. */
const NAME = 112;
const PLUS = 36;
const PAD = 28;
const MARK = 22;

/**
 * How many names fit, when the rest are becoming marks.
 *
 * Measured, not observed: reading it off the rendered row feeds back on itself, because
 * drawing one more mark leaves less room for names, which makes one more name hidden.
 * Drawn that way the strip settled on one mark for five hidden threads. So the split is
 * arithmetic on the width the row already has, and it is stable by construction.
 */
function fits(width: number, count: number): number {
	for (let k = count; k > 0; k -= 1) {
		const marks = k < count ? 8 + (count - k) * MARK : 0;
		if (PLUS + PAD + k * NAME + marks <= width) return k;
	}
	return 1;
}

/** what the row can see of itself: whether there is more either way, and how much */
function useReach(threads: readonly Thread[]) {
	const box = useRef<HTMLDivElement>(null);
	const row = useRef<HTMLDivElement>(null);
	const [reach, setReach] = useState({ back: false, on: false, hidden: 0, width: 420 });

	useEffect(() => {
		const node = box.current;
		if (node === null) return;
		const read = () => {
			const back = node.scrollLeft > 2;
			const on = node.scrollLeft + node.clientWidth < node.scrollWidth - 2;
			// how many names are wholly out of view, which is the only count worth saying
			const rows = [...node.querySelectorAll<HTMLElement>("[data-thread]")];
			const left = node.getBoundingClientRect().left;
			const right = node.getBoundingClientRect().right;
			const hidden = rows.filter((row) => {
				const seat = row.getBoundingClientRect();
				return seat.right < left + 8 || seat.left > right - 8;
			}).length;
			setReach({ back, on, hidden, width: row.current?.clientWidth ?? 420 });
		};
		read();
		node.addEventListener("scroll", read, { passive: true });
		const observer = new ResizeObserver(read);
		observer.observe(node);
		return () => {
			node.removeEventListener("scroll", read);
			observer.disconnect();
		};
	}, [threads]);

	const slide = (by: number) => box.current?.scrollBy({ left: by, behavior: "smooth" });
	return { box, row, ...reach, slide };
}

/**
 * A hidden thread's mark, which cannot be nothing.
 *
 * #136 made `read` draw nothing on purpose: in a row that also carries a name, an old
 * thread is a name and a time and needs no mark. Out here the mark *is* the thread, and
 * a thread you cannot see is a thread you cannot press — five hidden threads drew as
 * three. So read falls back to a hollow dot at the strength a disabled thing gets, and
 * running and unread keep #136's own two.
 */
function SpareMark({ life }: { life: Life }) {
	if (life === "read") return <span className="h-[5px] w-[5px] rounded-full border border-muted/45" />;
	return <ThreadMark life={life} />;
}

export function OverflowStrip({
	threads,
	open,
	onOpen,
	overflow,
}: {
	threads: readonly Thread[];
	open: string;
	onOpen: (id: string) => void;
	overflow: Overflow;
}) {
	const reach = useReach(threads);
	const [list, setList] = useState(false);

	// marks does not scroll at all: it shows what fits and the rest are marks. The open
	// thread has to be one of the names, and #136 fixed the order once — re-sorting a
	// strip moves a name out from under the cursor reaching for it — so a thread pressed
	// from the marks takes the last name's seat and that one becomes a mark. One swap,
	// caused by the press, and nothing else moves.
	const room = fits(reach.width, threads.length);
	const seats = threads.slice(0, room);
	const named =
		overflow !== "marks"
			? threads
			: seats.some((thread) => thread.id === open)
				? seats
				: [...seats.slice(0, room - 1), ...threads.filter((thread) => thread.id === open)];
	const spare = overflow === "marks" ? threads.filter((thread) => !named.includes(thread)) : [];
	const hidden = overflow === "count" ? threads.slice(threads.length - reach.hidden) : spare;

	return (
		<div ref={reach.row} className="relative flex h-[34px] shrink-0 items-stretch border-border border-b">
			<button
				type="button"
				aria-label="New thread"
				className="flex w-9 shrink-0 items-center justify-center border-border border-r text-muted/45 transition-colors duration-150 hover:text-text"
			>
				<PlusIcon className="h-2.5 w-2.5" />
			</button>

			{overflow === "arrows" && reach.back ? (
				<button
					type="button"
					aria-label="Earlier threads"
					onClick={() => reach.slide(-STEP)}
					className="flex w-6 shrink-0 items-center justify-center border-border border-r text-muted/60 transition-colors duration-150 hover:text-text"
				>
					<PanelCaret dir="left" className="h-3 w-2" />
				</button>
			) : null}

			<div className="relative min-w-0 flex-1">
				<div
					ref={reach.box}
					className={cn(
						"flex h-full items-stretch gap-3 px-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
						overflow === "marks" ? "overflow-hidden" : "overflow-x-auto",
					)}
				>
					{named.map((thread) => {
						const on = thread.id === open;
						return (
							<button
								key={thread.id}
								data-thread=""
								type="button"
								onClick={(event) => {
									onOpen(thread.id);
									if (overflow === "centre") {
										event.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
									}
								}}
								className="group relative flex min-w-[112px] shrink-0 grow basis-0 items-center gap-2 text-left"
							>
								<ThreadMark life={thread.life} />
								<span
									className={cn(
										"min-w-0 truncate font-mono text-sm leading-4 transition-colors duration-150",
										on ? "text-text" : "text-muted/70 group-hover:text-muted",
									)}
								>
									{thread.ask}
								</span>
								{on ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" /> : null}
							</button>
						);
					})}
				</div>
				{reach.on && overflow !== "marks" ? (
					<span className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent" />
				) : null}
			</div>

			{overflow === "arrows" && reach.on ? (
				<button
					type="button"
					aria-label="More threads"
					onClick={() => reach.slide(STEP)}
					className="flex w-6 shrink-0 items-center justify-center border-border border-l text-muted/60 transition-colors duration-150 hover:text-text"
				>
					<PanelCaret dir="right" className="h-3 w-2" />
				</button>
			) : null}

			{overflow === "marks" && hidden.length > 0 ? (
				<div className="flex shrink-0 items-center gap-1.5 border-border border-l px-2">
					{hidden.map((thread) => (
						<button
							key={thread.id}
							type="button"
							aria-label={thread.ask}
							onClick={() => onOpen(thread.id)}
							className="flex h-5 w-5 items-center justify-center rounded-xs transition-colors duration-150 hover:bg-surface"
						>
							<SpareMark life={thread.life} />
						</button>
					))}
				</div>
			) : null}

			{overflow === "count" && hidden.length > 0 ? (
				<button
					type="button"
					onClick={() => setList(!list)}
					className="flex shrink-0 items-center gap-1 border-border border-l px-2.5 font-mono text-2xs text-muted/70 tabular-nums leading-3 transition-colors duration-150 hover:text-text"
				>
					{hidden.length}
					<PanelCaret dir="right" className="h-2.5 w-2" />
				</button>
			) : null}

			{overflow === "count" && list ? (
				<div className="absolute top-full right-0 z-20 flex w-[220px] flex-col border border-border-raised bg-bg py-1">
					{hidden.map((thread) => (
						<button
							key={thread.id}
							type="button"
							onClick={() => {
								onOpen(thread.id);
								setList(false);
							}}
							className="flex h-7 items-center gap-2 px-2.5 text-left transition-colors duration-150 hover:bg-surface"
						>
							<ThreadMark life={thread.life} />
							<span className="min-w-0 truncate font-mono text-muted text-sm leading-4">{thread.ask}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
