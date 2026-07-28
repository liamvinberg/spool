import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectedFrame } from "../api";
import { cn } from "../cn";
import { ageOf, charWeights, findFrames, newestFirst, runsIn, type Weight } from "./frame-find";
import { pageLabel, pageOf } from "./pages";
import { FolderIcon } from "./sidebar";

/**
 * The frame finder: press `/` on the canvas and a palette opens over the
 * viewport, filtering every frame on every page. Arrows move the pick, Enter
 * lands the camera on it, Escape closes.
 *
 * `/` because Home already binds it — "`/` is the filter's door" — and one
 * app should not teach the same idea twice; ⌘K beside it, because that is
 * the chord every other palette taught, and both spell the same door. The
 * overlay stops at the rails on purpose: it covers the canvas because the
 * canvas is what Enter is about to move, and it leaves the Pages rail at full
 * strength because the rail is answering at the same time, lighting the page
 * that holds the pick.
 *
 * The row treatment shipped from `design/frames/app/spool-canvas--find-dim`:
 * the name stays whole and in place, only its brightness moves. The run-up
 * before the first landing dims, the typed letters take the thread, and
 * everything from the first landing onward is full text, because that is where
 * the difference between two near-identical frames always lives. An empty
 * query is every frame newest first, with an age column, because an order you
 * did not ask for has to say what it is.
 */

const TONE: Record<Weight, string> = {
	runup: "text-muted/40",
	hit: "text-thread",
	plain: "text-text",
};

const VISIBLE = 10;
const ROW = 30;

export function FindPalette({
	frames,
	onPick,
	onLand,
	onClose,
}: {
	/** every frame the finder may answer with, any order */
	frames: readonly ProjectedFrame[];
	/** the page under the pick, so the rail can light the row holding it */
	onPick: (page: string | null) => void;
	onLand: (name: string) => void;
	onClose: () => void;
}) {
	const [query, setQuery] = useState("");
	const [at, setAt] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	// the moment the palette opened: ages hold still while it is up
	const openedAt = useMemo(() => Date.now(), []);

	const fresh = useMemo(() => newestFirst(frames), [frames]);
	const hits = useMemo(() => findFrames(query, fresh), [query, fresh]);
	const picked = hits[at];

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		onPick(picked === undefined ? null : pageOf(picked.frame));
	}, [picked, onPick]);

	// the pick has to stay on screen, and a real project is screens of list
	useEffect(() => {
		listRef.current?.querySelector<HTMLElement>(`[data-at="${at}"]`)?.scrollIntoView({ block: "nearest" });
	}, [at]);

	// the fade only while rows remain below it: at the end, nothing says "more"
	const [more, setMore] = useState(false);
	const measureMore = useCallback(() => {
		const list = listRef.current;
		setMore(list !== null && list.scrollTop + list.clientHeight < list.scrollHeight - 1);
	}, []);
	useEffect(() => {
		if (hits.length === 0) {
			setMore(false);
			return;
		}
		measureMore();
	}, [hits.length, measureMore]);

	const empty = query.trim().length === 0;

	return (
		<>
			<div className="absolute inset-0 z-30 animate-find-in bg-bg/48 backdrop-blur-[2px]">
				{/* the scrim is a door out, the way the picker's backdrop is */}
				<button
					type="button"
					aria-label="Close the finder"
					tabIndex={-1}
					className="absolute inset-0 cursor-default"
					onMouseDown={onClose}
				/>
			</div>
			{/* fixed, so the panel centres on the window: the rails are asymmetric most of
			    the time, and a viewport centre reads as off-centre. 148 is the 44px bar plus
			    the 104 the prototype set below it. The scrim still stops at the rails. */}
			<div className="pointer-events-none fixed inset-x-0 top-[148px] z-30 flex justify-center px-8">
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Find a frame"
					// a caret that never leaves: clicking the panel is never clicking away from the field
					onMouseDown={(event) => {
						if (event.target !== inputRef.current) event.preventDefault();
						inputRef.current?.focus();
					}}
					className="pointer-events-auto flex h-fit w-[560px] animate-find-panel-in flex-col overflow-hidden rounded-lg border border-border-raised bg-surface"
				>
					<label className="flex h-12 shrink-0 items-center gap-3 border-border border-b px-4">
						{/* the summon key, left as the prompt: the field says which key opened it */}
						<span className="shrink-0 font-mono text-md text-muted/60 leading-md">/</span>
						<input
							ref={inputRef}
							value={query}
							spellCheck={false}
							autoComplete="off"
							placeholder="type part of a name"
							onChange={(event) => {
								setQuery(event.target.value);
								setAt(0);
							}}
							onKeyDown={(event) => {
								if (event.key === "ArrowDown") {
									event.preventDefault();
									setAt((n) => Math.min(n + 1, Math.max(hits.length - 1, 0)));
								} else if (event.key === "ArrowUp") {
									event.preventDefault();
									setAt((n) => Math.max(n - 1, 0));
								} else if (event.key === "Enter") {
									event.preventDefault();
									if (picked !== undefined) onLand(picked.frame.name);
								} else if (event.key === "Escape") {
									event.preventDefault();
									onClose();
								}
							}}
							className="min-w-0 flex-1 bg-transparent font-mono text-md text-text leading-md caret-thread outline-none placeholder:text-muted/40"
							aria-label="Find a frame"
						/>
						{/* an order you did not ask for has to say what it is; an order you typed does not */}
						<span className="shrink-0 font-mono text-2xs text-muted/50 leading-3">
							{empty ? `${fresh.length} frames, newest first` : `${hits.length} of ${fresh.length}`}
						</span>
					</label>

					<div className="relative shrink-0">
						<div
							ref={listRef}
							onScroll={measureMore}
							className="overflow-y-auto py-1.5"
							// an overflowing list stops half a row short, so the cut is the thing
							// that says there is more, rather than a trough down the side of it
							style={{
								height:
									Math.min(Math.max(hits.length, 1), VISIBLE) * ROW + 12 + (hits.length > VISIBLE ? 15 : 0),
							}}
						>
							{hits.length === 0 ? (
								<div className="flex h-[30px] items-center px-4 font-mono text-muted/60 text-sm leading-sm">
									nothing answers to that
								</div>
							) : (
								hits.map((hit, index) => (
									<FindRow
										key={hit.frame.name}
										name={hit.frame.name}
										page={pageLabel(pageOf(hit.frame))}
										matched={hit.matched}
										index={index}
										age={empty ? ageOf(hit.frame.born, openedAt) : undefined}
										picked={index === at}
										onPoint={() => setAt(index)}
										onLand={() => onLand(hit.frame.name)}
									/>
								))
							)}
						</div>
						{more ? (
							<div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface via-surface/85 to-transparent" />
						) : null}
					</div>

					<div className="flex h-9 shrink-0 items-center gap-5 border-border border-t px-4 font-mono text-2xs text-muted leading-3">
						<span>{"↑↓ moves"}</span>
						<span>{"↵ lands there"}</span>
						<span>esc closes</span>
					</div>
				</div>
			</div>
		</>
	);
}

