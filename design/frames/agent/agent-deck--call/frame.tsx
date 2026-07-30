import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LIVE_ASK, useAutoAsk } from "../../../shared/lib/agent-threads";
import { useFit } from "../../../shared/lib/deck-fit";
import { CASE_SAYS, type DeckCase, type DeckThread, drawn, named, useDeck, work } from "../../../shared/lib/deck-threads";
import { FRAMES, findFrames } from "../../../shared/lib/frame-find";
import { cn } from "../../../shared/lib/utils";
import { DeckApp, useDeckTurn } from "../../../shared/ui/spool-deck-app";
import { CaseStrip, DeckShell } from "../../../shared/ui/spool-deck-shell";
import { AgentIcon, FolderIcon } from "../../../shared/ui/spool-icons";
import { ThreadMark } from "../../../shared/ui/spool-thread-mark";

/**
 * agent-deck--call — no row at all, because spool already has the door.
 *
 * Press `/` on the canvas and a palette opens over it, filtering every frame on every
 * page: `src/ui/hotkeys.ts:245` binds it to `/` and to the platform accelerator with
 * `K`, and `spool-find-palette.tsx` states the reason it is `/` and not a chord —
 * *one app should not teach the same idea twice*. A thread is a thing you go to. It
 * belongs in the thing that goes to things.
 *
 * So this take adds no row, no second bar, no tab and no new key. The palette gains a
 * section above the frames, and the chrome gains one cell: the rail's own glyph with
 * one mark beside it for the loudest thing happening in a thread you are not reading.
 * The frame boots with the palette open, because the list is what it is asking you to
 * judge; the cell behind it is the whole of the resting state.
 *
 * **What a palette row can hold that no tab can.** The readout measures whichever case
 * is picked; press `12` and it measures the long one. Sixty-six characters at 10px mono
 * wants 407px against 500 of row, so it renders whole with ninety-three to spare. This
 * is the only surface in any of these five takes where a thread's name is never cut —
 * which reframes the whole title question. The name does not have to be short. It has
 * to be *findable*.
 *
 * **The title: what it did, not what was said to it.** The row leads with the frames
 * the conversation wrote, collapsed the way #135 already collapses a run of edits —
 * `cart--empty ×3` — and prints the ask underneath at muted strength. Two arguments
 * for it, and neither is aesthetic. First, retrieval: an hour later you are looking for
 * *the one that did the empty cart*, and you type `cart`, which is a frame name, not a
 * sentence you no longer remember typing. Second, cost: `src/ui/canvas/agent-threads.ts`
 * rejected asking a cheap model for a title as *silent spend on somebody's own
 * subscription for a label*, and recorded that the binary's own generated title never
 * reaches print mode. This name needs neither. Spool already draws `write
 * cart--empty-b` in the log; the name is a projection of data it has.
 *
 * There is no rename, because there is nothing stored to rename: the name recomputes
 * from the work. An unstarted thread has done nothing, so it reads `new thread` and
 * sorts first, where a new thing belongs.
 *
 * **Where the rule does not reach, printed rather than glossed.** The readout counts
 * how many of the deck the work reading can actually name. It is not all of them: a
 * thread that only asked a question, or only read files, wrote no frame, so it falls
 * back to its last line and then to its ask. `what is this?` is named by its ask under
 * any rule, which is fine, and `check what the tokens are called in Notion` is named
 * `ask Notion`, which is arguably better than the sentence. But a naming rule with a
 * fallback is two rules, and that is the honest cost of this idea.
 *
 * **What it costs is everything a row was for.** Nothing about the deck is on screen.
 * A thread finishing elsewhere moves one 14px mark in the corner of the bar and that is
 * the entire notification surface — press `elsewhere` and watch it, because that is the
 * case this take is weakest on and it should be judged at its weakest. Switching is
 * also two acts rather than one: a key, then a pick, with a panel over what you were
 * reading in between. Cheap for a deliberate switch, wrong for glancing.
 *
 * **The rail cannot touch it.** `agent-rail.tsx:68` ships the rail at 420 in a 200–480
 * drag range. A 560px panel over the middle of the window and one cell in the app bar
 * are the same at every one of those widths, so this take and `--marks` are the two
 * that a person dragging the rail down to 200 never notices.
 *
 * **On the word, and this take has the sharpest version of it.** `canvas.threads` is
 * bound to `t` and titled `Threads` in `src/ui/app.tsx:316`, and it toggles the flow
 * layer. If threads are reached by a key, `t` is the key they would obviously want, and
 * it is taken by something else called threads. Sharing `/` sidesteps that, which is
 * another reason to share it rather than to mint one.
 */

