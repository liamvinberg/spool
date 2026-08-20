import { useCallback, useEffect, useRef, useState } from "react";
import {
	aim,
	aimDouble,
	ascend,
	CART,
	type Ladder,
	type LadderName,
	LADDERS,
	nameOf,
	type Path,
	type Selection,
	type Target,
} from "../lib/select-ladder";
import { cn } from "../lib/utils";
import { CanvasChrome, type PageRow } from "./spool-canvas-chrome";
import { CartDocument } from "./spool-cart-document";
import { SpoolShell } from "./spool-shell";

/**
 * One canvas, four ladders. The field, the rails and the tool bar are the
 * shipped chrome; the only variable is what a gesture on the cart means, which
 * is the whole of what the ticket asks. Point at the frame and climb.
 *
 * ⌥ stands in for ⌘ inside these frames: the canvas keeps ⌘ for itself the
 * moment a frame goes live, so a prototype cannot borrow it. Esc is taken the
 * same way, which is why the rail carries a chip for both.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

const FRAME = "cart";

export function SelectScreen({ ladder: name }: { ladder: LadderName }) {
	const ladder = LADDERS[name];
	const [selection, setSelection] = useState<Selection>({ kind: "frame", frame: FRAME });
	const [live, setLive] = useState(false);
	const [accel, setAccel] = useState(false);
	/** where the pointer is: inside the document, on the label, or off the frame */
	const [pointer, setPointer] = useState<{ where: "document"; chain: Path } | { where: "label" | "away" }>({
		where: "away",
	});
	const stage = useRef<HTMLDivElement | null>(null);
	const liveRef = useRef(false);
	liveRef.current = live;

	const leave = useCallback(() => {
		if (liveRef.current) {
			setLive(false);
			return;
		}
		setSelection((held) => ascend(held));
	}, []);

	// ⌥ is held rather than pressed: the ring answers while the key is down
	useEffect(() => {
		const down = (event: KeyboardEvent) => {
			if (event.key === "Alt") setAccel(true);
			else if (event.key === "Escape") leave();
			else if (event.key === "Enter" && ladder.enterRuns) setLive(true);
		};
		const up = (event: KeyboardEvent) => {
			if (event.key === "Alt") setAccel(false);
		};
		addEventListener("keydown", down);
		addEventListener("keyup", up);
		return () => {
			removeEventListener("keydown", down);
			removeEventListener("keyup", up);
		};
	}, [leave, ladder.enterRuns]);

	const chain = pointer.where === "document" ? pointer.chain : [];
	const gesture = { chain, frame: FRAME, accel, selection };
	const single: Target =
		live || pointer.where === "away"
			? { kind: "nothing" }
			: pointer.where === "label"
				? { kind: "frame", frame: FRAME }
				: aim(ladder.name, gesture);
	const double: Target = live || pointer.where !== "document" ? { kind: "nothing" } : aimDouble(ladder.name, gesture);

	const apply = (target: Target) => {
		if (target.kind === "run") {
			setLive(true);
			setPointer({ where: "away" });
			return;
		}
		if (target.kind !== "nothing") setSelection(target);
	};

	const ringId = single.kind === "element" ? lastOf(single.path) : null;
	// the rung under the pointer's own, drawn faint: only worth a line when it is
	// somewhere the click would not already have taken you
	const nextId =
		ladder.twoRing && double.kind === "element" && lastOf(double.path) !== ringId ? lastOf(double.path) : null;
	const pickedId = !live && selection.kind === "element" ? lastOf(selection.path) : null;
	const framePicked = !live && selection.kind === "frame";
	const frameRing = single.kind === "frame" && !framePicked;
	// a ladder whose double-click always runs has nothing to announce; one where
	// running is the rung after the last one has to say so under the pointer
	const willRun = !ladder.doubleRuns && double.kind === "run";

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="72%">
			<CanvasChrome
				pages={PAGES}
				selected={FRAME}
				tool="select"
				railLabel="ladder"
				rail={
					<LadderRail
						ladder={ladder}
						selection={selection}
						live={live}
						accel={accel}
						onAscend={leave}
						onAccel={() => setAccel((held) => !held)}
					/>
				}
			>
				<Still left={36} top={214} name="menu" />
				<Still left={664} top={172} name="receipt" />

				<div className="absolute top-[190px] left-[288px] flex flex-col gap-1.5">
					<div className="flex w-[300px] items-center gap-1.5 font-mono text-sm leading-4">
						<button
							type="button"
							onClick={(event) => {
								if (live) return;
								if (ladder.labelRuns && event.detail >= 2) {
									setLive(true);
									setPointer({ where: "away" });
									return;
								}
								setSelection({ kind: "frame", frame: FRAME });
							}}
							onPointerEnter={() => !live && setPointer({ where: "label" })}
							onPointerLeave={() => setPointer({ where: "away" })}
							className={cn("cursor-pointer", framePicked ? "text-thread" : "text-muted")}
						>
							{FRAME}
						</button>
						{live ? (
							<button
								type="button"
								onClick={() => setLive(false)}
								className="ml-auto cursor-pointer font-mono text-2xs text-muted leading-3 hover:text-text"
							>
								live · esc exits
							</button>
						) : null}
					</div>

					{/* the handles overhang, so the clip that keeps the document inside its
					    frame lives one level down and the selection is drawn over it */}
					<div className="relative h-[440px] w-[300px]">
						<div
							ref={stage}
							onPointerMove={(event) => {
								if (live) return;
								setPointer({ where: "document", chain: chainFrom(event.target, stage.current) });
							}}
							onPointerLeave={() => setPointer({ where: "away" })}
							onClick={(event) => {
								if (live) return;
								const at = { chain: chainFrom(event.target, stage.current), frame: FRAME, accel, selection };
								apply(event.detail >= 2 ? aimDouble(ladder.name, at) : aim(ladder.name, at));
							}}
							className="relative h-full w-full overflow-hidden rounded-[10px] border border-border"
						>
							<CartDocument live={live} ring={ringId} next={nextId} picked={pickedId} />
							{frameRing ? (
								<span className="pointer-events-none absolute inset-0 rounded-[10px] border-[1.5px] border-thread/55" />
							) : null}
							{willRun ? <RunTag /> : null}
						</div>
						{framePicked ? <FrameSelection /> : null}
					</div>
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

