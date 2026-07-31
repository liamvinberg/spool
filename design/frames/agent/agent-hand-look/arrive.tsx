import { motion } from "motion/react";
import { type BlockId, KaffePage, type Place, plainPlace } from "./page";

/**
 * Eight ways an edit can arrive inside the rectangle, on one clock.
 *
 * Every cell renders the same page at the same revision, so what differs between two of
 * them is how the change lands and nothing else. The split that matters is what each one
 * needs from the runtime, and it is printed under every cell:
 *
 * **Four need nothing.** `cut`, `ghost` and `wipe` are whole renders and a compositing
 * rule. `settle` is a transition on the block's own box, which the page already knows
 * because `layout()` computes it — and it is the one treatment that draws the *reflow*
 * rather than the write, so what moves is every block the edit pushed.
 *
 * **Four need to know which block changed.** `rise`, `slide`, `plate` and `span` all
 * decorate one box. `jsx-dev-runtime.ts` already stamps every element with
 * `path:line:col` and `document.ts` already scans for it, so the box is obtainable — but
 * nothing upstream records which lines an `Edit` touched, so the sheet is handed the
 * block by `LANDS` and the product would need one message it does not have.
 */

export const ARRIVE_NAMES = ["cut", "ghost", "wipe", "settle", "rise", "slide", "plate", "span"] as const;
export type ArriveName = (typeof ARRIVE_NAMES)[number];

export const ARRIVE_NOTE: Record<ArriveName, string> = {
	cut: "no treatment at all",
	ghost: "the last revision, over, at 0.3",
	wipe: "a boundary down the whole frame",
	settle: "the reflow itself, eased",
	rise: "the block enters from under",
	slide: "sideways, which a layout cannot do",
	plate: "the box tints and drains",
	span: "a rule crosses the frame at its height",
};

export const ARRIVE_NEEDS: Record<ArriveName, string> = {
	cut: "nothing",
	ghost: "nothing",
	wipe: "nothing",
	settle: "nothing",
	rise: "the block",
	slide: "the block",
	plate: "the block",
	span: "the block",
};

const GHOST_MS = 420;
const GHOST_PEAK = 0.3;
const WIPE_MS = 274;
const SETTLE_MS = 280;
const RISE_MS = 280;
const SLIDE_MS = 300;
const PLATE_MS = 520;
const SPAN_MS = 860;

const EASE = [0.33, 1, 0.68, 1] as const;
const CSS_EASE = "cubic-bezier(0.33, 1, 0.68, 1)";
const INK = "#17171A";

export interface Landing {
	/** the write's index, 1 to 13, which is also the revision it produced */
	readonly n: number;
	readonly block: BlockId;
	/** seconds since it landed */
	readonly age: number;
}

export function Arrival({ name, rev, landing }: { name: ArriveName; rev: number; landing: Landing | null }) {
	if (name === "cut") return <KaffePage rev={rev} />;
	if (name === "ghost") return <Ghost rev={rev} landing={landing} />;
	if (name === "wipe") return <Wipe rev={rev} landing={landing} />;
	if (name === "settle") return <KaffePage rev={rev} place={settlePlace} />;
	return <Marked name={name} rev={rev} landing={landing} />;
}

/**
 * The old render over the new at a hard cap. Identical pixels cancel exactly, so only
 * what changed shows and the diff costs nothing. A cap rather than a crossfade, because
 * a moment where two designs sit at equal strength is the moment that reads as a broken
 * re-render.
 */
function Ghost({ rev, landing }: { rev: number; landing: Landing | null }) {
	const live = landing !== null && landing.age * 1000 < GHOST_MS;
	return (
		<div className="relative h-full w-full">
			<KaffePage rev={rev} />
			{live && landing !== null ? (
				<div
					className="pointer-events-none absolute inset-0"
					style={{ opacity: GHOST_PEAK * (1 - landing.age * 1000 / GHOST_MS) }}
				>
					<KaffePage rev={rev - 1} />
				</div>
			) : null}
		</div>
	);
}