function FindRow({
	name,
	page,
	matched,
	index,
	age,
	picked,
	onPoint,
	onLand,
}: {
	name: string;
	page: string;
	matched: readonly number[];
	index: number;
	/** how long ago the frame was born — printed only while the order is recency */
	age: string | undefined;
	picked: boolean;
	onPoint: () => void;
	onLand: () => void;
}) {
	const weights = charWeights(name, matched);
	return (
		<button
			type="button"
			data-at={index}
			// move, not enter: a list that scrolls under a still cursor must not re-pick
			onMouseMove={onPoint}
			onClick={onLand}
			className={cn(
				"relative flex w-full items-center gap-5 px-4 text-left transition-colors duration-100",
				picked && "bg-raised",
			)}
			style={{ height: ROW }}
		>
			{picked ? <span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-thread" /> : null}
			{/* the name, whole and in place. Only brightness moves. */}
			<span className="min-w-0 flex-1 truncate font-mono text-sm leading-sm">
				{runsIn(name, weights).map((run) => (
					<span key={run.at} className={TONE[run.weight]}>
						{run.text}
					</span>
				))}
			</span>
			{/* what the row is, then where it is: two different questions, so two groups */}
			<span className="flex shrink-0 items-center gap-3">
				{age === undefined ? null : (
					<span className="w-[26px] text-right font-mono text-2xs text-muted/40 leading-3">{age}</span>
				)}
				<span className="flex w-[74px] items-center gap-1.5">
					<FolderIcon className="h-3 w-3 shrink-0 text-muted/30" />
					<span className="truncate font-mono text-2xs text-muted/55 leading-3">{page}</span>
				</span>
			</span>
		</button>
	);
}