const CASES = [
	{ id: "one", label: "1" },
	{ id: "four", label: "4" },
	{ id: "twelve", label: "12" },
	{ id: "elsewhere", label: "elsewhere" },
] as const;

export default function AgentDeckCallFrame() {
	const [deck, setDeck] = useState<DeckCase>("four");
	const [readout, setReadout] = useState("measuring");

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="min-h-0 flex-1">
				<Case key={deck} deck={deck} onMeasure={setReadout} />
			</div>
			<CaseStrip
				cases={CASES}
				picked={deck}
				onPick={(id) => setDeck(id as DeckCase)}
				says={CASE_SAYS[deck]}
				readout={readout}
			/>
		</div>
	);
}

function Case({ deck, onMeasure }: { deck: DeckCase; onMeasure: (line: string) => void }) {
	const { script, turn, elapsed, ready } = useDeckTurn();
	const rail = useDeck([], turn, deck);
	useAutoAsk(ready, turn.send, LIVE_ASK);
	const [open, setOpen] = useState(true);

	return (
		<DeckShell
			right={
				<button
					type="button"
					title="Threads (/)"
					onClick={() => setOpen(true)}
					className="flex h-7 items-center gap-1.5 rounded-sm px-1.5 text-muted transition-colors duration-150 hover:bg-surface hover:text-text"
				>
					<AgentIcon className="h-3.5 w-3.5" />
					<ThreadMark life={rail.loudest} />
				</button>
			}
			overlay={
				open ? (
					<Palette
						threads={rail.threads}
						openId={rail.open.id}
						deck={deck}
						onMeasure={onMeasure}
						onPick={(id) => {
							rail.setOpen(id);
							setOpen(false);
						}}
						onClose={() => setOpen(false)}
					/>
				) : null
			}
		>
			<DeckApp
				nav="outside"
				script={script}
				turn={turn}
				elapsed={elapsed}
				stored={rail.open.id === "live" ? null : rail.open.entries}
				phase={rail.phase}
				run={rail.run}
				onSend={turn.send}
				onReplay={turn.replay}
			/>
		</DeckShell>
	);
}

const PANEL_W = 560;

