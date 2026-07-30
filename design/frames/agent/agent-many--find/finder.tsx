import type { RefObject } from "react";
import type { Thread } from "../../../shared/lib/agent-threads";
import { askOf, wroteFor } from "../../../shared/lib/many-threads";
import { cn } from "../../../shared/lib/utils";
import { SearchIcon } from "../../../shared/ui/spool-icons";
import { ThreadMark } from "../../../shared/ui/spool-thread-mark";

/**
 * The switcher is the finder, and it is the one spool already has.
 *
 * `/` opens a palette over the canvas that filters every frame on every page
 * (`spool-find-palette.tsx`, and `home.tsx:44` before it: *"`/` is the filter's door,
 * unless something is already taking type"*). A conversation is the other thing a project
 * accumulates hundreds of, and it is the only one that has been given chrome instead.
 *
 * What a palette can do that no strip can is read the *inside* of a thread. A row here
 * matches on the ask, on what the thread wrote, and on the line it is on — so
 * `cart--empty` finds the conversation that made it without anybody having remembered to
 * call it that.
 */

/** what a query hits, so a match can be shown rather than asserted */
function runs(text: string, query: string): readonly { readonly text: string; readonly hit: boolean }[] {
	if (query === "") return [{ text, hit: false }];
	const out: { text: string; hit: boolean }[] = [];
	const lower = text.toLowerCase();
	const needle = query.toLowerCase();
	let at = 0;
	for (;;) {
		const found = lower.indexOf(needle, at);
		if (found < 0) break;
		if (found > at) out.push({ text: text.slice(at, found), hit: false });
		out.push({ text: text.slice(found, found + needle.length), hit: true });
		at = found + needle.length;
	}
	if (at < text.length) out.push({ text: text.slice(at), hit: false });
	return out;
}

/**
 * The whole of a thread a query is allowed to reach: its ask and what it wrote.
 *
 * Nothing matches that is not also drawn on the row. A palette that hits on text you
 * cannot see is a palette that looks broken every time it does.
 */
export function haystack(thread: Thread): string {
	return [askOf(thread), ...wroteFor(thread)].join(" ");
}

export function matches(threads: readonly Thread[], query: string): readonly Thread[] {
	if (query.trim() === "") return threads;
	const needle = query.trim().toLowerCase();
	return threads.filter((thread) => haystack(thread).toLowerCase().includes(needle));
}

/**
 * The palette itself, over the canvas rather than over the transcript.
 *
 * That is the whole difference from #136's rejected menu, which dropped its list over the
 * log: there, choosing covered the conversation you were choosing to leave. Here it
 * covers the frames, which is the surface with nothing to say while you are picking a
 * conversation, and the transcript stays legible beside it the entire time.
 *
 * A row is two lines and nothing in it is cut. The ask wraps — this is the only surface
 * in any of these takes wide enough to hold `so when the like shot patches or disappears
 * its line should say that rather than sitting there` whole, and the frame prints how
 * many pixels that sentence actually is.
 */
export function Finder({
	threads,
	open,
	query,
	onQuery,
	pick,
	onPickAt,
	onOpen,
	width,
	probe,
	panel,
}: {
	threads: readonly Thread[];
	open: string;
	query: string;
	onQuery: (text: string) => void;
	pick: number;
	onPickAt: (index: number) => void;
	onOpen: (id: string) => void;
	width: number;
	/** hung on the first row's ask, so the frame can print the measure a name actually gets */
	probe?: RefObject<HTMLSpanElement | null> | undefined;
	/** the panel itself, so the frame can print how much of the canvas it is standing on */
	panel?: RefObject<HTMLDivElement | null> | undefined;
}) {
	const found = matches(threads, query);
	return (
		<div className="absolute inset-x-0 top-24 z-30 flex justify-center">
			<div ref={panel} className="flex flex-col border border-border-raised bg-surface" style={{ width }}>
				<div className="flex h-11 shrink-0 items-center gap-2.5 border-border border-b px-3.5">
					<SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted/50" />
					<input
						// biome-ignore lint/a11y/noAutofocus: a palette that opens without the caret in it is a list
						autoFocus
						value={query}
						onChange={(event) => onQuery(event.currentTarget.value)}
						placeholder="find a conversation"
						className="min-w-0 flex-1 bg-transparent font-mono text-sm text-text leading-4 outline-none placeholder:text-muted/40"
					/>
					<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">
						{found.length} of {threads.length}
					</span>
				</div>
				<div className="max-h-[420px] min-h-0 overflow-y-auto py-1.5">
					{found.length === 0 ? (
						<p className="px-3.5 py-3 font-mono text-2xs text-muted/50 leading-4">no conversation says that</p>
					) : (
						found.map((thread, index) => (
							<Row
								key={thread.id}
								thread={thread}
								query={query}
								on={index === pick}
								here={thread.id === open}
								onPoint={() => onPickAt(index)}
								onOpen={() => onOpen(thread.id)}
								probe={index === 0 ? probe : undefined}
							/>
						))
					)}
				</div>
			</div>
		</div>
	);
}