/** What the pointer is over, root first — the chain the frame's shim answers with. */
function chainFrom(target: EventTarget | null, root: HTMLElement | null): Path {
	const chain: string[] = [];
	let node = target instanceof Element ? target : null;
	while (node !== null && root !== null && root.contains(node)) {
		const id = node.getAttribute("data-node");
		if (id !== null) chain.unshift(id);
		node = node.parentElement;
	}
	return chain;
}

function lastOf(path: Path): string | null {
	return path[path.length - 1] ?? null;
}

/** The rung after the last one, said out loud, because nothing on screen says it. */
function RunTag() {
	return (
		<span className="pointer-events-none absolute top-2 right-2 rounded-xs bg-thread px-1.5 py-[2px] font-mono text-2xs text-on-thread leading-3">
			run
		</span>
	);
}

function FrameSelection() {
	return (
		<>
			<span className="pointer-events-none absolute inset-0 rounded-[10px] border-[1.5px] border-thread" />
			{[
				"-left-[4px] -top-[4px]",
				"-right-[4px] -top-[4px]",
				"-bottom-[4px] -left-[4px]",
				"-right-[4px] -bottom-[4px]",
			].map((spot) => (
				<span
					key={spot}
					className={cn(
						"pointer-events-none absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread",
						spot,
					)}
				/>
			))}
		</>
	);
}

/** A neighbour on the field: there so the frame under the pointer is a choice. */
function Still({ left, top, name }: { left: number; top: number; name: string }) {
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left, top }}>
			<span className="font-mono text-muted text-sm leading-4">{name}</span>
			<div className="h-[430px] w-[200px] overflow-hidden rounded-[8px] border border-border bg-bg">
				<div className="flex h-full flex-col gap-2 p-3">
					<span className="h-3 w-14 rounded-full bg-surface" />
					<span className="h-20 w-full rounded-[4px] bg-surface" />
					<span className="h-1.5 w-[88%] rounded-full bg-raised" />
					<span className="h-1.5 w-[72%] rounded-full bg-raised" />
					<span className="h-1.5 w-[80%] rounded-full bg-raised" />
					<span className="mt-auto h-7 w-full rounded-[4px] bg-raised" />
				</div>
			</div>
		</div>
	);
}