function Palette({
	threads,
	openId,
	deck,
	onMeasure,
	onPick,
	onClose,
}: {
	threads: readonly DeckThread[];
	openId: string;
	deck: DeckCase;
	onMeasure: (line: string) => void;
	onPick: (id: string) => void;
	onClose: () => void;
}) {
	const [query, setQuery] = useState("");
	const [at, setAt] = useState(0);
	const field = useRef<HTMLInputElement>(null);
	const { has, wants, fit } = useFit<HTMLSpanElement, HTMLSpanElement>(deck);

	const wanted = query.trim().toLowerCase();
	const hits = useMemo(
		() =>
			wanted === ""
				? threads
				: threads.filter(
						(thread) =>
							thread.ask.toLowerCase().includes(wanted) ||
							work(thread).toLowerCase().includes(wanted) ||
							thread.last.toLowerCase().includes(wanted),
					),
		[threads, wanted],
	);
	const frames = useMemo(() => findFrames(query).slice(0, 4), [query]);
	const longest = threads.reduce((best, thread) => (thread.ask.length > best.length ? thread.ask : best), "");

	useEffect(() => field.current?.focus(), []);
	useEffect(() => {
		if (fit.has === 0) return;
		onMeasure(
			`the longest ask is ${longest.length} characters and wants ${fit.wants}px · the row has ${fit.has} · ` +
				`nothing is cut · the work reading names ${named(threads)} of ${threads.length}, the rest fall back`,
		);
	}, [fit, longest, threads, onMeasure]);

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.14, ease: "easeOut" }}
			className="absolute inset-0 z-30 flex justify-center bg-bg/48 px-8 pt-[104px] backdrop-blur-[2px]"
			onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<motion.div
				initial={{ y: -8 }}
				animate={{ y: 0 }}
				transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
				className="flex h-fit flex-col overflow-hidden rounded-lg border border-border-raised bg-surface"
				style={{ width: PANEL_W }}
			>
				<label className="flex h-12 shrink-0 items-center gap-3 border-border border-b px-4">
					{/* the summon key left as the prompt, exactly as the frame finder does it */}
					<span className="shrink-0 font-mono text-md text-muted/60 leading-md">/</span>
					<input
						ref={field}
						value={query}
						spellCheck={false}
						autoComplete="off"
						placeholder="a thread, or a frame"
						onChange={(event) => {
							setQuery(event.target.value);
							setAt(0);
						}}
						onKeyDown={(event) => {
							if (event.key === "ArrowDown") {
								event.preventDefault();
								setAt((n) => Math.min(n + 1, hits.length - 1));
							} else if (event.key === "ArrowUp") {
								event.preventDefault();
								setAt((n) => Math.max(n - 1, 0));
							} else if (event.key === "Enter") {
								event.preventDefault();
								const picked = hits[at];
								if (picked !== undefined) onPick(picked.id);
							} else if (event.key === "Escape") {
								event.preventDefault();
								onClose();
							}
						}}
						className="min-w-0 flex-1 bg-transparent font-mono text-md text-text leading-md caret-thread outline-none placeholder:text-muted/40"
						aria-label="Find a thread or a frame"
					/>
					<span className="shrink-0 font-mono text-2xs text-muted/50 leading-3">
						{hits.length} of {threads.length}
					</span>
				</label>

				<div className="py-1">
					{hits.map((thread, index) => (
						<Row
							key={thread.id}
							thread={thread}
							picked={index === at}
							here={thread.id === openId}
							boxRef={index === 0 ? has : undefined}
							onPoint={() => setAt(index)}
							onPick={() => onPick(thread.id)}
						/>
					))}
					{hits.length === 0 ? (
						<div className="flex h-[30px] items-center px-4 font-mono text-muted/60 text-sm leading-sm">
							no conversation answers to that
						</div>
					) : null}
				</div>

				{/* the frames the same palette has always listed, below the conversations */}
				<div className="flex h-6 shrink-0 items-center justify-end border-border border-t px-4">
					<span className="font-mono text-2xs text-muted/40 leading-3">{FRAMES.length} frames</span>
				</div>
				<div className="pb-1">
					{frames.map((hit) => (
						<div key={hit.row.name} className="flex h-[30px] items-center gap-5 px-4">
							<span className="min-w-0 flex-1 truncate font-mono text-muted/70 text-sm leading-sm">{hit.row.name}</span>
							<span className="flex w-[74px] shrink-0 items-center gap-1.5">
								<FolderIcon className="h-3 w-3 shrink-0 text-muted/30" />
								<span className="truncate font-mono text-2xs text-muted/55 leading-3">{hit.row.page}</span>
							</span>
						</div>
					))}
				</div>

				<div className="flex h-9 shrink-0 items-center gap-5 border-border border-t px-4 font-mono text-2xs text-muted leading-3">
					<span>{"↑↓ moves"}</span>
					<span>{"↵ opens it"}</span>
					<span>esc closes</span>
				</div>
			</motion.div>

			{/* the longest ask, allowed to be as wide as it likes */}
			<div className="pointer-events-none invisible absolute top-0 left-0 h-0 overflow-hidden" aria-hidden="true">
				<span ref={wants} className="w-max whitespace-nowrap font-mono text-2xs leading-3">
					{longest}
				</span>
			</div>
		</motion.div>
	);
}

function Row({
	thread,
	picked,
	here,
	boxRef,
	onPoint,
	onPick,
}: {
	thread: DeckThread;
	picked: boolean;
	here: boolean;
	boxRef?: React.RefObject<HTMLSpanElement | null> | undefined;
	onPoint: () => void;
	onPick: () => void;
}) {
	return (
		<button
			type="button"
			onMouseMove={onPoint}
			onClick={onPick}
			className={cn(
				"relative flex w-full items-start gap-3 px-4 py-2 text-left transition-colors duration-100",
				picked && "bg-raised",
			)}
		>
			{picked ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<span className="pt-px">
				<ThreadMark life={drawn(thread.life)} />
			</span>
			<span ref={boxRef} className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="flex items-baseline gap-3">
					<span className={cn("min-w-0 truncate font-mono text-sm leading-4", here ? "text-text" : "text-text/85")}>
						{work(thread)}
					</span>
					{here ? <span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">open</span> : null}
					<span className="ml-auto shrink-0 font-mono text-2xs text-muted/45 leading-3">{thread.since}</span>
				</span>
				{/* the ask, whole: the one surface in the app where it is never cut. A thread
				    the work reading cannot name is already showing its ask on the line above,
				    so it does not show it twice */}
				{work(thread) === thread.ask ? null : (
					<span className="block w-full font-mono text-2xs text-muted/55 leading-4">
						{thread.ask}
					</span>
				)}
			</span>
		</button>
	);
}
