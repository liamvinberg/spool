import type { StagePage } from "../lib/explorer-tree";
import { cn } from "../lib/utils";
import { FolderIcon } from "./spool-icons";
import { FrameCover, STILL_H, STILL_W } from "./spool-explorer-wire";

/**
 * What the field says when the page you are standing on has no frames on it.
 *
 * Two cases wear one picture today, and they are not the same thing. A page of
 * pages holds plenty — `explorations` has eight frames under it — and the field
 * shows none of them, so the canvas reads as a hole where the tree reads as
 * full. A page nobody has written into yet holds nothing anywhere, and the
 * honest answer there is the sentence the empty project already gets.
 *
 * Each take here answers both, because a treatment that only covers the
 * container leaves the other one exactly as blank as it started.
 */

/* ── say ─────────────────────────────────────────────────────────────── */

/**
 * The field prints what is true about this page and stops.
 *
 * The cheapest honest answer: no new object on the canvas, no new gesture, one
 * mono line in the register spool already uses for counts. It tells you where
 * the frames went. It does not take you there.
 */
export function SaidEmpty({ page, pages }: { page: string; pages: readonly StagePage[] }) {
	const below = pages.reduce((total, sub) => total + sub.count, 0);
	return (
		<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pb-16">
			{pages.length === 0 ? (
				<>
					<p className="font-mono text-2xs text-muted/55 leading-3">no frames yet</p>
					<p className="font-mono text-2xs text-muted/35 leading-3">
						an agent writes frames/{page}/&lt;name&gt;/frame.tsx
					</p>
				</>
			) : (
				<>
					<p className="font-mono text-2xs text-muted/55 leading-3">
						{pages.length} {pages.length === 1 ? "page" : "pages"} inside · {below}{" "}
						{below === 1 ? "frame" : "frames"} below
					</p>
					<p className="font-mono text-2xs text-muted/35 leading-3">
						{pages.map((sub) => sub.name).join(" · ")}
					</p>
				</>
			)}
		</div>
	);
}

/* ── pages ───────────────────────────────────────────────────────────── */

/**
 * A page stands on the field as a stack of the frames it holds.
 *
 * The claim is that a page is a thing on the canvas rather than a row in a rail
 * with a canvas behind it, so it is drawn at frame size, in frame order, beside
 * the frames — including on a page that has frames of its own, because an object
 * that only appears when the field is empty is a placeholder, not an object.
 */
export function PageStill({ page, onEnter }: { page: StagePage; onEnter: () => void }) {
	const cover = page.frames[0];
	return (
		<button
			type="button"
			onClick={onEnter}
			aria-label={`Open ${page.name}`}
			className="group flex flex-col gap-1.5 text-left"
			style={{ width: STILL_W }}
		>
			<div className="flex min-w-0 items-center gap-1.5 font-mono text-xs leading-4">
				<FolderIcon className="h-3 w-3 shrink-0 text-muted/70 transition-colors group-hover:text-thread" />
				<span className="min-w-0 truncate text-muted transition-colors group-hover:text-text">{page.name}</span>
				<span className="ml-auto shrink-0 font-mono text-2xs text-muted/45 leading-3">{page.count}</span>
			</div>

			<div className="relative transition-transform duration-150 group-hover:-translate-y-[3px]" style={{ height: STILL_H }}>
				{/* the frames behind the first one, as edges: a page reads as a bundle
				    at a glance and the count says how deep the bundle goes */}
				{page.frames.slice(1, 3).map((node, index) => (
					<span
						key={node.id}
						className="absolute inset-0 rounded-[6px] border border-border-raised bg-surface transition-transform duration-150"
						style={{ transform: `translate(${(index + 1) * 7}px, ${(index + 1) * 7}px)` }}
					/>
				))}
				{cover === undefined ? (
					<div className="flex h-full w-full items-center justify-center rounded-[6px] border border-border border-dashed bg-bg font-mono text-2xs text-muted/35 leading-3">
						{page.pages > 0 ? `${page.pages} pages` : "empty"}
					</div>
				) : (
					<FrameCover node={cover} className="relative transition-colors group-hover:border-border-raised" />
				)}
			</div>
		</button>
	);
}

/* ── through ─────────────────────────────────────────────────────────── */

/**
 * The field shows what is below, grouped under the page each group came from.
 *
 * A page becomes a lens on its own subtree: standing on `explorations` you see
 * every frame in it, dimmed and small, each block under the name of the page it
 * actually lives on. Pressing a name narrows to that page and the dimming goes.
 * What it buys is that you never lose sight of the work; what it costs is that
 * the field now draws frames that are not on this page, so a drag onto it has no
 * page to land in.
 */
/** what a frame below looks like from a page above it: half size, and dimmed */
const BELOW_W = 88;
const BELOW_H = 176;

export function ThroughField({ pages, onEnter }: { pages: readonly StagePage[]; onEnter: (id: string) => void }) {
	return (
		<div className="absolute inset-0 flex flex-col items-center justify-center gap-6 overflow-hidden pt-10 pb-14">
			{pages.map((sub) => (
				<section key={sub.id} className="flex w-[520px] flex-col gap-2.5">
					<button type="button" onClick={() => onEnter(sub.id)} className="group flex items-center gap-2 text-left">
						<FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted/60 transition-colors group-hover:text-thread" />
						<span className="shrink-0 font-mono text-muted text-sm leading-sm transition-colors group-hover:text-text">
							{sub.name}
						</span>
						<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{sub.count}</span>
						<span className="h-px min-w-0 flex-1 bg-border" />
					</button>
					<div className="flex items-start gap-4 opacity-55 transition-opacity hover:opacity-100">
						{sub.frames.map((node) => (
							<div key={node.id} className="flex flex-col gap-1" style={{ width: BELOW_W }}>
								<div style={{ height: BELOW_H }}>
									<FrameCover node={node} />
								</div>
								<span className="truncate font-mono text-2xs text-muted/70 leading-3">{node.name}</span>
							</div>
						))}
						{sub.pages > 0 ? (
							<span className="self-center font-mono text-2xs text-muted/40 leading-3">
								{sub.pages} more {sub.pages === 1 ? "page" : "pages"} inside
							</span>
						) : null}
					</div>
				</section>
			))}
		</div>
	);
}

/* ── the field's own heading ─────────────────────────────────────────── */

/** `explorations · 0 frames · 3 pages` — where you are, in the machine's register */
export function StageLine({
	path,
	label,
	frames,
	pages,
}: {
	path: string;
	label: string;
	frames: number;
	pages: number;
}) {
	return (
		<div className="absolute top-5 left-6 flex items-baseline gap-2 font-mono text-2xs text-muted/55 leading-3">
			<span className="text-muted">{path === "" ? label : path}</span>
			<span>
				{frames} {frames === 1 ? "frame" : "frames"}
			</span>
			{pages > 0 ? (
				<span className={cn("text-muted/40")}>
					· {pages} {pages === 1 ? "page" : "pages"}
				</span>
			) : null}
		</div>
	);
}