function LadderRail({
	ladder,
	selection,
	live,
	accel,
	onAscend,
	onAccel,
}: {
	ladder: Ladder;
	selection: Selection;
	live: boolean;
	accel: boolean;
	onAscend: () => void;
	onAccel: () => void;
}) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex h-11 shrink-0 items-center gap-2 border-border border-b px-4">
				<span className="font-mono text-sm text-text leading-sm">{ladder.name}</span>
				<span className="ml-auto font-mono text-2xs text-muted/55 leading-3">ladder</span>
			</div>

			<div className="flex flex-col gap-2 border-border border-b px-4 py-3.5">
				<p className="text-base text-text leading-base">{ladder.claim}</p>
				<p className="text-base text-muted leading-base">{ladder.cost}</p>
			</div>

			<div className="flex flex-col gap-2 border-border border-b px-4 py-3.5">
				<span className="font-mono text-2xs text-muted/55 leading-3">selection</span>
				<span className="truncate font-mono text-sm text-text leading-sm">{readout(selection, live)}</span>
				<div className="flex items-center gap-2">
					<span className="font-mono text-2xs text-muted/55 leading-3">{rung(selection, live)}</span>
					<button
						type="button"
						onClick={onAscend}
						className="ml-auto cursor-pointer rounded-xs border border-border-raised px-1.5 py-[2px] font-mono text-2xs text-muted leading-3 hover:text-text"
					>
						esc
					</button>
					<button
						type="button"
						onClick={onAccel}
						aria-pressed={accel}
						className={cn(
							"cursor-pointer rounded-xs border px-1.5 py-[2px] font-mono text-2xs leading-3",
							accel ? "border-thread bg-thread text-on-thread" : "border-border-raised text-muted hover:text-text",
						)}
					>
						⌥
					</button>
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col gap-1.5 px-4 py-3.5">
				<span className="font-mono text-2xs text-muted/55 leading-3">bindings</span>
				{ladder.bindings.map((binding) => (
					<div key={binding.keys} className="flex items-baseline gap-3">
						<span
							className={cn(
								"w-[88px] shrink-0 font-mono text-2xs leading-4",
								binding.changed === true ? "text-thread" : "text-muted",
							)}
						>
							{binding.keys}
						</span>
						<span
							className={cn(
								"min-w-0 font-mono text-2xs leading-4",
								binding.changed === true ? "text-text" : "text-muted/70",
							)}
						>
							{binding.does}
						</span>
					</div>
				))}
			</div>

			<p className="border-border border-t px-4 py-3 text-base text-muted leading-base">
				⌥ stands in for ⌘ here, and the two chips press what the keyboard cannot reach. A live frame owns every plain
				key, so spool keeps ⌘ and Esc, and a frame inside one only gets what is left.
			</p>
		</div>
	);
}

function readout(selection: Selection, live: boolean): string {
	if (live) return `${FRAME} · live`;
	if (selection.kind === "none") return "nothing";
	if (selection.kind === "frame") return selection.frame;
	return `${selection.frame} / ${nameOf(selection.path)}`;
}

function rung(selection: Selection, live: boolean): string {
	const floor = deepest();
	if (live) return `rung ${floor + 1} · the document`;
	if (selection.kind === "element") return `rung ${selection.path.length} of ${floor}`;
	if (selection.kind === "frame") return `rung 0 of ${floor}`;
	return `rung — of ${floor}`;
}

/** How far down this document goes, so the count is the document's and not a guess. */
function deepest(): number {
	const walk = (node: typeof CART, depth: number): number =>
		(node.children ?? []).reduce((low, child) => Math.max(low, walk(child, depth + 1)), depth);
	return walk(CART, 1);
}