/**
 * A boundary travelling down the frame with the new state above it and the old below,
 * both at full strength. Where the write did not reach the two sides are identical, so
 * the partition draws nothing and the event on screen is always the size of the edit.
 * It costs an order the write does not have.
 */
function Wipe({ rev, landing }: { rev: number; landing: Landing | null }) {
	const live = landing !== null && landing.age * 1000 < WIPE_MS;
	if (!live || landing === null) return <KaffePage rev={rev} />;
	const cut = (landing.age * 1000) / WIPE_MS;
	return (
		<div className="relative h-full w-full">
			<KaffePage rev={rev - 1} />
			<div
				className="pointer-events-none absolute inset-0"
				style={{ clipPath: `inset(0 0 ${((1 - cut) * 100).toFixed(1)}% 0)` }}
			>
				<KaffePage rev={rev} />
			</div>
		</div>
	);
}

/**
 * Every block eases to its own box instead of jumping to it, which makes the *reflow*
 * the event: the lede gains a line and the four blocks under it travel. It is the only
 * treatment here that says something about the edit without being told where the edit
 * was, because the page already knows where everything goes at both revisions.
 */
const settlePlace: Place = (id, box, node) => (
	<div
		key={id}
		className="absolute"
		style={{
			left: box.x,
			top: box.y,
			width: box.w,
			height: box.h,
			transition: `top ${SETTLE_MS}ms ${CSS_EASE}, height ${SETTLE_MS}ms ${CSS_EASE}, width ${SETTLE_MS}ms ${CSS_EASE}`,
		}}
	>
		{node}
	</div>
);

/** the four that decorate one block, and so need the stamp to know which */
function Marked({ name, rev, landing }: { name: ArriveName; rev: number; landing: Landing | null }) {
	const ms = name === "rise" ? RISE_MS : name === "slide" ? SLIDE_MS : name === "plate" ? PLATE_MS : SPAN_MS;
	const live = landing !== null && landing.age * 1000 < ms;
	const place: Place = (id, box, node) => {
		const style = { left: box.x, top: box.y, width: box.w, height: box.h };
		if (!live || landing === null || landing.block !== id) {
			return plainPlace(id, box, node);
		}
		const key = `${id}:${landing.n}`;
		if (name === "rise") {
			return (
				<motion.div
					key={key}
					className="absolute"
					style={style}
					initial={{ y: 8, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					transition={{ duration: RISE_MS / 1000, ease: EASE }}
				>
					{node}
				</motion.div>
			);
		}
		if (name === "slide") {
			return (
				<motion.div
					key={key}
					className="absolute"
					style={style}
					initial={{ x: 9 }}
					animate={{ x: 0 }}
					transition={{ duration: SLIDE_MS / 1000, ease: EASE }}
				>
					{node}
				</motion.div>
			);
		}
		if (name === "plate") {
			return (
				<div key={key} className="absolute" style={style}>
					{node}
					<motion.span
						className="pointer-events-none absolute rounded-[3px]"
						style={{ inset: -3, background: INK }}
						initial={{ opacity: 0.15 }}
						animate={{ opacity: 0 }}
						transition={{ duration: PLATE_MS / 1000, ease: "linear" }}
					/>
				</div>
			);
		}
		return (
			<div key={key} className="absolute" style={style}>
				{node}
				<motion.span
					className="pointer-events-none absolute origin-left"
					style={{ left: -box.x, width: 240, top: box.h / 2, height: 1, background: INK }}
					initial={{ opacity: 0.5, scaleX: 0 }}
					animate={{ opacity: 0, scaleX: 1 }}
					transition={{ duration: SPAN_MS / 1000, ease: "linear" }}
				/>
			</div>
		);
	};
	return <KaffePage rev={rev} place={place} />;
}