function Row({
	thread,
	query,
	on,
	here,
	onPoint,
	onOpen,
	probe,
}: {
	thread: Thread;
	query: string;
	on: boolean;
	here: boolean;
	onPoint: () => void;
	onOpen: () => void;
	probe?: RefObject<HTMLSpanElement | null> | undefined;
}) {
	const wrote = wroteFor(thread);
	const under = [wrote.length === 0 ? "" : `wrote ${wrote.join(", ")}`, thread.since].filter((part) => part !== "");
	return (
		<button
			type="button"
			onMouseEnter={onPoint}
			onClick={onOpen}
			className={cn("flex w-full items-start gap-2.5 px-3.5 py-2 text-left", on && "bg-raised/70")}
		>
			<span className="flex h-5 shrink-0 items-center">
				<ThreadMark life={thread.life} />
			</span>
			<span className="min-w-0 flex-1">
				<span ref={probe} className="block text-base text-text leading-base">
					{runs(askOf(thread), query).map((run, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: the runs are a slicing of one string
						<span key={index} className={run.hit ? "text-thread" : undefined}>
							{run.text}
						</span>
					))}
				</span>
				<span className="mt-0.5 block font-mono text-2xs text-muted/50 leading-4">
					{runs(under.join(" · "), query).map((run, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: the runs are a slicing of one string
						<span key={index} className={run.hit ? "text-thread" : undefined}>
							{run.text}
						</span>
					))}
				</span>
			</span>
			{here ? <span className="shrink-0 pt-1 font-mono text-2xs text-muted/40 leading-3">open</span> : null}
		</button>
	);
}

/**
 * The one thing this take leaves on screen, and it is not in the rail.
 *
 * The rail gives threads nothing at all — no row, no column, no plate — so the fact that
 * there are twelve conversations and two of them are moving has to live somewhere, and
 * the canvas has the room the rail does not. It sits bottom left, mirrored off the tool
 * bar the way `--threads-placed`'s dock was, out of the corner where a resize handle
 * wants to be.
 *
 * The composer footer was the first place tried and #184 had already closed it: the
 * model and the stop want 243px against 271px of box at the shipped 300, so a door with
 * a count in it does not fit at the width spool actually ships. The frame prints the
 * door's own measured width against that spare rather than asserting it.
 */
export function Dock({
	open,
	threads,
	moving,
	onOpen,
}: {
	open: Thread;
	threads: readonly Thread[];
	moving: readonly Thread[];
	onOpen: () => void;
}) {
	return (
		<div className="absolute bottom-5 left-5 z-20 flex items-center">
			<button
				type="button"
				onClick={onOpen}
				className="flex h-8 items-center gap-2.5 border border-border-raised bg-surface px-3 transition-colors duration-150 hover:border-muted/30"
			>
				<span className="max-w-[220px] truncate text-base text-text/85 leading-base">{askOf(open)}</span>
				<span className="h-3.5 w-px shrink-0 bg-border-raised" />
				<span className="shrink-0 font-mono text-2xs text-muted/55 leading-3">{threads.length}</span>
				<span className="flex shrink-0 items-center gap-1">
					{moving.map((thread) => (
						<ThreadMark key={thread.id} life={thread.life} className="h-3 w-3" />
					))}
				</span>
			</button>
		</div>
	);
}
